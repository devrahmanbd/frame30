----------------------- MODULE CheckoutInventory -----------------------
(***************************************************************************)
(* Formal TLA+ specification of Frame30's stock hold, checkout order      *)
(* lifecycle, and payment settlement webhook idempotency engine.           *)
(*                                                                         *)
(* Proves that under arbitrary concurrency, hold expiration, duplicate     *)
(* deliveries, distinct event IDs for the same payment, cancelled order    *)
(* race conditions, and duplicate fulfillment attempts:                   *)
(*  1. Available inventory never drops below zero (StockNonNegative)       *)
(*  2. Total physical units are conserved (InventoryConservation)          *)
(*  3. Exactly at most one successful settlement per payment (AtMostOneSettlementPerPayment) *)
(*  4. Paid orders are strictly backed by verified settlements (OrderSettlementConsistency) *)
(*  5. Order IDs are unique and shopper active order bounds hold.          *)
(***************************************************************************)

EXTENDS Integers, FiniteSets

CONSTANTS 
    Shoppers,       \* Set of customer identifiers, e.g. {s1, s2}
    MaxStock,       \* Initial variant inventory units, e.g. 2
    OrderIds,       \* Set of unique order IDs, e.g. {ord1, ord2}
    EventIds,       \* Set of webhook event IDs, e.g. {evt1, evt2}
    PaymentRefs     \* Set of payment gateway transaction IDs, e.g. {pay1, pay2}

VARIABLES
    availableStock,     \* Integer: 0..MaxStock
    holds,              \* Function: Shoppers -> 0..MaxStock
    orders,             \* Set of [id: OrderIds, shopper: Shoppers, qty: 1..MaxStock, status: Statuses]
    processedEvents,    \* Set of EventIds already delivered/processed
    settlements         \* Set of [paymentRef: PaymentRefs, ordId: OrderIds, status: SettlementStatuses]

vars == <<availableStock, holds, orders, processedEvents, settlements>>

Statuses == {"Pending", "Paid", "Fulfilled", "Cancelled"}
SettlementStatuses == {"Success", "Failed", "Refunded"}

-----------------------------------------------------------------------------
(* Type Invariant *)
TypeOK ==
    /\ availableStock \in 0..MaxStock
    /\ holds \in [Shoppers -> 0..MaxStock]
    /\ \A o \in orders :
        /\ o.id \in OrderIds
        /\ o.shopper \in Shoppers
        /\ o.qty \in 1..MaxStock
        /\ o.status \in Statuses
    /\ \A s \in settlements :
        /\ s.paymentRef \in PaymentRefs
        /\ s.ordId \in OrderIds
        /\ s.status \in SettlementStatuses

(* Initial State *)
Init ==
    /\ availableStock = MaxStock
    /\ holds = [s \in Shoppers |-> 0]
    /\ orders = {}
    /\ processedEvents = {}
    /\ settlements = {}

-----------------------------------------------------------------------------
(* Helper: Calculate total active units held or ordered *)
SumHeld ==
    LET SumFn[S \in SUBSET Shoppers] ==
        IF S = {} THEN 0
        ELSE LET x == CHOOSE elem \in S : TRUE
             IN holds[x] + SumFn[S \ {x}]
    IN SumFn[Shoppers]

SumOrdered ==
    LET SumFn[O \in SUBSET orders] ==
        IF O = {} THEN 0
        ELSE LET o == CHOOSE elem \in O : TRUE
             IN (IF o.status \in {"Pending", "Paid", "Fulfilled"} THEN o.qty ELSE 0) + SumFn[O \ {o}]
    IN SumFn[orders]

-----------------------------------------------------------------------------
(* State Transitions *)

(* Shopper reserves stock for checkout *)
AcquireHold(s, qty) ==
    /\ holds[s] = 0
    /\ qty > 0
    /\ qty <= availableStock
    /\ availableStock' = availableStock - qty
    /\ holds' = [holds EXCEPT ![s] = qty]
    /\ UNCHANGED <<orders, processedEvents, settlements>>

(* Hold expires due to TTL or customer releases cart *)
ExpireOrReleaseHold(s) ==
    /\ holds[s] > 0
    /\ availableStock' = availableStock + holds[s]
    /\ holds' = [holds EXCEPT ![s] = 0]
    /\ UNCHANGED <<orders, processedEvents, settlements>>

(* Shopper places order from active hold *)
PlaceOrder(s, ordId) ==
    /\ holds[s] > 0
    /\ ~ \E o \in orders : o.id = ordId
    /\ ~ \E o \in orders : o.shopper = s /\ o.status \in {"Pending", "Paid"}
    /\ orders' = orders \cup {[id |-> ordId, shopper |-> s, qty |-> holds[s], status |-> "Pending"]}
    /\ holds' = [holds EXCEPT ![s] = 0]
    /\ UNCHANGED <<availableStock, processedEvents, settlements>>

(* Shopper or timeout cancels pending order; stock restored to available pool *)
CancelPendingOrder(ordId) ==
    /\ \E o \in orders : o.id = ordId /\ o.status = "Pending"
    /\ LET target == CHOOSE o \in orders : o.id = ordId
       IN
          /\ availableStock' = availableStock + target.qty
          /\ orders' = (orders \ {target}) \cup {[target EXCEPT !.status = "Cancelled"]}
    /\ UNCHANGED <<holds, processedEvents, settlements>>

(* Webhook received from payment gateway for specific order & payment reference *)
ReceivePaymentWebhook(eventId, payRef, ordId, isSuccess) ==
    IF eventId \in processedEvents
    THEN \* Idempotent replay of already-settled event: strictly no state mutation
         UNCHANGED vars
    ELSE \* First delivery of this event ID
         /\ processedEvents' = processedEvents \cup {eventId}
         /\ IF \E s \in settlements : s.paymentRef = payRef
            THEN \* Payment reference already settled: reject duplicate payment attempt
                 UNCHANGED <<availableStock, holds, orders, settlements>>
            ELSE IF \E o \in orders : o.id = ordId /\ o.status = "Pending"
                 THEN \* Order is pending: settle according to gateway outcome
                      IF isSuccess
                      THEN /\ orders' = {IF o.id = ordId THEN [o EXCEPT !.status = "Paid"] ELSE o : o \in orders}
                           /\ settlements' = settlements \cup {[paymentRef |-> payRef, ordId |-> ordId, status |-> "Success"]}
                           /\ UNCHANGED <<availableStock, holds>>
                      ELSE /\ settlements' = settlements \cup {[paymentRef |-> payRef, ordId |-> ordId, status |-> "Failed"]}
                           /\ UNCHANGED <<availableStock, holds, orders>>
                 ELSE IF \E o \in orders : o.id = ordId /\ o.status = "Cancelled"
                      THEN \* Late webhook for cancelled order: refund if captured, otherwise record failed
                           IF isSuccess
                           THEN /\ settlements' = settlements \cup {[paymentRef |-> payRef, ordId |-> ordId, status |-> "Refunded"]}
                                /\ UNCHANGED <<availableStock, holds, orders>>
                           ELSE /\ settlements' = settlements \cup {[paymentRef |-> payRef, ordId |-> ordId, status |-> "Failed"]}
                                /\ UNCHANGED <<availableStock, holds, orders>>
                      ELSE \* Unknown or already paid/fulfilled order: no mutation
                           UNCHANGED <<availableStock, holds, orders, settlements>>

(* Merchant fulfills paid order; duplicate fulfillment calls are safe no-ops *)
FulfillOrder(ordId) ==
    /\ \E o \in orders : o.id = ordId /\ o.status \in {"Paid", "Fulfilled"}
    /\ orders' = {IF o.id = ordId /\ o.status = "Paid"
                  THEN [o EXCEPT !.status = "Fulfilled"]
                  ELSE o : o \in orders}
    /\ UNCHANGED <<availableStock, holds, processedEvents, settlements>>

-----------------------------------------------------------------------------
(* Next-State Relation *)
Next ==
    \/ \E s \in Shoppers, q \in 1..MaxStock : AcquireHold(s, q)
    \/ \E s \in Shoppers : ExpireOrReleaseHold(s)
    \/ \E s \in Shoppers, ordId \in OrderIds : PlaceOrder(s, ordId)
    \/ \E ordId \in OrderIds : CancelPendingOrder(ordId)
    \/ \E e \in EventIds, p \in PaymentRefs, ordId \in OrderIds, succ \in {TRUE, FALSE} :
         ReceivePaymentWebhook(e, p, ordId, succ)
    \/ \E ordId \in OrderIds : FulfillOrder(ordId)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Critical Invariants to Verify with TLC *)

(* 1. Available stock never drops below 0 *)
StockNonNegative ==
    availableStock >= 0

(* 2. Physical conservation of inventory units *)
InventoryConservation ==
    availableStock + SumHeld + SumOrdered = MaxStock

(* 3. Unique order identifiers *)
UniqueOrderIds ==
    \A o1, o2 \in orders : o1.id = o2.id => o1 = o2

(* 4. Active order bound per shopper *)
MaxActiveOrderPerShopper ==
    \A s \in Shoppers :
        LET active == {o \in orders : o.shopper = s /\ o.status \in {"Pending", "Paid"}}
        IN Cardinality(active) <= 1

(* 5. Explicit Payment Settlement Idempotency: at most one successful settlement per payment reference *)
AtMostOneSettlementPerPayment ==
    \A p \in PaymentRefs :
        Cardinality({s \in settlements : s.paymentRef = p /\ s.status = "Success"}) <= 1

(* 6. Order Settlement Consistency: Paid or Fulfilled orders are strictly backed by a verified settlement *)
OrderSettlementConsistency ==
    \A o \in orders :
        (o.status \in {"Paid", "Fulfilled"}) =>
            \E s \in settlements : s.ordId = o.id /\ s.status = "Success"

(* 7. Failed payments are never refunded *)
NoRefundOnFailedPayment ==
    \A s \in settlements :
        s.status = "Failed" => ~ \E r \in settlements : r.paymentRef = s.paymentRef /\ r.status = "Refunded"

(* 8. Refunds strictly require captured payments *)
RefundRequiresCapturedPayment ==
    \A s \in settlements :
        s.status = "Refunded" => ~ \E f \in settlements : f.paymentRef = s.paymentRef /\ f.status = "Failed"

=============================================================================

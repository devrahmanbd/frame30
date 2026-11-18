----------------------- MODULE CheckoutInventory -----------------------
(***************************************************************************)
(* Formal TLA+ specification of Frame30's stock hold, checkout order      *)
(* lifecycle, payment capture, and refund lifecycle settlement engine.     *)
(*                                                                         *)
(* Proves that under arbitrary concurrency, hold expiration, duplicate     *)
(* deliveries, distinct event IDs for the same payment, cancelled order    *)
(* race conditions, and duplicate fulfillment attempts:                   *)
(*  1. Available inventory never drops below zero (StockNonNegative)       *)
(*  2. Total physical units are conserved (InventoryConservation)          *)
(*  3. Refund requires prior successful capture (RefundRequiresCapture)    *)
(*  4. Failed payments cannot be refunded (NoRefundOnFailedPayment)        *)
(*  5. Refund amounts never exceed captured amounts (RefundAmountBounded)  *)
(*  6. Refund failures are represented explicitly (ExplicitRefundFailure)  *)
(*  7. Duplicate captures & refunds are idempotent                         *)
(*  8. Paid orders are strictly backed by captured settlements             *)
(***************************************************************************)

EXTENDS Integers, FiniteSets

CONSTANTS 
    Shoppers,       \* Set of customer identifiers, e.g. {s1, s2}
    MaxStock,       \* Initial variant inventory units, e.g. 2
    OrderIds,       \* Set of unique order IDs, e.g. {ord1, ord2}
    EventIds,       \* Set of webhook event IDs, e.g. {evt1, evt2, evt3}
    PaymentRefs     \* Set of payment gateway transaction IDs, e.g. {pay1, pay2}

VARIABLES
    availableStock,     \* Integer: 0..MaxStock
    holds,              \* Function: Shoppers -> 0..MaxStock
    orders,             \* Set of [id: OrderIds, shopper: Shoppers, qty: 1..MaxStock, status: Statuses]
    processedEvents,    \* Set of EventIds already delivered/processed
    settlements         \* Set of [paymentRef, ordId, capturedAmount, refundedAmount, paymentStatus, refundStatus]

vars == <<availableStock, holds, orders, processedEvents, settlements>>

Statuses == {"Pending", "Paid", "Fulfilled", "Cancelled"}
PaymentStatuses == {"None", "Captured", "Failed"}
RefundStatuses == {"None", "Success", "Failed"}

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
        /\ s.capturedAmount \in 0..MaxStock
        /\ s.refundedAmount \in 0..MaxStock
        /\ s.paymentStatus \in PaymentStatuses
        /\ s.refundStatus \in RefundStatuses

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

(* Payment gateway capture event *)
ProcessPaymentCapture(eventId, payRef, ordId, isSuccess) ==
    IF eventId \in processedEvents
    THEN \* Idempotent replay of already-processed event
         UNCHANGED vars
    ELSE
         /\ processedEvents' = processedEvents \cup {eventId}
         /\ IF \E s \in settlements : s.paymentRef = payRef
            THEN \* Payment reference already settled: reject duplicate payment attempt
                 UNCHANGED <<availableStock, holds, orders, settlements>>
            ELSE IF \E o \in orders : o.id = ordId /\ o.status = "Pending"
                 THEN LET target == CHOOSE o \in orders : o.id = ordId
                      IN IF isSuccess
                         THEN /\ orders' = (orders \ {target}) \cup {[target EXCEPT !.status = "Paid"]}
                              /\ settlements' = settlements \cup {[
                                   paymentRef |-> payRef,
                                   ordId |-> ordId,
                                   capturedAmount |-> target.qty,
                                   refundedAmount |-> 0,
                                   paymentStatus |-> "Captured",
                                   refundStatus |-> "None"
                                 ]}
                              /\ UNCHANGED <<availableStock, holds>>
                         ELSE /\ settlements' = settlements \cup {[
                                   paymentRef |-> payRef,
                                   ordId |-> ordId,
                                   capturedAmount |-> 0,
                                   refundedAmount |-> 0,
                                   paymentStatus |-> "Failed",
                                   refundStatus |-> "None"
                                 ]}
                              /\ UNCHANGED <<availableStock, holds, orders>>
                 ELSE IF \E o \in orders : o.id = ordId /\ o.status = "Cancelled"
                      THEN LET target == CHOOSE o \in orders : o.id = ordId
                           IN IF isSuccess
                              THEN \* Late webhook for cancelled order: captures money, ready for explicit refund
                                   /\ settlements' = settlements \cup {[
                                        paymentRef |-> payRef,
                                        ordId |-> ordId,
                                        capturedAmount |-> target.qty,
                                        refundedAmount |-> 0,
                                        paymentStatus |-> "Captured",
                                        refundStatus |-> "None"
                                      ]}
                                   /\ UNCHANGED <<availableStock, holds, orders>>
                              ELSE /\ settlements' = settlements \cup {[
                                        paymentRef |-> payRef,
                                        ordId |-> ordId,
                                        capturedAmount |-> 0,
                                        refundedAmount |-> 0,
                                        paymentStatus |-> "Failed",
                                        refundStatus |-> "None"
                                      ]}
                                   /\ UNCHANGED <<availableStock, holds, orders>>
                      ELSE UNCHANGED <<availableStock, holds, orders, settlements>>

(* Gateway refund event with explicit capture check and failure state *)
ProcessRefund(eventId, payRef, refundAmount, isRefundSuccess) ==
    IF eventId \in processedEvents
    THEN \* Idempotent delivery of already-processed refund event
         UNCHANGED vars
    ELSE
         /\ processedEvents' = processedEvents \cup {eventId}
         /\ IF ~ \E s \in settlements : s.paymentRef = payRef
            THEN \* No settlement exists for this payment reference: cannot refund!
                 UNCHANGED <<availableStock, holds, orders, settlements>>
            ELSE LET target == CHOOSE s \in settlements : s.paymentRef = payRef
                 IN IF target.paymentStatus # "Captured" \/ target.capturedAmount = 0
                    THEN \* Failed or uncaptured payments CANNOT be refunded!
                         UNCHANGED <<availableStock, holds, orders, settlements>>
                    ELSE IF target.refundStatus = "Success"
                    THEN \* Duplicate refund attempt for already refunded payment: idempotent no-op!
                         UNCHANGED <<availableStock, holds, orders, settlements>>
                    ELSE IF refundAmount <= 0 \/ refundAmount > target.capturedAmount
                    THEN \* Refund amounts cannot exceed captured amounts!
                         UNCHANGED <<availableStock, holds, orders, settlements>>
                    ELSE IF isRefundSuccess
                         THEN \* Successful refund of captured funds
                              /\ settlements' = (settlements \ {target}) \cup {[
                                   target EXCEPT
                                     !.refundedAmount = refundAmount,
                                     !.refundStatus = "Success"
                                 ]}
                              /\ UNCHANGED <<availableStock, holds, orders>>
                         ELSE \* Explicit refund failure represented in settlement state!
                              /\ settlements' = (settlements \ {target}) \cup {[
                                   target EXCEPT
                                     !.refundStatus = "Failed"
                                 ]}
                              /\ UNCHANGED <<availableStock, holds, orders>>

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
         ProcessPaymentCapture(e, p, ordId, succ)
    \/ \E e \in EventIds, p \in PaymentRefs, amt \in 1..MaxStock, succ \in {TRUE, FALSE} :
         ProcessRefund(e, p, amt, succ)
    \/ \E ordId \in OrderIds : FulfillOrder(ordId)

Spec == Init /\ [][Next]_vars

-----------------------------------------------------------------------------
(* Critical Safety Invariants to Verify with TLC *)

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

(* 5. Explicit Payment Capture Idempotency: at most one capture per payment reference *)
AtMostOneCapturePerPayment ==
    \A p \in PaymentRefs :
        Cardinality({s \in settlements : s.paymentRef = p /\ s.paymentStatus = "Captured"}) <= 1

(* 6. Explicit Refund Idempotency: at most one successful refund per payment reference *)
AtMostOneSuccessfulRefundPerPayment ==
    \A p \in PaymentRefs :
        Cardinality({s \in settlements : s.paymentRef = p /\ s.refundStatus = "Success"}) <= 1

(* 7. Order Settlement Consistency: Paid or Fulfilled orders are strictly backed by a captured settlement *)
OrderSettlementConsistency ==
    \A o \in orders :
        (o.status \in {"Paid", "Fulfilled"}) =>
            \E s \in settlements : s.ordId = o.id /\ s.paymentStatus = "Captured"

(* 8. Refund requires prior successful capture *)
RefundRequiresCapture ==
    \A s \in settlements :
        s.refundStatus = "Success" => (s.paymentStatus = "Captured" /\ s.capturedAmount > 0)

(* 9. Failed payments cannot be refunded *)
NoRefundOnFailedPayment ==
    \A s \in settlements :
        s.paymentStatus = "Failed" => (s.refundStatus = "None" /\ s.refundedAmount = 0)

(* 10. Refund amounts cannot exceed captured amounts *)
RefundAmountBoundedByCapture ==
    \A s \in settlements :
        s.refundedAmount <= s.capturedAmount

(* 11. Explicit refund failure is represented in settlement state *)
ExplicitRefundFailureRepresented ==
    \A s \in settlements :
        s.refundStatus = "Failed" => (s.paymentStatus = "Captured" /\ s.refundedAmount = 0)

=============================================================================


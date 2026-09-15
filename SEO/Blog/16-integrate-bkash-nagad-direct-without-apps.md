# How to Integrate bKash & Nagad Direct Checkout Without Monthly Apps

> **Target Query:** `bkash integrated ecommerce website`, `automated bkash checkout`, `nagad payment gateway website`  
> **Reading Time:** 9 minutes  
> **Published:** November 2026  

---

## 1. Why Third-Party Payment Plugins Fail

In Bangladesh, over **70% of online shoppers** prefer completing purchases through Mobile Financial Services (MFS) like **bKash** or **Nagad**.

On legacy platforms like WooCommerce or Shopify, connecting bKash or Nagad requires installing unofficial third-party plugins from GitHub or informal vendor sites. These plugins exhibit three critical flaws:
1. **Broken Webhooks:** Dropped network packets cause orders to remain stuck in "Pending Payment" even after the customer's wallet was debited.
2. **Security Vulnerabilities:** Storing merchant API secret keys on unencrypted WordPress databases exposes merchant accounts to unauthorized fund transfers.
3. **Monthly App Subscriptions:** On Shopify, third-party MFS apps charge **$25 to $50/month (3,000–6,000 BDT/mo)** simply to route a payment redirect.

---

## 2. Direct Tokenized Checkout vs Manual Transaction ID

```
┌────────────────────────────────────────────────────────────────────────┐
│                   MANUAL VS TOKENIZED MFS COMPARISON                   │
├───────────────────────────────────┬────────────────────────────────────┤
│ CLUMSY MANUAL METHOD              │ NATIVE TOKENIZED API (FRAMIQUE)    │
├───────────────────────────────────┼────────────────────────────────────┤
│ 1. Customer places order          │ 1. Customer clicks "Pay with bKash"│
│ 2. Customer minimizes browser     │ 2. Official secure popup opens     │
│ 3. Opens bKash app on phone       │ 3. Customer enters PIN & OTP       │
│ 4. Types merchant number          │ 4. Transaction confirms in < 2s    │
│ 5. Copies 10-digit TrxID          │ 5. Order automatically marks 'Paid'│
│ 6. Pastes TrxID into store form   │ 6. Money clears to merchant account│
│ 7. Merchant manually checks ledger│ 7. Shipping label prints instantly │
└───────────────────────────────────┴────────────────────────────────────┘
```

By switching from manual TrxID entry to **native tokenized checkout**, stores experience an immediate **30% to 40% reduction in checkout drop-offs**.

---

## 3. Step-by-Step Setup on FRAMIQUE

Connecting your official bKash and Nagad credentials in **FRAMIQUE** takes under 3 minutes:

1. In your Framique Admin Console, navigate to **Settings > Payments**.
2. Select **bKash Direct Integration**:
   - Enter your `App Key`, `App Secret`, `Username`, and `Password` provided by bKash Merchant Services.
3. Select **Nagad Direct Integration**:
   - Enter your `Merchant ID`, `Public Key`, and `Private Key`.
4. Click **Verify Connection & Save**.

Framique’s backend automatically runs an automated sandbox handshake test to verify API communication. Once verified, tokenized checkouts activate immediately across your entire storefront with **0% platform transaction fees**.

[Learn More About Payment Integrations](/payments)

# Connecting a .com.bd Custom Domain with Automated Edge SSL on Framique

> **Target Query:** `custom domain ecommerce bd`, `how to connect com bd domain`, `btcl domain ecommerce setup`  
> **Reading Time:** 8 minutes  
> **Published:** December 2026  

---

## 1. Why a Local .com.bd Domain Builds Brand Trust

For Bangladeshi consumers, seeing a verified `.com.bd` domain (e.g. `yourbrand.com.bd`) signals established local presence, legal legitimacy, and long-term brand investment.

However, configuring `.com.bd` domains on international platforms like Shopify or Webflow has historically been painful due to BTCL’s manual DNS management interface and complicated SSL certificate issuance.

In **FRAMIQUE**, custom domain connection is handled through an automated **edge host-header router** with built-in **Let's Encrypt ACME challenge verification**.

```
┌────────────────────────────────────────────────────────────────────────┐
│                   EDGE HOST-HEADER ROUTING ARCHITECTURE                │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Customer visits `yourbrand.com.bd`                                  │
│ 2. DNS resolves to Framique Edge Gateway IP                            │
│ 3. Edge Proxy inspects `Host: yourbrand.com.bd` header                 │
│ 4. Matches `domain` record to `merchant_id` in 4 milliseconds          │
│ 5. Injects tenant context and streams SSL-encrypted store HTML         │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Step-by-Step Configuration Guide

### Step 1: Obtain Your DNS Records from BTCL
1. Log into your BTCL domain portal (`bdia.btcl.com.bd`).
2. Go to **DNS Management** for your domain.
3. Configure your Primary and Secondary Nameservers to a modern DNS provider (such as Cloudflare, Porkbun, or Namecheap) for instant propagation.

### Step 2: Add CNAME Record
In your DNS provider’s dashboard:
- **Type:** `CNAME`
- **Name / Host:** `@` or `store` (e.g. `store.yourbrand.com.bd` or root domain)
- **Target / Value:** `edge.framique.com`
- **TTL:** Automatic or 300 seconds

### Step 3: Connect Domain in Framique Admin
1. Open your **FRAMIQUE Admin Console > Settings > Custom Domains**.
2. Type `yourbrand.com.bd` and click **Verify & Connect**.
3. Framique’s edge gateway executes an automatic DNS verification handshake and automatically provisions a free, 2048-bit TLS/SSL certificate via ACME challenge routing.
4. Your custom domain goes live with HTTPS in under 60 seconds.

[Configure Your Domain in Framique](/features)

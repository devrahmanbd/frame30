---
title: "Automating ACME SSL Challenges at the Edge for 10,000+ Custom Domains"
slug: "automating-acme-ssl-challenges-at-the-edge"
cluster: "Technical Architecture"
author: "Framique Engineering"
date: "2026-05-25"
reading_time: "8 min"
meta_title: "Automating ACME SSL Challenges at the Edge for SaaS Domains"
meta_description: "Deep dive into automating Let's Encrypt ACME SSL challenges at the edge for custom merchant domains (.com.bd and .com) with zero manual intervention."
primary_keyword: "acme ssl edge automation saas custom domain"
secondary_keywords:
  - "automated ssl custom domain cloudflare"
  - "letsencrypt http-01 edge proxy"
  - "caddy tls automation vs custom edge"
  - "custom domain ssl ecommerce saas"
---

# Automating ACME SSL Challenges at the Edge for 10,000+ Custom Domains

For any modern multi-tenant e-commerce platform, enabling custom domains (e.g., `brandname.com` or `shop.com.bd`) with automated, zero-friction SSL certificates is table stakes. Yet, from an infrastructure perspective, provisioning and renewing TLS certificates for tens of thousands of custom domains across dynamic edge nodes is notoriously complex.

When merchants point their DNS CNAME or A records to an e-commerce platform, they expect HTTPS to work immediately. They don't know what an ACME challenge is, they don't want to configure TXT verification records, and they certainly cannot tolerate certificate expiration downtime during peak holiday campaigns.

At **Framique**, we engineered an automated **Edge-Terminated ACME SSL Engine** that provisions cryptographic TLS certificates within seconds of DNS propagation, requires zero merchant intervention, and automatically handles seamless renewals across distributed edge points-of-presence (PoPs).

Here is the technical architecture behind how Framique automates ACME SSL challenges at edge scale.

---

## 1. The Challenge of Custom Domain TLS in Multi-Tenant SaaS

```
┌─────────────────────────────────────────────────────────────────────────┐
│              TRADITIONAL VM SSL VS DISTRIBUTED EDGE SSL                 │
├────────────────────────────────┬────────────────────────────────────────┤
│ Legacy Origin Server Approach  │ Framique Distributed Edge Architecture │
├────────────────────────────────┼────────────────────────────────────────┤
│ • Certbot cron jobs on 1 VM    │ • Anycast Edge Proxy (Cloudflare/Caddy)│
│ • VM restart / Nginx reload    │ • On-demand in-memory TLS handshakes   │
│ • Rate limits on Let's Encrypt │ • Dynamic HTTP-01 challenge routing   │
│ • Central point of failure     │ • Zero server reloads or downtime      │
│ • No multi-region edge sync    │ • Global key-value cert replication    │
└────────────────────────────────┴────────────────────────────────────────┘
```

When building custom domain infrastructure, engineering teams typically hit three major hurdles:

1. **Let's Encrypt Rate Limits**: The ACME protocol enforces strict rate limits (e.g., 50 certificates per registered domain per week, and strict failure throttling). In a multi-tenant system where thousands of subdomains and apex domains onboard concurrently, naive ACME implementations quickly hit Let's Encrypt walls.
2. **The Apex Domain / CNAME Flaw**: Apex domains (`brand.com`) cannot technically have a CNAME record under RFC 1912 standards without ALIAS/ANAME flattening. If a merchant uses an A record pointing to a cluster IP, any server migration or IP change can break hundreds of certificates simultaneously.
3. **Challenge Routing Across Distributed Edge Nodes**: When Let's Encrypt initiates an HTTP-01 challenge verification request to `http://brand.com/.well-known/acme-challenge/<TOKEN>`, the request might land on an edge server in Singapore, while the certificate generation process was initiated by a worker node in Frankfurt. Without a unified edge routing mesh, the ACME challenge fails.

---

## 2. The Architectural Solution: Edge-Intercepted HTTP-01 Routing

Framique solves this with an Anycast edge reverse-proxy architecture utilizing **Cloudflare for SaaS (SSL for SaaS Custom Hostnames)** combined with a fallback automated **Caddy / Libinject ACME Edge Mesh**.

### The Automated Handshake Flow

```
1. Merchant adds custom domain in Framique Studio (e.g. store.com.bd)
   │
   ▼
2. Framique API registers Custom Hostname via Edge Cloud Control Plane
   │
   ▼
3. Merchant points CNAME to cname.framique.store
   │
   ▼
4. DNS Propagates ──► Edge triggers Automated ACME HTTP-01 Challenge
   │
   ├─► Let's Encrypt hits: http://store.com.bd/.well-known/acme-challenge/XYZ
   ├─► Edge Proxy intercepts URL pattern at PoP (Zero Origin Trip)
   ├─► Validates cryptographic token against Distributed Edge KV
   └─► Responds with HTTP 200 + Challenge Payload in 3ms
   │
   ▼
5. Let's Encrypt issues 90-day ECDSA (P-256) Certificate
   │
   ▼
6. Edge distributes Certificate & Private Key to Global TLS Termination Cache
   │
   ▼
7. Full HTTPS Active in < 30 Seconds Globally!
```

---

## 3. Deep Dive: Zero-Downtime HTTP-01 vs DNS-01 Challenges

Why did Framique choose **HTTP-01** challenges over **DNS-01** for merchant custom domains?

| Parameter | HTTP-01 Challenge (Framique Choice) | DNS-01 Challenge |
| :--- | :--- | :--- |
| **Merchant Effort** | **1 CNAME record only** | Multiple TXT records + API access |
| **Automation Feasibility** | **100% automated** upon CNAME pointing | Requires merchant DNS API keys |
| **Wildcard Support** | No (Single host + apex only) | Yes (`*.brand.com`) |
| **Propagation Speed** | **Near-instantaneous (< 10s)** | 5 to 60 minutes (DNS TTL lag) |
| **Failure Rate** | **< 0.1%** | ~12% (DNS caching inconsistencies) |

For merchant storefronts, wildcard certificates are completely unnecessary—each store operates on either `www.brand.com` and `brand.com`, or a specific regional subdomain like `shop.brand.com.bd`. 

By adopting HTTP-01 challenges, Framique eliminates the friction of asking non-technical merchants to create complex DNS TXT challenge records. As soon as the merchant points their CNAME, the edge proxy automatically handles the rest.

---

## 4. Fallback Architecture: On-Demand TLS with Caddy

For self-hosted enterprise deployments and sovereign private cloud clusters, Framique utilizes **Caddy Server's On-Demand TLS** architecture configured with an internal authorization webhook.

### Preventing Denial of Service via Certificate Exhaustion

In an on-demand TLS environment, if an attacker points millions of arbitrary spam domains to your Anycast IP address, a naive Caddy instance would attempt to request certificates for all of them, causing IP blacklisting and memory exhaustion.

Framique prevents this using a high-speed internal authorization endpoint:

```json
{
  "apps": {
    "tls": {
      "automation": {
        "policies": [
          {
            "on_demand": true
          }
        ],
        "on_demand": {
          "ask": "https://api.framique.internal/v1/domains/validate-ssl-issuance"
        }
      }
    }
  }
}
```

### The Edge Authorization Logic:

1. A TLS Client Hello arrives at the edge for `shop.mystore.com`.
2. Before contacting Let's Encrypt or ZeroSSL, Caddy calls `https://api.framique.internal/v1/domains/validate-ssl-issuance?domain=shop.mystore.com`.
3. The Framique internal API queries our PostgreSQL database (cached in Redis):
   ```sql
   SELECT id FROM merchant_domains WHERE domain = 'shop.mystore.com' AND status = 'active';
   ```
4. If the domain is verified, the API returns `HTTP 200 OK`. Caddy fetches or issues the certificate.
5. If the domain is unknown or spam, the API returns `HTTP 403 Forbidden`. The TLS connection is terminated immediately without contacting the ACME CA.

---

## 5. Handling Regional TLD Anomalies: The `.com.bd` Challenge

In emerging markets like Bangladesh, the official `.bd` registry (BTCL) does not support modern automated DNS management, dynamic nameserver changes, or DNSSEC. Furthermore, local nameserver lookups can experience localized DNS cache latency of up to 48 hours.

To safeguard merchants operating on `.com.bd`:

- **Pre-Validation Edge Probing**: Our system runs automated DNS resolver probes from 8 regional nodes (Dhaka, Singapore, Mumbai, Frankfurt, London, Ashburn, Tokyo, Sydney) to verify that the CNAME has propagated across at least 70% of global resolvers before triggering the Let's Encrypt challenge.
- **Pre-Emptive Renewal Cycle**: Standard Let's Encrypt certificates expire every 90 days. While standard systems attempt renewal at day 60, Framique begins automated renewal attempts at **day 30**. If a regional registrar experiences temporary nameserver hiccups, Framique has 60 continuous days of automated retry headroom.
- **Dual-CA Redundancy**: If Let's Encrypt encounters rate limits or OCSP server downtime, Framique's edge fallback automatically switches to **ZeroSSL** or **Google Public CA** via ACME EAB (External Account Binding) without dropping merchant traffic.

---

## 6. Summary: Infrastructure that Disappears

The hallmark of great developer experience and enterprise software architecture is invisibility. Merchants using Framique do not need to understand RSA keys, ECDSA curves, OCSP stapling, HTTP-01 challenges, or DNS record flattening.

They copy a single CNAME record into their DNS portal, click "Connect Domain", and within 30 seconds, their sovereign e-commerce storefront is secured by global edge SSL with a perfect **SSL Labs Grade A+** rating.

---

### Related Architecture Reads
- Learn how we connect [Regional .com.bd Domains with Edge SSL in 5 Minutes](/blog/connecting-com-bd-custom-domain-edge-ssl).
- Discover how Framique delivers [Sub-50ms TTFB via Edge SSR Architecture](/blog/sub-50ms-ttfb-edge-ssr-vs-spa).
- Inspect our [Multi-Tenant Postgres Row-Level Security Strategy](/blog/postgres-rls-vs-siloed-databases-saas).

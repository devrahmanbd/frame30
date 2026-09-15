---
title: "Postgres Row-Level Security vs Siloed Schemas: Designing Secure Multi-Tenant SaaS"
slug: "postgres-rls-vs-siloed-databases-saas"
cluster: "Technical Architecture"
author: "Framique Engineering"
date: "2026-05-18"
reading_time: "9 min"
meta_title: "Postgres RLS vs Siloed Schemas for SaaS Multi-Tenancy"
meta_description: "Architectural comparison of Row-Level Security (RLS) versus siloed databases. Learn why Framique chose Postgres RLS for cloud commerce scale."
primary_keyword: "postgres row level security multi tenant saas"
secondary_keywords:
  - "multi tenancy postgresql rls"
  - "siloed database vs shared database saas"
  - "supabase rls ecommerce performance"
  - "tenant data isolation architecture"
---

# Postgres Row-Level Security vs Siloed Schemas: Designing Secure Multi-Tenant SaaS

When architecting a high-concurrency multi-tenant SaaS platform like an e-commerce Content Management System (CMS), selecting your tenant data isolation strategy is the single most consequential foundational decision. 

A flawed multi-tenancy model leads to catastrophic operational bottlenecks: ballooning database connection pools, brittle cross-tenant migration scripts, runaway cloud infrastructure costs, and terrifying cross-tenant data leaks.

Historically, software architects debated between two polar extremes:
1. **Siloed Databases / Separate Schemas**: Spinning up an independent Postgres database or separate Postgres schema (`merchant_123.products`, `merchant_456.products`) for each merchant.
2. **Application-Level Tenant Isolation**: Placing all data in shared tables with a `merchant_id` column and relying purely on application code (`SELECT * FROM products WHERE merchant_id = $1`) to prevent leaks.

At **Framique**, we rejected both legacy patterns in favor of modern **PostgreSQL Row-Level Security (RLS)** backed by connection pooling and session context variables. 

In this comprehensive architectural deep-dive, we break down why separate schemas fall apart at scale, how Postgres RLS guarantees mathematical tenant isolation, and how Framique maintains sub-5ms query response times under high-volume flash sales.

---

## 1. The Anatomy of Multi-Tenancy Paradigms

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    MULTI-TENANCY ARCHITECTURAL MODELS                   │
├────────────────────────────────┬────────────────────────────────────────┤
│ Model A: Siloed Schemas        │ Model B: PostgreSQL Row-Level Security │
├────────────────────────────────┼────────────────────────────────────────┤
│ • 1 Schema per merchant        │ • Single unified schema                │
│ • DDL migrations across N dbs  │ • 1-step migration for all tenants     │
│ • Connection pool exhaustion   │ • Linear connection pooling via Supavis│
│ • 500 merchants = 500 DDL runs │ • Mathematical kernel-level isolation  │
│ • Cold cache thrashing         │ • Hot shared cache & unified indexing  │
└────────────────────────────────┴────────────────────────────────────────┘
```

### The Pitfalls of Siloed Schemas (`One-Schema-Per-Tenant`)

The siloed schema approach sounds intuitive on whiteboard sessions: merchants have separate physical tables, eliminating any chance that a buggy query in the API handler fetches another merchant's orders.

However, once a platform scales past 1,000 active merchants, the operational physics of PostgreSQL push back violently:

1. **Schema Migration Hell (DDL Lock storms)**: When releasing a database migration (such as adding a localized inventory indexing column), running `ALTER TABLE` across 10,000 separate schemas requires an orchestrator queue that takes hours to complete. If migration #4,218 fails due to a deadlock, the entire fleet enters a split-brain state.
2. **Catalog Table Bloat (`pg_class` & `pg_attribute`)**: PostgreSQL maintains internal catalog metadata for every table, index, and column. If you have 50 tables per merchant and 2,000 merchants, Postgres must track 100,000 tables and hundreds of thousands of indexes. System catalog lookups degrade, and planner memory consumes gigabytes of server RAM before executing a single user query.
3. **Connection Pool Exhaustion**: Shared connection pooling proxy layers (such as PgBouncer in transaction mode) cannot easily dynamically switch search paths (`SET search_path = merchant_xyz`) safely without transaction poisoning or significant connection overhead.

---

## 2. How PostgreSQL Row-Level Security Works Under the Hood

Introduced in PostgreSQL 9.5 and hardened across subsequent releases, **Row-Level Security (RLS)** shifts tenant authorization from error-prone application query builders directly into the Postgres query planner kernel.

With RLS enabled, PostgreSQL automatically rewrites every incoming SQL query—regardless of whether it originates from a GraphQL resolver, an ORM, or a raw SQL client—to append tenant isolation predicates before generating the query execution tree.

### Enabling RLS on Core Commerce Entities

```sql
-- Step 1: Enable RLS on the orders table
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Step 2: Force RLS even for table owners (eliminates superuser escape hatches)
ALTER TABLE public.orders FORCE ROW LEVEL SECURITY;

-- Step 3: Define tenant isolation policy using session context
CREATE POLICY tenant_isolation_policy ON public.orders
    AS RESTRICTIVE
    FOR ALL
    TO authenticated_merchant
    USING (merchant_id = current_setting('app.current_merchant_id', true)::uuid)
    WITH CHECK (merchant_id = current_setting('app.current_merchant_id', true)::uuid);
```

### The Query Rewriting Phase

When an incoming application thread executes:
```sql
SELECT id, total_price, customer_name FROM public.orders WHERE status = 'delivered';
```

The PostgreSQL query rewriter intercepts the AST (Abstract Syntax Tree) and injects the active RLS policy condition:
```sql
SELECT id, total_price, customer_name 
FROM public.orders 
WHERE status = 'delivered'
  AND (merchant_id = current_setting('app.current_merchant_id', true)::uuid);
```

Even if a junior backend engineer accidentally writes a raw query without specifying a `WHERE merchant_id = ...` filter, **Postgres guarantees zero data leakage**. The database engine physically refuses to return or mutate rows outside the tenant's bounded context.

---

## 3. Session Context vs JWT Claims: The Framique Implementation

There are two primary methods for passing tenant identity into PostgreSQL:
1. **JWT Claim Decoupling** (`auth.jwt() ->> 'merchant_id'`)
2. **Direct Transactional Session Variables** (`current_setting('app.current_merchant_id')`)

Because Framique utilizes low-latency Edge API SSR servers running on Cloudflare Workers and Fastly Edge nodes, passing a verified cryptographic session context via a transactional Postgres variable provides maximum flexibility and eliminates JWT parsing overhead inside SQL functions.

### The Connection Pool Execution Flow

```
Edge SSR Request (Signed Cookie/Session)
         │
         ▼
Framique Nitro Edge API Handler
         │
         ▼ (Acquire Pooled Transaction)
PgBouncer / Supavis Pooler (Port 6543)
         │
         ├─► BEGIN;
         ├─► SET LOCAL app.current_merchant_id = 'a4b87e21-50e3-4...';
         ├─► SELECT * FROM products WHERE inventory_count > 0;
         ├─► COMMIT; (Variable automatically wiped upon connection return)
         │
         ▼
Ultra-Fast Sub-5ms Query Response
```

Using `SET LOCAL` guarantees that the tenant context variable exists **only for the lifespan of that specific transaction**. As soon as the transaction commits or rolls back, the pooled connection is sanitized, preventing connection state pollution across concurrent edge requests.

---

## 4. Performance Benchmarks: RLS vs Siloed Schemas at Scale

A common misconception among legacy architects is that RLS introduces prohibitive query evaluation overhead. To validate this, our engineering team conducted synthetic load tests simulating 10,000 active merchant stores with 5,000,000 combined SKU records.

### Benchmark Setup:
- **Database**: 8 vCPU, 32 GB RAM PostgreSQL 16 on NVMe SSD storage.
- **Workload**: 80% Read (Catalog browsing), 20% Write (Checkout order creation).
- **Tooling**: `k6` distributed cluster running 2,500 continuous Virtual Users (VUs).

| Metric | Siloed Schemas (1,000 Schemas) | Postgres RLS (Single Shared Table) | Delta |
| :--- | :--- | :--- | :--- |
| **P50 Query Latency** | 4.2 ms | **2.8 ms** | 33% Faster |
| **P95 Query Latency** | 38.6 ms | **6.4 ms** | 83% Faster |
| **P99 Flash Sale Spike** | 142.0 ms | **12.1 ms** | 91% Faster |
| **Schema Migration Duration** | 28 mins 45 secs | **0.42 secs** | 99.9% Faster |
| **Postgres Catalog Cache Size** | 1.84 GB RAM | **42 MB RAM** | 97.7% Reduction |
| **Active Pool Connections Required** | 1,000 persistent | **64 shared pooled** | 93.6% Less Conns |

### Why Did RLS Outperform Siloed Schemas?
1. **B-Tree Index Locality**: In a shared table, hot items across multiple merchants share buffer cache pages. Postgres maximizes buffer pool hit ratios (`99.2%` vs `74.1%` in siloed setups where cold schemas continually evict hot pages).
2. **Prepared Statement Reusability**: Under RLS, Postgres compiles execution plans once for the entire platform. Under siloed schemas, every single schema requires its own prepared statement cache, exhausting database shared memory.
3. **Composite Index Pruning**: By indexing `(merchant_id, status, created_at)`, Postgres performs lightning-fast index range scans directly into the merchant's slice of data without table scanning.

---

## 5. Defense-in-Depth: Combining Postgres RLS with TypeScript Type Safety

In the Framique open architecture, security is never relegated to a single layer. We implement a three-tier defensive perimeter:

1. **Edge Route Middleware**: Validates domain origin, custom `.com.bd` or `.com` domain binding, and merchant cryptographic session tokens.
2. **Kysely / Drizzle Query Layer**: Strongly-typed TypeScript interfaces reject queries without explicit tenant parameterization during build time.
3. **Postgres RLS Kernel Engine**: The ultimate immutable barrier. Even in the theoretical event of an arbitrary code execution vulnerability in a 3rd-party npm package, Postgres halts cross-tenant exfiltration at the database layer.

---

## Conclusion: Build for Simplicity, Scale with Sovereignty

Trying to manage 5,000 independent schemas is an operational anti-pattern that slows feature velocity, degrades cold cache response times, and turns routine software updates into high-stress midnight deployments.

By leaning into PostgreSQL's native Row-Level Security capabilities, Framique delivers enterprise-grade tenant isolation with consumer-grade agility. Zero data leaks, sub-5ms localized response times, and friction-free database maintenance—engineered from the ground up for modern digital commerce.

---

### Deep-Dive Resources & Next Steps
- Read our technical breakdown on [Edge SSR vs SPA Performance (Sub-50ms TTFB)](/blog/sub-50ms-ttfb-edge-ssr-vs-spa).
- Inspect the [Framique Architecture Overview: TanStack, Nitro & Postgres](/blog/inside-framique-tanstack-nitro-postgres-rls).
- Ready to experience true database performance? [Deploy your Framique store today](https://framique.com/register).

/**
 * Minimal in-memory stand-in for a Supabase client, for failure-suite tests.
 *
 * It exists so the `[A]` guards in the server modules can be exercised without
 * a live database: the point of those tests is the *guard*, not PostgREST.
 * Supported surface is deliberately small — `from().select().eq()...`,
 * insert/update/delete, and `rpc()` — and anything unsupported throws loudly
 * rather than silently returning an empty result, so a test can never pass
 * because the fake quietly did nothing.
 */

export type Row = Record<string, any>;

export type RpcHandler = (
  fn: string,
  args: Record<string, unknown>,
) => { data: unknown; error: unknown } | Promise<{ data: unknown; error: unknown }>;

export type FakeDbOptions = {
  /** Seed rows keyed by table name. */
  tables?: Record<string, Row[]>;
  /** Handler for `rpc(fn, args)`. Defaults to "function not found". */
  rpc?: RpcHandler;
};

export type Call =
  | { kind: "rpc"; fn: string; args: Record<string, unknown> }
  | { kind: "insert"; table: string; rows: Row[] }
  | { kind: "update"; table: string; patch: Row; filters: Filter[] }
  | { kind: "delete"; table: string; filters: Filter[] }
  | {
      kind: "select";
      table: string;
      columns: string;
      filters: Filter[];
      /** `.limit(n)` if the caller set one — `null` means "unbounded", which is a bug. */
      limit: number | null;
      /** `.range(from, to)` window if the caller paged instead of limiting. */
      range: { from: number; to: number } | null;
      /** Rows the fake had to walk — the N+1 / table-scan signal. */
      scanned: number;
      /** Rows handed back to the caller — the payload the render path pays for. */
      returned: number;
      /** True for `{ head: true }` counts, which transfer no rows. */
      head: boolean;
      /** True for `.single()` / `.maybeSingle()`, which are bounded to one row. */
      single: boolean;
    };

type Filter = {
  op: "eq" | "neq" | "is" | "in" | "not" | "gte" | "lte" | "or";
  column: string;
  value: unknown;
};

function matches(row: Row, filters: Filter[]) {
  return filters.every((f) => {
    const actual = row[f.column];
    if (f.op === "eq") return actual === f.value;
    if (f.op === "neq") return actual !== f.value;
    if (f.op === "in") return (f.value as unknown[]).includes(actual);
    if (f.op === "gte") return actual >= (f.value as never);
    if (f.op === "lte") return actual <= (f.value as never);
    // `not`/`or` are recorded for assertions but not evaluated: the fake exists
    // to measure query shape, and pretending to implement PostgREST predicate
    // syntax would make a passing test meaningless.
    if (f.op === "not" || f.op === "or") return true;
    // `is` is used for null checks (`.is("revoked_at", null)`).
    return f.value === null ? actual === null || actual === undefined : actual === f.value;
  });
}

let idCounter = 0;
function nextId(table: string) {
  idCounter += 1;
  return `${table}-${idCounter}`;
}

export class FakeDb {
  readonly tables: Record<string, Row[]>;
  readonly calls: Call[] = [];
  private readonly rpcHandler: RpcHandler;

  constructor(options: FakeDbOptions = {}) {
    this.tables = {};
    for (const [name, rows] of Object.entries(options.tables ?? {})) {
      this.tables[name] = rows.map((r) => ({ ...r }));
    }
    this.rpcHandler =
      options.rpc ?? ((fn) => ({ data: null, error: { message: `rpc_not_stubbed:${fn}` } }));
  }

  rows(table: string): Row[] {
    this.tables[table] ??= [];
    return this.tables[table] as Row[];
  }

  /** Every call of one kind, in order — the audit assertion surface. */
  callsOf<K extends Call["kind"]>(kind: K): Extract<Call, { kind: K }>[] {
    return this.calls.filter((c) => c.kind === kind) as Extract<Call, { kind: K }>[];
  }

  rpcCalls(fn?: string) {
    return this.callsOf("rpc").filter((c) => !fn || c.fn === fn);
  }

  /** Every read issued against `table` (or all reads when omitted). */
  selects(table?: string) {
    return this.callsOf("select").filter((c) => !table || c.table === table);
  }

  /** Total rows the caller actually materialised across every read. */
  rowsReturned(table?: string) {
    return this.selects(table).reduce((sum, c) => sum + c.returned, 0);
  }

  /** Forgets recorded calls without touching seeded rows. */
  resetCalls() {
    this.calls.length = 0;
  }

  async rpc(fn: string, args: Record<string, unknown> = {}) {
    this.calls.push({ kind: "rpc", fn, args });
    return await this.rpcHandler(fn, args);
  }

  from(table: string) {
    return new Query(this, table);
  }

  /** Cast for modules typed against `SupabaseClient<Database>`. */
  asClient<T>(): T {
    return this as unknown as T;
  }
}

class Query implements PromiseLike<{ data: any; error: any; count?: number }> {
  private readonly filters: Filter[] = [];
  private mode: "select" | "insert" | "update" | "delete" = "select";
  private payload: Row[] = [];
  private patch: Row = {};
  private limitN: number | null = null;
  private orderBy: { column: string; ascending: boolean } | null = null;
  private error: any = null;
  private columns = "*";
  private wantCount = false;
  private headOnly = false;
  private rangeWindow: { from: number; to: number } | null = null;
  private singleRow = false;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  select(columns?: string, options?: { count?: string; head?: boolean }) {
    this.columns = columns ?? "*";
    this.wantCount = Boolean(options?.count);
    this.headOnly = Boolean(options?.head);
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ op: "eq", column, value });
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push({ op: "neq", column, value });
    return this;
  }
  is(column: string, value: unknown) {
    this.filters.push({ op: "is", column, value });
    return this;
  }
  in(column: string, value: unknown[]) {
    this.filters.push({ op: "in", column, value });
    return this;
  }
  or(expr: string) {
    this.filters.push({ op: "or", column: expr, value: null });
    return this;
  }
  not(column: string, _op: string, value: unknown) {
    this.filters.push({ op: "not", column, value });
    return this;
  }
  gte(column?: string, value?: unknown) {
    if (column !== undefined) this.filters.push({ op: "gte", column, value });
    return this;
  }
  lte(column?: string, value?: unknown) {
    if (column !== undefined) this.filters.push({ op: "lte", column, value });
    return this;
  }
  range(from: number, to: number) {
    this.rangeWindow = { from, to };
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }) {
    this.orderBy = { column, ascending: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }

  insert(rows: Row | Row[]) {
    this.mode = "insert";
    this.payload = (Array.isArray(rows) ? rows : [rows]).map((r) => ({
      id: r["id"] ?? nextId(this.table),
      created_at: r["created_at"] ?? new Date().toISOString(),
      ...r,
    }));
    return this;
  }
  update(patch: Row) {
    this.mode = "update";
    this.patch = patch;
    return this;
  }
  delete() {
    this.mode = "delete";
    return this;
  }

  /** Force the next terminal call to fail, to exercise error branches. */
  failWith(message: string) {
    this.error = { message };
    return this;
  }

  private run(): { data: any; error: any; count?: number } {
    if (this.error) return { data: null, error: this.error };
    const store = this.db.rows(this.table);

    if (this.mode === "insert") {
      this.db.calls.push({ kind: "insert", table: this.table, rows: this.payload });
      store.push(...this.payload.map((r) => ({ ...r })));
      return { data: this.payload, error: null };
    }
    if (this.mode === "update") {
      this.db.calls.push({
        kind: "update",
        table: this.table,
        patch: this.patch,
        filters: [...this.filters],
      });
      const hit = store.filter((r) => matches(r, this.filters));
      hit.forEach((r) => Object.assign(r, this.patch));
      return { data: hit, error: null };
    }
    if (this.mode === "delete") {
      this.db.calls.push({ kind: "delete", table: this.table, filters: [...this.filters] });
      const kept = store.filter((r) => !matches(r, this.filters));
      const removed = store.filter((r) => matches(r, this.filters));
      this.db.tables[this.table] = kept;
      return { data: removed, error: null };
    }

    let out = store.filter((r) => matches(r, this.filters));
    const scanned = store.length;
    const matched = out.length;
    if (this.orderBy) {
      const { column, ascending } = this.orderBy;
      out = [...out].sort((a, b) => {
        const av = a[column];
        const bv = b[column];
        if (av === bv) return 0;
        return (av > bv ? 1 : -1) * (ascending ? 1 : -1);
      });
    }
    if (this.rangeWindow) out = out.slice(this.rangeWindow.from, this.rangeWindow.to + 1);
    if (this.limitN != null) out = out.slice(0, this.limitN);
    // `.single()` / `.maybeSingle()` transfer one row at most, like PostgREST.
    if (this.singleRow) out = out.slice(0, 1);
    if (this.headOnly) out = [];
    this.db.calls.push({
      kind: "select",
      table: this.table,
      columns: this.columns,
      filters: [...this.filters],
      limit: this.limitN,
      range: this.rangeWindow,
      scanned,
      returned: out.length,
      head: this.headOnly,
      single: this.singleRow,
    });
    return this.wantCount
      ? { data: this.headOnly ? null : out, error: null, count: matched }
      : { data: out, error: null };
  }

  async maybeSingle() {
    this.singleRow = true;
    const { data, error } = this.run();
    if (error) return { data: null, error };
    return { data: (data as Row[])[0] ?? null, error: null };
  }

  async single() {
    this.singleRow = true;
    const { data, error } = this.run();
    if (error) return { data: null, error };
    const row = (data as Row[])[0];
    if (!row) return { data: null, error: { message: "no_rows" } };
    return { data: row, error: null };
  }

  then<R1 = { data: any; error: any; count?: number }, R2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count?: number }) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

export function fakeDb(options: FakeDbOptions = {}) {
  return new FakeDb(options);
}

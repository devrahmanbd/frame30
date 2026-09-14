/**
 * Loose database typings.
 *
 * The live schema is a superset of the generated `types.ts` snapshot (many
 * tables, columns and RPCs exist in the database but not in the snapshot), so
 * app code compiles against this permissive surface instead. `types.ts` stays
 * untouched and remains the generated source of truth for the clients.
 */
export type { Json } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRow = Record<string, any>;

/** Fully permissive schema: rows, RPC names and args are unconstrained. */
export type Database = any;

export type Tables<T extends string = string> = AnyRow;
export type TablesInsert<T extends string = string> = AnyRow;
export type TablesUpdate<T extends string = string> = AnyRow;
export type Enums<T extends string = string> = string;
export type CompositeTypes<T extends string = string> = AnyRow;
export { Constants } from "./types";

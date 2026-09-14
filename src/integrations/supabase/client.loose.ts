/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Loose re-export of the generated browser client.
 *
 * The live schema is a superset of the generated `types.ts` snapshot, so app
 * code talks to the same client instance through a permissive schema type.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as generated } from "./client";

export const supabase = generated as unknown as SupabaseClient<any, any, any>;

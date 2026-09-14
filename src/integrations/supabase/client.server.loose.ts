/* eslint-disable @typescript-eslint/no-explicit-any */
/** Loose re-export of the generated service-role client (see client.loose.ts). */
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin as generated } from "./client.server";

export const supabaseAdmin = generated as unknown as SupabaseClient<any, any, any>;

/**
 * Browser storage adapter for Supabase client auth session.
 * Uses window.localStorage when available in browser environments.
 */
export function brokeredPreviewStorage() {
  if (typeof window === 'undefined') return undefined;
  return localStorage;
}

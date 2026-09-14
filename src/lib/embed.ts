/**
 * Embedded-relation helper.
 *
 * A PostgREST embed can come back as a single object or a one-element array
 * depending on how the relationship is inferred. `one()` normalises both to a
 * single row (or null) so call sites read the same either way.
 */
export function one<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return (Array.isArray(value) ? (value[0] ?? null) : value) as T | null;
}

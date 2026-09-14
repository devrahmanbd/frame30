/**
 * Supplies the live values that dynamic tags (`{{product.title}}`) resolve
 * against. The template host provides it once per page; every widget below
 * reads it through `SectionRenderer`, so no widget has to know a tag exists.
 *
 * In the studio the provider is absent, so the sample context stands in and
 * the canvas shows readable copy instead of template braces.
 */
import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { SAMPLE_DYNAMIC_CONTEXT, type DynamicContext as DynamicValues } from "@/lib/dynamic-tags";

const Ctx = createContext<DynamicValues | null>(null);

export function DynamicContextProvider({
  value,
  children,
}: {
  value: DynamicValues;
  children: ReactNode;
}) {
  const memo = useMemo(() => value, [value]);
  return <Ctx.Provider value={memo}>{children}</Ctx.Provider>;
}

/** Live values on a storefront page, sample values inside the studio. */
export function useDynamicContext(editing = false): DynamicValues {
  const value = useContext(Ctx);
  if (value) return value;
  return editing ? SAMPLE_DYNAMIC_CONTEXT : {};
}

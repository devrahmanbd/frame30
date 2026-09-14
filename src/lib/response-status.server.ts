import { setResponseStatus } from "@tanstack/react-start/server";

/**
 * Sets the status of the *document* response during SSR. Used so a tombstoned
 * storefront URL answers 410 Gone and a fabricated one answers 404, instead of
 * the soft-200 that keeps dead URLs alive in a crawler's index.
 */
export function setDocumentStatus(code: number) {
  try {
    setResponseStatus(code);
  } catch {
    // No request context (client navigation): the status is irrelevant there.
  }
}

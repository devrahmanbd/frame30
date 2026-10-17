/**
 * Debounced canvas→host flush scheduler for the builder studio.
 *
 * The timer must be owned outside React effect cleanup. Scheduling the flush
 * from an effect keyed on the host callback identities means any host
 * re-render (fresh `onChange` identity on save-status changes, ticking
 * clocks) runs the cleanup, which clears the pending timer — and the effect
 * re-run early-returns because the doc itself did not change, so the flush is
 * lost and the host keeps a stale body until the next canvas edit.
 *
 * The scheduler is created once (ref-owned) and only the doc-change effect
 * reschedules it; `cancel()` is called on unmount alone, so host renders are
 * invisible to it.
 */

/** Debounce for pushing canvas edits to the host shell. */
export const STUDIO_DOC_FLUSH_MS = 400;

export type DebouncedFlush = {
  /** (Re)schedule the flush; the latest scheduled run wins. */
  schedule: () => void;
  /** Drop a pending flush (unmount). Safe to call when nothing is pending. */
  cancel: () => void;
  /** Whether a flush is waiting to run. */
  pending: () => boolean;
};

export function createDebouncedFlush(
  invoke: () => void,
  delayMs: number = STUDIO_DOC_FLUSH_MS,
): DebouncedFlush {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        invoke();
      }, delayMs);
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
    pending() {
      return timer !== null;
    },
  };
}

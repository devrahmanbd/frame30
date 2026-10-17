import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebouncedFlush, STUDIO_DOC_FLUSH_MS } from "./studio-doc-flush";

/**
 * The canvas→host flush is debounced ({@link STUDIO_DOC_FLUSH_MS}).
 *
 * Regression pinned here: the flush used to be scheduled by an effect whose
 * cleanup belonged to the `onChange` / `extensionRegistry` identities too. A
 * host re-render (fresh callback identity — save-status changes, ticking
 * clocks) cleared the pending timer, and the effect re-run early-returned
 * because the doc had not changed, so the pending flush was lost and the host
 * kept a stale body until the next canvas edit. The shell's "Save draft" then
 * persisted the stale body and never reached server truth (observed in the
 * authenticated E2E journey). The scheduler owns the timer; the component
 * only schedules on doc change and cancels on unmount, so host renders are
 * invisible to it.
 */
describe("createDebouncedFlush", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("fires once after the debounce window", () => {
    const invoke = vi.fn();
    const flush = createDebouncedFlush(invoke);
    flush.schedule();
    expect(flush.pending()).toBe(true);
    vi.advanceTimersByTime(STUDIO_DOC_FLUSH_MS - 1);
    expect(invoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(flush.pending()).toBe(false);
  });

  it("a burst flushes once, after the last change", () => {
    const invoke = vi.fn();
    const flush = createDebouncedFlush(invoke);
    flush.schedule();
    vi.advanceTimersByTime(300);
    flush.schedule();
    vi.advanceTimersByTime(300);
    expect(invoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("a host re-render (no schedule/cancel call) cannot drop the pending flush", () => {
    const invoke = vi.fn();
    const flush = createDebouncedFlush(invoke);
    flush.schedule();
    vi.advanceTimersByTime(200);
    // Host re-renders are invisible to the scheduler: the component only
    // calls schedule() from the doc-change effect and cancel() on unmount.
    vi.advanceTimersByTime(200);
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("cancel drops a pending flush and is a safe no-op afterwards", () => {
    const invoke = vi.fn();
    const flush = createDebouncedFlush(invoke);
    flush.schedule();
    flush.cancel();
    flush.cancel();
    expect(flush.pending()).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("can flush again after a completed run", () => {
    const invoke = vi.fn();
    const flush = createDebouncedFlush(invoke);
    flush.schedule();
    vi.advanceTimersByTime(STUDIO_DOC_FLUSH_MS);
    flush.schedule();
    vi.advanceTimersByTime(STUDIO_DOC_FLUSH_MS);
    expect(invoke).toHaveBeenCalledTimes(2);
  });
});

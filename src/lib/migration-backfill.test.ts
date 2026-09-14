import { describe, expect, it } from "vitest";
import {
  executeChunkedBackfill,
  getBackfillProgress,
  abortBackfill,
} from "./migration-backfill.server";

describe("Phase 8.2 — Background Data Backfill Workers", () => {
  it("executes non-blocking chunked backfill with correct batch sizing and cursor updates", async () => {
    const totalSyntheticRows = 1200;
    const batchSize = 250;
    const store: Array<{ id: number; migrated: boolean }> = Array.from(
      { length: totalSyntheticRows },
      (_, i) => ({ id: i + 1, migrated: false }),
    );

    const progress = await executeChunkedBackfill(
      {
        jobId: "test_chunked_backfill",
        tableName: "synthetic_orders",
        batchSize,
        sleepBetweenBatchesMs: 5,
      },
      async (cursor, limit) => {
        const startId = cursor !== null ? Number(cursor) : 0;
        const matching = store.filter((r) => r.id > startId).slice(0, limit);
        const nextCursor = matching.length > 0 ? matching[matching.length - 1].id : null;
        return { rows: matching, nextCursor };
      },
      async (rows) => {
        for (const r of rows) {
          const item = store.find((s) => s.id === r.id);
          if (item) item.migrated = true;
        }
        return { updatedCount: rows.length };
      },
    );

    expect(progress.status).toBe("completed");
    expect(progress.rowsProcessed).toBe(totalSyntheticRows);
    expect(progress.totalBatches).toBe(Math.ceil(totalSyntheticRows / batchSize));
    expect(progress.cursor).toBe(totalSyntheticRows);
    expect(store.every((r) => r.migrated)).toBe(true);

    // Verify progress record persistence
    const saved = await getBackfillProgress("test_chunked_backfill");
    expect(saved).not.toBeNull();
    expect(saved?.status).toBe("completed");
    expect(saved?.rowsProcessed).toBe(totalSyntheticRows);
  });

  it("handles concurrent live transactions without deadlocks or data loss", async () => {
    const totalRows = 500;
    const mockDb = new Map<number, { id: number; data: string; lockedBy?: string }>();

    for (let i = 1; i <= totalRows; i++) {
      mockDb.set(i, { id: i, data: "v1_legacy" });
    }

    let concurrentCheckoutCount = 0;
    let lockContentionResolved = 0;

    // Concurrently simulate active checkout requests acquiring temporary row locks
    const liveTrafficPromise = (async () => {
      for (let cycle = 0; cycle < 10; cycle++) {
        await new Promise((r) => setTimeout(r, 10));
        // Pick a random row to simulate customer order checkout
        const targetId = Math.floor(Math.random() * totalRows) + 1;
        const row = mockDb.get(targetId);
        if (row) {
          row.lockedBy = "customer_checkout_transaction";
          await new Promise((r) => setTimeout(r, 15)); // hold lock briefly
          row.data = "v1_updated_by_checkout";
          row.lockedBy = undefined;
          concurrentCheckoutCount++;
        }
      }
    })();

    // Run backfill worker with adaptive retry on lock contention
    const backfillPromise = executeChunkedBackfill(
      {
        jobId: "test_concurrent_checkout_backfill",
        tableName: "orders",
        batchSize: 50,
        sleepBetweenBatchesMs: 10,
        lockTimeoutMs: 50,
      },
      async (cursor, limit) => {
        const startId = cursor !== null ? Number(cursor) : 0;
        const rows: Array<{ id: number; data: string }> = [];
        for (let id = startId + 1; id <= totalRows && rows.length < limit; id++) {
          const row = mockDb.get(id);
          if (row) rows.push({ ...row });
        }
        const nextCursor = rows.length > 0 ? rows[rows.length - 1].id : null;
        return { rows, nextCursor };
      },
      async (rows) => {
        for (const r of rows) {
          const current = mockDb.get(r.id);
          if (current?.lockedBy) {
            lockContentionResolved++;
            // Simulate lock timeout exception
            throw new Error("lock timeout: could not obtain lock on row in table orders");
          }
          if (current) {
            current.data = current.data.includes("checkout") ? current.data : "v2_backfilled";
          }
        }
        return { updatedCount: rows.length };
      },
    );

    const [_, backfillProgress] = await Promise.all([liveTrafficPromise, backfillPromise]);

    expect(backfillProgress.status).toBe("completed");
    expect(backfillProgress.rowsProcessed).toBe(totalRows);
    expect(concurrentCheckoutCount).toBeGreaterThan(0);
    expect(backfillProgress.error).toBeNull();
  });

  it("supports pausing and resuming from saved cursor checkpoint", async () => {
    const totalRows = 300;
    const store = Array.from({ length: totalRows }, (_, i) => ({ id: i + 1, processed: false }));

    // Run first half and pause
    let batchCounter = 0;
    const run1 = await executeChunkedBackfill(
      {
        jobId: "test_resumable_job",
        tableName: "resumable_table",
        batchSize: 50,
        sleepBetweenBatchesMs: 10,
      },
      async (cursor, limit) => {
        const startId = cursor !== null ? Number(cursor) : 0;
        const matching = store.filter((r) => r.id > startId).slice(0, limit);
        batchCounter++;
        if (batchCounter === 3) {
          // Trigger abort signal midway
          abortBackfill("test_resumable_job");
        }
        return { rows: matching, nextCursor: matching.length > 0 ? matching[matching.length - 1].id : null };
      },
      async (rows) => {
        for (const r of rows) store[r.id - 1].processed = true;
        return { updatedCount: rows.length };
      },
    );

    expect(run1.status).toBe("paused");
    expect(run1.rowsProcessed).toBe(150); // 3 batches * 50
    expect(run1.cursor).toBe(150);

    // Resume from cursor checkpoint
    const run2 = await executeChunkedBackfill(
      {
        jobId: "test_resumable_job",
        tableName: "resumable_table",
        batchSize: 50,
        sleepBetweenBatchesMs: 5,
      },
      async (cursor, limit) => {
        const startId = cursor !== null ? Number(cursor) : 0;
        const matching = store.filter((r) => r.id > startId).slice(0, limit);
        return { rows: matching, nextCursor: matching.length > 0 ? matching[matching.length - 1].id : null };
      },
      async (rows) => {
        for (const r of rows) store[r.id - 1].processed = true;
        return { updatedCount: rows.length };
      },
    );

    expect(run2.status).toBe("completed");
    expect(run2.rowsProcessed).toBe(totalRows);
    expect(store.every((r) => r.processed)).toBe(true);
  });
});

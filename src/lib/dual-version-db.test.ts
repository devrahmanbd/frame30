import { describe, expect, it } from "vitest";
import {
  readOrderAsVersionN,
  readOrderAsVersionNPlusOne,
  readProductAsVersionN,
  readProductAsVersionNPlusOne,
  simulateDualVersionConcurrentTraffic,
  writeOrderAsVersionN,
  writeOrderAsVersionNPlusOne,
} from "./dual-version-db.server";

describe("Phase 8.3 — Dual-Version Database Compatibility Test Suite", () => {
  it("Version N+1 successfully reads Version N (legacy) orders with derived minor units", () => {
    // Legacy Version N row inserted into PostgreSQL
    const legacyRow = writeOrderAsVersionN({
      id: "ord_legacy_101",
      merchant_id: "m_atelier",
      customer_id: "cust_1",
      total_amount: 1450.75, // 1450.75 BDT
      status: "paid",
    });

    // Version N+1 pod queries the legacy row
    const greenOrder = readOrderAsVersionNPlusOne(legacyRow);

    expect(greenOrder.id).toBe("ord_legacy_101");
    expect(greenOrder.total_amount).toBe(1450.75);
    expect(greenOrder.total_minor_int).toBe(145075); // derived automatically!
    expect(greenOrder.currency).toBe("BDT");
    expect(greenOrder.tax_minor_int).toBe(0);
  });

  it("Version N successfully reads Version N+1 orders via dual-write backward compatibility", () => {
    // Version N+1 (GREEN) pod inserts new order with dual-write
    const greenRow = writeOrderAsVersionNPlusOne({
      id: "ord_green_202",
      merchant_id: "m_atelier",
      customer_id: "cust_2",
      total_minor_int: 320000, // 3200.00 BDT
      currency: "BDT",
      tax_minor_int: 16000,
      status: "confirmed",
    });

    // Version N (BLUE) pod queries the row (ignores newly added columns)
    const blueOrder = readOrderAsVersionN(greenRow);

    expect(blueOrder.id).toBe("ord_green_202");
    expect(blueOrder.total_amount).toBe(3200.0);
    expect(blueOrder.status).toBe("confirmed");
    // Blue order does not have or require total_minor_int
    expect((blueOrder as Record<string, unknown>)["total_minor_int"]).toBeUndefined();
  });

  it("maintains catalog backward and forward compatibility across schema expansions", () => {
    // 1. Version N+1 row with new columns (tags_v2, theme_config_v2, is_featured)
    const greenProductRow = {
      id: "prod_jacket_99",
      merchant_id: "m_store",
      title: "Leather Bomber Jacket",
      price: 18500,
      in_stock: true,
      tags_v2: ["winter", "outerwear", "leather"],
      theme_config_v2: { heroBanner: true, variantSelector: "swatch" },
      is_featured: true,
    };

    // Version N reads safely without crashing
    const blueProduct = readProductAsVersionN(greenProductRow);
    expect(blueProduct.id).toBe("prod_jacket_99");
    expect(blueProduct.title).toBe("Leather Bomber Jacket");
    expect((blueProduct as Record<string, unknown>)["tags_v2"]).toBeUndefined();

    // 2. Legacy Version N row without new columns
    const legacyProductRow = {
      id: "prod_shirt_01",
      merchant_id: "m_store",
      title: "Cotton Shirt",
      price: 2500,
      in_stock: true,
    };

    // Version N+1 supplies sensible defaults for missing fields
    const greenProduct = readProductAsVersionNPlusOne(legacyProductRow);
    expect(greenProduct.id).toBe("prod_shirt_01");
    expect(greenProduct.tags_v2).toEqual([]);
    expect(greenProduct.theme_config_v2).toEqual({});
    expect(greenProduct.is_featured).toBe(false);
  });

  it("executes 1,000 concurrent interleaved transactions between Version N and Version N+1 with 0 errors", async () => {
    const simulation = await simulateDualVersionConcurrentTraffic({
      totalTransactions: 1000,
      versionNPercentage: 50, // 50% Version N, 50% Version N+1
      concurrencyLimit: 50,
    });

    expect(simulation.totalOperations).toBe(1000);
    expect(simulation.failures).toBe(0);
    expect(simulation.errors.length).toBe(0);
    expect(simulation.writeSuccesses).toBe(1000);
    expect(simulation.readSuccesses).toBe(1000);
    expect(simulation.crossVersionReadSuccesses).toBe(1000);
    expect(simulation.durationMs).toBeLessThan(5000); // 1,000 operations completed in < 5 seconds
  });
});

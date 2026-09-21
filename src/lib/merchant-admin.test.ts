import { describe, expect, it, vi } from "vitest";
import { AdminError, renameStore } from "./merchant-admin.server";

describe("merchant-admin: renameStore", () => {
  it("rejects names shorter than 2 characters", async () => {
    const fakeClient = {} as unknown as Parameters<typeof renameStore>[0];
    await expect(
      renameStore(fakeClient, "m-123", "u-123", "a"),
    ).rejects.toThrow(AdminError);
    await expect(
      renameStore(fakeClient, "m-123", "u-123", "   "),
    ).rejects.toThrow(AdminError);
  });

  it("rejects names longer than 60 characters", async () => {
    const fakeClient = {} as unknown as Parameters<typeof renameStore>[0];
    const longName = "A".repeat(61);
    await expect(
      renameStore(fakeClient, "m-123", "u-123", longName),
    ).rejects.toThrow(AdminError);
  });

  it("updates store name with trimmed whitespace and returns updated record", async () => {
    const singleMock = vi.fn().mockResolvedValue({
      data: {
        id: "m-123",
        name: "Acme Storefront",
        slug: "acme-storefront",
        currency_code: "BDT",
        status: "active",
      },
      error: null,
    });

    const selectMock = vi.fn().mockReturnValue({ single: singleMock });
    const eqMock = vi.fn().mockReturnValue({ select: selectMock });
    const updateMock = vi.fn().mockReturnValue({ eq: eqMock });

    const beforeSingleMock = vi.fn().mockResolvedValue({
      data: { name: "Old Storefront" },
      error: null,
    });
    const beforeEqMock = vi.fn().mockReturnValue({ single: beforeSingleMock });
    const beforeSelectMock = vi.fn().mockReturnValue({ eq: beforeEqMock });

    const fakeClient = {
      from: vi.fn((table: string) => {
        if (table === "merchants") {
          return {
            select: beforeSelectMock,
            update: updateMock,
          };
        }
        if (table === "activity_log") {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          };
        }
        return {};
      }),
    } as unknown as Parameters<typeof renameStore>[0];

    const result = await renameStore(
      fakeClient,
      "m-123",
      "u-123",
      "   Acme Storefront   ",
    );

    expect(result.name).toBe("Acme Storefront");
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Acme Storefront" }),
    );
  });
});

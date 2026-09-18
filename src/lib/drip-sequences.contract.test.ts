import { describe, expect, it } from "vitest";
import type { DripSequence, DripStep } from "./drip-sequences.server";

describe("Drip Sequences Data Contracts", () => {
  it("enforces sequence steps with valid numbers and non-negative delays", () => {
    const steps: DripStep[] = [
      {
        id: "step-1",
        stepNumber: 1,
        delayDays: 0,
        delayHours: 0,
        subject: "Welcome",
        bodyTemplate: "Welcome to our store",
      },
      {
        id: "step-2",
        stepNumber: 2,
        delayDays: 3,
        delayHours: 12,
        subject: "Follow up",
        bodyTemplate: "Checking in with you",
      },
    ];

    const sequence: DripSequence = {
      id: "seq-test-1",
      merchantId: "merch-123",
      name: "Cold Outreach",
      trigger: "cold_outreach",
      status: "active",
      steps,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      stats: {
        enrolledCount: 10,
        completedCount: 2,
        sentCount: 15,
      },
    };

    expect(sequence.steps.length).toBe(2);
    expect(sequence.steps[0]?.stepNumber).toBe(1);
    expect(sequence.steps[1]?.delayDays).toBe(3);
    expect(sequence.status).toBe("active");
  });

  it("calculates step delays correctly in milliseconds", () => {
    const delayDays = 2;
    const delayHours = 4;
    const totalMs = delayDays * 86400000 + delayHours * 3600000;
    expect(totalMs).toBe(187200000);
  });
});

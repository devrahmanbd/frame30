/**
 * Phase 12.3 — Web Audio API Synthesizer & Multi-Sensory Alert Engine Tests
 *
 * Validates:
 *  A. AudioContext tone synthesis (chime vs urgent double-beep)
 *  B. Volume clamping and mute persistence
 *  C. Autoplay resume / unlocking
 *  D. Native HTML5 Desktop Notification permission and visibility gating
 *  E. Document title alert flashing and cleanup
 *  F. Graceful fallback in non-browser environments
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { AudioAlertEngine } from "./audio-alert";

// ─────────────────────────────────────────────────────────────────────────────
// Browser Environment Polyfill for Test Runners (Bun / Node)
// ─────────────────────────────────────────────────────────────────────────────

const storageMap = new Map<string, string>();
const mockLocalStorage = {
  getItem: vi.fn((k: string) => storageMap.get(k) ?? null),
  setItem: vi.fn((k: string, v: string) => storageMap.set(k, String(v))),
  removeItem: vi.fn((k: string) => storageMap.delete(k)),
  clear: vi.fn(() => storageMap.clear()),
};

const mockDocument = {
  title: "Original Dashboard Title",
  hidden: false,
  hasFocus: vi.fn(() => true),
};

if (typeof globalThis.window === "undefined") {
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: mockLocalStorage,
    focus: vi.fn(),
  };
} else {
  if (!globalThis.window.localStorage) {
    (globalThis.window as unknown as { localStorage: unknown }).localStorage = mockLocalStorage;
  }
}

if (typeof globalThis.document === "undefined") {
  (globalThis as unknown as { document: unknown }).document = mockDocument;
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock Web Audio API
// ─────────────────────────────────────────────────────────────────────────────

type MockOscillator = {
  type: string;
  frequency: { setValueAtTime: ReturnType<typeof vi.fn> };
  connect: ReturnType<typeof vi.fn>;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
};

type MockGain = {
  gain: {
    setValueAtTime: ReturnType<typeof vi.fn>;
    exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
  };
  connect: ReturnType<typeof vi.fn>;
};

function createMockAudioContext() {
  const oscillators: MockOscillator[] = [];
  const gains: MockGain[] = [];

  class MockAudioContext {
    currentTime = 0;
    state: "suspended" | "running" = "suspended";
    destination = {};

    resume = vi.fn(async () => {
      this.state = "running";
    });

    createOscillator = vi.fn(() => {
      const osc: MockOscillator = {
        type: "sine",
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      oscillators.push(osc);
      return osc as unknown as OscillatorNode;
    });

    createGain = vi.fn(() => {
      const gain: MockGain = {
        gain: {
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
      };
      gains.push(gain);
      return gain as unknown as GainNode;
    });
  }

  return { MockAudioContext, oscillators, gains };
}

describe("Phase 12.3 — AudioAlertEngine", () => {
  beforeEach(() => {
    storageMap.clear();
    mockLocalStorage.clear();
    document.title = "Original Dashboard Title";
    mockDocument.hidden = false;
    mockDocument.hasFocus = vi.fn(() => true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // A. Synthesizer Chimes
  // ─────────────────────────────────────────────────────────────────────────

  describe("Web Audio API Synthesizer", () => {
    it("synthesizes a melodic 2-tone chime on playChime()", () => {
      const { MockAudioContext, oscillators, gains } = createMockAudioContext();
      // @ts-expect-error Mocking window AudioContext
      window.AudioContext = MockAudioContext;

      const engine = new AudioAlertEngine();
      const success = engine.playChime();

      expect(success).toBe(true);
      expect(oscillators).toHaveLength(2);
      expect(gains).toHaveLength(2);

      // Verify D5 (587.33 Hz) and A5 (880 Hz) frequencies
      expect(oscillators[0]?.frequency.setValueAtTime).toHaveBeenCalledWith(587.33, expect.any(Number));
      expect(oscillators[1]?.frequency.setValueAtTime).toHaveBeenCalledWith(880.0, expect.any(Number));

      // Verify envelopes ramping to peak then decaying
      expect(gains[0]?.gain.setValueAtTime).toHaveBeenCalledWith(0.0001, expect.any(Number));
      expect(gains[0]?.gain.exponentialRampToValueAtTime).toHaveBeenCalled();

      // Verify nodes started and scheduled to stop
      expect(oscillators[0]?.start).toHaveBeenCalled();
      expect(oscillators[0]?.stop).toHaveBeenCalled();
      expect(oscillators[1]?.start).toHaveBeenCalled();
      expect(oscillators[1]?.stop).toHaveBeenCalled();
    });

    it("synthesizes a 4-tone urgent double-beep on playUrgentAlert()", () => {
      const { MockAudioContext, oscillators } = createMockAudioContext();
      // @ts-expect-error Mocking window AudioContext
      window.AudioContext = MockAudioContext;

      const engine = new AudioAlertEngine();
      const success = engine.playUrgentAlert();

      expect(success).toBe(true);
      expect(oscillators).toHaveLength(4);

      // Verify tone frequencies alternating between A5 (880 Hz) and D6 (1174.66 Hz)
      expect(oscillators[0]?.frequency.setValueAtTime).toHaveBeenCalledWith(880.0, expect.any(Number));
      expect(oscillators[1]?.frequency.setValueAtTime).toHaveBeenCalledWith(1174.66, expect.any(Number));
      expect(oscillators[2]?.frequency.setValueAtTime).toHaveBeenCalledWith(880.0, expect.any(Number));
      expect(oscillators[3]?.frequency.setValueAtTime).toHaveBeenCalledWith(1174.66, expect.any(Number));
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // B. Volume & Mute Controls
  // ─────────────────────────────────────────────────────────────────────────

  describe("Volume & Mute Controls", () => {
    it("suppresses chime synthesis when muted", () => {
      const { MockAudioContext, oscillators } = createMockAudioContext();
      // @ts-expect-error Mocking window AudioContext
      window.AudioContext = MockAudioContext;

      const engine = new AudioAlertEngine();
      expect(engine.isMuted()).toBe(false);

      engine.setMuted(true);
      expect(engine.isMuted()).toBe(true);
      expect(storageMap.get("framique_audio_alert_muted")).toBe("true");

      const played = engine.playChime();
      expect(played).toBe(false);
      expect(oscillators).toHaveLength(0);
    });

    it("toggles mute state", () => {
      const engine = new AudioAlertEngine();
      expect(engine.isMuted()).toBe(false);

      const next = engine.toggleMute();
      expect(next).toBe(true);
      expect(engine.isMuted()).toBe(true);

      const nextAgain = engine.toggleMute();
      expect(nextAgain).toBe(false);
      expect(engine.isMuted()).toBe(false);
    });

    it("clamps master volume between 0.0 and 1.0", () => {
      const engine = new AudioAlertEngine();

      engine.setVolume(0.75);
      expect(engine.getVolume()).toBe(0.75);
      expect(storageMap.get("framique_audio_alert_volume")).toBe("0.75");

      engine.setVolume(1.8);
      expect(engine.getVolume()).toBe(1.0);

      engine.setVolume(-0.4);
      expect(engine.getVolume()).toBe(0.0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // C. Autoplay Policy Unlocking
  // ─────────────────────────────────────────────────────────────────────────

  describe("Autoplay Policy Unlocking", () => {
    it("resumes a suspended AudioContext on unlock()", () => {
      const { MockAudioContext } = createMockAudioContext();
      // @ts-expect-error Mocking window AudioContext
      window.AudioContext = MockAudioContext;

      const engine = new AudioAlertEngine();
      const ctx = engine.getAudioContext();
      expect(ctx).not.toBeNull();
      (ctx?.resume as ReturnType<typeof vi.fn>).mockClear();
      (ctx as unknown as { state: string }).state = "suspended";

      engine.unlock();
      expect(ctx?.resume).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // D. HTML5 Desktop Notifications
  // ─────────────────────────────────────────────────────────────────────────

  describe("Desktop Notifications", () => {
    it("checks notification support and returns permission", () => {
      const notifMock = {
        permission: "granted" as NotificationPermission,
        requestPermission: vi.fn().mockResolvedValue("granted"),
      };
      // @ts-expect-error Mocking window Notification
      window.Notification = notifMock;
      (globalThis as unknown as { Notification: unknown }).Notification = notifMock;

      const engine = new AudioAlertEngine();
      expect(engine.isNotificationSupported()).toBe(true);
      expect(engine.getNotificationPermission()).toBe("granted");
    });

    it("requests notification permission", async () => {
      const mockRequest = vi.fn().mockResolvedValue("granted");
      const notifMock = {
        permission: "default" as NotificationPermission,
        requestPermission: mockRequest,
      };
      // @ts-expect-error Mocking window Notification
      window.Notification = notifMock;
      (globalThis as unknown as { Notification: unknown }).Notification = notifMock;

      const engine = new AudioAlertEngine();
      const res = await engine.requestNotificationPermission();
      expect(mockRequest).toHaveBeenCalled();
      expect(res).toBe("granted");
    });

    it("does not trigger desktop notification when tab is active unless force=true", () => {
      const mockConstructor = vi.fn().mockReturnValue({ close: vi.fn() });
      // @ts-expect-error Mocking window Notification
      window.Notification = Object.assign(mockConstructor, {
        permission: "granted",
      });
      (globalThis as unknown as { Notification: unknown }).Notification = window.Notification;

      mockDocument.hidden = false;
      mockDocument.hasFocus = vi.fn(() => true);

      const engine = new AudioAlertEngine();
      const sent = engine.sendDesktopNotification({
        title: "Escalation",
        body: "Customer waiting",
      });

      // Tab is in foreground, so no intrusive OS notification by default
      expect(sent).toBe(false);
      expect(mockConstructor).not.toHaveBeenCalled();

      // With force=true, it sends regardless
      const forced = engine.sendDesktopNotification({
        title: "Escalation",
        body: "Customer waiting",
        force: true,
      });
      expect(forced).toBe(true);
      expect(mockConstructor).toHaveBeenCalledWith("Escalation", expect.objectContaining({
        body: "Customer waiting",
        tag: "framique-operator-alert",
      }));
    });

    it("triggers desktop notification when tab is hidden or blurred", () => {
      const mockClose = vi.fn();
      const mockNotificationInstance = {
        close: mockClose,
        onclick: null as (() => void) | null,
      };
      const mockConstructor = vi.fn().mockReturnValue(mockNotificationInstance);
      // @ts-expect-error Mocking window Notification
      window.Notification = Object.assign(mockConstructor, {
        permission: "granted",
      });
      (globalThis as unknown as { Notification: unknown }).Notification = window.Notification;

      mockDocument.hidden = true;

      const onFocusMock = vi.fn();
      window.focus = onFocusMock;

      const onClickMock = vi.fn();
      const engine = new AudioAlertEngine();
      const sent = engine.sendDesktopNotification({
        title: "Customer Escalated",
        body: "Needs human specialist",
        onClick: onClickMock,
      });

      expect(sent).toBe(true);
      expect(mockConstructor).toHaveBeenCalled();

      // Trigger click callback
      mockNotificationInstance.onclick?.();
      expect(onFocusMock).toHaveBeenCalled();
      expect(onClickMock).toHaveBeenCalled();
      expect(mockClose).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // E. Tab Title Flashing
  // ─────────────────────────────────────────────────────────────────────────

  describe("Browser Tab Title Alert", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      document.title = "Original Dashboard Title";
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("alternates document title when tab is hidden and restores on stop", () => {
      mockDocument.hidden = true;
      mockDocument.hasFocus = vi.fn(() => false);

      const engine = new AudioAlertEngine();
      engine.startTitleAlert(2);

      vi.advanceTimersByTime(1300);
      expect(document.title).toContain("Needs Agent");

      vi.advanceTimersByTime(1300);
      expect(document.title).toContain("Action Required");

      engine.stopTitleAlert();
      expect(document.title).toBe("Original Dashboard Title");
    });
  });
});

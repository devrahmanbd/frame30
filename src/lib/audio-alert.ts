/**
 * Phase 12.3 — Web Audio API Synthesizer & Multi-Sensory Alert Engine
 *
 * Implements:
 *  1. Zero-dependency synthesized audio chimes via Web Audio API:
 *     - Melodic 2-tone alert chime (D5 -> A5)
 *     - Urgent double-beep alert tone (A5 -> D6) for high-urgency/SLA escalations
 *  2. Autoplay policy unlocking on first user interaction or explicit toggle
 *  3. Volume & Mute control with localStorage persistence
 *  4. HTML5 Desktop Notification engine with document visibility gate
 *  5. Browser tab title alert animator: alternating "(N) 🔴 Needs Attention" when blurred
 *  6. Safe degradation on SSR / headless / testing environments without window or AudioContext
 */

const STORAGE_KEY_MUTED = "framique_audio_alert_muted";
const STORAGE_KEY_VOLUME = "framique_audio_alert_volume";

export type ToneConfig = {
  frequency: number;
  type?: OscillatorType;
  duration: number;
  gain?: number;
};

export class AudioAlertEngine {
  private ctx: AudioContext | null = null;
  private isMutedState = false;
  private masterVolume = 0.4;
  private originalDocumentTitle = "";
  private titleInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const storedMuted = window.localStorage.getItem(STORAGE_KEY_MUTED);
        if (storedMuted !== null) {
          this.isMutedState = storedMuted === "true";
        }
        const storedVol = window.localStorage.getItem(STORAGE_KEY_VOLUME);
        if (storedVol !== null) {
          const parsed = parseFloat(storedVol);
          if (!isNaN(parsed)) this.masterVolume = Math.max(0, Math.min(1, parsed));
        }
      } catch {
        // localStorage restricted or disabled
      }
    }
  }

  /**
   * Lazily initialize or resume AudioContext on user gesture.
   */
  public getAudioContext(): AudioContext | null {
    if (typeof window === "undefined") return null;

    if (!this.ctx) {
      const AudioCtxClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtxClass) {
        this.ctx = new AudioCtxClass();
      }
    }

    if (this.ctx && this.ctx.state === "suspended") {
      void this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  /**
   * Check if Web Audio API is supported in the current environment.
   */
  public isSupported(): boolean {
    return (
      typeof window !== "undefined" &&
      Boolean(
        window.AudioContext ||
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext,
      )
    );
  }

  /**
   * Check mute state.
   */
  public isMuted(): boolean {
    return this.isMutedState;
  }

  /**
   * Set mute state with localStorage persistence.
   */
  public setMuted(muted: boolean): void {
    this.isMutedState = muted;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY_MUTED, String(muted));
      }
    } catch {}
  }

  /**
   * Toggle mute state.
   */
  public toggleMute(): boolean {
    const next = !this.isMutedState;
    this.setMuted(next);
    return next;
  }

  /**
   * Get master volume (0.0 to 1.0).
   */
  public getVolume(): number {
    return this.masterVolume;
  }

  /**
   * Set master volume (0.0 to 1.0).
   */
  public setVolume(vol: number): void {
    const clamped = Math.max(0, Math.min(1, vol));
    this.masterVolume = clamped;
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY_VOLUME, String(clamped));
      }
    } catch {}
  }

  /**
   * Unlock AudioContext from user gesture (e.g. click anywhere or click button).
   */
  public unlock(): void {
    const ctx = this.getAudioContext();
    if (ctx && ctx.state === "suspended") {
      void ctx.resume();
    }
  }

  /**
   * Synthesize a sequence of tones with exponential volume envelopes.
   */
  private playSequence(tones: ToneConfig[]): boolean {
    if (this.isMutedState) return false;
    const ctx = this.getAudioContext();
    if (!ctx) return false;

    try {
      let startTime = ctx.currentTime + 0.01;

      for (const t of tones) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = t.type ?? "sine";
        osc.frequency.setValueAtTime(t.frequency, startTime);

        const peakGain = (t.gain ?? 0.7) * this.masterVolume;
        gain.gain.setValueAtTime(0.0001, startTime);
        gain.gain.exponentialRampToValueAtTime(peakGain, startTime + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + t.duration);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(startTime);
        osc.stop(startTime + t.duration + 0.05);

        startTime += t.duration;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Play standard 2-tone alert chime (D5: 587.33Hz -> A5: 880Hz).
   * Used for new shopper messages and routine notifications.
   */
  public playChime(): boolean {
    return this.playSequence([
      { frequency: 587.33, duration: 0.12, type: "sine", gain: 0.6 },
      { frequency: 880.0, duration: 0.22, type: "triangle", gain: 0.8 },
    ]);
  }

  /**
   * Play urgent double-beep alert tone (A5: 880Hz -> D6: 1174.66Hz x 2).
   * Used when a conversation escalates to `needs_agent`, high priority, or SLA breach.
   */
  public playUrgentAlert(): boolean {
    return this.playSequence([
      { frequency: 880.0, duration: 0.09, type: "triangle", gain: 0.8 },
      { frequency: 1174.66, duration: 0.14, type: "sine", gain: 0.9 },
      { frequency: 880.0, duration: 0.09, type: "triangle", gain: 0.8 },
      { frequency: 1174.66, duration: 0.22, type: "sine", gain: 0.95 },
    ]);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Desktop HTML5 Notifications
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check if native notifications are supported.
   */
  public isNotificationSupported(): boolean {
    return typeof window !== "undefined" && Boolean(window.Notification);
  }

  /**
   * Get current notification permission state.
   */
  public getNotificationPermission(): NotificationPermission | "unsupported" {
    if (!this.isNotificationSupported() || !window.Notification) return "unsupported";
    return window.Notification.permission;
  }

  /**
   * Request native desktop notification permission.
   */
  public async requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
    if (!this.isNotificationSupported() || !window.Notification) return "unsupported";
    try {
      return await window.Notification.requestPermission();
    } catch {
      return "denied";
    }
  }

  /**
   * Send a desktop notification if permission is granted.
   * Only displays if document is hidden/blurred, or force=true.
   */
  public sendDesktopNotification(opts: {
    title: string;
    body: string;
    tag?: string;
    force?: boolean;
    onClick?: () => void;
  }): boolean {
    if (!this.isNotificationSupported() || !window.Notification) return false;
    if (window.Notification.permission !== "granted") return false;

    // By default, only alert the operator via OS notifications if they are not actively looking at this tab
    const isTabBackgrounded =
      typeof document !== "undefined" && (document.hidden || !document.hasFocus());
    if (!isTabBackgrounded && !opts.force) {
      return false;
    }

    try {
      const NotifClass = window.Notification;
      const n = new NotifClass(opts.title, {
        body: opts.body,
        tag: opts.tag ?? "framique-operator-alert",
        icon: "/favicon.ico",
      });

      n.onclick = () => {
        if (typeof window !== "undefined") {
          window.focus();
        }
        opts.onClick?.();
        n.close();
      };
      return true;
    } catch {
      return false;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Browser Tab Title Flashing
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start alternating the browser document title to grab operator attention when tab is blurred.
   */
  public startTitleAlert(unreadCount: number): void {
    if (typeof document === "undefined") return;
    this.stopTitleAlert();

    this.originalDocumentTitle = document.title;
    const alertTitle = `(${unreadCount}) 🔴 Needs Agent — AI Moderation`;
    let toggle = true;

    this.titleInterval = setInterval(() => {
      // If user comes back to the tab, stop flashing
      if (typeof document !== "undefined" && !document.hidden && document.hasFocus()) {
        this.stopTitleAlert();
        return;
      }
      document.title = toggle ? alertTitle : `💬 Action Required (${unreadCount})`;
      toggle = !toggle;
    }, 1200);
  }

  /**
   * Restore original document title and stop flashing.
   */
  public stopTitleAlert(): void {
    if (this.titleInterval) {
      clearInterval(this.titleInterval);
      this.titleInterval = null;
    }
    if (this.originalDocumentTitle && typeof document !== "undefined") {
      document.title = this.originalDocumentTitle;
    }
  }
}

/** Global singleton instance */
export const alertEngine = new AudioAlertEngine();

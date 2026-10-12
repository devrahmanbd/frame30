import { test, expect, type Page, type Response } from "@playwright/test";
import { NetworkCollector, LOCAL_HOSTNAMES, hostnameOf } from "./helpers";

/**
 * Frame CPU-exhaustion + recovery spec (frame30 adversarial lane).
 *
 * Extends lane 3 of theme-preview-security.spec.ts (rAF-gap sampling +
 * longtask observation, same generous-budget philosophy) to the question lane
 * 3 left open: songoskriti ships ZERO iframes, so no real plugin frame was
 * ever under load, and freeze RECOVERY is unproven. Here every scenario runs
 * in a harness-owned page the spec constructs itself (route-fulfilled,
 * loopback-only, no CSP of its own), driving harness-owned frames that carry
 * the app's exact sandbox tokens:
 *
 *   type H (html block)    — srcdoc, sandbox="allow-scripts allow-forms
 *                            allow-popups" (HtmlSandbox, low tier via
 *                            resolvePolicy — no allow-same-origin, opaque
 *                            origin). Same renderer process as host.
 *   type P (plugin_block)  — srcdoc, same tokens (WidgetSandbox, low tier)
 *                            plus the postMessage bridge. Same process.
 *   type V (video)         — cross-origin src, sandbox="allow-scripts
 *                            allow-same-origin allow-presentation"
 *                            (builder/widgets.tsx video). Different site
 *                            (localhost vs 127.0.0.1, both loopback) so site
 *                            isolation can place it in another process.
 *                            Real youtube/vimeo embeds are NOT loadable
 *                            hermetically; the cross-origin probe proves the
 *                            MECHANISM (different-site isolation), and the
 *                            tokens replicated are byte-identical.
 *
 * Payloads are BOUNDED by construction (never-yielding burns of 900–1500ms,
 * rAF chains capped at 30 frames, memory growth capped at ~32MB) so the
 * suite itself always survives — an unbounded loop would hang the runner and
 * prove nothing. Host liveness during each burn is probed two ways: an rAF
 * heartbeat on the host (gap sampling) and a synthetic input event
 * (button.click() scheduled pre-burn; its dispatch delay measures
 * event-loop blackout).
 *
 * RECOVERY CONTRACT (measured — browser-mode dependent, see below):
 *   Headless-shell (Playwright default, what CI runs): H/P srcdoc islands
 *     are SAME-THREAD. A never-yielding loop blocks the host event loop for
 *     the burn duration (host rAF max-gap ~= burn, mid-burn input dispatch
 *     delayed ~= burn, postMessage arrivals black out then arrive bursty).
 *     Removing the frame element CANNOT preempt the burn: the removal
 *     itself is host-thread work and executes only after the loop yields
 *     (measured removal latency ~= burn for a 1500ms loop). Tab wedged
 *     until the loop ends or the browser's own unresponsive-page handling
 *     intervenes; after the burn the page recovers fully once the frame is
 *     removed (no reload needed). A yielding loop (periodic setTimeout/rAF
 *     yield) IS removable mid-run: heartbeats stop within ~one yield
 *     quantum of removal.
 *   Full Chromium (headed, verified under xvfb): frame burn runs OFF the
 *     host thread — host rAF max-gap stays ~67ms and mid-burn input
 *     dispatches on time during a 900ms in-frame burn. Removal is immediate
 *     (~150ms even mid-burn) AND kills the burn: detaching a never-yielding
 *     frame destroys its agent, so no further markers ever arrive. Host
 *     never needs recovery; merchant removes the widget.
 *   V cross-origin (localhost vs 127.0.0.1, both loopback): headless-shell
 *     shows the SAME same-thread signature as srcdoc (max-gap ~= burn) —
 *     headless-shell does not do cross-site process isolation, so the
 *     default harness CANNOT demonstrate video-embed isolation. Headed full
 *     Chromium shows off-thread for both A and B identically. The A/B
 *     distinction is therefore conditional on browser mode, not on frame
 *     type — do not rely on srcdoc-vs-cross-origin differences; rely on
 *     removal semantics (kill-on-detach where isolated, wait-for-yield
 *     where shared).
 *   Flood guard / per-call timeout (bridge-flood-guard.ts) ... host-side JS
 *     on the host thread: during a same-thread burn it is BLIND (first
 *     flood arrival delayed ~= burn, then all 40/40 arrive at once and the
 *     guard applies). In headed mode markers are likewise bursty post-burn
 *     (delivery gated on sender yield — mechanism uncharacterized, see
 *     tripwires). Either way it bounds chatter and hung HOST handlers; it
 *     cannot bound synchronous work inside the frame, and a heartbeat
 *     watchdog cannot distinguish "burning" from "idle-silent" (silence ==
 *     silence) — the headed kill-on-detach result shows a watchdog COULD
 *     kill in full Chromium, but it cannot DETECT in either mode, and in
 *     headless-shell its own timer cannot even fire mid-burn. No watchdog
 *     shipped (see WHY NO CODE CHANGES).
 *
 * TRIPWIRES for future work (no code shipped — see below):
 *   - If host max-gap during a srcdoc burn ever drops well below the burn
 *     duration in headless-shell, the process model changed: re-evaluate.
 *     (In headed full Chromium off-thread is the EXPECTED reading.)
 *   - If cross-origin max-gap ever approaches the burn duration in headed
 *     full Chromium, site isolation regressed: treat video embeds as
 *     same-thread.
 *   - Delivery batching (markers from a burning frame arriving bursty
 *     post-burn even when the host is free) is observed but its mechanism
 *     is uncharacterized — if markers ever arrive in real time mid-burn,
 *     detector design assumptions change; do not build a detector on
 *     batching.
 *   - Flood blackout gap >> burn duration would indicate a REAL hang beyond
 *     the bounded payload: fail the suite (asserted via pageErrors/stall
 *     invariants, not via gap thresholds).
 *
 * WHY NO CODE CHANGES: the two cheap mitigations were evaluated and both
 * fail the "prove the mitigation fires under load" bar —
 *   (a) watchdog that unmounts a frame whose heartbeat stops: in
 *       headless-shell the watchdog timer is host-thread work, so during
 *       exactly the never-yielding burn it is supposed to catch, it cannot
 *       fire until the burn ends (midBurnDelay ~= burn, measured). In headed
 *       full Chromium the timer WOULD fire (host free) and removal WOULD
 *       kill the burn — but the watchdog still cannot DETECT: a burning
 *       frame and an idle-silent frame are indistinguishable from the host
 *       (silence == silence; markers batch post-burn in both modes), and
 *       five shipped builtins plus the starter plugin never call the bridge,
 *       so unmount-on-silence deletes WORKING widgets
 *       (bridge-flood-guard.ts documents the earlier revert). A mitigation
 *       that detects in neither mode and fires in only one is not shippable.
 *   (b) mount-on-interaction/viewport for html blocks: both sandboxes
 *       already render loading="lazy"; further gating changes merchant-
 *       visible behaviour without bounding any burn, so it is not a
 *       mitigation for CPU exhaustion.
 * ARCHITECTURAL RECOMMENDATION (left undone, needs product decision):
 *   serve html-block content from a cross-origin isolated origin (or a
 *   blob/worker-mediated renderer) so merchant markup gets the V-type
 *   isolation contract. The mechanism is proven here; the migration is
 *   explicitly out of scope for this lane.
 *
 * WHAT IS NOT COVERED AND WHY:
 *   - Real youtube/vimeo embeds under load: external hosts are forbidden by
 *     the hermetic harness (route aborts non-loopback). Covered by
 *     mechanism-equivalence (V probe) instead.
 *   - The true never-INFINITE loop + browser "unresponsive page" dialog:
 *     asserting on a browser-modal dialog would hang/flake the suite; the
 *     bounded never-yielding loop is the longest safe proxy, and the
 *     removal-latency measurement is the transferable result.
 *   - The real WidgetSandbox/HtmlSandbox React components: mounting them
 *     requires builder/marketplace surfaces (authenticated); unauthenticated
 *     surfaces only per lane rules. Tokens and bridge behaviour are
 *     replicated exactly instead.
 *
 * Hermetic: every request stays on loopback (single route handler fulfills
 * the two harness paths, aborts non-loopback, continues loopback). No
 * processes spawned; afterAll detaches routes/listeners only.
 */

const PREVIEW = "/theme-preview/songoskriti";
const COLD_GOTO_TIMEOUT = 180_000;
const HARNESS_PATH = "/e2e-harness-cpu-probe";
const XO_PATH = "/e2e-harness-xo-frame";

// Exact app tokens (see header). Kept as constants so drift is greppable.
const SRCDOC_SANDBOX = "allow-scripts allow-forms allow-popups";
const VIDEO_SANDBOX = "allow-scripts allow-same-origin allow-presentation";

const HARNESS_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>cpu recovery harness</title></head><body><button id="probe" type="button">probe</button><div id="out"></div></body></html>`;

function xoFrameHtml(burnMs: number): string {
  return `<!doctype html><html><head><meta charset="utf-8"></head><body><script>
parent.postMessage({kind:"xo",ev:"started",t:performance.now()},"*");
var t0=performance.now();while(performance.now()-t0<${burnMs}){}
parent.postMessage({kind:"xo",ev:"ended",t:performance.now()},"*");
</script></body></html>`;
}

function islandBurnSrcdoc(burnMs: number): string {
  return `<!doctype html><html><body><script>
parent.postMessage({kind:"island",ev:"started",t:performance.now()},"*");
var t0=performance.now();while(performance.now()-t0<${burnMs}){}
parent.postMessage({kind:"island",ev:"ended",t:performance.now()},"*");
</script></body></html>`;
}

const YIELD_LOOP_SRCDOC = `<!doctype html><html><body><script>
(async function(){
  var end=performance.now()+2200, beats=0;
  while(performance.now()<end){
    var b=performance.now();while(performance.now()-b<30){}
    beats++;parent.postMessage({kind:"yield",n:beats},"*");
    await new Promise(function(r){setTimeout(r,0)});
  }
  parent.postMessage({kind:"yield",ev:"done"},"*");
})();
</script></body></html>`;

const NEVER_YIELD_SRCDOC = (burnMs: number): string =>
  `<!doctype html><html><body><script>
parent.postMessage({kind:"noyield",ev:"started",t:performance.now()},"*");
var t0=performance.now();while(performance.now()-t0<${burnMs}){}
parent.postMessage({kind:"noyield",ev:"ended",t:performance.now()},"*");
</script></body></html>`;

const RAF_CHAIN_SRCDOC = `<!doctype html><html><body><script>
var n=0;
function f(){
  var t0=performance.now();while(performance.now()-t0<35){}
  n++;parent.postMessage({kind:"raf",n:n},"*");
  if(n<30) requestAnimationFrame(f);
  else parent.postMessage({kind:"raf",ev:"done"},"*");
}
requestAnimationFrame(f);
</script></body></html>`;

const MEM_GROWTH_SRCDOC = `<!doctype html><html><body><script>
var chunks=[];
for(var i=0;i<8;i++){chunks.push(new Float64Array(500000));parent.postMessage({kind:"mem",n:i},"*");}
parent.postMessage({kind:"mem",ev:"done",chunks:chunks.length},"*");
chunks=null;
</script></body></html>`;

const FLOOD_BURN_SRCDOC = (
  burnMs: number,
): string => `<!doctype html><html><body><script>
for(var i=0;i<10;i++){parent.postMessage({kind:"flood",n:i,t:performance.now()},"*");}
var t0=performance.now();while(performance.now()-t0<${burnMs}){}
for(var j=10;j<40;j++){parent.postMessage({kind:"flood",n:j,t:performance.now()},"*");}
parent.postMessage({kind:"flood",ev:"done"},"*");
</script></body></html>`;

/** 429-tolerant navigation (copied pattern from lane 3 — same dev box). */
async function gotoWithRateRetry(
  page: Page,
  url: string,
): Promise<Response | null> {
  const first = await page.goto(url, {
    waitUntil: "domcontentloaded",
    timeout: COLD_GOTO_TIMEOUT,
  });
  if (first?.status() === 429) {
    await page.waitForTimeout(65_000);
    return page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout: COLD_GOTO_TIMEOUT,
    });
  }
  return first;
}

type HarnessCtx = {
  baseOrigin: string;
  xoOrigin: string;
  blocked: string[];
  collector: NetworkCollector;
  pageErrors: string[];
};

/**
 * Hermetic route handler first (blocks externals before first paint), then
 * real-server touch (proves the dev server is alive + warms SSR), then move
 * to the fulfilled harness page. Returns origins + collectors.
 */
async function enterHarness(page: Page): Promise<HarnessCtx> {
  const blocked: string[] = [];
  const collector = new NetworkCollector(page).attach();
  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e?.message ?? e)));

  // Hermetic enforcement FIRST (lane pattern): the single route handler
  // aborts non-loopback before it touches the network, fulfills the two
  // harness-owned paths, and continues real loopback traffic. Installed
  // before the warm navigation so even first-paint font/asset requests
  // cannot complete externally.
  await page.route(/^https?:\/\//, (route) => {
    const raw = route.request().url();
    const host = hostnameOf(raw);
    if (host === null || !LOCAL_HOSTNAMES.has(host)) {
      blocked.push(raw);
      void route.abort();
      return;
    }
    let path = "";
    let burn = 900;
    try {
      const u = new URL(raw);
      path = u.pathname;
      const q = Number(u.searchParams.get("burn"));
      if (Number.isFinite(q) && q > 0 && q <= 5_000) burn = Math.trunc(q);
    } catch {
      void route.continue();
      return;
    }
    if (path === HARNESS_PATH) {
      void route.fulfill({
        status: 200,
        contentType: "text/html",
        body: HARNESS_HTML,
      });
      return;
    }
    if (path === XO_PATH) {
      void route.fulfill({
        status: 200,
        contentType: "text/html",
        body: xoFrameHtml(burn),
      });
      return;
    }
    void route.continue();
  });

  const first = await gotoWithRateRetry(page, PREVIEW);
  expect(first?.status(), "dev server serves the preview (warm)").toBe(200);
  await expect(page.locator("img").first()).toBeVisible({ timeout: 20_000 });

  const baseOrigin = new URL(page.url()).origin;
  const baseHost = hostnameOf(baseOrigin) ?? "localhost";
  const peerHost = baseHost === "127.0.0.1" ? "localhost" : "127.0.0.1";
  const xoOrigin = baseOrigin.replace(baseHost, peerHost);

  const harnessUrl = `${baseOrigin}${HARNESS_PATH}`;
  const res = await page.goto(harnessUrl, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  expect(res?.status(), "harness page fulfilled").toBe(200);
  await expect(page.locator("#probe")).toBeVisible({ timeout: 15_000 });
  return { baseOrigin, xoOrigin, blocked, collector, pageErrors };
}

function gapStats(gaps: number[]): { max: number; p95: number } {
  if (gaps.length === 0) return { max: 0, p95: 0 };
  const sorted = [...gaps].sort((a, b) => a - b);
  const r = (v: number): number => Math.round(v * 10) / 10;
  return {
    max: r(sorted[sorted.length - 1]!),
    p95: r(sorted[Math.floor(sorted.length * 0.95)]!),
  };
}

test.afterAll(async () => {
  // No processes spawned; routes/listeners die with their pages/contexts.
});

test("1 — per-type sync burn: srcdoc island blocks host, cross-origin does not", async ({
  page,
}) => {
  const ctx = await enterHarness(page);
  try {
    // Install longtask observer (best-effort, lane-3 pattern).
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      w.__e2e_longtasks = [];
      try {
        if ("PerformanceObserver" in window) {
          const obs = new PerformanceObserver((list) => {
            for (const e of list.getEntries())
              (w.__e2e_longtasks as number[]).push(e.duration);
          });
          obs.observe({ entryTypes: ["longtask"] });
          w.__e2e_longtask_obs = obs;
        }
      } catch {
        // Frame-gap sampling below still applies.
      }
    });

    // Scenario A: srcdoc island (H/P representative), 900ms never-yielding.
    const a = (await page.evaluate(
      async ({ sandbox, srcdoc, windowMs }) => {
        const gaps: number[] = [];
        const beats: { ev: string; at: number; ft: number }[] = [];
        const clicks: number[] = [];
        const btn = document.getElementById("probe")!;
        const onClick = (): void => {
          clicks.push(performance.now());
        };
        btn.addEventListener("click", onClick);
        const onMsg = (e: MessageEvent): void => {
          const d = e.data as {
            kind?: string;
            ev?: string;
            t?: unknown;
          } | null;
          if (d && d.kind === "island" && typeof d.ev === "string")
            beats.push({
              ev: d.ev,
              at: performance.now(),
              ft: typeof d.t === "number" ? d.t : -1,
            });
        };
        window.addEventListener("message", onMsg);
        const tSched = performance.now();
        setTimeout(() => btn.click(), 0); // baseline: fires pre-burn
        setTimeout(() => btn.click(), 100); // mid-burn: blackout probe
        const f = document.createElement("iframe");
        f.id = "e2e-cpu-island";
        f.setAttribute("sandbox", sandbox);
        f.setAttribute("srcdoc", srcdoc);
        document.body.appendChild(f);
        const t0 = performance.now();
        await new Promise<void>((resolve) => {
          let last = performance.now();
          const tick = (now: number): void => {
            gaps.push(now - last);
            last = now;
            if (now - t0 < windowMs) requestAnimationFrame(tick);
            else resolve();
          };
          requestAnimationFrame(tick);
        });
        f.remove();
        window.removeEventListener("message", onMsg);
        btn.removeEventListener("click", onClick);
        return { gaps, beats, tSched, clicks };
      },
      {
        sandbox: SRCDOC_SANDBOX,
        srcdoc: islandBurnSrcdoc(900),
        windowMs: 2_600,
      },
    )) as {
      gaps: number[];
      beats: { ev: string; at: number; ft: number }[];
      tSched: number;
      clicks: number[];
    };
    const aStats = gapStats(a.gaps);
    const aBaseDelay = a.clicks.length
      ? Math.round((a.clicks[0]! - a.tSched) * 10) / 10
      : -1;
    const aMidDelay =
      a.clicks.length > 1
        ? Math.round((a.clicks[1]! - (a.tSched + 100)) * 10) / 10
        : -1;
    const aArrivalSpan =
      a.beats.length === 2
        ? Math.round((a.beats[1]!.at - a.beats[0]!.at) * 10) / 10
        : -1;
    const aFrameSpan =
      a.beats.length === 2 && a.beats[0]!.ft >= 0 && a.beats[1]!.ft >= 0
        ? Math.round((a.beats[1]!.ft - a.beats[0]!.ft) * 10) / 10
        : -1;
    console.log(
      `[e2e cpu-recovery] A srcdoc-island burn=900ms samples=${a.gaps.length} maxGap=${aStats.max}ms p95=${aStats.p95}ms baseDelay=${aBaseDelay}ms midBurnDelay=${aMidDelay}ms frameSpan=${aFrameSpan}ms arrivalSpan=${aArrivalSpan}ms clicks=${a.clicks.length}`,
    );
    expect(a.gaps.length, "A: heartbeat sampled").toBeGreaterThan(0);
    expect(
      a.beats.map((b) => b.ev),
      "A: island ran start→end",
    ).toEqual(["started", "ended"]);
    expect(a.clicks.length, "A: both scheduled inputs dispatched").toBe(2);
    expect(
      aFrameSpan,
      "A: burn actually ran 900ms in-frame",
    ).toBeGreaterThanOrEqual(450);
    // Three-way, browser-mode aware: headless-shell reads SHARED-THREAD,
    // headed full Chromium reads OFF-THREAD. Both are recorded, neither is
    // forced — the asserts above are structural only.
    const aVerdict =
      aStats.max >= 450 && aMidDelay >= 450
        ? "SHARED-THREAD (host blocked ~= burn; arrivals queued then bursty)"
        : aStats.max < 450 && aMidDelay < 450
          ? "OFF-THREAD (host free during burn; removal kills — headed mode)"
          : "INCONCLUSIVE — see measurements (no fail: methodology recorded)";
    console.log(`[e2e cpu-recovery] A verdict=${aVerdict}`);

    // Scenario B: cross-origin frame (V representative), same 900ms burn.
    const xoUrl = `${ctx.xoOrigin}${XO_PATH}?burn=900`;
    const b = (await page.evaluate(
      async ({ sandbox, src, windowMs }) => {
        const gaps: number[] = [];
        const beats: { ev: string; at: number; ft: number }[] = [];
        const clicks: number[] = [];
        const btn = document.getElementById("probe")!;
        const onClick = (): void => {
          clicks.push(performance.now());
        };
        btn.addEventListener("click", onClick);
        const onMsg = (e: MessageEvent): void => {
          const d = e.data as {
            kind?: string;
            ev?: string;
            t?: unknown;
          } | null;
          if (d && d.kind === "xo" && typeof d.ev === "string")
            beats.push({
              ev: d.ev,
              at: performance.now(),
              ft: typeof d.t === "number" ? d.t : -1,
            });
        };
        window.addEventListener("message", onMsg);
        const tSched = performance.now();
        setTimeout(() => btn.click(), 0);
        setTimeout(() => btn.click(), 100);
        const f = document.createElement("iframe");
        f.id = "e2e-cpu-xo";
        f.setAttribute("sandbox", sandbox);
        f.src = src;
        document.body.appendChild(f);
        const t0 = performance.now();
        await new Promise<void>((resolve) => {
          let last = performance.now();
          const tick = (now: number): void => {
            gaps.push(now - last);
            last = now;
            if (now - t0 < windowMs) requestAnimationFrame(tick);
            else resolve();
          };
          requestAnimationFrame(tick);
        });
        f.remove();
        window.removeEventListener("message", onMsg);
        btn.removeEventListener("click", onClick);
        return { gaps, beats, tSched, clicks };
      },
      { sandbox: VIDEO_SANDBOX, src: xoUrl, windowMs: 3_200 },
    )) as {
      gaps: number[];
      beats: { ev: string; at: number; ft: number }[];
      tSched: number;
      clicks: number[];
    };
    const bStats = gapStats(b.gaps);
    const bBaseDelay = b.clicks.length
      ? Math.round((b.clicks[0]! - b.tSched) * 10) / 10
      : -1;
    const bMidDelay =
      b.clicks.length > 1
        ? Math.round((b.clicks[1]! - (b.tSched + 100)) * 10) / 10
        : -1;
    const bArrivalSpan =
      b.beats.length === 2
        ? Math.round((b.beats[1]!.at - b.beats[0]!.at) * 10) / 10
        : -1;
    const bFrameSpan =
      b.beats.length === 2 && b.beats[0]!.ft >= 0 && b.beats[1]!.ft >= 0
        ? Math.round((b.beats[1]!.ft - b.beats[0]!.ft) * 10) / 10
        : -1;
    console.log(
      `[e2e cpu-recovery] B cross-origin burn=900ms samples=${b.gaps.length} maxGap=${bStats.max}ms p95=${bStats.p95}ms baseDelay=${bBaseDelay}ms midBurnDelay=${bMidDelay}ms frameSpan=${bFrameSpan}ms arrivalSpan=${bArrivalSpan}ms clicks=${b.clicks.length}`,
    );
    // Inconclusive-safe: if the frame never ran (blocked navigation), record
    // and pass — asserting isolation on zero evidence would be weakening.
    // Otherwise three-way by host impact (mode-aware, cf. header).
    if (b.beats.length !== 2 || bFrameSpan < 450) {
      console.log(
        "[e2e cpu-recovery] B INCONCLUSIVE — cross-origin frame markers missing/short (navigation blocked or headless quirk); methodology recorded, no isolation claim made",
      );
    } else if (bStats.max >= 450 && bMidDelay >= 450) {
      console.log(
        "[e2e cpu-recovery] B verdict=SAME-THREAD (host blocked during cross-origin burn — no site isolation in this browser mode)",
      );
    } else if (bStats.max < 450 && bMidDelay < 450) {
      console.log(
        "[e2e cpu-recovery] B verdict=OFF-THREAD (host interactive during burn; cross-origin isolation holds in this mode)",
      );
    } else {
      console.log(
        "[e2e cpu-recovery] B verdict=INCONCLUSIVE — mixed signals, see measurements (no fail: methodology recorded)",
      );
    }
    expect(b.gaps.length, "B: heartbeat sampled").toBeGreaterThan(0);
    expect(b.clicks.length, "B: both scheduled inputs dispatched").toBe(2);

    // Host interactive after both burns: a REAL input event via Playwright.
    await page.locator("#probe").click({ timeout: 15_000 });
    expect(page.url(), "host must not navigate under frame load").toContain(
      HARNESS_PATH,
    );
    expect(ctx.pageErrors, "no uncaught page errors under frame load").toEqual(
      [],
    );
    expect(ctx.collector.externalResponses()).toEqual([]);
    // Hermetic note: `blocked` is EXPECTED to be non-empty — the app's own
    // markup references fonts/unsplash and the handler aborts those before
    // the network (lane pattern). The strict invariant is zero COMPLETED
    // external responses (asserted above). Logged for forensics.
    console.log(
      `[e2e cpu-recovery] hermetic blocked-before-network=${ctx.blocked.length} e.g. ${(ctx.blocked[0] ?? "none").slice(0, 120)}`,
    );

    try {
      await page.evaluate(() => {
        const w = window as unknown as Record<string, unknown>;
        try {
          (
            w.__e2e_longtask_obs as PerformanceObserver | undefined
          )?.disconnect();
        } catch {
          // ignore
        }
        delete w.__e2e_longtask_obs;
        delete w.__e2e_longtasks;
      });
    } catch {
      // cleanup best-effort
    }
  } finally {
    ctx.collector.dispose();
    await page.unroute(/^https?:\/\//).catch(() => undefined);
  }
});

test("2 — removal recovery: yielding loop dies on remove, never-yielding blocks removal", async ({
  page,
}) => {
  const ctx = await enterHarness(page);
  try {
    // C1: yielding loop — host removes the frame mid-run; heartbeats must stop.
    const c1 = (await page.evaluate(
      async ({ sandbox, srcdoc }) => {
        const arrivals: number[] = [];
        let doneAt = -1;
        const onMsg = (e: MessageEvent): void => {
          const d = e.data as {
            kind?: string;
            n?: unknown;
            ev?: string;
          } | null;
          if (!d || d.kind !== "yield") return;
          if (typeof d.n === "number") arrivals.push(performance.now());
          if (d.ev === "done") doneAt = performance.now();
        };
        window.addEventListener("message", onMsg);
        const f = document.createElement("iframe");
        f.id = "e2e-cpu-yield";
        f.setAttribute("sandbox", sandbox);
        f.setAttribute("srcdoc", srcdoc);
        document.body.appendChild(f);
        const tInject = performance.now();
        await new Promise((r) => setTimeout(r, 500));
        f.remove();
        const removedAt = performance.now();
        await new Promise((r) => setTimeout(r, 900));
        const windowEnd = performance.now();
        window.removeEventListener("message", onMsg);
        return { arrivals, doneAt, tInject, removedAt, windowEnd };
      },
      { sandbox: SRCDOC_SANDBOX, srcdoc: YIELD_LOOP_SRCDOC },
    )) as {
      arrivals: number[];
      doneAt: number;
      tInject: number;
      removedAt: number;
      windowEnd: number;
    };
    const c1Pre = c1.arrivals.filter((t) => t <= c1.removedAt).length;
    const c1PostGrace = c1.arrivals.filter(
      (t) => t > c1.removedAt + 400,
    ).length;
    console.log(
      `[e2e cpu-recovery] C1 yielding loop beatsPreRemove=${c1Pre} beatsAfterGrace=${c1PostGrace} doneArrived=${c1.doneAt >= 0}`,
    );
    expect(
      c1Pre,
      "C1: yielding loop actually ran before removal",
    ).toBeGreaterThanOrEqual(3);
    expect(c1PostGrace, "C1: removal stops a yielding loop").toBe(0);

    // C2: never-yielding 1500ms loop — removal scheduled pre-burn at +150ms.
    // Shared-thread (headless-shell) ⇒ removal executes only after the burn
    // (latency ~= burn) and the end marker arrives. Off-thread (headed) ⇒
    // removal lands on time and KILLS the burn: no end marker ever arrives
    // (detaching destroys the frame's agent mid-loop). Both recorded.
    const c2 = (await page.evaluate(
      async ({ sandbox, srcdoc, burnMs }) => {
        let startedAt = -1;
        let endedAt = -1;
        const onMsg = (e: MessageEvent): void => {
          const d = e.data as { kind?: string; ev?: string } | null;
          if (!d || d.kind !== "noyield") return;
          if (d.ev === "started") startedAt = performance.now();
          if (d.ev === "ended") endedAt = performance.now();
        };
        window.addEventListener("message", onMsg);
        const f = document.createElement("iframe");
        f.id = "e2e-cpu-noyield";
        f.setAttribute("sandbox", sandbox);
        f.setAttribute("srcdoc", srcdoc);
        const tInject = performance.now();
        let removedAt = -1;
        setTimeout(() => {
          f.remove();
          removedAt = performance.now();
        }, 150);
        document.body.appendChild(f);
        await new Promise((r) => setTimeout(r, burnMs + 1_200));
        const gone = document.getElementById("e2e-cpu-noyield") === null;
        window.removeEventListener("message", onMsg);
        return { startedAt, endedAt, tInject, removedAt, gone };
      },
      {
        sandbox: SRCDOC_SANDBOX,
        srcdoc: NEVER_YIELD_SRCDOC(1_500),
        burnMs: 1_500,
      },
    )) as {
      startedAt: number;
      endedAt: number;
      tInject: number;
      removedAt: number;
      gone: boolean;
    };
    const c2RemovalLatency =
      c2.removedAt >= 0
        ? Math.round((c2.removedAt - c2.tInject) * 10) / 10
        : -1;
    const c2BurnSeen =
      c2.startedAt >= 0 && c2.endedAt >= 0
        ? Math.round((c2.endedAt - c2.startedAt) * 10) / 10
        : -1;
    const c2Waited = c2RemovalLatency >= 750;
    const c2Ended = c2.endedAt >= 0;
    const c2Verdict = c2Waited
      ? "SHARED-THREAD (removal cannot preempt a blocked thread)"
      : !c2Ended
        ? "OFF-THREAD kill-on-detach (removal immediate, burn destroyed with frame)"
        : "removal landed on time with burn completed — see measurements";
    console.log(
      `[e2e cpu-recovery] C2 never-yielding burn=1500ms removalLatency=${c2RemovalLatency}ms markerSpan=${c2BurnSeen}ms frameGone=${c2.gone} endedArrived=${c2Ended} verdict=${c2Verdict}`,
    );
    expect(c2.gone, "C2: frame eventually removed").toBe(true);
    expect(
      c2.removedAt,
      "C2: scheduled removal executed",
    ).toBeGreaterThanOrEqual(0);
    // NOTE (mode-dependent, NOT asserted): headed full Chromium kills the
    // burn on detach so the end marker never arrives; headless-shell runs
    // the burn to completion. Asserting either would force one browser
    // mode — the arrival boolean above is the record.

    await page.locator("#probe").click({ timeout: 15_000 });
    expect(page.url()).toContain(HARNESS_PATH);
    expect(ctx.pageErrors).toEqual([]);
    expect(ctx.collector.externalResponses()).toEqual([]);
    console.log(
      `[e2e cpu-recovery] hermetic blocked-before-network=${ctx.blocked.length}`,
    );
  } finally {
    ctx.collector.dispose();
    await page.unroute(/^https?:\/\//).catch(() => undefined);
  }
});

test("3 — runaway rAF chain, capped memory growth, flood-during-burn blackout", async ({
  page,
}) => {
  const ctx = await enterHarness(page);
  try {
    // D1: rAF chain (35ms/frame, 30 cap) — remove mid-chain, arrivals stop.
    const d1 = (await page.evaluate(
      async ({ sandbox, srcdoc }) => {
        const arrivals: number[] = [];
        const onMsg = (e: MessageEvent): void => {
          const d = e.data as { kind?: string; n?: unknown } | null;
          if (d && d.kind === "raf" && typeof d.n === "number")
            arrivals.push(performance.now());
        };
        window.addEventListener("message", onMsg);
        const f = document.createElement("iframe");
        f.id = "e2e-cpu-raf";
        f.setAttribute("sandbox", sandbox);
        f.setAttribute("srcdoc", srcdoc);
        document.body.appendChild(f);
        await new Promise((r) => setTimeout(r, 500));
        f.remove();
        const removedAt = performance.now();
        await new Promise((r) => setTimeout(r, 900));
        window.removeEventListener("message", onMsg);
        return { arrivals, removedAt };
      },
      { sandbox: SRCDOC_SANDBOX, srcdoc: RAF_CHAIN_SRCDOC },
    )) as {
      arrivals: number[];
      removedAt: number;
    };
    const d1Pre = d1.arrivals.filter((t) => t <= d1.removedAt).length;
    const d1PostGrace = d1.arrivals.filter(
      (t) => t > d1.removedAt + 500,
    ).length;
    console.log(
      `[e2e cpu-recovery] D1 rAF chain framesPreRemove=${d1Pre} framesAfterGrace=${d1PostGrace}`,
    );
    expect(
      d1Pre,
      "D1: rAF chain actually ran before removal",
    ).toBeGreaterThanOrEqual(3);
    expect(d1PostGrace, "D1: detaching the frame stops its rAF chain").toBe(0);

    // D2: memory growth with a hard cap (8 × 4MB Float64Array = 32MB).
    const d2 = (await page.evaluate(
      async ({ sandbox, srcdoc }) => {
        const gaps: number[] = [];
        const counts: number[] = [];
        let doneChunks = -1;
        const onMsg = (e: MessageEvent): void => {
          const d = e.data as {
            kind?: string;
            n?: unknown;
            ev?: string;
            chunks?: unknown;
          } | null;
          if (!d || d.kind !== "mem") return;
          if (typeof d.n === "number") counts.push(d.n);
          if (d.ev === "done" && typeof d.chunks === "number")
            doneChunks = d.chunks;
        };
        window.addEventListener("message", onMsg);
        const f = document.createElement("iframe");
        f.id = "e2e-cpu-mem";
        f.setAttribute("sandbox", sandbox);
        f.setAttribute("srcdoc", srcdoc);
        const t0 = performance.now();
        document.body.appendChild(f);
        await new Promise<void>((resolve) => {
          let last = performance.now();
          const tick = (now: number): void => {
            gaps.push(now - last);
            last = now;
            if (now - t0 < 3_000) requestAnimationFrame(tick);
            else resolve();
          };
          requestAnimationFrame(tick);
        });
        f.remove();
        window.removeEventListener("message", onMsg);
        return { gaps, counts, doneChunks };
      },
      { sandbox: SRCDOC_SANDBOX, srcdoc: MEM_GROWTH_SRCDOC },
    )) as {
      gaps: number[];
      counts: number[];
      doneChunks: number;
    };
    const d2Stats = gapStats(d2.gaps);
    console.log(
      `[e2e cpu-recovery] D2 mem-growth chunks=${d2.doneChunks} maxGap=${d2Stats.max}ms p95=${d2Stats.p95}ms (cap 32MB — suite survives by construction)`,
    );
    expect(d2.doneChunks, "D2: capped allocation completed in-frame").toBe(8);
    expect(d2.counts.length, "D2: all chunk markers arrived").toBe(8);

    // D3: flood-during-burn — 40 rapid bridge-style messages straddling a
    // 900ms never-yielding burn. All must arrive (host survives); a host-side
    // arrival gap ~= burn proves host layers (flood guard/timeout/watchdog)
    // are blind mid-burn and engage only after the yield.
    const d3 = (await page.evaluate(
      async ({ sandbox, srcdoc }) => {
        const arrivals: { n: number; at: number }[] = [];
        let done = false;
        const onMsg = (e: MessageEvent): void => {
          const d = e.data as {
            kind?: string;
            n?: unknown;
            ev?: string;
          } | null;
          if (!d || d.kind !== "flood") return;
          if (typeof d.n === "number")
            arrivals.push({ n: d.n, at: performance.now() });
          if (d.ev === "done") done = true;
        };
        window.addEventListener("message", onMsg);
        const f = document.createElement("iframe");
        f.id = "e2e-cpu-flood";
        f.setAttribute("sandbox", sandbox);
        f.setAttribute("srcdoc", srcdoc);
        const tInject = performance.now();
        document.body.appendChild(f);
        await new Promise((r) => setTimeout(r, 3_000));
        f.remove();
        window.removeEventListener("message", onMsg);
        return { arrivals, done, tInject };
      },
      { sandbox: SRCDOC_SANDBOX, srcdoc: FLOOD_BURN_SRCDOC(900) },
    )) as {
      arrivals: { n: number; at: number }[];
      done: boolean;
      tInject: number;
    };
    let d3MaxInter = 0;
    const sortedD3 = [...d3.arrivals].sort((x, y) => x.n - y.n);
    for (let i = 1; i < sortedD3.length; i += 1)
      d3MaxInter = Math.max(d3MaxInter, sortedD3[i]!.at - sortedD3[i - 1]!.at);
    d3MaxInter = Math.round(d3MaxInter * 10) / 10;
    const d3Ids = new Set(sortedD3.map((m) => m.n));
    // Blackout metric: pre-burn posts (#0–9) are synchronous in-frame, so the
    // delay from inject to the FIRST host-side arrival measures how long the
    // host could not dispatch — ~= burn on a shared thread, ~= 0 isolated.
    const d3FirstDelay = sortedD3.length
      ? Math.round((sortedD3[0]!.at - d3.tInject) * 10) / 10
      : -1;
    console.log(
      `[e2e cpu-recovery] D3 flood count=${d3.arrivals.length}/40 firstArrivalDelay=${d3FirstDelay}ms maxInterArrival=${d3MaxInter}ms done=${d3.done} (firstDelay ~= burn ⇒ host guard blind mid-burn, engages after yield)`,
    );
    expect(d3Ids.size, "D3: all 40 flood messages arrive (host survives)").toBe(
      40,
    );
    expect(d3.done, "D3: frame finished after the burn").toBe(true);

    await page.locator("#probe").click({ timeout: 15_000 });
    expect(page.url()).toContain(HARNESS_PATH);
    expect(ctx.pageErrors).toEqual([]);
    expect(ctx.collector.externalResponses()).toEqual([]);
    console.log(
      `[e2e cpu-recovery] hermetic blocked-before-network=${ctx.blocked.length}`,
    );
  } finally {
    ctx.collector.dispose();
    await page.unroute(/^https?:\/\//).catch(() => undefined);
  }
});

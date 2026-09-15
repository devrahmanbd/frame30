---
name: core-web-vitals
description: Optimize Core Web Vitals (LCP, INP, CLS) for better page experience and search ranking. Use when asked to "improve Core Web Vitals", "fix LCP", "reduce CLS", "optimize INP", "page experience optimization", or "fix layout shifts".
---

# Core Web Vitals Optimization

Targeted optimization for the three Core Web Vitals metrics.

| Metric | Measures | Good | Needs work | Poor |
|--------|----------|------|------------|------|
| **LCP** | Loading | ≤ 2.5s | 2.5s – 4s | > 4s |
| **INP** | Interactivity | ≤ 200ms | 200ms – 500ms | > 500ms |
| **CLS** | Visual Stability | ≤ 0.1 | 0.1 – 0.25 | > 0.25 |

## LCP: Largest Contentful Paint

**Common fixes:**
- Preload LCP image: `<link rel="preload" href="/hero.webp" as="image" fetchpriority="high">`
- Use `fetchpriority="high"` on LCP img tag
- Inline critical CSS, defer non-critical
- Use `font-display: swap` to prevent font blocking text render
- SSR/SSG instead of client-side rendering

**Debug:**
```javascript
new PerformanceObserver((list) => {
  const lastEntry = list.getEntries().at(-1);
  console.log('LCP:', lastEntry.element, lastEntry.startTime);
}).observe({ type: 'largest-contentful-paint', buffered: true });
```

## INP: Interaction to Next Paint

Total INP = Input Delay + Processing Time + Presentation Delay

**Common fixes:**
- Break long tasks: chunk processing with `await scheduler.yield()` or `setTimeout(..., 0)`
- Provide immediate visual feedback in event handlers
- Defer non-critical work with `requestIdleCallback`
- Lazy load third-party scripts
- Memoize components with `React.memo()`

**Debug:**
```javascript
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.duration > 200) {
      console.warn('Slow interaction:', entry.name, entry.duration);
    }
  }
}).observe({ type: 'event', buffered: true, durationThreshold: 16 });
```

## CLS: Cumulative Layout Shift

**Common fixes:**
- Always set `width` and `height` on images: `<img width="800" height="600">`
- Reserve space for ads/embeds: `min-height` containers
- Use `font-display: optional` or matched fallback metrics
- Animate only `transform` and `opacity`, never layout properties

**Debug:**
```javascript
new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (!entry.hadRecentInput) {
      entry.sources?.forEach(source => {
        console.log('Shifted element:', source.node);
      });
    }
  }
}).observe({ type: 'layout-shift', buffered: true });
```

## Framework Quick Fixes

**Next.js:** Use `next/image` with `priority` prop for LCP images. Use `dynamic()` for heavy components.

**React:** Memoize with `React.memo()`, defer with `useTransition()`.

## Tools
- Chrome DevTools → Performance panel
- PageSpeed Insights (field + lab data)
- web-vitals library for real user monitoring

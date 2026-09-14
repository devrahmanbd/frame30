import type { SeoDraft, SeoReport } from "./seo-analysis";

export const SEO_WORKER_PROTOCOL = 1;
export type SeoWorkerRequest = { v: number; id: number; draft: SeoDraft };
export type SeoWorkerResponse =
  | { v: number; id: number; ok: true; report: SeoReport; ms: number }
  | { v: number; id: number; ok: false; error: string };
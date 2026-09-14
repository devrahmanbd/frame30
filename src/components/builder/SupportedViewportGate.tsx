import { useEffect, useState, type ReactNode } from "react";
import { Monitor } from "lucide-react";
import { BUILDER_MIN_VIEWPORT_PX } from "@/lib/browser-support";
import { useLang } from "@/lib/i18n";

type ViewportState = "checking" | "supported" | "unsupported";

export function SupportedViewportGate({ children }: { children: ReactNode }) {
  const { t } = useLang();
  const [state, setState] = useState<ViewportState>("checking");

  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${BUILDER_MIN_VIEWPORT_PX}px)`);
    const update = () => setState(query.matches ? "supported" : "unsupported");
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  if (state === "supported") return children;

  return (
    <main className="mx-auto flex min-h-[60vh] max-w-xl items-center px-6 py-12">
      <section className="w-full border-y border-border py-10 text-center" aria-live="polite">
        <Monitor className="mx-auto size-10 text-primary" aria-hidden="true" />
        <h1 className="mt-5 font-bangla-display text-2xl font-bold">
          {state === "checking"
            ? t("Checking your workspace", "আপনার ওয়ার্কস্পেস পরীক্ষা হচ্ছে")
            : t("Theme studio needs a desktop", "থিম স্টুডিওর জন্য ডেস্কটপ প্রয়োজন")}
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-muted-foreground">
          {state === "checking"
            ? t("Confirming that the editing canvas will fit.", "এডিটিং ক্যানভাসটি ঠিকভাবে ফিট হবে কি না দেখা হচ্ছে।")
            : t(
                `Use a browser window at least ${BUILDER_MIN_VIEWPORT_PX}px wide. Your storefront and other admin tools remain available here.`,
                `কমপক্ষে ${BUILDER_MIN_VIEWPORT_PX}px চওড়া ব্রাউজার উইন্ডো ব্যবহার করুন। এই ডিভাইসে স্টোরফ্রন্ট ও অন্যান্য অ্যাডমিন টুল ব্যবহার করা যাবে।`,
              )}
        </p>
      </section>
    </main>
  );
}

import {
  useState,
  useId,
  useRef,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { Link } from "@tanstack/react-router";
import { withEngine } from "@/lib/motion-engine";
import { ArrowRight, Loader2, Check } from "@/components/icons/tabler";
import { BrandLogo } from "@/components/public/BrandLogo";
import { useLang } from "@/lib/i18n";
import { LEGAL_DOCS, ORG_NAP } from "@/lib/legal";
import { subscribeNewsletterFn } from "@/lib/newsletter.functions";
import { cn } from "@/lib/utils";

/**
 * Social channels matching the 4-column row from the design specification.
 *
 * Icon artwork: Simple Icons set (opensvg.dev / svgrepo.com canonical
 * paths), uniform 24x24 fill glyphs — never mixed stroke/fill styles.
 */
export const SOCIAL_LINKS = [
  {
    name: "YouTube",
    href: "#",
    icon: (
      <svg
        className="size-4 shrink-0 fill-current"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
      </svg>
    ),
  },
  {
    name: "X",
    href: "#",
    icon: (
      <svg
        className="size-4 shrink-0 fill-current"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z" />
      </svg>
    ),
  },
  {
    name: "Instagram",
    href: "#",
    icon: (
      <svg
        className="size-4 shrink-0 fill-current"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M7.0301.084c-1.2768.0602-2.1487.264-2.911.5634-.7888.3075-1.4575.72-2.1228 1.3877-.6652.6677-1.075 1.3368-1.3802 2.127-.2954.7638-.4956 1.6365-.552 2.914-.0564 1.2775-.0689 1.6882-.0626 4.947.0062 3.2586.0206 3.6671.0825 4.9473.061 1.2765.264 2.1482.5635 2.9107.308.7889.72 1.4573 1.388 2.1228.6679.6655 1.3365 1.0743 2.1285 1.38.7632.295 1.6361.4961 2.9134.552 1.2773.056 1.6884.069 4.9462.0627 3.2578-.0062 3.668-.0207 4.9478-.0814 1.28-.0607 2.147-.2652 2.9098-.5633.7889-.3086 1.4578-.72 2.1228-1.3881.665-.6682 1.0745-1.3378 1.3795-2.1284.2957-.7632.4966-1.636.552-2.9124.056-1.2809.0692-1.6898.063-4.948-.0063-3.2583-.021-3.6668-.0817-4.9465-.0607-1.2797-.264-2.1487-.5633-2.9117-.3084-.7889-.72-1.4568-1.3876-2.1228C21.2982 1.33 20.628.9208 19.8378.6165 19.074.321 18.2017.1197 16.9244.0645 15.6471.0093 15.236-.005 11.977.0014 8.718.0076 8.31.0215 7.0301.0839m.1402 21.6932c-1.17-.0509-1.8053-.2453-2.2287-.408-.5606-.216-.96-.4771-1.3819-.895-.422-.4178-.6811-.8186-.9-1.378-.1644-.4234-.3624-1.058-.4171-2.228-.0595-1.2645-.072-1.6442-.079-4.848-.007-3.2037.0053-3.583.0607-4.848.05-1.169.2456-1.805.408-2.2282.216-.5613.4762-.96.895-1.3816.4188-.4217.8184-.6814 1.3783-.9003.423-.1651 1.0575-.3614 2.227-.4171 1.2655-.06 1.6447-.072 4.848-.079 3.2033-.007 3.5835.005 4.8495.0608 1.169.0508 1.8053.2445 2.228.408.5608.216.96.4754 1.3816.895.4217.4194.6816.8176.9005 1.3787.1653.4217.3617 1.056.4169 2.2263.0602 1.2655.0739 1.645.0796 4.848.0058 3.203-.0055 3.5834-.061 4.848-.051 1.17-.245 1.8055-.408 2.2294-.216.5604-.4763.96-.8954 1.3814-.419.4215-.8181.6811-1.3783.9-.4224.1649-1.0577.3617-2.2262.4174-1.2656.0595-1.6448.072-4.8493.079-3.2045.007-3.5825-.006-4.848-.0608M16.953 5.5864A1.44 1.44 0 1 0 18.39 4.144a1.44 1.44 0 0 0-1.437 1.4424M5.8385 12.012c.0067 3.4032 2.7706 6.1557 6.173 6.1493 3.4026-.0065 6.157-2.7701 6.1506-6.1733-.0065-3.4032-2.771-6.1565-6.174-6.1498-3.403.0067-6.156 2.771-6.1496 6.1738M8 12.0077a4 4 0 1 1 4.008 3.9921A3.9996 3.9996 0 0 1 8 12.0077" />
      </svg>
    ),
  },
  {
    name: "Facebook",
    href: "#",
    icon: (
      <svg
        className="size-4 shrink-0 fill-current"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path d="M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z" />
      </svg>
    ),
  },
] as const;

export interface PublicFooterProps {
  /** If true, omits the top "Built for What Comes Next" CTA section */
  hideCta?: boolean;
}

/**
 * 3D Sculptural Floating Brand Ribbon Emblem
 * Crafted with perspective depth, subtle metallic specular highlights,
 * and pure monochromatic glassmorphism matching the public header.
 */
function SculpturalEmblem() {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const shadowRef = useRef<HTMLDivElement>(null);
  const rimRef = useRef<SVGPathElement>(null);
  const foldRef = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (!containerRef.current || !svgRef.current) return;

    const scope = withEngine(({ gsap }) => {
      const mm = gsap.matchMedia();

      mm.add(
        {
          reduceMotion: "(prefers-reduced-motion: reduce)",
          noPreference: "(prefers-reduced-motion: no-preference)",
        },
        (context) => {
          const { reduceMotion } = context.conditions as {
            reduceMotion: boolean;
            noPreference: boolean;
          };

          if (reduceMotion) {
            gsap.set([svgRef.current, shadowRef.current], {
              opacity: 1,
              y: 0,
              scale: 1,
            });
            return;
          }

          // 1. Entrance animation on mount
          gsap.fromTo(
            svgRef.current,
            { autoAlpha: 0, y: 24, scale: 0.94 },
            { autoAlpha: 1, y: 0, scale: 1, duration: 1.2, ease: "power2.out" },
          );

          // 2. Coordinated floating levitation cycle (physics-inspired)
          const floatTl = gsap.timeline({
            repeat: -1,
            yoyo: true,
            defaults: { ease: "sine.inOut" },
          });

          floatTl
            .to(
              svgRef.current,
              {
                y: -12,
                rotation: 1.6,
                duration: 3.2,
              },
              0,
            )
            .to(
              shadowRef.current,
              {
                scaleX: 0.84,
                scaleY: 0.42,
                opacity: 0.35,
                duration: 3.2,
              },
              0,
            );

          // 3. Specular rim highlight shimmer
          if (rimRef.current) {
            gsap.to(rimRef.current, {
              opacity: 1,
              strokeWidth: 4,
              duration: 2.2,
              repeat: -1,
              yoyo: true,
              ease: "sine.inOut",
            });
          }

          // 4. Subtle underfold ambient depth breathing
          if (foldRef.current) {
            gsap.to(foldRef.current, {
              opacity: 0.8,
              duration: 3.2,
              repeat: -1,
              yoyo: true,
              ease: "sine.inOut",
            });
          }

          // 5. GPU & CPU conservation: pause infinite animation when tab is inactive
          const handleVisibilityChange = () => {
            if (document.hidden) {
              floatTl.pause();
            } else {
              floatTl.resume();
            }
          };

          document.addEventListener("visibilitychange", handleVisibilityChange);

          return () => {
            document.removeEventListener(
              "visibilitychange",
              handleVisibilityChange,
            );
            floatTl.kill();
          };
        },
        containerRef,
      );

      return () => {
        mm.revert();
      };
    });

    return () => {
      scope.dispose();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative mx-auto mt-12 mb-4 w-full max-w-[320px] sm:max-w-[420px] h-[160px] sm:h-[220px] flex items-center justify-center select-none pointer-events-none"
    >
      {/* Soft depth occlusion shadow */}
      <div
        ref={shadowRef}
        className="absolute inset-x-12 bottom-2 h-8 bg-foreground/[0.06] dark:bg-black/60 blur-xl rounded-full transform scale-y-50"
      />

      {/* Floating 3D Sculptural Ribbon SVG */}
      <svg
        ref={svgRef}
        viewBox="0 0 400 240"
        className="w-full h-full drop-shadow-[0_20px_35px_rgba(0,0,0,0.12)] dark:drop-shadow-[0_25px_40px_rgba(0,0,0,0.65)]"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          {/* Specular front surface gradient */}
          <linearGradient
            id="ribbonFront"
            x1="80"
            y1="40"
            x2="320"
            y2="200"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.95" />
            <stop offset="45%" stopColor="currentColor" stopOpacity="0.85" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.45" />
          </linearGradient>

          {/* Underfold ambient shade */}
          <linearGradient
            id="ribbonFold"
            x1="160"
            y1="120"
            x2="280"
            y2="220"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.7" />
            <stop offset="60%" stopColor="currentColor" stopOpacity="0.3" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0.1" />
          </linearGradient>

          {/* Upper curve rim lighting */}
          <linearGradient
            id="ribbonRim"
            x1="140"
            y1="30"
            x2="260"
            y2="120"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        {/* Dynamic group inheriting foreground/card tones */}
        <g className="text-foreground">
          {/* Base bottom loop */}
          <path
            ref={foldRef}
            d="M 120 170 C 170 210, 240 205, 290 155 C 330 115, 310 80, 265 95 C 215 112, 175 165, 120 170 Z"
            fill="url(#ribbonFold)"
          />

          {/* Main sculptural forward sweep */}
          <path
            d="M 175 55 C 245 40, 295 85, 265 140 C 235 195, 140 190, 115 130 C 95 85, 130 65, 175 55 Z"
            fill="url(#ribbonFront)"
          />

          {/* Top crest highlight stroke */}
          <path
            ref={rimRef}
            d="M 175 55 C 220 45, 275 75, 265 130"
            stroke="url(#ribbonRim)"
            strokeWidth="3.5"
            strokeLinecap="round"
            className="opacity-70 dark:opacity-90"
          />

          {/* Front loop bevel curve */}
          <path
            d="M 125 145 C 150 175, 215 180, 250 135"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeOpacity="0.25"
          />
        </g>
      </svg>
    </div>
  );
}

/**
 * PublicFooter — Recreated to precisely match the modern architectural grid layout,
 * glassmorphic transparency with the header, zero aurora background, 4-column
 * structured links & social cards, and integrated newsletter subscribe action.
 */
export function PublicFooter({ hideCta = false }: PublicFooterProps) {
  const { tk, lang } = useLang();
  const year = new Date().getFullYear();

  // Newsletter state
  const inputId = useId();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const renderedAt = useRef<number>(Date.now());

  const handleSubscribe = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (submitting || !email.trim()) return;

      setSubmitting(true);
      setFeedback(null);

      try {
        const res = await subscribeNewsletterFn({
          data: {
            email: email.trim(),
            locale: lang === "bn" ? "bn" : "en",
            source: "footer",
            consent: true,
            honeypot: "",
            renderedAt: renderedAt.current,
          },
        });

        if (res.outcome === "check_inbox") {
          setFeedback({
            type: "success",
            text:
              lang === "bn"
                ? "ধন্যবাদ! ইনবক্স চেক করুন।"
                : "Subscribed! Check your inbox to confirm.",
          });
          setEmail("");
        } else if (res.outcome === "rate_limited") {
          setFeedback({
            type: "error",
            text:
              lang === "bn"
                ? "অনুগ্রহ করে কিছুক্ষণ পর আবার চেষ্টা করুন।"
                : "Too many attempts. Please wait.",
          });
        } else {
          setFeedback({
            type: "error",
            text:
              lang === "bn"
                ? "সাবস্ক্রিপশনে ত্রুটি হয়েছে।"
                : "Subscription failed. Please try again.",
          });
        }
      } catch {
        setFeedback({
          type: "error",
          text:
            lang === "bn"
              ? "সাময়িক ত্রুটি। পরে চেষ্টা করুন।"
              : "Something went wrong. Please try again.",
        });
      } finally {
        setSubmitting(false);
      }
    },
    [email, lang, submitting],
  );

  return (
    <footer className="relative border-t border-border/60 bg-background/80 backdrop-blur-xl transition-colors text-foreground overflow-hidden">
      {/* ---------------------------------------------------------------- */}
      {/* 1. TOP CTA SECTION: "Built for What Comes Next."                  */}
      {/* ---------------------------------------------------------------- */}
      {!hideCta && (
        <div className="relative z-10 mx-auto max-w-5xl px-4 pt-20 pb-8 text-center sm:px-6 md:pt-28">
          <h2 className="fq-display text-4xl font-bold tracking-tight text-foreground sm:text-5xl md:text-6xl lg:text-7xl leading-[1.08]">
            {lang === "bn" ? (
              <>
                আগামীর বাণিজ্যের জন্য
                <br />
                প্রস্তুত প্ল্যাটফর্ম।
              </>
            ) : (
              <>
                Built for What
                <br />
                Comes Next.
              </>
            )}
          </h2>

          <p className="mx-auto mt-5 max-w-xl text-sm sm:text-base text-muted-foreground leading-relaxed">
            {lang === "bn"
              ? "উচ্চাকাঙ্ক্ষী ব্র্যান্ড ও উদ্যোক্তাদের দ্রুততম অগ্রগতির আধুনিক ইকমার্স টুলস।"
              : "Future-ready tools for teams moving at the speed of innovation."}
          </p>

          <div className="mt-8 flex justify-center">
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex min-h-[48px] items-center justify-center rounded-fq-md border border-foreground/20 bg-foreground px-8 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-background shadow-sm transition-all duration-200 hover:opacity-90 hover:scale-[1.02] active:scale-[0.98]"
            >
              {lang === "bn" ? "শুরু করুন" : "Get Started"}
            </Link>
          </div>

          {/* Sculptural 3D Emblem Floating Motif */}
          <SculpturalEmblem />
        </div>
      )}

      {/* ---------------------------------------------------------------- */}
      {/* 2. THE 4-COLUMN ARCHITECTURAL GRID                                */}
      {/* ---------------------------------------------------------------- */}
      <div className="relative border-t border-border/60">
        <div className="mx-auto max-w-7xl">
          {/* Top Row: 4 Social Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y divide-border/60 sm:divide-y-0 sm:divide-x divide-border/60 border-b border-border/60">
            {SOCIAL_LINKS.map((item) => {
              const isPlaceholder = item.href === "#";
              return (
                <a
                  key={item.name}
                  href={item.href}
                  {...(!isPlaceholder
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                  onClick={(e) => {
                    if (isPlaceholder) e.preventDefault();
                  }}
                  title={
                    isPlaceholder
                      ? `${item.name} (Official profile launching soon)`
                      : item.name
                  }
                  aria-label={
                    isPlaceholder
                      ? `${item.name} - official profile launching soon`
                      : item.name
                  }
                  className="group flex min-h-[58px] items-center justify-between px-6 py-4 text-sm font-medium text-foreground/80 transition-colors hover:bg-foreground/[0.03] hover:text-foreground cursor-pointer"
                >
                  <span className="flex items-center gap-3">
                    <span className="text-foreground/70 transition-colors group-hover:text-primary">
                      {item.icon}
                    </span>
                    <span className="tracking-tight">{item.name}</span>
                  </span>
                  <ArrowRight className="size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-1 group-hover:text-foreground" />
                </a>
              );
            })}
          </div>

          {/* Bottom Row: 4 Links Columns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 divide-y divide-border/60 sm:divide-y-0 sm:divide-x divide-border/60">
            {/* Column 1: PRODUCT */}
            <div className="px-6 py-10 sm:py-12">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {lang === "bn" ? "পণ্য" : "Product"}
              </h3>
              <ul className="mt-5 space-y-3 text-sm">
                <li>
                  <Link
                    to="/features"
                    className="inline-flex min-h-7 items-center text-foreground/80 transition-colors hover:text-primary"
                  >
                    {lang === "bn" ? "ফিচারসমূহ" : "Technology & Features"}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/payments"
                    className="inline-flex min-h-7 items-center text-foreground/80 transition-colors hover:text-primary"
                  >
                    {lang === "bn" ? "পেমেন্ট গেটওয়ে" : "Payment Rails"}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/fulfilment"
                    className="inline-flex min-h-7 items-center text-foreground/80 transition-colors hover:text-primary"
                  >
                    {lang === "bn"
                      ? "ডেলিভারি ও কুরিয়ার"
                      : "Fulfilment & Dispatch"}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/status"
                    className="inline-flex min-h-7 items-center text-foreground/80 transition-colors hover:text-primary"
                  >
                    {lang === "bn" ? "সিস্টেম স্ট্যাটাস" : "Releases & Status"}
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 2: RESOURCES */}
            <div className="px-6 py-10 sm:py-12">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {lang === "bn" ? "রিসোর্স" : "Resources"}
              </h3>
              <ul className="mt-5 space-y-3 text-sm">
                <li>
                  <Link
                    to="/docs"
                    className="inline-flex min-h-7 items-center text-foreground/80 transition-colors hover:text-primary"
                  >
                    {lang === "bn" ? "ডকুমেন্টেশন" : "Docs"}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/docs"
                    className="inline-flex min-h-7 items-center text-foreground/80 transition-colors hover:text-primary"
                  >
                    {lang === "bn" ? "এপিআই গাইড" : "API Reference"}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/pricing"
                    className="inline-flex min-h-7 items-center text-foreground/80 transition-colors hover:text-primary"
                  >
                    {lang === "bn" ? "প্রাইসিং ও প্ল্যান" : "Pricing & Plans"}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/faq"
                    className="inline-flex min-h-7 items-center text-foreground/80 transition-colors hover:text-primary"
                  >
                    {lang === "bn" ? "সাধারণ জিজ্ঞাসা" : "Tutorials & FAQ"}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/blog"
                    className="inline-flex min-h-7 items-center text-foreground/80 transition-colors hover:text-primary"
                  >
                    {lang === "bn" ? "ব্লগ ও আপডেট" : "System Guide & Blog"}
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 3: COMPANY */}
            <div className="px-6 py-10 sm:py-12">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {lang === "bn" ? "প্রতিষ্ঠান" : "Company"}
              </h3>
              <ul className="mt-5 space-y-3 text-sm">
                <li>
                  <Link
                    to="/about"
                    className="inline-flex min-h-7 items-center text-foreground/80 transition-colors hover:text-primary"
                  >
                    {lang === "bn" ? "আমাদের সম্পর্কে" : "About & Team"}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/customers"
                    className="inline-flex min-h-7 items-center text-foreground/80 transition-colors hover:text-primary"
                  >
                    {lang === "bn"
                      ? "ভেরিফাইড মার্চেন্ট"
                      : "Verified Merchants"}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/security"
                    className="inline-flex min-h-7 items-center text-foreground/80 transition-colors hover:text-primary"
                  >
                    {lang === "bn" ? "নিরাপত্তা ও ভরসা" : "Security & Trust"}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/contact"
                    className="inline-flex min-h-7 items-center text-foreground/80 transition-colors hover:text-primary"
                  >
                    {lang === "bn" ? "যোগাযোগ ও সাপোর্ট" : "Contact & Support"}
                  </Link>
                </li>
                <li>
                  <Link
                    to="/dashboard"
                    className="inline-flex min-h-7 items-center text-foreground/80 transition-colors hover:text-primary"
                  >
                    {lang === "bn" ? "মার্চেন্ট লগইন" : "Merchant Portal"}
                  </Link>
                </li>
              </ul>
            </div>

            {/* Column 4: LEGAL */}
            <div className="px-6 py-10 sm:py-12">
              <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {lang === "bn" ? "আইনি ও পলিসি" : "Legal"}
              </h3>
              <ul className="mt-5 space-y-3 text-sm">
                <li>
                  <Link
                    to="/legal"
                    className="inline-flex min-h-7 items-center text-foreground/80 transition-colors hover:text-primary"
                  >
                    {lang === "bn" ? "আইনি বিবরণ (ইমপ্রিন্ট)" : "Imprint"}
                  </Link>
                </li>
                {LEGAL_DOCS.map((doc) => (
                  <li key={doc.slug}>
                    <Link
                      to="/legal/$doc"
                      params={{ doc: doc.slug }}
                      className="inline-flex min-h-7 items-center text-foreground/80 transition-colors hover:text-primary"
                    >
                      {doc.title[lang]}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------- */}
      {/* 3. BOTTOM BAR: BRAND IDENTITY + STATEMENT & NEWSLETTER           */}
      {/* ---------------------------------------------------------------- */}
      <div className="border-t border-border/60">
        <div className="mx-auto max-w-7xl px-6 py-12 lg:py-16">
          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10">
            {/* Left: Brand Name, Logo & Statement */}
            <div className="max-w-md space-y-4">
              <Link to="/" className="inline-flex items-center gap-3 group">
                <BrandLogo size={28} className="group-hover:scale-105" />
                <span className="fq-display text-2xl font-bold tracking-tight text-foreground">
                  FRAMIQUE<span className="text-primary">.</span>
                </span>
              </Link>

              <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
                {lang === "bn"
                  ? "নতুন প্রযুক্তির যুগে নিশ্চিত আত্মবিশ্বাস ও গর্বের সাথে আমরা বাংলাদেশি ব্যবসায়ী ও উদ্যোক্তাদের আগামী তৈরি করছি।"
                  : "In the new era of technology, we look to the future with certainty and pride for our company and businesses."}
              </p>

              <div className="pt-2 text-[11px] text-muted-foreground/60">
                © {year} {ORG_NAP.legalName} · {ORG_NAP.locality},{" "}
                {ORG_NAP.country}
              </div>
            </div>

            {/* Right: Newsletter Input & Subscribe Button */}
            <div className="w-full lg:max-w-md">
              <form onSubmit={handleSubscribe} noValidate className="space-y-2">
                <div className="flex items-stretch rounded-fq-md border border-border/80 bg-background/60 p-1 backdrop-blur-md shadow-sm transition-all focus-within:border-foreground/60 focus-within:ring-1 focus-within:ring-foreground/20">
                  <label htmlFor={inputId} className="sr-only">
                    Email address
                  </label>
                  <input
                    id={inputId}
                    type="email"
                    required
                    maxLength={254}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="NAME@EMAIL.COM"
                    aria-label="Email address for newsletter"
                    className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-xs font-mono uppercase tracking-wider text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
                  />
                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-fq-sm bg-foreground px-5 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-background transition-opacity hover:opacity-90 disabled:opacity-60"
                  >
                    {submitting ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : feedback?.type === "success" ? (
                      <span className="flex items-center gap-1.5 text-success-foreground">
                        <Check className="size-3.5" />
                        <span>Done</span>
                      </span>
                    ) : lang === "bn" ? (
                      "সাবস্ক্রাইব"
                    ) : (
                      "Subscribe"
                    )}
                  </button>
                </div>

                {feedback ? (
                  <p
                    role="status"
                    className={cn(
                      "text-xs font-medium mt-1.5",
                      feedback.type === "success"
                        ? "text-success-foreground"
                        : "text-destructive",
                    )}
                  >
                    {feedback.text}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground/60">
                    {lang === "bn"
                      ? "কোনো স্প্যাম নেই। যেকোনো সময় আনসাবস্ক্রাইব করা যাবে।"
                      : "Zero spam. Guaranteed privacy. Unsubscribe anytime."}
                  </p>
                )}
              </form>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}

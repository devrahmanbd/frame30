import * as React from "react";
import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";

/**
 * Platform Owner Page Header
 * Features Hallmark typography, clear visual hierarchy, optional breadcrumbs,
 * status badge, and an actions slot with full keyboard focus support.
 */
export function OwnerHeader({
  title,
  subtitle,
  badge,
  actions,
  breadcrumbs,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
  className?: string;
}) {
  return (
    <header className={cn("space-y-3 pb-2", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs text-muted-foreground">
          <Link
            to="/root"
            className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-xs"
          >
            Root
          </Link>
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              <ChevronRight className="size-3.5 opacity-50 shrink-0" aria-hidden="true" />
              {crumb.to ? (
                <Link
                  to={crumb.to}
                  className="transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded-xs"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="font-medium text-foreground">{crumb.label}</span>
              )}
            </React.Fragment>
          ))}
        </nav>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground font-bangla-display leading-snug">
              {title}
            </h1>
            {badge}
          </div>
          {subtitle && (
            <p className="text-sm text-muted-foreground font-bangla-body leading-relaxed max-w-3xl">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-2.5 shrink-0">{actions}</div>}
      </div>
    </header>
  );
}

/**
 * Platform Owner Stat Card
 * Built on shadcn Card with subtle top accent line, icon bubble, tabular numerals,
 * optional trend indicator, and full keyboard-accessible click target.
 */
export function StatCard({
  label,
  value,
  subtext,
  icon: Icon,
  trend,
  tone = "default",
  to,
  className,
}: {
  label: string;
  value: ReactNode;
  subtext?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  trend?: { value: string; positive?: boolean; neutral?: boolean };
  tone?: "default" | "ok" | "warn" | "bad" | "primary";
  to?: string;
  className?: string;
}) {
  const toneBorder =
    tone === "primary"
      ? "border-primary/40 dark:border-primary/50 hover:border-primary"
      : tone === "ok"
        ? "border-emerald-500/30 dark:border-emerald-500/40 hover:border-emerald-500"
        : tone === "warn"
          ? "border-amber-500/30 dark:border-amber-500/40 hover:border-amber-500"
          : tone === "bad"
            ? "border-rose-500/30 dark:border-rose-500/40 hover:border-rose-500"
            : "border-border/70 hover:border-border";

  const content = (
    <Card
      className={cn(
        "group relative overflow-hidden transition-all duration-200 hover:shadow-md bg-card/95 backdrop-blur-xs",
        toneBorder,
        to && "cursor-pointer focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
        className,
      )}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1.5 flex-1 min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
              {label}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground font-mono tabular-nums">
                {value}
              </span>
              {trend && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full",
                    trend.neutral
                      ? "bg-muted text-muted-foreground"
                      : trend.positive
                        ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        : "bg-rose-500/10 text-rose-600 dark:text-rose-400",
                  )}
                >
                  {trend.positive ? (
                    <TrendingUp className="size-3 shrink-0" aria-hidden="true" />
                  ) : trend.neutral ? null : (
                    <TrendingDown className="size-3 shrink-0" aria-hidden="true" />
                  )}
                  <span>{trend.value}</span>
                </span>
              )}
            </div>
            {subtext && (
              <p className="text-xs text-muted-foreground font-bangla-body leading-normal truncate">
                {subtext}
              </p>
            )}
          </div>

          <div className="flex flex-col items-end gap-2 shrink-0">
            {Icon && (
              <div className="flex size-9 items-center justify-center rounded-lg bg-muted/60 text-muted-foreground transition-colors group-hover:bg-primary/10 group-hover:text-primary">
                <Icon className="size-4.5" />
              </div>
            )}
            {to && (
              <ArrowUpRight className="size-3.5 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-foreground" />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  if (to) {
    return (
      <Link
        to={to}
        className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        {content}
      </Link>
    );
  }

  return content;
}

/**
 * Platform Owner Stat Grid
 * Standardized responsive grid adhering to vertical rhythm and spacing tokens.
 */
export function StatGrid({
  children,
  cols = 4,
  className,
}: {
  children: ReactNode;
  cols?: 2 | 3 | 4 | 5;
  className?: string;
}) {
  const colClass =
    cols === 2
      ? "sm:grid-cols-2"
      : cols === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : cols === 5
          ? "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
          : "sm:grid-cols-2 lg:grid-cols-4";

  return <div className={cn("grid gap-4", colClass, className)}>{children}</div>;
}

/**
 * Status is never colour-only: each state carries its own glyph, label, and high WCAG contrast.
 * Fully aligned with Hallmark comfort contrast standards.
 */
export function StatePill({
  tone,
  children,
  className,
}: {
  tone: "ok" | "warn" | "bad" | "neutral";
  children: ReactNode;
  className?: string;
}) {
  const config = {
    ok: {
      cls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
      icon: CheckCircle2,
    },
    warn: {
      cls: "bg-amber-500/10 text-amber-800 dark:text-amber-300 border-amber-500/25",
      icon: AlertTriangle,
    },
    bad: {
      cls: "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/25",
      icon: AlertOctagon,
    },
    neutral: {
      cls: "bg-muted/80 text-muted-foreground border-border/80",
      icon: Info,
    },
  };

  const { cls, icon: Icon } = config[tone] ?? config.neutral;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-tight transition-colors",
        cls,
        className,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

/**
 * Emergency & Governance Feature Switch
 * Built with accessible shadcn Switch primitive, touch targets >= 44px,
 * keyboard accessibility, and explanatory hints.
 */
export function FlagSwitch({
  label,
  hint,
  enabled,
  onLabel,
  offLabel,
  pending,
  onToggle,
  destructive = false,
  className,
}: {
  label: string;
  hint?: string;
  enabled: boolean;
  onLabel: string;
  offLabel: string;
  pending: boolean;
  onToggle: (next: boolean) => void;
  destructive?: boolean;
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "transition-colors duration-200 border-border/80 hover:border-border",
        enabled && destructive && "border-rose-500/30 bg-rose-500/5",
        className,
      )}
    >
      <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4 min-h-[4rem]">
        <div className="space-y-0.5 flex-1 min-w-[12rem]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight text-foreground font-bangla-display">
              {label}
            </span>
            {destructive && enabled && (
              <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                CRITICAL
              </Badge>
            )}
          </div>
          {hint && (
            <p className="text-xs text-muted-foreground font-bangla-body leading-relaxed max-w-xl">
              {hint}
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <StatePill tone={enabled ? (destructive ? "warn" : "ok") : "neutral"}>
            {enabled ? onLabel : offLabel}
          </StatePill>

          <div className="flex items-center min-h-11 min-w-11 justify-center">
            <Switch
              checked={enabled}
              disabled={pending}
              onCheckedChange={onToggle}
              aria-label={label}
              className="data-[state=checked]:bg-primary"
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Platform Owner Table
 * Built on shadcn Table primitive with subtle zebra hover rows,
 * clean borders, and responsive overflow scrolling.
 */
export function OwnerTable({
  head,
  children,
  caption,
  className,
}: {
  head: (string | ReactNode)[];
  children: ReactNode;
  caption?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border border-border/80 bg-card/95 shadow-xs backdrop-blur-xs",
        className,
      )}
    >
      <Table>
        {caption && <caption className="sr-only">{caption}</caption>}
        <TableHeader className="bg-muted/40">
          <TableRow className="border-b border-border/70 hover:bg-transparent">
            {head.map((h, idx) => (
              <TableHead
                key={idx}
                className="h-10 px-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {h}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>{children}</TableBody>
      </Table>
    </div>
  );
}

/**
 * General Platform Owner Card
 * Versatile container for desk summaries, control clusters, and forms.
 */
export function OwnerCard({
  title,
  description,
  badge,
  actions,
  children,
  footer,
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  badge?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={cn("border-border/80 bg-card/95 shadow-xs backdrop-blur-xs", className)}>
      {(title || description || badge || actions) && (
        <CardHeader className="flex flex-row items-start justify-between gap-4 border-b border-border/60 pb-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              {title && (
                <CardTitle className="text-base sm:text-lg font-semibold tracking-tight text-foreground font-bangla-display">
                  {title}
                </CardTitle>
              )}
              {badge}
            </div>
            {description && (
              <CardDescription className="text-xs sm:text-sm text-muted-foreground font-bangla-body">
                {description}
              </CardDescription>
            )}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </CardHeader>
      )}
      <CardContent className="p-5">{children}</CardContent>
      {footer && (
        <CardFooter className="flex items-center justify-between border-t border-border/60 bg-muted/20 p-4">
          {footer}
        </CardFooter>
      )}
    </Card>
  );
}

/**
 * Sovereign Alert Banner
 * For cross-tenant security alerts, degraded posture warnings, and audit notices.
 */
export function OwnerAlert({
  tone = "info",
  title,
  children,
  action,
  className,
}: {
  tone?: "info" | "warn" | "bad" | "ok";
  title?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  const styles = {
    info: {
      container: "border-blue-500/30 bg-blue-500/5 text-blue-900 dark:text-blue-100",
      icon: Info,
      iconClass: "text-blue-600 dark:text-blue-400",
    },
    warn: {
      container: "border-amber-500/30 bg-amber-500/5 text-amber-900 dark:text-amber-100",
      icon: AlertTriangle,
      iconClass: "text-amber-600 dark:text-amber-400",
    },
    bad: {
      container: "border-rose-500/30 bg-rose-500/5 text-rose-900 dark:text-rose-100",
      icon: AlertOctagon,
      iconClass: "text-rose-600 dark:text-rose-400",
    },
    ok: {
      container: "border-emerald-500/30 bg-emerald-500/5 text-emerald-900 dark:text-emerald-100",
      icon: CheckCircle2,
      iconClass: "text-emerald-600 dark:text-emerald-400",
    },
  }[tone];

  const Icon = styles.icon;

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between text-sm",
        styles.container,
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <Icon className={cn("size-5 shrink-0 mt-0.5", styles.iconClass)} aria-hidden="true" />
        <div className="space-y-0.5">
          {title && <p className="font-semibold">{title}</p>}
          <div className="text-xs sm:text-sm opacity-90 font-bangla-body leading-relaxed">
            {children}
          </div>
        </div>
      </div>
      {action && <div className="shrink-0 pt-1 sm:pt-0">{action}</div>}
    </div>
  );
}

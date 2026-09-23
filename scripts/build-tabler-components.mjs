#!/usr/bin/env bun
/**
 * Generates `src/components/icons/tabler.tsx` from the vendored Tabler SVGs.
 *
 * Dashboard surfaces import lucide-react directly today (63 files). The
 * generated module exports one component per LUCIDE export name used there,
 * each rendering the mapped Tabler geometry with the lucide component API
 * (`size`, `strokeWidth`, `className`, `...rest` onto `<svg>`), so each call
 * site changes by exactly one import line. `LucideIcon` is re-exported as a
 * type for prop declarations (e.g. KpiCard).
 *
 * Source of truth for geometry: `assets/icons/tabler/<tabler>.svg` (MIT).
 * Source of truth for the lucide→tabler map: MAP below (also mirrored in
 * /tmp/final-map.json at authoring time). Run `bun run assets:tabler` after
 * editing. Output is committed — CI never regenerates it silently.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

// lucide export name -> vendored tabler file (without .svg)
/** @type {Record<string, string>} */
const MAP = {
  Activity: "activity",
  AlertCircle: "alert-circle",
  AlertOctagon: "alert-octagon",
  AlertTriangle: "alert-triangle",
  AlignCenter: "align-center",
  AlignLeft: "align-left",
  AlignRight: "align-right",
  ArrowDownRight: "arrow-down-right",
  ArrowLeft: "arrow-left",
  ArrowRight: "arrow-right",
  ArrowUpRight: "arrow-up-right",
  Award: "award",
  BadgeCheck: "rosette",
  BadgeDollarSign: "currency-dollar",
  BarChart3: "chart-bar",
  Bell: "bell",
  Bold: "bold",
  BookOpen: "book",
  Bot: "robot",
  Boxes: "box-multiple",
  Building2: "building",
  Check: "check",
  CheckCircle: "circle-check",
  CheckCircle2: "circle-check",
  ChevronDown: "chevron-down",
  ChevronLeft: "chevron-left",
  ChevronRight: "chevron-right",
  ChevronUp: "chevron-up",
  ChevronsLeft: "chevrons-left",
  ChevronsRight: "chevrons-right",
  Clock: "clock",
  Code2: "code",
  Contact: "address-book",
  Copy: "copy",
  CreditCard: "credit-card",
  Download: "download",
  Edit2: "edit",
  Eraser: "eraser",
  ExternalLink: "external-link",
  Eye: "eye",
  EyeOff: "eye-off",
  FileAudio: "file-music",
  FileCheck2: "file-check",
  FileText: "file-text",
  FileUp: "file-upload",
  FileVideo: "movie",
  Filter: "filter",
  Flame: "flame",
  FolderTree: "folders",
  Gauge: "gauge",
  Gem: "diamond",
  Gift: "gift",
  Globe: "globe",
  Globe2: "globe",
  GripVertical: "grip-vertical",
  Hash: "hash",
  HeartPulse: "activity-heartbeat",
  HelpCircle: "help-circle",
  History: "history",
  Image: "photo",
  ImageOff: "photo-off",
  ImagePlus: "photo-plus",
  Images: "photo-plus",
  Inbox: "inbox",
  Info: "info-circle",
  Italic: "italic",
  KeyRound: "key",
  Keyboard: "keyboard",
  Landmark: "building-bank",
  Layers: "stack",
  LayoutDashboard: "layout-dashboard",
  LayoutGrid: "layout-grid",
  LayoutTemplate: "template",
  LifeBuoy: "lifebuoy",
  Link2: "link",
  List: "list",
  ListOrdered: "list-numbers",
  ListTree: "list-tree",
  Loader2: "loader-2",
  LogOut: "logout",
  Mail: "mail",
  Megaphone: "speakerphone",
  Menu: "menu",
  MessageSquare: "message",
  Minus: "minus",
  Monitor: "device-desktop",
  Moon: "moon",
  Omega: "omega",
  Package: "package",
  PackageSearch: "packages",
  Palette: "palette",
  PanelLeftClose: "layout-sidebar-left-collapse",
  PanelLeftOpen: "layout-sidebar-left-expand",
  PanelRight: "layout-sidebar-right",
  Pause: "player-pause",
  PhoneCall: "phone-call",
  Play: "player-play",
  PlayCircle: "player-play",
  Plug: "plug-connected",
  Plus: "plus",
  Puzzle: "puzzle",
  QrCode: "qrcode",
  Quote: "quote",
  Receipt: "receipt",
  Redo2: "arrow-forward-up",
  RefreshCw: "refresh",
  RotateCcw: "rotate-2",
  Scale: "scale",
  Scissors: "scissors",
  Search: "search",
  Send: "send",
  Settings: "settings",
  Shapes: "geometry",
  Shield: "shield",
  ShieldAlert: "shield-exclamation",
  ShieldCheck: "shield-check",
  ShoppingBag: "shopping-bag",
  ShoppingBasket: "basket",
  ShoppingCart: "shopping-cart",
  Sliders: "adjustments-horizontal",
  Smartphone: "device-mobile",
  Sparkles: "sparkles",
  Star: "star",
  Store: "building-store",
  Strikethrough: "strikethrough",
  Sun: "sun",
  Tablet: "device-tablet",
  Tags: "tags",
  ThumbsDown: "thumb-down",
  ThumbsUp: "thumb-up",
  Ticket: "ticket",
  TicketPercent: "discount",
  Timer: "stopwatch",
  Trash2: "trash",
  TrendingUp: "trending-up",
  Truck: "truck",
  Underline: "underline",
  Undo2: "arrow-back-up",
  UploadCloud: "cloud-upload",
  User: "user",
  UserCog: "user-cog",
  UserPlus: "user-plus",
  UserX: "user-x",
  Users: "users",
  X: "x",
  XCircle: "circle-x",
};

/** @param {string} svg */
function innerOf(svg) {
  const open = svg.indexOf(">");
  const close = svg.lastIndexOf("</svg>");
  if (open === -1 || close === -1 || close <= open) {
    throw new Error("unparseable svg");
  }
  const inner = svg.slice(open + 1, close).trim();
  if (
    !inner ||
    /<script[\s>]|javascript:|on[a-z]+\s*=|<svg[\s>]/i.test(inner)
  ) {
    throw new Error("unsafe svg content");
  }
  return inner;
}

async function main() {
  const { readFileSync } = await import("node:fs");
  const entries = Object.entries(MAP).sort(([a], [b]) => (a < b ? -1 : 1));
  const bodies = [];
  const missing = [];
  for (const [exportName, file] of entries) {
    const path = resolve(ROOT, "assets/icons/tabler", `${file}.svg`);
    let raw;
    try {
      raw = readFileSync(path, "utf8");
    } catch {
      missing.push(`${exportName} (${file}.svg)`);
      continue;
    }
    bodies.push(
      `export function ${exportName}(props: IconProps) {\n` +
        `  return base(${JSON.stringify(innerOf(raw))}, props);\n` +
        `}`,
    );
  }
  if (missing.length > 0) {
    console.error(
      `tabler components FAILED: missing vendored SVG for ${missing.join(", ")}`,
    );
    process.exit(1);
  }
  const out = `/**
 * GENERATED by scripts/build-tabler-components.mjs — do not edit.
 * Tabler geometry (MIT, see assets/icons/tabler/LICENSE-MIT) behind the
 * lucide export names the dashboard imports. Import from here instead of
 * "lucide-react" in dashboard scope.
 */
/* eslint-disable prettier/prettier -- generated single-line icon bodies */
import type { ReactElement, SVGProps } from "react";

export type IconProps = SVGProps<SVGSVGElement> & {
  size?: number | string;
  strokeWidth?: number | string;
};

/** Compatible prop type for icon slots (e.g. KpiCard). */
export type LucideIcon = (props: IconProps) => ReactElement;

function base(paths: string, props: IconProps): ReactElement {
  const { size = 24, strokeWidth = 2, ...rest } = props;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
      dangerouslySetInnerHTML={{ __html: paths }}
    />
  );
}

${bodies.join("\n\n")}
`;
  const target = resolve(ROOT, "src/components/icons/tabler.tsx");
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, out, "utf8");
  console.log(
    `tabler components written — ${bodies.length} exports → src/components/icons/tabler.tsx`,
  );
}

main().catch((error) => {
  console.error(`tabler components harness failed: ${error?.stack ?? error}`);
  process.exit(2);
});

/**
 * Phase 14 — style resolution.
 *
 * Turns a node's settings bag into React CSS for the requested device. One
 * function is used by both the canvas and the preview, so what a merchant sees
 * while editing is what the page renders.
 */
import type { CSSProperties } from "react";
import { containerCss, childBasisCss, type ContainerSettings } from "./containers";
import { isContainerNode, type NodeSettings, type StudioNode } from "./model";
import { boxToCss, isBox, resolveResponsive, type DeviceKey, type Maybe } from "./responsive";

function n(settings: NodeSettings, key: string, device: DeviceKey): number | undefined {
  const value = resolveResponsive(settings[key] as Maybe<number>, device);
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function s(settings: NodeSettings, key: string, device: DeviceKey): string | undefined {
  const value = resolveResponsive(settings[key] as Maybe<string>, device);
  return typeof value === "string" && value !== "" ? value : undefined;
}

function spacing(settings: NodeSettings, key: string, device: DeviceKey): string | undefined {
  const raw = settings[key];
  const resolved = resolveResponsive(raw as Maybe<unknown>, device);
  if (isBox(resolved)) return boxToCss(raw as Maybe<never>, device);
  if (typeof resolved === "number") return `${resolved}px`;
  return undefined;
}

export function transformCss(settings: NodeSettings, device: DeviceKey): string | undefined {
  const parts: string[] = [];
  const rotate = n(settings, "rotate", device);
  const scale = n(settings, "scale", device);
  const translateY = n(settings, "translateY", device);
  if (rotate) parts.push(`rotate(${rotate}deg)`);
  if (scale && scale !== 1) parts.push(`scale(${scale})`);
  if (translateY) parts.push(`translateY(${translateY}px)`);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

/** Shared style bag: typography, background, border, effects, layout. */
export function nodeCss(node: StudioNode, device: DeviceKey = "desktop"): CSSProperties {
  const set = node.settings;
  const style: CSSProperties = {
    color: s(set, "textColor", device),
    fontFamily: s(set, "fontFamily", device),
    fontSize: n(set, "fontSize", device),
    fontWeight: n(set, "fontWeight", device) ?? (s(set, "fontWeight", device) as CSSProperties["fontWeight"]),
    textTransform: s(set, "textTransform", device) as CSSProperties["textTransform"],
    fontStyle: s(set, "fontStyle", device),
    textDecoration: s(set, "textDecoration", device),
    lineHeight: n(set, "lineHeight", device),
    letterSpacing: n(set, "letterSpacing", device),
    textAlign: s(set, "textAlign", device) as CSSProperties["textAlign"],
    textShadow: s(set, "textShadow", device),
    mixBlendMode: s(set, "blendMode", device) as CSSProperties["mixBlendMode"],
    background: s(set, "background", device),
    backgroundImage: s(set, "backgroundImage", device)
      ? `url(${JSON.stringify(s(set, "backgroundImage", device))})`
      : undefined,
    backgroundSize: s(set, "backgroundSize", device),
    borderWidth: n(set, "borderWidth", device),
    borderStyle: s(set, "borderStyle", device) ?? (n(set, "borderWidth", device) ? "solid" : undefined),
    borderColor: s(set, "borderColor", device),
    borderRadius: n(set, "radius", device),
    boxShadow: s(set, "boxShadow", device),
    opacity: n(set, "opacity", device),
    margin: spacing(set, "margin", device),
    padding: spacing(set, "padding", device),
    position: s(set, "position", device) as CSSProperties["position"],
    zIndex: n(set, "zIndex", device),
    transform: transformCss(set, device),
  };

  const width = n(set, "width", device);
  if (width !== undefined && !isContainerNode(node)) style.width = `${width}%`;

  if (isContainerNode(node)) {
    const paddingY = n(set, "paddingY", device);
    const paddingX = n(set, "paddingX", device);
    if (paddingY !== undefined || paddingX !== undefined) {
      style.padding = `${paddingY ?? 0}px ${paddingX ?? 0}px`;
    }
  }

  return Object.fromEntries(Object.entries(style).filter(([, v]) => v !== undefined && v !== "")) as CSSProperties;
}

/** Inner flex/grid style for a container node. */
export function containerInnerCss(node: StudioNode, device: DeviceKey = "desktop"): CSSProperties {
  return containerCss(node.settings as ContainerSettings, device);
}

/** Style a node applies to itself when it sits inside a flex parent. */
export function selfCss(node: StudioNode, device: DeviceKey = "desktop"): CSSProperties {
  return childBasisCss((node.settings as ContainerSettings).basis, device);
}

const HIDE_KEY: Partial<Record<DeviceKey, string>> = {
  desktop: "hideDesktop",
  laptop: "hideDesktop",
  widescreen: "hideDesktop",
  tablet: "hideTablet",
  mobileLandscape: "hideMobile",
  mobile: "hideMobile",
};

/** Responsive visibility, from either the Advanced switches or `hiddenOn`. */
export function isHiddenOn(node: StudioNode, device: DeviceKey): boolean {
  if (node.hiddenOn?.includes(device)) return true;
  const key = HIDE_KEY[device];
  return Boolean(key && node.settings[key] === true);
}

export const ANIMATION_CLASS: Record<string, string> = {
  fade: "fq-studio-anim-fade",
  "fade-up": "fq-studio-anim-fade-up",
  "fade-down": "fq-studio-anim-fade-down",
  zoom: "fq-studio-anim-zoom",
  "slide-left": "fq-studio-anim-slide-left",
  "slide-right": "fq-studio-anim-slide-right",
};

export function animationProps(node: StudioNode): { className?: string; style?: CSSProperties } {
  const name = node.settings.animation;
  if (typeof name !== "string" || !name || !ANIMATION_CLASS[name]) return {};
  const duration = typeof node.settings.animationDuration === "number" ? node.settings.animationDuration : 400;
  const delay = typeof node.settings.animationDelay === "number" ? node.settings.animationDelay : 0;
  return {
    className: ANIMATION_CLASS[name],
    style: { animationDuration: `${duration}ms`, animationDelay: `${delay}ms` },
  };
}

/** Style keys the "Reset style" action clears. */
export const RESETTABLE_KEYS = [
  "textColor",
  "fontFamily",
  "fontSize",
  "fontWeight",
  "textTransform",
  "fontStyle",
  "textDecoration",
  "lineHeight",
  "letterSpacing",
  "textShadow",
  "blendMode",
  "background",
  "backgroundImage",
  "backgroundSize",
  "borderWidth",
  "borderStyle",
  "borderColor",
  "radius",
  "boxShadow",
  "opacity",
  "margin",
  "padding",
  "rotate",
  "scale",
  "translateY",
];

export function resetStyles(settings: NodeSettings): NodeSettings {
  const next = { ...settings };
  for (const key of RESETTABLE_KEYS) delete next[key];
  return next;
}

/** Style subset copied by "Copy style" / "Paste style". */
export function pickStyles(settings: NodeSettings): NodeSettings {
  const out: NodeSettings = {};
  for (const key of RESETTABLE_KEYS) if (settings[key] !== undefined) out[key] = settings[key];
  return out;
}

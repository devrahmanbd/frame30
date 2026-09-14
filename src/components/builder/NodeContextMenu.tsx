/**
 * Phase 1.2 — right-click menu shared by the canvas and the layer tree.
 *
 * Keyboard-complete (arrow keys, Home/End, Enter, Escape), closes on outside
 * click, scroll and window resize, and clamps itself inside the viewport so a
 * node near the right edge does not open a menu off-screen.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export type MenuItem =
  | { kind: "action"; id: string; label: string; hint?: string; disabled?: boolean; danger?: boolean; run: () => void }
  | { kind: "separator"; id: string };

export function NodeContextMenu({
  at,
  items,
  onClose,
  label,
}: {
  at: { x: number; y: number } | null;
  items: MenuItem[];
  onClose: () => void;
  label: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState(at);
  const actionable = items.filter((item): item is Extract<MenuItem, { kind: "action" }> => item.kind === "action" && !item.disabled);

  useEffect(() => setPos(at), [at]);

  useLayoutEffect(() => {
    if (!pos || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    const maxX = window.innerWidth - box.width - 8;
    const maxY = window.innerHeight - box.height - 8;
    const clamped = { x: Math.max(8, Math.min(pos.x, maxX)), y: Math.max(8, Math.min(pos.y, maxY)) };
    if (clamped.x !== pos.x || clamped.y !== pos.y) setPos(clamped);
  }, [pos]);

  useEffect(() => {
    if (!at) return;
    const dismiss = (event: Event) => {
      if (event.type === "mousedown" && ref.current?.contains(event.target as Node)) return;
      onClose();
    };
    window.addEventListener("mousedown", dismiss);
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    // Focus the first item so the menu is usable without a mouse.
    const timer = setTimeout(() => ref.current?.querySelector<HTMLElement>("[role='menuitem']:not([aria-disabled='true'])")?.focus(), 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("mousedown", dismiss);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [at, onClose]);

  if (!at || !pos) return null;

  const move = (from: HTMLElement, delta: 1 | -1 | "first" | "last") => {
    const nodes = Array.from(
      ref.current?.querySelectorAll<HTMLElement>("[role='menuitem']:not([aria-disabled='true'])") ?? [],
    );
    if (!nodes.length) return;
    const index = nodes.indexOf(from);
    const next =
      delta === "first"
        ? 0
        : delta === "last"
          ? nodes.length - 1
          : (index + delta + nodes.length) % nodes.length;
    nodes[next]?.focus();
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      style={{ position: "fixed", left: pos.x, top: pos.y, zIndex: 60 }}
      className="min-w-52 rounded-fq-md border border-border bg-card p-1 shadow-lg"
    >
      {items.map((item) =>
        item.kind === "separator" ? (
          <div key={item.id} role="separator" className="my-1 h-px bg-border" />
        ) : (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            aria-disabled={item.disabled ? "true" : undefined}
            disabled={item.disabled}
            onKeyDown={(event) => {
              const target = event.currentTarget;
              if (event.key === "ArrowDown") {
                event.preventDefault();
                move(target, 1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                move(target, -1);
              } else if (event.key === "Home") {
                event.preventDefault();
                move(target, "first");
              } else if (event.key === "End") {
                event.preventDefault();
                move(target, "last");
              }
            }}
            onClick={() => {
              item.run();
              onClose();
            }}
            className={`flex w-full items-center justify-between gap-3 rounded-fq-sm px-2 py-1.5 text-left text-xs disabled:opacity-40 ${
              item.danger ? "text-destructive hover:bg-destructive/10" : "hover:bg-muted"
            }`}
          >
            <span>{item.label}</span>
            {item.hint && <span className="font-mono text-[0.65rem] text-muted-foreground">{item.hint}</span>}
          </button>
        ),
      )}
      {actionable.length === 0 && (
        <p className="px-2 py-1.5 text-xs text-muted-foreground">—</p>
      )}
    </div>
  );
}

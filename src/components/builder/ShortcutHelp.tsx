/**
 * Phase 1.4 — the `?` overlay.
 *
 * Rendered from the shortcut registry, never from a hand-kept list, so the
 * overlay cannot advertise a key the dispatcher does not handle. Dialog
 * behaviour (focus trap, scroll lock, Escape, focus restore) is delegated to
 * `OverlayHost`, which is the single owner of modal semantics in the builder —
 * duplicating it here is what the Phase 7 overlay invariant test forbids.
 */
import { useLang } from "@/lib/i18n";
import { OverlayHost } from "@/components/builder/primitives/OverlayHost";
import {
  SHORTCUT_GROUP_LABEL,
  formatShortcut,
  shortcutsByGroup,
  type Platform,
} from "@/lib/builder-shortcuts";

export function ShortcutHelp({
  open,
  platform,
  onClose,
}: {
  open: boolean;
  platform: Platform;
  onClose: () => void;
}) {
  const { t } = useLang();
  return (
    <OverlayHost
      open={open}
      onClose={onClose}
      title={t("Keyboard shortcuts", "কীবোর্ড শর্টকাট")}
    >
      <div className="max-h-[70vh] overflow-y-auto">
        <p className="text-xs text-muted-foreground">
          {t(
            "Shortcuts are ignored while you type in a field or on the canvas.",
            "কোনো ফিল্ড বা ক্যানভাসে টাইপ করার সময় শর্টকাট কাজ করে না।",
          )}
        </p>

        <div className="mt-3 space-y-4">
          {shortcutsByGroup().map(({ group, items }) => (
            <section key={group}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t(SHORTCUT_GROUP_LABEL[group].en, SHORTCUT_GROUP_LABEL[group].bn)}
              </h3>
              <dl className="mt-1 divide-y divide-border">
                {items.map((spec) => (
                  <div key={spec.id} className="flex items-center justify-between gap-4 py-1.5">
                    <dt className="text-sm">{t(spec.label.en, spec.label.bn)}</dt>
                    <dd className="shrink-0 rounded-fq-md border border-border px-2 py-0.5 font-mono text-xs tabular-nums">
                      {formatShortcut(spec, platform)}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
      </div>
    </OverlayHost>
  );
}

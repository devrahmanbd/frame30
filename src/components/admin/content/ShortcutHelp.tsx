import { Drawer } from "@/components/console/kit";
import { useLang } from "@/lib/i18n";
import { DESK_SHORTCUTS } from "@/lib/content-desk";

/** The `?` sheet listing the desk's keyboard map. */
export function ShortcutHelp({
  open,
  onClose,
  shortcuts = DESK_SHORTCUTS,
  hint,
}: {
  open: boolean;
  onClose: () => void;
  shortcuts?: readonly { keys: string; en: string; bn: string }[];
  hint?: string;
}) {
  const { t, lang } = useLang();
  const l = lang === "bn" ? "bn" : "en";
  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={t("Keyboard shortcuts", "কীবোর্ড শর্টকাট")}
      description={hint ?? t("Works when a row has focus. Press ? again to close.", "একটি সারিতে ফোকাস থাকলে কাজ করে। বন্ধ করতে আবার ? চাপুন।")}
    >
      <dl className="divide-y divide-border text-sm">
        {shortcuts.map((s) => (
          <div key={s.keys} className="flex items-center justify-between gap-4 py-2">
            <dt className="text-foreground">{s[l]}</dt>
            <dd>
              <kbd className="fq-num rounded-fq-sm border border-border bg-muted px-1.5 py-0.5 text-xs text-foreground">{s.keys}</kbd>
            </dd>
          </div>
        ))}
      </dl>
    </Drawer>
  );
}

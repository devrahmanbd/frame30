/**
 * Phase 15 — the WordPress "Feature filter" drawer, three columns of
 * checkboxes over Subject / Features / Layout. Selections AND together, the
 * count is shown on the trigger, and `Clear` resets in one move.
 */
import {
  FEATURE_FILTERS,
  EMPTY_SELECTION,
  selectionCount,
  toggleFeature,
  type FeatureSelection,
} from "@/lib/themes/appearance";
import { Drawer, btnGhost, btnPrimary } from "@/components/console/kit";

export function FeatureFilterDrawer({
  open,
  selection,
  onChange,
  onClose,
}: {
  open: boolean;
  selection: FeatureSelection;
  onChange: (next: FeatureSelection) => void;
  onClose: () => void;
}) {
  return (
    <Drawer
      open={open}
      title="Feature filter"
      description="Narrow the catalogue by subject, features and layout."
      onClose={onClose}
      footer={
        <>
          <button type="button" className={btnGhost} onClick={() => onChange(EMPTY_SELECTION)}>
            Clear ({selectionCount(selection)})
          </button>
          <button type="button" className={btnPrimary} onClick={onClose}>
            Apply filters
          </button>
        </>
      }
    >
      <div className="space-y-6">
        {FEATURE_FILTERS.map((group) => (
          <fieldset key={group.id}>
            <legend className="mb-2 text-sm font-semibold text-foreground">{group.label}</legend>
            <ul className="grid gap-1 sm:grid-cols-2">
              {group.options.map((option) => {
                const checked = selection[group.id].includes(option);
                return (
                  <li key={option}>
                    <label className="flex min-h-11 items-center gap-2.5 rounded-fq-md px-2 text-sm capitalize transition-colors hover:bg-muted">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onChange(toggleFeature(selection, group.id, option))}
                        className="size-5 accent-[var(--fq-signal)]"
                      />
                      <span className="text-foreground/90">{option}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ))}
      </div>
    </Drawer>
  );
}

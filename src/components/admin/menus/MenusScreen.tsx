/**
 * Phase 16 — Content › Menus (WordPress Appearance › Menus parity).
 *
 * Left: source boxes. Right: the structure plus display locations. A sticky
 * save bar appears only when the draft differs from what is stored, and the
 * Save button stays disabled while any row is missing a label or an address.
 */
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ListTree, Plus } from "lucide-react";
import {
  Card,
  ConfirmDialog,
  EmptyState,
  InlineError,
  Page,
  Skeleton,
  btnGhost,
  btnPrimary,
  inputClass,
} from "@/components/console/kit";
import {
  MENU_LOCATIONS,
  type MenuDropPosition,
  type MenuItem,
  type MenuLocation,
  type MenuSource,
  type NavMenu,
  addItem,
  indentItem,
  locationsLabel,
  menuDirty,
  moveItem,
  moveVertical,
  outdentItem,
  removeItem,
  sourceToItem,
  toggleLocation,
  updateItem,
  validateMenu,
} from "@/lib/menus/menu";
import {
  menuCreateFn,
  menuDeleteFn,
  menuSaveFn,
  menusWorkspaceFn,
} from "@/lib/menus/menu.functions";
import { cn } from "@/lib/utils";
import { MenuSourcePanel } from "./MenuSourcePanel";
import { MenuStructure } from "./MenuStructure";

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `tmp-${Math.random().toString(36).slice(2)}`;

export function MenusScreen() {
  const qc = useQueryClient();
  const load = useServerFn(menusWorkspaceFn);
  const create = useServerFn(menuCreateFn);
  const save = useServerFn(menuSaveFn);
  const destroy = useServerFn(menuDeleteFn);

  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState<MenuItem[]>([]);
  const [name, setName] = useState("");
  const [locations, setLocations] = useState<MenuLocation[]>([]);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["menus", "workspace"],
    queryFn: () => load({}),
    staleTime: 15_000,
  });

  const menus: NavMenu[] = useMemo(() => query.data?.menus ?? [], [query.data]);
  const sources: MenuSource[] = useMemo(() => query.data?.sources ?? [], [query.data]);
  const active = menus.find((menu) => menu.id === activeId) ?? menus[0] ?? null;

  useEffect(() => {
    if (!active) return;
    setActiveId(active.id);
    setDraft(active.items);
    setName(active.name);
    setLocations(active.locations);
  }, [active?.id, query.dataUpdatedAt]);

  const issues = useMemo(() => validateMenu(draft), [draft]);
  const dirty =
    Boolean(active) &&
    (menuDirty(active?.items ?? [], draft) ||
      name !== (active?.name ?? "") ||
      locations.join(",") !== (active?.locations ?? []).join(","));

  const refresh = () => void qc.invalidateQueries({ queryKey: ["menus", "workspace"] });

  const createMenu = useMutation({
    mutationFn: (input: { name: string }) => create({ data: input }),
    onSuccess: (result) => {
      setError(null);
      setCreating(false);
      setNewName("");
      setActiveId(result.menu.id);
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const saveMenu = useMutation({
    mutationFn: () =>
      save({ data: { menuId: active!.id, name: name.trim() || "Untitled menu", locations, items: draft } }),
    onSuccess: () => {
      setError(null);
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const deleteMenu = useMutation({
    mutationFn: () => destroy({ data: { menuId: active!.id } }),
    onSuccess: () => {
      setError(null);
      setConfirmDelete(false);
      setActiveId(null);
      refresh();
    },
    onError: (e: Error) => setError(e.message),
  });

  const addSources = (picked: MenuSource[]) =>
    setDraft((current) =>
      picked.reduce((items, source) => addItem(items, sourceToItem(source, newId())), current),
    );

  const addCustom = (input: { label: string; url: string }) =>
    setDraft((current) =>
      addItem(current, {
        id: newId(),
        parentId: null,
        position: current.length,
        kind: "custom",
        label: input.label,
        url: input.url,
        refId: null,
        titleAttr: "",
        newTab: false,
        cssClass: "",
      }),
    );

  return (
    <Page
      title="Menus"
      description="Build the navigation your shoppers use, and choose where each menu appears."
      actions={
        <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>
          <Plus className="size-4" aria-hidden />
          <span className="ml-1">Create menu</span>
        </button>
      }
    >
      {error && <InlineError message={error} />}

      {creating && (
        <Card title="Create a new menu">
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-[220px] flex-1 space-y-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Menu name
              </span>
              <input
                className={inputClass}
                value={newName}
                autoFocus
                onChange={(event) => setNewName(event.target.value)}
              />
            </label>
            <button
              type="button"
              className={btnPrimary}
              disabled={newName.trim().length === 0 || createMenu.isPending}
              onClick={() => createMenu.mutate({ name: newName.trim() })}
            >
              {createMenu.isPending ? "Creating…" : "Create menu"}
            </button>
            <button type="button" className={btnGhost} onClick={() => setCreating(false)}>
              Cancel
            </button>
          </div>
        </Card>
      )}

      {query.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <Skeleton className="h-64 rounded-fq-md" />
          <Skeleton className="h-64 rounded-fq-md" />
        </div>
      ) : menus.length === 0 ? (
        <EmptyState
          icon={<ListTree className="size-6" aria-hidden />}
          title="No menus yet"
          description="A menu holds the links in your header, footer or mobile drawer."
          action={
            <button type="button" className={btnPrimary} onClick={() => setCreating(true)}>
              Create your first menu
            </button>
          }
        />
      ) : (
        <>
          {menus.length > 1 && (
            <Card>
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Select a menu">
                {menus.map((menu) => (
                  <button
                    key={menu.id}
                    type="button"
                    aria-pressed={menu.id === active?.id}
                    onClick={() => setActiveId(menu.id)}
                    className={cn(
                      "min-h-11 rounded-full border px-4 text-sm font-medium transition-colors",
                      menu.id === active?.id
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {menu.name}
                    <span className="ml-2 text-xs opacity-80">{locationsLabel(menu.locations)}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
            <div className="space-y-3">
              <h2 className="text-sm font-semibold">Add menu items</h2>
              <MenuSourcePanel sources={sources} onAdd={addSources} onAddCustom={addCustom} />
            </div>

            <div className="space-y-4">
              <Card title="Menu settings">
                <div className="space-y-4">
                  <label className="block space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Menu name
                    </span>
                    <input
                      className={inputClass}
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                    />
                  </label>
                  <fieldset className="space-y-1">
                    <legend className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Display location
                    </legend>
                    {MENU_LOCATIONS.map((location) => (
                      <label key={location.key} className="flex min-h-11 items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-3 size-4"
                          checked={locations.includes(location.key)}
                          onChange={() => setLocations((current) => toggleLocation(current, location.key))}
                        />
                        <span className="pt-2.5">
                          <span className="font-medium">{location.label}</span>
                          <span className="block text-xs text-muted-foreground">{location.hint}</span>
                        </span>
                      </label>
                    ))}
                  </fieldset>
                </div>
              </Card>

              <section aria-label="Menu structure" className="space-y-3">
                <h2 className="text-sm font-semibold">Menu structure</h2>
                <p className="text-xs text-muted-foreground">
                  Drag a row, or use the arrows to reorder and the chevrons to nest an item under the one above
                  it. Menus can be three levels deep.
                </p>
                <MenuStructure
                  items={draft}
                  issues={issues}
                  onChange={(id, patch) => setDraft((current) => updateItem(current, id, patch))}
                  onMove={(id, targetId, position: MenuDropPosition) =>
                    setDraft((current) => moveItem(current, id, targetId, position))
                  }
                  onRemove={(id) => setDraft((current) => removeItem(current, id))}
                  onVertical={(id, step) => setDraft((current) => moveVertical(current, id, step))}
                  onIndent={(id) => setDraft((current) => indentItem(current, id))}
                  onOutdent={(id) => setDraft((current) => outdentItem(current, id))}
                />
              </section>

              <div className="fq-card sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 bg-card/90 px-3 py-2 backdrop-blur">
                <p className="text-sm text-muted-foreground" aria-live="polite">
                  {issues.length > 0
                    ? `${issues.length} item${issues.length === 1 ? " needs" : "s need"} a label and an address`
                    : dirty
                      ? "Unsaved changes"
                      : "All changes saved"}
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="inline-flex min-h-11 items-center rounded-fq-md px-3 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
                    onClick={() => setConfirmDelete(true)}
                  >
                    Delete menu
                  </button>
                  <button
                    type="button"
                    className={btnPrimary}
                    disabled={!dirty || issues.length > 0 || saveMenu.isPending}
                    onClick={() => saveMenu.mutate()}
                  >
                    {saveMenu.isPending ? "Saving…" : "Save menu"}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {confirmDelete && active && (
        <ConfirmDialog
          open
          destructive
          title={`Delete “${active.name}”?`}
          description="The menu and all of its links will be removed. Anywhere it was displayed will fall back to your default navigation."
          confirmLabel="Delete menu"
          onConfirm={() => deleteMenu.mutate()}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </Page>
  );
}

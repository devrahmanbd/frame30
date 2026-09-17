import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import {
  UserPlus,
  ShieldPlus,
  Pencil,
  Trash2,
  X,
  Loader2,
  Store,
  ShieldAlert,
} from "lucide-react";
import { useLang } from "@/lib/i18n";
import {
  ownerPeopleFn,
  ownerSetOwnerRightFn,
  ownerCreateAccountFn,
  ownerUpdateAccountFn,
  ownerDeleteAccountFn,
} from "@/lib/owner-desk.functions";
import type { PersonRow } from "@/lib/owner-people.server";
import { OwnerHeader, OwnerTable, StatCard, StatGrid, StatePill } from "@/components/root/OwnerUi";
import { RootConfirmDialog } from "@/components/root/RootConfirmDialog";

export const Route = createFileRoute("/root/users")({
  head: () => ({
    meta: [
      { title: "People and access — Framique owner console" },
      {
        name: "description",
        content:
          "Every Framique account: sign-in activity, the stores each person belongs to, and who holds platform owner rights.",
      },
      { property: "og:title", content: "People and access — Framique owner console" },
      {
        property: "og:description",
        content: "Account roster, store memberships and platform owner rights for Framique.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PeopleDesk,
});

export function PeopleDesk() {
  const { tk } = useLang();
  const qc = useQueryClient();
  const load = useServerFn(ownerPeopleFn);
  const setRight = useServerFn(ownerSetOwnerRightFn);
  const createAccount = useServerFn(ownerCreateAccountFn);
  const updateAccount = useServerFn(ownerUpdateAccountFn);
  const deleteAccount = useServerFn(ownerDeleteAccountFn);

  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [activeError, setActiveError] = useState<string | null>(null);

  // Modals state
  const [createModal, setCreateModal] = useState<{ open: boolean; isOwner: boolean } | null>(null);
  const [editModal, setEditModal] = useState<{ open: boolean; user: PersonRow; isOwner: boolean } | null>(null);
  const [deleteModal, setDeleteModal] = useState<{ open: boolean; userId: string; label: string; isOwner: boolean } | null>(null);
  const [detachModal, setDetachModal] = useState<{ open: boolean; userId: string; merchantId: string; merchantName: string; userLabel: string } | null>(null);
  const [rightModal, setRightModal] = useState<{ open: boolean; userId: string; grant: boolean; label: string } | null>(null);

  // Form states for create
  const [createEmail, setCreateEmail] = useState("");
  const [createPassword, setCreatePassword] = useState("");
  const [createMerchantId, setCreateMerchantId] = useState("");
  const [createRole, setCreateRole] = useState<"owner" | "admin" | "staff" | "viewer">("staff");

  // Form states for edit
  const [editEmail, setEditEmail] = useState("");
  const [editPassword, setEditPassword] = useState("");
  const [editMerchantId, setEditMerchantId] = useState("");
  const [editRole, setEditRole] = useState<"owner" | "admin" | "staff" | "viewer">("staff");

  const { data, isLoading, error: queryError } = useQuery({
    queryKey: ["owner-people", page],
    queryFn: () => load({ data: { page } }),
  });

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["owner-people"] });

  // Right toggle mutation
  const rightMut = useMutation({
    mutationFn: (input: { userId: string; grant: boolean }) => setRight({ data: input }),
    onSuccess: () => {
      setRightModal(null);
      setActiveError(null);
      invalidate();
    },
    onError: (e) => {
      setRightModal(null);
      setActiveError(e instanceof Error ? e.message : "Right update failed");
    },
  });

  // Create mutation
  const createMut = useMutation({
    mutationFn: (input: {
      email: string;
      password?: string | null;
      isOwner: boolean;
      merchantId?: string | null;
      role?: "owner" | "admin" | "staff" | "viewer" | null;
    }) => createAccount({ data: input }),
    onSuccess: () => {
      setCreateModal(null);
      setCreateEmail("");
      setCreatePassword("");
      setCreateMerchantId("");
      setCreateRole("staff");
      setActiveError(null);
      invalidate();
    },
    onError: (e) => {
      setActiveError(e instanceof Error ? e.message : "Account creation failed");
    },
  });

  // Update mutation
  const updateMut = useMutation({
    mutationFn: (input: {
      userId: string;
      email?: string | null;
      password?: string | null;
      merchantId?: string | null;
      role?: "owner" | "admin" | "staff" | "viewer" | null;
      removeMerchantId?: string | null;
      isOwner?: boolean | null;
    }) => updateAccount({ data: input }),
    onSuccess: () => {
      setEditModal(null);
      setEditEmail("");
      setEditPassword("");
      setEditMerchantId("");
      setEditRole("staff");
      setActiveError(null);
      invalidate();
    },
    onError: (e) => {
      setActiveError(e instanceof Error ? e.message : "Account update failed");
    },
  });

  // Delete mutation
  const deleteMut = useMutation({
    mutationFn: (userId: string) => deleteAccount({ data: { userId } }),
    onSuccess: () => {
      setDeleteModal(null);
      setActiveError(null);
      invalidate();
    },
    onError: (e) => {
      setDeleteModal(null);
      setActiveError(e instanceof Error ? e.message : "Account deletion failed");
    },
  });

  // Detach mutation
  const detachMut = useMutation({
    mutationFn: (input: { userId: string; merchantId: string }) =>
      updateAccount({ data: { userId: input.userId, removeMerchantId: input.merchantId } }),
    onSuccess: () => {
      setDetachModal(null);
      setActiveError(null);
      invalidate();
    },
    onError: (e) => {
      setDetachModal(null);
      setActiveError(e instanceof Error ? e.message : "Store detachment failed");
    },
  });

  const needle = query.trim().toLowerCase();
  const rawAdmins = data?.platformAdmins ?? (data?.people ?? []).filter((p) => p.isOwner);
  const rawStoreUsers = data?.storeUsers ?? (data?.people ?? []).filter((p) => !p.isOwner);
  const merchantsList = data?.merchants ?? [];

  const platformAdmins = rawAdmins.filter(
    (p) =>
      !needle ||
      (p.email ?? "").toLowerCase().includes(needle) ||
      p.userId.toLowerCase().includes(needle),
  );

  const storeUsers = rawStoreUsers.filter(
    (p) =>
      !needle ||
      (p.email ?? "").toLowerCase().includes(needle) ||
      p.userId.toLowerCase().includes(needle) ||
      p.memberships.some((m) => m.merchantName.toLowerCase().includes(needle)),
  );

  const combinedError =
    activeError ||
    (queryError instanceof Error ? queryError.message : queryError ? String(queryError) : null);

  const openEdit = (user: PersonRow, isOwner: boolean) => {
    setEditEmail(user.email ?? "");
    setEditPassword("");
    setEditMerchantId("");
    setEditRole("staff");
    setEditModal({ open: true, user, isOwner });
  };

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <OwnerHeader title={tk("owner.people.title")} subtitle={tk("owner.people.subtitle")} />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setCreateEmail("");
              setCreatePassword("");
              setCreateMerchantId("");
              setCreateRole("staff");
              setCreateModal({ open: true, isOwner: true });
            }}
            className="inline-flex items-center gap-1.5 rounded-fq-md border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-400 hover:bg-rose-500/20"
          >
            <ShieldPlus className="h-4 w-4" />
            <span>{tk("owner.people.add_owner")}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setCreateEmail("");
              setCreatePassword("");
              setCreateMerchantId(merchantsList[0]?.id ?? "");
              setCreateRole("staff");
              setCreateModal({ open: true, isOwner: false });
            }}
            className="inline-flex items-center gap-1.5 rounded-fq-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <UserPlus className="h-4 w-4" />
            <span>{tk("owner.people.create_account")}</span>
          </button>
        </div>
      </div>

      {combinedError ? (
        <div role="alert" className="flex items-center justify-between rounded-fq-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{combinedError}</span>
          <button type="button" onClick={() => setActiveError(null)} className="text-destructive hover:opacity-70">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      <StatGrid>
        <StatCard label={tk("owner.people.accounts")} value={String(data?.totals.users ?? 0)} />
        <StatCard label={tk("owner.people.owners")} value={String(data?.totals.owners ?? 0)} />
        <StatCard label={tk("owner.people.unconfirmed")} value={String(data?.totals.unconfirmed ?? 0)} />
        <StatCard label={tk("owner.people.stores")} value={String(data?.totals.merchants ?? 0)} />
      </StatGrid>

      <div className="flex items-center justify-between gap-4">
        <label className="block text-sm flex-1 max-w-sm">
          <span className="block pb-1 font-medium">{tk("owner.people.search")}</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by email, user ID, or store name..."
            className="w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </label>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>{tk("common.loading")}</span>
        </div>
      ) : null}

      {/* 1. Platform Administrators (platform_admins) Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span>{tk("owner.people.owners")}</span>
              <span className="rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 text-xs font-mono">
                platform_admins
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Root operators with full infrastructure clearance.
            </p>
          </div>
          <span className="text-xs text-muted-foreground font-mono">{platformAdmins.length} total</span>
        </div>

        {platformAdmins.length > 0 ? (
          <OwnerTable
            head={[
              tk("owner.people.account"),
              tk("owner.people.last_sign_in"),
              tk("owner.people.rights"),
              "Actions",
            ]}
          >
            {platformAdmins.map((p) => (
              <tr key={p.userId} className="border-t border-border align-top">
                <td className="px-3 py-2">
                  <span className="block font-medium">{p.email ?? "—"}</span>
                  <code className="font-mono text-xs text-muted-foreground">{p.userId}</code>
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {p.lastSignInAt ? new Date(p.lastSignInAt).toLocaleString() : tk("owner.people.never")}
                </td>
                <td className="px-3 py-2">
                  <StatePill tone="ok">{tk("owner.people.platform_owner")}</StatePill>
                  {p.isYou ? (
                    <span className="block pt-1 text-xs text-muted-foreground">
                      {tk("owner.users.you")}
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      title="Edit root operator"
                      onClick={() => openEdit(p, true)}
                      className="rounded-fq-sm border border-border px-2 py-1 text-xs font-medium hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5 inline mr-1" />
                      <span>{tk("owner.people.edit_account")}</span>
                    </button>
                    {p.isYou ? null : (
                      <>
                        <button
                          type="button"
                          title="Revoke clearance"
                          onClick={() =>
                            setRightModal({ userId: p.userId, grant: false, label: p.email ?? p.userId })
                          }
                          className="rounded-fq-sm border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 px-2 py-1 text-xs font-medium"
                        >
                          {tk("owner.people.revoke")}
                        </button>
                        <button
                          type="button"
                          title="Delete account permanently"
                          onClick={() =>
                            setDeleteModal({
                              open: true,
                              userId: p.userId,
                              label: p.email ?? p.userId,
                              isOwner: true,
                            })
                          }
                          className="rounded-fq-sm border border-destructive/40 text-destructive hover:bg-destructive/10 p-1 text-xs"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </OwnerTable>
        ) : (
          <p className="text-sm text-muted-foreground py-2">No platform administrators match search.</p>
        )}
      </div>

      {/* 2. Merchant & Store Accounts Table */}
      <div className="space-y-3 pt-4 border-t border-border">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span>{tk("owner.people.accounts")}</span>
              <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-xs font-mono">
                merchant_members
              </span>
            </h2>
            <p className="text-xs text-muted-foreground">
              Merchants and store staff accounts across all active storefronts.
            </p>
          </div>
          <span className="text-xs text-muted-foreground font-mono">{storeUsers.length} on this page</span>
        </div>

        {storeUsers.length > 0 ? (
          <OwnerTable
            head={[
              tk("owner.people.account"),
              tk("owner.people.stores"),
              tk("owner.people.last_sign_in"),
              tk("owner.people.rights"),
              "Actions",
            ]}
          >
            {storeUsers.map((p) => (
              <tr key={p.userId} className="border-t border-border align-top">
                <td className="px-3 py-2">
                  <span className="block font-medium">{p.email ?? "—"}</span>
                  <code className="font-mono text-xs text-muted-foreground">{p.userId}</code>
                  {p.confirmed ? null : (
                    <span className="block pt-1">
                      <StatePill tone="warn">{tk("owner.people.unconfirmed")}</StatePill>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  {p.memberships.length === 0 ? (
                    <span className="text-muted-foreground text-xs italic">No store assigned</span>
                  ) : (
                    <ul className="space-y-1.5">
                      {p.memberships.map((m) => (
                        <li key={`${p.userId}:${m.merchantId}`} className="flex items-center justify-between gap-2 text-xs">
                          <span>
                            <strong className="font-medium text-foreground">{m.merchantName}</strong>{" "}
                            <span className="text-muted-foreground">
                              ({m.role} · {m.status})
                            </span>
                          </span>
                          <button
                            type="button"
                            title="Detach from store"
                            onClick={() =>
                              setDetachModal({
                                open: true,
                                userId: p.userId,
                                merchantId: m.merchantId,
                                merchantName: m.merchantName,
                                userLabel: p.email ?? p.userId,
                              })
                            }
                            className="rounded text-muted-foreground hover:text-destructive p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="px-3 py-2 tabular-nums">
                  {p.lastSignInAt ? new Date(p.lastSignInAt).toLocaleString() : tk("owner.people.never")}
                </td>
                <td className="px-3 py-2">
                  <StatePill tone="warn">{tk("owner.people.merchant_only")}</StatePill>
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      title="Edit account & store assignment"
                      onClick={() => openEdit(p, false)}
                      className="rounded-fq-sm border border-border px-2 py-1 text-xs font-medium hover:bg-muted"
                    >
                      <Pencil className="h-3.5 w-3.5 inline mr-1" />
                      <span>{tk("owner.people.edit_account")}</span>
                    </button>
                    <button
                      type="button"
                      title="Promote to platform owner"
                      onClick={() =>
                        setRightModal({ userId: p.userId, grant: true, label: p.email ?? p.userId })
                      }
                      className="rounded-fq-sm border border-border px-2 py-1 text-xs font-medium hover:bg-muted text-foreground"
                    >
                      {tk("owner.people.grant")}
                    </button>
                    <button
                      type="button"
                      title="Delete account permanently"
                      onClick={() =>
                        setDeleteModal({
                          open: true,
                          userId: p.userId,
                          label: p.email ?? p.userId,
                          isOwner: false,
                        })
                      }
                      className="rounded-fq-sm border border-destructive/40 text-destructive hover:bg-destructive/10 p-1 text-xs"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </OwnerTable>
        ) : (
          <p className="text-sm text-muted-foreground py-2">No merchant accounts found.</p>
        )}

        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            disabled={page === 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="rounded-fq-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {tk("owner.people.prev")}
          </button>
          <span className="text-sm tabular-nums text-muted-foreground">{page}</span>
          <button
            type="button"
            disabled={!data?.hasMore}
            onClick={() => setPage((p) => p + 1)}
            className="rounded-fq-md border border-border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {tk("owner.people.next")}
          </button>
        </div>
      </div>

      {/* --- CREATE ACCOUNT MODAL --- */}
      {createModal?.open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-fq-lg border border-border bg-card p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                {createModal.isOwner ? (
                  <>
                    <ShieldAlert className="h-5 w-5 text-rose-500" />
                    <span>{tk("owner.people.add_owner")}</span>
                  </>
                ) : (
                  <>
                    <UserPlus className="h-5 w-5 text-primary" />
                    <span>{tk("owner.people.create_account")}</span>
                  </>
                )}
              </h3>
              <button
                type="button"
                onClick={() => setCreateModal(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!createEmail) return;
                createMut.mutate({
                  email: createEmail,
                  password: createPassword || undefined,
                  isOwner: createModal.isOwner,
                  merchantId: createModal.isOwner ? undefined : createMerchantId || undefined,
                  role: createModal.isOwner ? undefined : createRole,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-foreground pb-1">
                  Email address <span className="text-destructive">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={createEmail}
                  onChange={(e) => setCreateEmail(e.target.value)}
                  placeholder="operator@framique.com"
                  className="w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground pb-1">
                  Password <span className="text-muted-foreground">(min. 6 characters)</span>
                </label>
                <input
                  type="text"
                  value={createPassword}
                  onChange={(e) => setCreatePassword(e.target.value)}
                  placeholder="Leave blank to auto-generate temporary password"
                  className="w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {!createModal.isOwner ? (
                <>
                  <div>
                    <label className="block text-xs font-medium text-foreground pb-1">
                      Assign to Store <span className="text-muted-foreground">(optional)</span>
                    </label>
                    <select
                      value={createMerchantId}
                      onChange={(e) => setCreateMerchantId(e.target.value)}
                      className="w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">— Select a storefront —</option>
                      {merchantsList.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-foreground pb-1">
                      Store Role
                    </label>
                    <select
                      value={createRole}
                      onChange={(e) => setCreateRole(e.target.value as any)}
                      className="w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="owner">Owner (Full merchant authority)</option>
                      <option value="admin">Admin (Staff & store manager)</option>
                      <option value="staff">Staff (Orders & inventory only)</option>
                      <option value="viewer">Viewer (Read-only access)</option>
                    </select>
                  </div>
                </>
              ) : (
                <p className="text-xs text-rose-400/90 bg-rose-500/10 border border-rose-500/20 rounded-fq-sm p-2.5">
                  Platform owners have unrestricted infrastructure clearance across all merchant stores, audit logs, and configurations.
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={createMut.isPending}
                  onClick={() => setCreateModal(null)}
                  className="rounded-fq-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
                >
                  {tk("owner.people.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={createMut.isPending}
                  className="inline-flex items-center gap-1.5 rounded-fq-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {createMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  <span>{tk("owner.people.create_account")}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* --- EDIT ACCOUNT MODAL --- */}
      {editModal?.open ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/60 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-md rounded-fq-lg border border-border bg-card p-6 shadow-xl space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Pencil className="h-4 w-4 text-primary" />
                <span>
                  {editModal.isOwner ? tk("owner.people.edit_owner") : tk("owner.people.edit_account")}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setEditModal(null)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="text-xs text-muted-foreground">
              User ID: <code className="font-mono text-foreground">{editModal.user.userId}</code>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateMut.mutate({
                  userId: editModal.user.userId,
                  email: editEmail !== editModal.user.email ? editEmail : undefined,
                  password: editPassword || undefined,
                  merchantId: editMerchantId || undefined,
                  role: editMerchantId ? editRole : undefined,
                });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-medium text-foreground pb-1">
                  Email address
                </label>
                <input
                  type="email"
                  required
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground pb-1">
                  Reset Password <span className="text-muted-foreground">(leave blank to keep unchanged)</span>
                </label>
                <input
                  type="text"
                  value={editPassword}
                  onChange={(e) => setEditPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {!editModal.isOwner ? (
                <>
                  <div className="border-t border-border pt-3">
                    <label className="block text-xs font-medium text-foreground pb-1">
                      Assign / Update Store Membership
                    </label>
                    <select
                      value={editMerchantId}
                      onChange={(e) => setEditMerchantId(e.target.value)}
                      className="w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                    >
                      <option value="">— Select store to assign or update —</option>
                      {merchantsList.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {editMerchantId ? (
                    <div>
                      <label className="block text-xs font-medium text-foreground pb-1">
                        Role in selected store
                      </label>
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value as any)}
                        className="w-full rounded-fq-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="owner">Owner (Full merchant authority)</option>
                        <option value="admin">Admin (Staff & store manager)</option>
                        <option value="staff">Staff (Orders & inventory only)</option>
                        <option value="viewer">Viewer (Read-only access)</option>
                      </select>
                    </div>
                  ) : null}
                </>
              ) : null}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={updateMut.isPending}
                  onClick={() => setEditModal(null)}
                  className="rounded-fq-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-muted"
                >
                  {tk("owner.people.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={updateMut.isPending}
                  className="inline-flex items-center gap-1.5 rounded-fq-md bg-primary px-4 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {updateMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  <span>{tk("owner.people.save")}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* --- CONFIRM RIGHT GRANT / REVOKE --- */}
      <RootConfirmDialog
        open={Boolean(rightModal)}
        title={rightModal?.grant ? tk("owner.people.grant") : tk("owner.people.revoke")}
        description={
          rightModal?.grant
            ? `Grant platform owner clearance to ${rightModal?.label}? ${tk("owner.people.grant_hint")}`
            : `Revoke platform clearance for ${rightModal?.label}? ${tk("owner.people.revoke_hint")}`
        }
        confirmLabel={rightModal?.grant ? tk("owner.people.grant") : tk("owner.people.revoke")}
        tone={rightModal?.grant ? "primary" : "danger"}
        busy={rightMut.isPending}
        onConfirm={() => rightModal && rightMut.mutate({ userId: rightModal.userId, grant: rightModal.grant })}
        onCancel={() => setRightModal(null)}
      />

      {/* --- CONFIRM DELETE ACCOUNT --- */}
      <RootConfirmDialog
        open={Boolean(deleteModal)}
        title={tk("owner.people.delete_account")}
        description={`Permanently delete user account (${deleteModal?.label})? ${tk("owner.people.delete_confirm")}`}
        confirmLabel={tk("owner.people.delete_account")}
        tone="danger"
        busy={deleteMut.isPending}
        onConfirm={() => deleteModal && deleteMut.mutate(deleteModal.userId)}
        onCancel={() => setDeleteModal(null)}
      />

      {/* --- CONFIRM DETACH STORE --- */}
      <RootConfirmDialog
        open={Boolean(detachModal)}
        title={tk("owner.people.detach_store")}
        description={`Detach ${detachModal?.userLabel} from "${detachModal?.merchantName}"?`}
        confirmLabel={tk("owner.people.detach_store")}
        tone="danger"
        busy={detachMut.isPending}
        onConfirm={() =>
          detachModal &&
          detachMut.mutate({ userId: detachModal.userId, merchantId: detachModal.merchantId })
        }
        onCancel={() => setDetachModal(null)}
      />
    </section>
  );
}

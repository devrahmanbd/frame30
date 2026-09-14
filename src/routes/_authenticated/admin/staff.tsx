import { useState } from "react";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { StatusPill, Field, inputClass, btnPrimary, btnGhost } from "@/components/admin/MarketingUi";
import { useLang } from "@/lib/i18n";
import { PERMISSION_MATRIX, type Grant } from "@/lib/permissions";
import {
  governanceLoadFn,
  governanceSaveRoleFn,
  governanceDeleteRoleFn,
  governanceSetMemberFn,
  governanceSetMfaFn,
  governanceSubmitKycFn,
  governanceInviteFn,
  governanceRevokeSessionFn,
} from "@/lib/governance.functions";

export const Route = createFileRoute("/_authenticated/admin/staff")({
  loader: () => governanceLoadFn(),
  head: () => ({
    meta: [
      { title: "Staff & permissions — Framique admin" },
      {
        name: "description",
        content: "Manage team members, custom roles, two-factor status and store verification.",
      },
      { property: "og:title", content: "Staff & permissions — Framique admin" },
      { property: "og:description", content: "Granular roles, audit trail and store verification." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StaffPage,
});

const STATUS_TONE: Record<string, "neutral" | "success" | "warning" | "danger" | "info"> = {
  invited: "warning",
  active: "success",
  suspended: "danger",
  removed: "neutral",
  none: "warning",
  enrolled: "success",
  enforced: "success",
  pending: "neutral",
  submitted: "info",
  verified: "success",
  rejected: "danger",
};

const FORBIDDEN = ["staff:manage_roles", "staff:manage_grants"];
const OWNER_ONLY = ["finance:read", "finance:initiate", "finance:approve", "settings:update"];

function key(g: Grant) {
  return `${g.group}:${g.action}`;
}

function StaffPage() {
  const { tk, tError } = useLang();
  const data = Route.useLoaderData();
  const router = useRouter();
  const saveRole = useServerFn(governanceSaveRoleFn);
  const setMember = useServerFn(governanceSetMemberFn);
  const setMfa = useServerFn(governanceSetMfaFn);
  const submitKyc = useServerFn(governanceSubmitKycFn);
  const deleteRole = useServerFn(governanceDeleteRoleFn);
  const invite = useServerFn(governanceInviteFn);
  const revokeSession = useServerFn(governanceRevokeSessionFn);
  const [inviteForm, setInviteForm] = useState<{ email: string; role: "admin" | "staff" | "viewer"; roleId: string }>({
    email: "",
    role: "staff",
    roleId: "",
  });
  const isOwner = data.members.some((m) => m.isSelf && m.role === "owner");

  const editable = data.roles.filter((r) => !r.isFixed);
  const [roleId, setRoleId] = useState<string | null>(editable[0]?.id ?? null);
  const current = data.roles.find((r) => r.id === roleId) ?? null;
  const [roleName, setRoleName] = useState(current?.name ?? "");
  const [grants, setGrants] = useState<string[]>((current?.grants ?? []).map(key));
  const [mfaRequired, setMfaRequired] = useState<boolean>(current?.mfaRequired ?? false);
  const [busy, setBusy] = useState(false);
  const [kyc, setKyc] = useState({
    legalName: data.kyc.legalName,
    contactPhone: data.kyc.contactPhone,
    tradeLicenseNo: data.kyc.tradeLicenseNo,
    binNo: data.kyc.binNo,
  });

  function selectRole(id: string | null) {
    setRoleId(id);
    const role = data.roles.find((r) => r.id === id) ?? null;
    setRoleName(role?.name ?? "");
    setGrants((role?.grants ?? []).map(key));
    setMfaRequired(role?.mfaRequired ?? false);
  }

  async function run(fn: () => Promise<unknown>, okKey: string) {
    setBusy(true);
    try {
      await fn();
      toast.success(tk(okKey));
      await router.invalidate();
    } catch (error) {
      toast.error(tError(error));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-bangla-display text-xl font-semibold">{tk("staff.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{tk("staff.subtitle")}</p>
      </header>

      <section className="rounded-fq-md border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">
          {tk("staff.members")}
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">{tk("staff.member")}</th>
                <th className="px-4 py-2">{tk("staff.base_role")}</th>
                <th className="px-4 py-2">{tk("staff.custom_role")}</th>
                <th className="px-4 py-2">{tk("staff.status")}</th>
                <th className="px-4 py-2">{tk("staff.mfa")}</th>
                <th className="px-4 py-2">{tk("staff.joined")}</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <span className="font-medium">{m.name}</span>
                    {m.invitedBy && (
                      <span className="block text-xs text-muted-foreground">
                        {tk("staff.invited_by")}: {m.invitedBy}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 capitalize">{m.role}</td>
                  <td className="px-4 py-3">
                    <select
                      className={inputClass}
                      aria-label={tk("staff.custom_role")}
                      disabled={busy || m.isSelf}
                      value={m.roleId ?? ""}
                      onChange={(e) =>
                        run(
                          () =>
                            setMember({
                              data: {
                                memberId: m.id,
                                roleId: e.target.value || null,
                                status: m.status,
                              },
                            }),
                          "staff.member_updated",
                        )
                      }
                    >
                      <option value="">{tk("staff.no_custom_role")}</option>
                      {data.roles.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <select
                      className={inputClass}
                      aria-label={tk("staff.status")}
                      disabled={busy || m.isSelf}
                      value={m.status}
                      onChange={(e) =>
                        run(
                          () =>
                            setMember({
                              data: {
                                memberId: m.id,
                                roleId: m.roleId,
                                status: e.target.value as typeof m.status,
                              },
                            }),
                          "staff.member_updated",
                        )
                      }
                    >
                      {(["invited", "active", "suspended", "removed"] as const).map((s) => (
                        <option key={s} value={s}>
                          {tk(`staff.status.${s}`)}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill
                      tone={STATUS_TONE[m.mfaStatus] ?? "neutral"}
                      label={tk(`staff.mfa.${m.mfaStatus}`)}
                    />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-border px-4 py-3">
          <span className="text-sm text-muted-foreground">{tk("staff.mfa_own")}</span>
          {(["none", "enrolled", "enforced"] as const).map((s) => (
            <button
              key={s}
              type="button"
              className={btnGhost}
              disabled={busy}
              onClick={() => run(() => setMfa({ data: { status: s } }), "staff.mfa_updated")}
            >
              {tk(`staff.mfa.${s}`)}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-fq-md border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{tk("staff.invite")}</h2>
        <form
          className="grid gap-3 px-4 py-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                invite({
                  data: {
                    email: inviteForm.email.trim(),
                    role: inviteForm.role,
                    roleId: inviteForm.roleId || null,
                  },
                }).then(() => setInviteForm({ email: "", role: "staff", roleId: "" })),
              "staff.invited",
            );
          }}
        >
          <Field label={tk("staff.invite_email")}>
            <input
              type="email"
              required
              className={inputClass}
              value={inviteForm.email}
              onChange={(e) => setInviteForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
          <Field label={tk("staff.base_role")}>
            <select
              className={inputClass}
              value={inviteForm.role}
              onChange={(e) =>
                setInviteForm((f) => ({ ...f, role: e.target.value as typeof f.role }))
              }
            >
              {(["admin", "staff", "viewer"] as const).map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
          <Field label={tk("staff.custom_role")}>
            <select
              className={inputClass}
              value={inviteForm.roleId}
              onChange={(e) => setInviteForm((f) => ({ ...f, roleId: e.target.value }))}
            >
              <option value="">{tk("staff.no_custom_role")}</option>
              {data.roles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </Field>
          <button type="submit" className={btnPrimary} disabled={busy}>
            {tk("staff.invite_send")}
          </button>
        </form>
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {tk("staff.invite_note")}
        </p>
      </section>

      <section className="rounded-fq-md border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">{tk("staff.sessions")}</h2>
        {data.sessions.length === 0 ? (
          <p className="px-4 py-4 text-sm text-muted-foreground">{tk("staff.sessions_empty")}</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-medium">
                    {s.name} {s.isSelf && <span className="text-xs text-muted-foreground">({tk("staff.session_current")})</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.device || "—"} · {s.aal || "aal1"} ·{" "}
                    {s.lastSeenAt ? new Date(s.lastSeenAt).toLocaleString() : "—"}
                  </p>
                </div>
                <button
                  type="button"
                  className={btnGhost}
                  disabled={busy}
                  onClick={() => run(() => revokeSession({ data: { sessionId: s.id } }), "staff.session_revoked")}
                >
                  {tk("staff.session_revoke")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-fq-md border border-border bg-card">
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">{tk("staff.roles")}</h2>
          <select
            className={inputClass}
            aria-label={tk("staff.roles")}
            value={roleId ?? ""}
            onChange={(e) => selectRole(e.target.value || null)}
          >
            <option value="">{tk("staff.role_new")}</option>
            {editable.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
          <span className="text-xs text-muted-foreground">{tk("staff.role_fixed_note")}</span>
          {roleId && (
            <button
              type="button"
              className={`${btnGhost} ml-auto text-danger-foreground`}
              disabled={busy}
              onClick={() => {
                if (!window.confirm(tk("common.confirm_destructive"))) return;
                void run(async () => {
                  await deleteRole({ data: { roleId } });
                  selectRole(null);
                }, "staff.role_deleted");
              }}
            >
              {tk("staff.role_delete")}
            </button>
          )}
        </div>

        <div className="space-y-4 p-4">
          <Field label={tk("staff.role_name")}>
            <input
              className={inputClass}
              value={roleName}
              onChange={(e) => setRoleName(e.target.value)}
            />
          </Field>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={mfaRequired}
              disabled={busy}
              onChange={(e) => setMfaRequired(e.target.checked)}
            />
            <span>{tk("staff.role_mfa_required")}</span>
          </label>

          <p className="rounded-fq-md bg-info-soft px-3 py-2 text-xs text-info-foreground">
            {tk("staff.least_privilege_note")}
          </p>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">{tk("staff.permissions")}</legend>
            {PERMISSION_MATRIX.map((group) => (
              <div key={group.group} className="rounded-fq-md border border-border p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {tk(`perm.group.${group.group}`)}
                </p>
                <div className="flex flex-wrap gap-3">
                  {group.actions.map((action) => {
                    const id = `${group.group}:${action}`;
                    const forbidden = FORBIDDEN.includes(id);
                    const ownerOnly = !isOwner && OWNER_ONLY.includes(id);
                    const disabled = busy || forbidden || ownerOnly;
                    const implied =
                      action === "read" &&
                      grants.some((g) => g.startsWith(`${group.group}:`) && g !== id);
                    const checked = grants.includes(id) || implied;
                    return (
                      <label
                        key={id}
                        className={`flex items-center gap-2 text-sm ${disabled ? "text-muted-foreground" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={disabled || implied}
                          aria-describedby={`desc-${id}`}
                          onChange={() =>
                            setGrants((prev) =>
                              prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
                            )
                          }
                        />
                        <span id={`desc-${id}`}>
                          {action}
                          {forbidden && ` — ${tk("staff.grant_forbidden")}`}
                          {ownerOnly && ` — ${tk("staff.grant_owner_only")}`}
                          {implied && ` — ${tk("staff.grant_implied")}`}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </fieldset>

          <button
            type="button"
            className={btnPrimary}
            disabled={busy}
            onClick={() =>
              run(
                () =>
                  saveRole({
                    data: {
                      roleId,
                      name: roleName,
                      mfaRequired,
                      grants: grants.map((g) => {
                        const [group, action] = g.split(":");
                        return { group: group as string, action: action as string };
                      }),
                    },
                  }),
                "staff.role_saved",
              )
            }
          >
            {tk("common.save")}
          </button>
        </div>
      </section>


      <section className="rounded-fq-md border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold">{tk("kyc.title")}</h2>
          <StatusPill
            tone={STATUS_TONE[data.kyc.state] ?? "neutral"}
            label={tk(`kyc.state.${data.kyc.state}`)}
          />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{tk("kyc.subtitle")}</p>
        {data.kyc.rejectionReason && (
          <p className="mt-2 text-sm text-destructive">{data.kyc.rejectionReason}</p>
        )}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label={tk("kyc.legal_name")}>
            <input
              className={inputClass}
              value={kyc.legalName}
              onChange={(e) => setKyc({ ...kyc, legalName: e.target.value })}
            />
          </Field>
          <Field label={tk("kyc.contact_phone")}>
            <input
              className={inputClass}
              value={kyc.contactPhone}
              onChange={(e) => setKyc({ ...kyc, contactPhone: e.target.value })}
            />
          </Field>
          <Field label={tk("kyc.trade_license")}>
            <input
              className={inputClass}
              value={kyc.tradeLicenseNo}
              onChange={(e) => setKyc({ ...kyc, tradeLicenseNo: e.target.value })}
            />
          </Field>
          <Field label={tk("kyc.bin")}>
            <input
              className={inputClass}
              value={kyc.binNo}
              onChange={(e) => setKyc({ ...kyc, binNo: e.target.value })}
            />
          </Field>
        </div>
        <button
          type="button"
          className={`${btnPrimary} mt-4`}
          disabled={busy}
          onClick={() => run(() => submitKyc({ data: kyc }), "kyc.submitted_toast")}
        >
          {tk("kyc.submit")}
        </button>
      </section>

      <section className="rounded-fq-md border border-border bg-card">
        <h2 className="border-b border-border px-4 py-3 text-sm font-semibold">
          {tk("staff.audit")}
        </h2>
        <ul className="divide-y divide-border">
          {data.audit.length === 0 && (
            <li className="px-4 py-3 text-sm text-muted-foreground">{tk("common.empty")}</li>
          )}
          {data.audit.map((row) => (
            <li key={row.id} className="flex flex-wrap gap-2 px-4 py-3 text-sm">
              <span className="font-medium">{row.action}</span>
              <span className="text-muted-foreground">{row.actor}</span>
              <span className="ml-auto tabular-nums text-muted-foreground">
                {new Date(row.createdAt).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/**
 * Platform people management.
 *
 * Two questions this desk answers that nothing else could: who can sign in at
 * all, and which stores each of them belongs to. Identity lives in the auth
 * schema, so the listing goes through the admin API — which is exactly why it
 * sits behind `ownerGate`: platform-admin check first, audit row always.
 *
 * Owner rights are stored in `platform_admins` only. Nothing reads a role from
 * a client claim, and an owner can never remove their own access (that would
 * lock the console out with no way back in).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { ownerGate, OwnerError } from "./owner-ops.server";

type Client = SupabaseClient<Database>;
/* eslint-disable @typescript-eslint/no-explicit-any */
type Loose = any;

async function service() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Loose;
}

export type PersonRow = {
  userId: string;
  email: string | null;
  createdAt: string;
  lastSignInAt: string | null;
  confirmed: boolean;
  isOwner: boolean;
  isYou: boolean;
  memberships: { merchantId: string; merchantName: string; role: string; status: string }[];
};

export async function loadPeople(db: Client, userId: string, page = 1) {
  return ownerGate(
    db,
    userId,
    { action: "people.read", entity: "auth.users", bucket: "owner.read", kind: "read", meta: { page } },
    async () => {
      const svc = await service();
      const perPage = 50;
      const listed = await svc.auth.admin.listUsers({ page, perPage });
      if (listed.error) throw new OwnerError("people.read_failed", listed.error.message);
      const users = (listed.data?.users ?? []) as Loose[];

      const [admins, members, merchants] = await Promise.all([
        svc.from("platform_admins").select("user_id, created_at"),
        svc.from("merchant_members").select("user_id, merchant_id, role, status"),
        svc.from("merchants").select("id, name"),
      ]);
      const ownerIds = new Set(((admins.data ?? []) as Loose[]).map((a) => a.user_id as string));
      const names = new Map<string, string>(
        ((merchants.data ?? []) as Loose[]).map((m) => [m.id as string, m.name as string]),
      );
      const byUser = new Map<string, PersonRow["memberships"]>();
      for (const m of (members.data ?? []) as Loose[]) {
        const list = byUser.get(m.user_id as string) ?? [];
        list.push({
          merchantId: m.merchant_id,
          merchantName: names.get(m.merchant_id) ?? "—",
          role: m.role ?? "staff",
          status: m.status ?? "active",
        });
        byUser.set(m.user_id as string, list);
      }

      const people: PersonRow[] = users.map((u) => ({
        userId: u.id,
        email: u.email ?? null,
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at ?? null,
        confirmed: Boolean(u.email_confirmed_at ?? u.confirmed_at),
        isOwner: ownerIds.has(u.id as string),
        isYou: u.id === userId,
        memberships: byUser.get(u.id as string) ?? [],
      }));

      return {
        people,
        page,
        hasMore: users.length === perPage,
        totals: {
          users: people.length,
          owners: people.filter((p) => p.isOwner).length,
          unconfirmed: people.filter((p) => !p.confirmed).length,
          merchants: names.size,
        },
      };
    },
  );
}

export async function setOwnerRight(db: Client, actorId: string, targetUserId: string, grant: boolean) {
  if (!grant && targetUserId === actorId) throw new OwnerError("people.cannot_demote_self");
  return ownerGate(
    db,
    actorId,
    {
      action: grant ? "people.grant_owner" : "people.revoke_owner",
      entity: "platform_admins",
      entityId: targetUserId,
      bucket: "owner.suspend",
      kind: "write",
    },
    async () => {
      const svc = await service();
      if (grant) {
        const { error } = await svc
          .from("platform_admins")
          .upsert({ user_id: targetUserId }, { onConflict: "user_id" });
        if (error) throw new OwnerError("people.grant_failed", error.message);
      } else {
        const target = await svc.auth.admin.getUserById(targetUserId);
        const OWNER_EMAIL = (process.env["PLATFORM_OWNER_EMAIL"] || "devrahmanbd@gmail.com").toLowerCase();
        if (target?.data?.user?.email?.toLowerCase() === OWNER_EMAIL) {
          throw new OwnerError("people.cannot_demote_owner", "Cannot revoke root owner rights.");
        }
        const remaining = await svc.from("platform_admins").select("user_id");
        if (((remaining.data ?? []) as Loose[]).length <= 1) {
          throw new OwnerError("people.last_owner");
        }
        const { error } = await svc.from("platform_admins").delete().eq("user_id", targetUserId);
        if (error) throw new OwnerError("people.revoke_failed", error.message);
      }
      return { ok: true };
    },
  );
}

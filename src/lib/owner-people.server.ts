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

      const platformAdmins = people.filter((p) => p.isOwner);
      const storeUsers = people.filter((p) => !p.isOwner);

      return {
        people,
        platformAdmins,
        storeUsers,
        merchants: ((merchants.data ?? []) as Loose[]).map((m) => ({
          id: m.id as string,
          name: m.name as string,
        })),
        page,
        hasMore: users.length === perPage,
        totals: {
          users: storeUsers.length,
          owners: platformAdmins.length,
          unconfirmed: people.filter((p) => !p.confirmed).length,
          merchants: names.size,
        },
      };
    },
  );
}

export type CreateAccountInput = {
  email: string;
  password?: string | null;
  isOwner?: boolean;
  merchantId?: string | null;
  role?: "owner" | "admin" | "staff" | "viewer" | string | null;
};

export async function createAccount(db: Client, actorId: string, input: CreateAccountInput) {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes("@")) {
    throw new OwnerError("people.invalid_email", "Valid email is required.");
  }
  const password = input.password?.trim() || Math.random().toString(36).slice(-10) + "Aa1!";

  return ownerGate(
    db,
    actorId,
    {
      action: "people.create_account",
      entity: "auth.users",
      bucket: "platform.write",
      kind: "write",
      meta: { email, isOwner: Boolean(input.isOwner), merchantId: input.merchantId ?? null },
    },
    async () => {
      const svc = await service();
      const { data: created, error } = await svc.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

      let userId = created?.user?.id;
      if (error) {
        // Check if user already exists
        const listed = await svc.auth.admin.listUsers({ page: 1, perPage: 100 });
        const existing = (listed.data?.users ?? []).find((u: any) => u.email?.toLowerCase() === email);
        if (!existing) {
          throw new OwnerError("people.create_failed", error.message);
        }
        userId = existing.id;
      }

      if (!userId) {
        throw new OwnerError("people.create_failed", "Could not create user account.");
      }

      if (input.isOwner) {
        const { error: adminErr } = await svc
          .from("platform_admins")
          .upsert({ user_id: userId }, { onConflict: "user_id" });
        if (adminErr) throw new OwnerError("people.grant_failed", adminErr.message);
      }

      if (input.merchantId) {
        const role = input.role || "staff";
        const { error: memberErr } = await svc
          .from("merchant_members")
          .upsert(
            {
              user_id: userId,
              merchant_id: input.merchantId,
              role,
              status: "active",
            },
            { onConflict: "merchant_id,user_id" },
          );
        if (memberErr) throw new OwnerError("people.membership_failed", memberErr.message);
      }

      return { ok: true, userId };
    },
  );
}

export type UpdateAccountInput = {
  userId: string;
  email?: string | null;
  password?: string | null;
  merchantId?: string | null;
  role?: "owner" | "admin" | "staff" | "viewer" | string | null;
  removeMerchantId?: string | null;
  isOwner?: boolean | null;
};

export async function updateAccount(db: Client, actorId: string, input: UpdateAccountInput) {
  return ownerGate(
    db,
    actorId,
    {
      action: "people.update_account",
      entity: "auth.users",
      entityId: input.userId,
      bucket: "platform.write",
      kind: "write",
      meta: { userId: input.userId },
    },
    async () => {
      const svc = await service();
      const updates: { email?: string; password?: string } = {};
      if (input.email?.trim()) {
        updates.email = input.email.trim().toLowerCase();
      }
      if (input.password?.trim()) {
        updates.password = input.password.trim();
      }

      if (Object.keys(updates).length > 0) {
        const { error: updateErr } = await svc.auth.admin.updateUserById(input.userId, updates);
        if (updateErr) throw new OwnerError("people.update_failed", updateErr.message);
      }

      if (typeof input.isOwner === "boolean") {
        if (input.isOwner) {
          await svc.from("platform_admins").upsert({ user_id: input.userId }, { onConflict: "user_id" });
        } else {
          if (input.userId === actorId) {
            throw new OwnerError("people.cannot_demote_self", "Cannot revoke your own root owner rights.");
          }
          const remaining = await svc.from("platform_admins").select("user_id");
          if (((remaining.data ?? []) as Loose[]).length <= 1) {
            throw new OwnerError("people.last_owner", "Cannot revoke the last platform owner.");
          }
          await svc.from("platform_admins").delete().eq("user_id", input.userId);
        }
      }

      if (input.merchantId) {
        const role = input.role || "staff";
        const { error: memberErr } = await svc
          .from("merchant_members")
          .upsert(
            {
              user_id: input.userId,
              merchant_id: input.merchantId,
              role,
              status: "active",
            },
            { onConflict: "merchant_id,user_id" },
          );
        if (memberErr) throw new OwnerError("people.membership_failed", memberErr.message);
      }

      if (input.removeMerchantId) {
        const { error: delErr } = await svc
          .from("merchant_members")
          .delete()
          .match({ user_id: input.userId, merchant_id: input.removeMerchantId });
        if (delErr) throw new OwnerError("people.detach_failed", delErr.message);
      }

      return { ok: true };
    },
  );
}

export async function deleteAccount(db: Client, actorId: string, targetUserId: string) {
  if (targetUserId === actorId) {
    throw new OwnerError("people.cannot_delete_self", "Cannot delete your own account.");
  }

  return ownerGate(
    db,
    actorId,
    {
      action: "people.delete_account",
      entity: "auth.users",
      entityId: targetUserId,
      bucket: "platform.write",
      kind: "write",
    },
    async () => {
      const svc = await service();
      const { data: adminRow } = await svc
        .from("platform_admins")
        .select("user_id")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (adminRow) {
        const remaining = await svc.from("platform_admins").select("user_id");
        if (((remaining.data ?? []) as Loose[]).length <= 1) {
          throw new OwnerError("people.last_owner", "Cannot delete the last platform owner.");
        }
        await svc.from("platform_admins").delete().eq("user_id", targetUserId);
      }

      await svc.from("merchant_members").delete().eq("user_id", targetUserId);

      const { error: delErr } = await svc.auth.admin.deleteUser(targetUserId);
      if (delErr) throw new OwnerError("people.delete_failed", delErr.message);

      return { ok: true };
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
      bucket: "platform.write",
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
        const remaining = await svc.from("platform_admins").select("user_id");
        if (((remaining.data ?? []) as Loose[]).length <= 1) {
          throw new OwnerError("people.last_owner");
        }
        const configuredOwner = process.env["PLATFORM_OWNER_EMAIL"]?.toLowerCase();
        if (configuredOwner) {
          const target = await svc.auth.admin.getUserById(targetUserId);
          if (target?.data?.user?.email?.toLowerCase() === configuredOwner) {
            throw new OwnerError("people.cannot_demote_owner", "Cannot revoke root owner rights.");
          }
        }
        const { error } = await svc.from("platform_admins").delete().eq("user_id", targetUserId);
        if (error) throw new OwnerError("people.revoke_failed", error.message);
      }
      return { ok: true };
    },
  );
}

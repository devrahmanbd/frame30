import { useState, useEffect, useId } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  LogOut,
  Mail,
  CreditCard,
  Building2,
  ShieldCheck,
  ExternalLink,
  Edit2,
  Receipt,
  Sparkles,
  ChevronRight,
  Settings,
  Shield,
  Loader2,
  User,
  CheckCircle2,
  Sun,
  Moon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useMerchant, useMerchants } from "@/hooks/use-merchant";
import { useStoreUrl } from "@/hooks/use-store-url";
import { useLang } from "@/lib/i18n";
import { adminRenameStoreFn } from "@/lib/merchant-admin.functions";
import { billingLoadFn } from "@/lib/billing.functions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { btnGhost, btnPrimary, inputClass, StatusPill } from "./MarketingUi";

export function UserProfileMenu() {
  const { t } = useLang();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const storeNameInputId = useId();

  const { data: merchant } = useMerchant();
  const { memberships } = useMerchants();
  const { storeUrl, primaryHost } = useStoreUrl();
  const currentMembership = memberships.find(
    (m) => m.merchant_id === merchant?.id,
  );

  const fetchBilling = useServerFn(billingLoadFn);
  const renameFn = useServerFn(adminRenameStoreFn);

  // State
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [currentTheme, setCurrentTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    if (typeof document !== "undefined") {
      const isDark = document.documentElement.classList.contains("dark");
      setCurrentTheme(isDark ? "dark" : "light");
    }
  }, [dropdownOpen]);

  const toggleTheme = () => {
    const next = currentTheme === "light" ? "dark" : "light";
    setCurrentTheme(next);
    try {
      localStorage.setItem("fq_public_theme", next);
    } catch {
      // storage unavailable
    }
    document.documentElement.setAttribute("data-theme", next);
    document.documentElement.classList.toggle("dark", next === "dark");
  };

  // Authenticated user query (instant local session lookup first)
  const { data: user } = useQuery({
    queryKey: ["auth-user"],
    queryFn: async () => {
      const { data: sessData } = await supabase.auth.getSession();
      if (sessData.session?.user) {
        return sessData.session.user;
      }
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
    staleTime: 5 * 60 * 1000,
  });

  // Billing overview query (lazy-loaded on-demand when profile menu opens)
  const { data: billingData } = useQuery({
    queryKey: ["billing-overview", merchant?.id],
    enabled: dropdownOpen && !!merchant?.id,
    queryFn: () => fetchBilling(),
    staleTime: 60_000,
  });

  // Rename store mutation
  const renameMutation = useMutation({
    mutationFn: async (name: string) => {
      return await renameFn({ data: { name } });
    },
    onSuccess: async (updated) => {
      await qc.invalidateQueries({ queryKey: ["merchant"] });
      await qc.invalidateQueries({ queryKey: ["merchant-memberships"] });
      toast.success(
        t(
          `Store renamed to "${updated.name}"`,
          `দোকানের নাম পরিবর্তন করে "${updated.name}" রাখা হয়েছে`,
        ),
      );
      setRenameOpen(false);
      setRenameError(null);
    },
    onError: (err: Error) => {
      setRenameError(
        err.message ||
          t("Failed to rename store", "দোকানের নাম পরিবর্তন ব্যর্থ হয়েছে"),
      );
    },
  });

  // Handle open rename dialog
  const handleOpenRename = () => {
    setNewName(merchant?.name ?? "");
    setRenameError(null);
    setRenameOpen(true);
    setDropdownOpen(false);
  };

  const handleSaveRename = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newName.trim();
    if (trimmed.length < 2) {
      setRenameError(
        t(
          "Store name must be at least 2 characters",
          "দোকানের নাম কমপক্ষে ২ অক্ষরের হতে হবে",
        ),
      );
      return;
    }
    if (trimmed.length > 60) {
      setRenameError(
        t(
          "Store name cannot exceed 60 characters",
          "দোকানের নাম ৬০ অক্ষরের বেশি হতে পারবে না",
        ),
      );
      return;
    }
    setRenameError(null);
    renameMutation.mutate(trimmed);
  };

  // Handle Sign Out
  const handleSignOut = async () => {
    setIsSigningOut(true);
    try {
      await supabase.auth.signOut();
      qc.clear();
      toast.success(t("Signed out successfully", "সফলভাবে লগআউট হয়েছে"));
      void navigate({ to: "/auth", replace: true });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error signing out";
      toast.error(message);
    } finally {
      setIsSigningOut(false);
    }
  };

  const userEmail = user?.email ?? "merchant@framique.com";
  const isEmailVerified = !!user?.email_confirmed_at;
  const storeName = merchant?.name ?? "Framique Store";
  const userRole = currentMembership?.role ?? "owner";

  // Plan info
  const planTier = billingData?.subscription?.plan ?? "growth";
  const planStatus = billingData?.subscription?.status ?? "active";
  const planDisplay =
    planTier.charAt(0).toUpperCase() + planTier.slice(1) + " Plan";

  // Initials for avatar
  const avatarLetter = (
    userEmail.charAt(0) ||
    storeName.charAt(0) ||
    "M"
  ).toUpperCase();

  return (
    <>
      <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="group relative flex items-center gap-2 rounded-fq-md p-1 transition-all hover:bg-muted focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background"
            aria-label={t("Merchant Profile Menu", "মার্চেন্ট প্রোফাইল মেনু")}
            title={userEmail}
          >
            <div className="relative flex size-8 items-center justify-center rounded-full bg-gradient-to-tr from-primary to-primary/70 font-bangla-display text-xs font-bold text-primary-foreground shadow-sm transition-transform group-hover:scale-105">
              {avatarLetter}
              <span
                className={`absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-card ${
                  isEmailVerified ? "bg-emerald-500" : "bg-amber-500"
                }`}
                aria-hidden
              />
            </div>
            <div className="hidden text-left sm:block">
              <p className="max-w-[120px] truncate text-xs font-semibold leading-tight text-foreground">
                {storeName}
              </p>
              <p className="max-w-[120px] truncate text-[10px] text-muted-foreground">
                {userEmail}
              </p>
            </div>
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          align="end"
          className="w-80 rounded-fq-lg border border-border bg-card p-0 shadow-xl"
          sideOffset={8}
        >
          {/* Section 1: User & Store Identity */}
          <div className="border-b border-border/80 bg-muted/40 p-4">
            <div className="flex items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-primary to-primary/80 text-sm font-bold text-primary-foreground shadow-sm">
                {avatarLetter}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-semibold text-foreground">
                    {storeName}
                  </span>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-primary">
                    {userRole}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <span className="truncate" title={userEmail}>
                    {userEmail}
                  </span>
                  {isEmailVerified ? (
                    <span
                      title={t("Email verified", "ইমেইল ভেরিফাইড")}
                      className="inline-flex shrink-0 text-emerald-600 dark:text-emerald-400"
                    >
                      <CheckCircle2 className="size-3" />
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Quick Actions in Header */}
            <div className="mt-3 flex items-center gap-2 pt-2 border-t border-border/50">
              <button
                type="button"
                onClick={handleOpenRename}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-fq-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted hover:text-primary"
              >
                <Edit2 className="size-3.5 text-muted-foreground" />
                <span>{t("Rename Store", "দোকানের নাম পরিবর্তন")}</span>
              </button>

              <Link
                to="/dashboard/settings/email"
                onClick={() => setDropdownOpen(false)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-fq-md border border-border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted hover:text-primary"
              >
                <Mail className="size-3.5 text-muted-foreground" />
                <span>{t("Check Mail", "মেইল চেক")}</span>
              </Link>
            </div>
          </div>

          {/* Section 2: Framique Billing Overview */}
          <div className="p-3">
            <div className="rounded-fq-md border border-border/80 bg-background/50 p-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CreditCard className="size-4 text-primary" />
                  <span className="text-xs font-semibold text-foreground">
                    {t("Framique Billing", "ফ্রেমিক বিলিং")}
                  </span>
                </div>
                <StatusPill
                  label={
                    planStatus === "trialing"
                      ? t("Trial", "ট্রায়াল")
                      : planStatus
                  }
                  tone={
                    planStatus === "active"
                      ? "success"
                      : planStatus === "trialing"
                        ? "info"
                        : "warning"
                  }
                />
              </div>

              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-xs font-medium text-foreground">
                  {planDisplay}
                </span>
                <Link
                  to="/dashboard/plans"
                  onClick={() => setDropdownOpen(false)}
                  className="text-[11px] font-semibold text-primary hover:underline"
                >
                  {t("Change Plan", "প্ল্যান পরিবর্তন")} →
                </Link>
              </div>

              <div className="mt-2.5 grid grid-cols-2 gap-1.5 border-t border-border/50 pt-2 text-[11px]">
                <Link
                  to="/dashboard/billing/invoices"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  <Receipt className="size-3" />
                  <span>{t("Invoices & Usage", "ইনভয়েস ও ব্যবহার")}</span>
                </Link>
                <Link
                  to="/dashboard/plans"
                  onClick={() => setDropdownOpen(false)}
                  className="flex items-center justify-end gap-1 text-muted-foreground hover:text-foreground"
                >
                  <Sparkles className="size-3 text-amber-500" />
                  <span>{t("Upgrade Quota", "কোটা আপগ্রেড")}</span>
                </Link>
              </div>
            </div>
          </div>

          <DropdownMenuSeparator />

          {/* Section 3: Navigation Quick Links */}
          <DropdownMenuGroup className="p-1">
            <DropdownMenuItem asChild>
              <Link
                to="/dashboard/settings"
                onClick={() => setDropdownOpen(false)}
                className="flex cursor-pointer items-center justify-between rounded-fq-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted"
              >
                <span className="flex items-center gap-2">
                  <Settings className="size-3.5 text-muted-foreground" />
                  {t("Store Settings", "দোকানের সেটিংস")}
                </span>
                <ChevronRight className="size-3 text-muted-foreground" />
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link
                to="/dashboard/settings/email"
                onClick={() => setDropdownOpen(false)}
                className="flex cursor-pointer items-center justify-between rounded-fq-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted"
              >
                <span className="flex items-center gap-2">
                  <Mail className="size-3.5 text-muted-foreground" />
                  {t(
                    "Email & SMTP Configuration",
                    "ইমেইল ও এসএমটিপি কনফিগারেশন",
                  )}
                </span>
                <ChevronRight className="size-3 text-muted-foreground" />
              </Link>
            </DropdownMenuItem>

            <DropdownMenuItem asChild>
              <Link
                to="/dashboard/settings/security"
                onClick={() => setDropdownOpen(false)}
                className="flex cursor-pointer items-center justify-between rounded-fq-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted"
              >
                <span className="flex items-center gap-2">
                  <Shield className="size-3.5 text-muted-foreground" />
                  {t("Security & 2FA", "নিরাপত্তা ও ২এফএ")}
                </span>
                <ChevronRight className="size-3 text-muted-foreground" />
              </Link>
            </DropdownMenuItem>

            {merchant?.slug ? (
              <DropdownMenuItem asChild>
                <a
                  href={storeUrl()}
                  target="_blank"
                  rel="noreferrer"
                  onClick={() => setDropdownOpen(false)}
                  className="flex cursor-pointer items-center justify-between rounded-fq-md px-2.5 py-1.5 text-xs text-foreground hover:bg-muted"
                >
                  <span className="flex items-center gap-2">
                    <ExternalLink className="size-3.5 text-muted-foreground" />
                    {t("View Live Storefront", "লাইভ দোকান দেখুন")}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {primaryHost ?? merchant.slug} ↗
                  </span>
                </a>
              </DropdownMenuItem>
            ) : null}

            <div className="flex items-center justify-between rounded-fq-md px-2.5 py-1.5 text-xs text-foreground">
              <span className="flex items-center gap-2">
                {currentTheme === "dark" ? (
                  <Moon className="size-3.5 text-primary" />
                ) : (
                  <Sun className="size-3.5 text-amber-500" />
                )}
                <span>{t("Mode", "মোড")}</span>
              </span>
              <button
                type="button"
                onClick={toggleTheme}
                className="flex items-center gap-1.5 rounded-fq-sm border border-border bg-background px-2 py-0.5 text-[11px] font-medium text-foreground transition-colors hover:bg-muted"
              >
                <span>
                  {currentTheme === "dark"
                    ? t("Dark", "ডার্ক")
                    : t("Light", "লাইট")}
                </span>
              </button>
            </div>
          </DropdownMenuGroup>

          <DropdownMenuSeparator />

          {/* Section 4: Sign Out */}
          <div className="p-1">
            <button
              type="button"
              disabled={isSigningOut}
              onClick={handleSignOut}
              className="flex w-full cursor-pointer items-center gap-2 rounded-fq-md px-2.5 py-2 text-left text-xs font-medium text-danger transition-colors hover:bg-danger/10 hover:text-danger-foreground disabled:opacity-50"
            >
              {isSigningOut ? (
                <Loader2 className="size-3.5 animate-spin text-danger" />
              ) : (
                <LogOut className="size-3.5 text-danger" />
              )}
              <span>
                {isSigningOut
                  ? t("Signing out…", "লগআউট হচ্ছে…")
                  : t("Sign out", "সাইন আউট")}
              </span>
            </button>
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Rename Store Modal Dialog */}
      <Dialog open={renameOpen} onOpenChange={setRenameOpen}>
        <DialogContent className="max-w-md rounded-fq-lg border border-border bg-card p-6 shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg font-semibold text-foreground">
              <Building2 className="size-5 text-primary" />
              {t("Rename Store", "দোকানের নাম পরিবর্তন")}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {t(
                "Update your store's display name. This will immediately update your admin console and customer-facing receipts.",
                "আপনার দোকানের নাম পরিবর্তন করুন। এটি অবিলম্বে আপনার অ্যাডমিন কনসোল এবং গ্রাহকদের ইনভয়েসে হালনাগাদ হবে।",
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveRename} className="mt-4 space-y-4">
            <div>
              <label
                htmlFor={storeNameInputId}
                className="block text-xs font-medium text-foreground"
              >
                {t("New Store Name", "দোকানের নতুন নাম")}
              </label>
              <input
                id={storeNameInputId}
                type="text"
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (renameError) setRenameError(null);
                }}
                maxLength={60}
                placeholder={t("e.g. Acme Clothings", "যেমন: একমি ক্লোথিংস")}
                className={`mt-1 ${inputClass}`}
                autoFocus
              />
              <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{t("2 to 60 characters", "২ থেকে ৬০ অক্ষর")}</span>
                <span>{newName.length}/60</span>
              </div>
            </div>

            {renameError ? (
              <div className="rounded-fq-md border border-danger/40 bg-danger/10 px-3 py-2 text-xs text-danger">
                {renameError}
              </div>
            ) : null}

            <DialogFooter className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setRenameOpen(false)}
                disabled={renameMutation.isPending}
                className={btnGhost}
              >
                {t("Cancel", "বাতিল")}
              </button>
              <button
                type="submit"
                disabled={renameMutation.isPending || !newName.trim()}
                className={btnPrimary}
              >
                {renameMutation.isPending ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="size-3.5 animate-spin" />
                    {t("Saving…", "সংরক্ষণ হচ্ছে…")}
                  </span>
                ) : (
                  t("Save Changes", "সংরক্ষণ করুন")
                )}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

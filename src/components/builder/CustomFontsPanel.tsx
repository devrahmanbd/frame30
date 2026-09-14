/**
 * Phase 3 — custom font upload, merchant side.
 *
 * woff2 only, ≤ 400 KB, ≤ 4 files per family (validated again on the server).
 * A face is inert until the merchant attests to the licence: publish is
 * blocked while any uploaded face is unattested.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

import { useLang } from "@/lib/i18n";
import { FONT_BUDGET, type FontAsset, type FontScript } from "@/lib/theme-fonts";
import {
  confirmFontLicenceFn,
  deleteFontAssetFn,
  listFontAssetsFn,
  uploadFontAssetFn,
} from "@/lib/theme-fonts.functions";

const INPUT = "w-full rounded-fq-md border border-border bg-card px-3 py-2 text-sm";

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read_failed"));
    reader.readAsDataURL(file);
  });
}

export function CustomFontsPanel() {
  const { t } = useLang();
  const qc = useQueryClient();
  const list = useServerFn(listFontAssetsFn);
  const upload = useServerFn(uploadFontAssetFn);
  const confirm = useServerFn(confirmFontLicenceFn);
  const remove = useServerFn(deleteFontAssetFn);

  const [family, setFamily] = useState("");
  const [weight, setWeight] = useState(400);
  const [subset, setSubset] = useState<FontScript>("latin");

  const assets = useQuery({ queryKey: ["font-assets"], queryFn: () => list({}) });
  const refresh = () => qc.invalidateQueries({ queryKey: ["font-assets"] });
  const fail = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");

  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > FONT_BUDGET.maxFileBytes) throw new Error(t("Font must be 400 KB or smaller", "ফন্ট ৪০০ কেবি বা কম হতে হবে"));
      return upload({ data: { family: family.trim(), weight, subset, base64: await toBase64(file) } });
    },
    onSuccess: () => {
      toast.success(t("Font uploaded — confirm the licence to use it", "ফন্ট আপলোড হয়েছে — ব্যবহারের আগে লাইসেন্স নিশ্চিত করুন"));
      refresh();
    },
    onError: fail,
  });

  const attest = useMutation({
    mutationFn: (id: string) => confirm({ data: { id } }),
    onSuccess: () => {
      toast.success(t("Licence confirmed", "লাইসেন্স নিশ্চিত হয়েছে"));
      refresh();
    },
    onError: fail,
  });

  const drop = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: refresh,
    onError: fail,
  });

  const rows: FontAsset[] = assets.data ?? [];

  return (
    <div className="space-y-3 rounded-fq-md border border-border p-3">
      <p className="text-xs font-semibold">{t("Custom fonts", "কাস্টম ফন্ট")}</p>
      <p className="text-[0.65rem] text-muted-foreground">
        {t(
          "woff2 only, up to 400 KB and 4 weights per family. You must confirm you are licensed to use the font before publishing.",
          "শুধু woff2, প্রতি ফ্যামিলিতে সর্বোচ্চ ৪০০ কেবি ও ৪টি ওয়েট। প্রকাশের আগে লাইসেন্স নিশ্চিত করতে হবে।",
        )}
      </p>

      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-3 block text-[0.65rem] font-medium" htmlFor="font-family">
          {t("Family name", "ফ্যামিলির নাম")}
          <input
            id="font-family"
            value={family}
            onChange={(e) => setFamily(e.target.value)}
            placeholder="Acme Grotesk"
            className={INPUT}
          />
        </label>
        <label className="block text-[0.65rem] font-medium" htmlFor="font-weight">
          {t("Weight", "ওয়েট")}
          <select
            id="font-weight"
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
            className={INPUT}
          >
            {[300, 400, 500, 600, 700].map((w) => (
              <option key={w} value={w}>
                {w}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-[0.65rem] font-medium" htmlFor="font-subset">
          {t("Script", "স্ক্রিপ্ট")}
          <select
            id="font-subset"
            value={subset}
            onChange={(e) => setSubset(e.target.value as FontScript)}
            className={INPUT}
          >
            <option value="latin">Latin</option>
            <option value="bengali">বাংলা</option>
          </select>
        </label>
        <label className="block text-[0.65rem] font-medium" htmlFor="font-file">
          {t("File", "ফাইল")}
          <input
            id="font-file"
            type="file"
            accept=".woff2,font/woff2"
            disabled={!family.trim() || uploadFile.isPending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadFile.mutate(file);
              e.target.value = "";
            }}
            className={INPUT}
          />
        </label>
      </div>

      <ul className="space-y-2">
        {rows.map((asset) => (
          <li
            key={asset.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-fq-md border border-border px-3 py-2 text-xs"
          >
            <span>
              {asset.family} · {asset.weight} · {Math.round(asset.bytes / 1024)} KB
            </span>
            {asset.licenceConfirmedAt ? (
              <span className="rounded-fq-md bg-success-soft px-2 py-1 text-success-foreground">
                {t("Licensed", "লাইসেন্সড")}
              </span>
            ) : (
              <button
                type="button"
                onClick={() => attest.mutate(asset.id)}
                className="rounded-fq-md border border-border px-2 py-1"
              >
                {t("I am licensed to use this font", "আমি এই ফন্ট ব্যবহারের লাইসেন্সপ্রাপ্ত")}
              </button>
            )}
            <button type="button" onClick={() => drop.mutate(asset.id)} className="underline">
              {t("Remove", "সরান")}
            </button>
          </li>
        ))}
        {rows.length === 0 && (
          <li className="text-[0.65rem] text-muted-foreground">
            {t("No custom fonts uploaded.", "কোনো কাস্টম ফন্ট আপলোড করা হয়নি।")}
          </li>
        )}
      </ul>
    </div>
  );
}

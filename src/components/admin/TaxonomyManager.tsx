import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { slugify, useMerchant } from "@/hooks/use-merchant";
import { TextField } from "@/components/admin/ProductForm";

type Row = { id: string; name: string; slug: string; description: string | null };

export function TaxonomyManager({
  table,
  titleBn,
  titleEn,
}: {
  table: "brands" | "categories";
  titleBn: string;
  titleEn: string;
}) {
  const qc = useQueryClient();
  const { data: merchant } = useMerchant();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const list = useQuery({
    queryKey: [table, merchant?.id],
    enabled: !!merchant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table)
        .select("id, name, slug, description")
        .eq("merchant_id", merchant!.id)
        .order("name");
      if (error) throw error;
      return data as Row[];
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from(table).insert({
        merchant_id: merchant!.id,
        name,
        slug: slugify(name),
        description: description || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setName("");
      setDescription("");
      toast.success("Saved");
      void qc.invalidateQueries({ queryKey: [table, merchant?.id] });
    },
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Could not save"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: [table, merchant?.id] }),
    onError: (err: unknown) =>
      toast.error(err instanceof Error ? err.message : "Could not delete"),
  });

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-bangla-display text-lg font-semibold">{titleBn}</h1>
        <p className="text-sm text-muted-foreground">{titleEn}</p>
      </header>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim() && merchant) create.mutate();
        }}
        className="grid gap-4 rounded-fq-lg border border-border bg-card p-5 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
      >
        <TextField label="Name" value={name} onChange={setName} required />
        <TextField label="Description" value={description} onChange={setDescription} />
        <button
          type="submit"
          disabled={create.isPending}
          className="min-h-11 rounded-fq-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          Add
        </button>
      </form>

      <ul className="divide-y divide-border overflow-hidden rounded-fq-lg border border-border bg-card">
        {list.isLoading && (
          <li className="px-4 py-4 text-sm text-muted-foreground">Loading…</li>
        )}
        {!list.isLoading && !list.data?.length && (
          <li className="px-4 py-4 text-sm text-muted-foreground">Nothing here yet.</li>
        )}
        {list.data?.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">{row.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                /{row.slug}
                {row.description ? ` — ${row.description}` : ""}
              </p>
            </div>
            <button
              type="button"
              aria-label={`Delete ${row.name}`}
              onClick={() => remove.mutate(row.id)}
              className="grid size-11 place-items-center rounded-fq-md text-[hsl(var(--rickshaw-red))] hover:bg-muted"
            >
              <Trash2 className="size-4" aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

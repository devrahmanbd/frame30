import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  isEditorChoice,
  kindDefaultEditor,
  type ContentKindChoice,
  type EditorChoice,
} from "@/lib/content-editors";
import { useMerchant } from "./use-merchant";

/**
 * The merchant's default page editor, from Settings
 * (`setup_steps.page_editor_default`). Falls back to the kind default
 * (pages builder, posts classic) when unset or unreadable — the list and
 * keyboard shortcuts always have something to open.
 */
export function usePageEditorDefault(kind: ContentKindChoice): EditorChoice {
  const { data: merchant } = useMerchant();
  const { data: setting } = useQuery({
    queryKey: ["merchant-settings", "page-editor", merchant?.id],
    enabled: !!merchant?.id,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("merchant_settings")
        .select("setup_steps")
        .eq("merchant_id", merchant!.id)
        .maybeSingle();
      if (error) return null;
      const steps = data?.setup_steps as Record<string, unknown> | null;
      return steps?.page_editor_default ?? null;
    },
  });
  if (isEditorChoice(setting)) return setting;
  return kindDefaultEditor(kind);
}

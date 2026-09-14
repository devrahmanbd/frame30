/**
 * Phase 14 — top bar.
 *
 * 48px, near-black, always visible. Button order matches the Elementor
 * reference walk: menu · add · page settings · history · design system ·
 * device switch · finder · structure · preview · publish · save options.
 */
import { BREAKPOINT_BY_KEY, type DeviceKey } from "@/lib/studio/responsive";
import {
  ChevronDown,
  Clock,
  Command,
  Eye,
  Layers,
  Menu,
  Palette,
  Plus,
  Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STUDIO_SHORTCUTS, formatStudioShortcut, type StudioPlatform, type StudioShortcutId } from "@/lib/studio/shortcuts";
import { DEVICE_ICON } from "./StudioControls";

export type TopBarProps = {
  title: string;
  device: DeviceKey;
  activeDevices: DeviceKey[];
  dirty: boolean;
  saving: boolean;
  platform: StudioPlatform;
  onDevice: (device: DeviceKey) => void;
  onAddElement: () => void;
  onPageSettings: () => void;
  onHistory: () => void;
  onDesignSystem: () => void;
  onFinder: () => void;
  onStructure: () => void;
  onPreview: () => void;
  onPublish: () => void;
  onSaveDraft: () => void;
  onSaveTemplate: () => void;
  onShortcuts: () => void;
  onExit: () => void;
};

function tip(id: StudioShortcutId, platform: StudioPlatform, label: string): string {
  const shortcut = STUDIO_SHORTCUTS.find((s) => s.id === id);
  return shortcut ? `${label} (${formatStudioShortcut(shortcut, platform)})` : label;
}

function BarButton({
  label,
  onClick,
  children,
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "grid size-11 place-items-center rounded-fq-sm text-[color:var(--fq-studio-bar-ink)] transition-colors hover:bg-white/10",
        active && "bg-white/15",
      )}
    >
      {children}
    </button>
  );
}

export function StudioTopBar(props: TopBarProps) {
  const { platform } = props;

  return (
    <header className="fq-studio-bar flex h-12 items-center gap-1 px-2" aria-label="Editor toolbar">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Editor menu"
            title="Editor menu"
            className="grid size-11 place-items-center rounded-fq-sm text-[color:var(--fq-studio-bar-ink)] hover:bg-white/10"
          >
            <Menu className="size-5" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={props.onSaveTemplate}>Save as template</DropdownMenuItem>
          <DropdownMenuItem onSelect={props.onDesignSystem}>Design system</DropdownMenuItem>
          <DropdownMenuItem onSelect={props.onShortcuts}>Keyboard shortcuts</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={props.onExit}>Exit to dashboard</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <BarButton label="Add element" onClick={props.onAddElement}>
        <Plus className="size-5" aria-hidden />
      </BarButton>
      <BarButton label={tip("pageSettings", platform, "Page settings")} onClick={props.onPageSettings}>
        <Settings2 className="size-5" aria-hidden />
      </BarButton>
      <BarButton label={tip("history", platform, "History")} onClick={props.onHistory}>
        <Clock className="size-5" aria-hidden />
      </BarButton>
      <BarButton label={tip("siteSettings", platform, "Design system")} onClick={props.onDesignSystem}>
        <Palette className="size-5" aria-hidden />
      </BarButton>

      <span className="mx-2 hidden max-w-48 truncate text-xs font-medium text-[color:var(--fq-studio-bar-ink)] sm:block">
        {props.title || "Untitled"}
      </span>

      <div
        role="group"
        aria-label="Preview device"
        className="ml-auto flex items-center gap-0.5 rounded-fq-sm bg-white/10 p-0.5"
      >
        {props.activeDevices.map((key) => {
          const Icon = DEVICE_ICON[key];
          const def = BREAKPOINT_BY_KEY[key];
          const label = def.direction === "max" ? `${def.label} (up to ${def.edge}px)` : `${def.label} (${def.edge}px and up)`;
          return (
            <button
              key={key}
              type="button"
              onClick={() => props.onDevice(key)}
              aria-pressed={props.device === key}
              aria-label={label}
              title={label}
              className={cn(
                "grid size-10 place-items-center rounded-fq-sm text-[color:var(--fq-studio-bar-ink)] transition-colors",
                props.device === key ? "bg-white/20" : "hover:bg-white/10",
              )}
            >
              <Icon className="size-4" aria-hidden />
            </button>
          );
        })}
      </div>

      <BarButton label={tip("finder", platform, "Finder")} onClick={props.onFinder}>
        <Command className="size-5" aria-hidden />
      </BarButton>
      <BarButton label={tip("navigator", platform, "Structure")} onClick={props.onStructure}>
        <Layers className="size-5" aria-hidden />
      </BarButton>
      <BarButton label={tip("preview", platform, "Preview changes")} onClick={props.onPreview}>
        <Eye className="size-5" aria-hidden />
      </BarButton>

      <button
        type="button"
        onClick={props.onPublish}
        disabled={!props.dirty || props.saving}
        title={props.dirty ? tip("publish", platform, "Publish") : "Nothing to publish"}
        className="ml-1 inline-flex min-h-9 items-center rounded-fq-sm bg-primary px-4 text-sm font-semibold text-primary-foreground transition-opacity disabled:opacity-40"
      >
        {props.saving ? "Saving…" : "Publish"}
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Save options"
            title="Save options"
            className="grid size-9 place-items-center rounded-fq-sm bg-primary text-primary-foreground"
          >
            <ChevronDown className="size-4" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={props.onSaveDraft}>Save draft</DropdownMenuItem>
          <DropdownMenuItem onSelect={props.onSaveTemplate}>Save as template</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}

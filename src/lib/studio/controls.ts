/**
 * Phase 14 — control schema.
 *
 * Every widget's Content tab, plus the shared Style and Advanced tabs, are
 * described as data. The settings panel renders the schema generically, so a
 * new widget needs a catalogue entry and a content schema — never a bespoke
 * panel.
 */
import type { NodeSettings, StudioNode } from "./model";
import { UNITS, type Unit } from "./responsive";

export type ControlTab = "content" | "style" | "advanced" | "interactions";

/** Panel tabs (V4 naming) and the control tabs each one renders. */
export type PanelTab = "general" | "style" | "interactions";

export const PANEL_TAB_CONTROLS: Record<PanelTab, ControlTab[]> = {
  general: ["content"],
  style: ["style", "advanced"],
  interactions: ["interactions"],
};

export type ControlType =
  | "text"
  | "textarea"
  | "richtext"
  | "number"
  | "slider"
  | "select"
  | "choice"
  | "switch"
  | "color"
  | "dimensions"
  | "image"
  | "link"
  | "icon"
  | "repeater"
  | "code"
  | "heading";

export type ControlOption = { value: string; label: string };

export type Control = {
  key: string;
  label: string;
  type: ControlType;
  tab: ControlTab;
  /** Collapsible section title inside the tab. */
  section: string;
  options?: ControlOption[];
  units?: Unit[];
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  help?: string;
  responsive?: boolean;
  /** Repeater row schema. */
  fields?: Control[];
  /** Only show when another control holds one of these values. */
  showWhen?: { key: string; equals: (string | number | boolean)[] };
};

const ALIGN_OPTIONS: ControlOption[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
  { value: "justify", label: "Justify" },
];

const c = (control: Control): Control => control;

/* ------------------------------------------------------------------ */
/* Shared tabs                                                         */
/* ------------------------------------------------------------------ */

export const STYLE_CONTROLS: Control[] = [
  c({
    key: "textColor",
    label: "Text colour",
    type: "color",
    tab: "style",
    section: "Typography",
    responsive: false,
  }),
  c({
    key: "fontFamily",
    label: "Font family",
    type: "select",
    tab: "style",
    section: "Typography",
    options: [
      { value: "", label: "Theme default" },
      { value: "var(--font-sans)", label: "Body sans" },
      { value: "var(--font-display, var(--font-sans))", label: "Display" },
      { value: "var(--font-bangla)", label: "Bangla" },
      { value: "ui-monospace, SFMono-Regular, monospace", label: "Monospace" },
    ],
  }),
  c({
    key: "fontSize",
    label: "Size",
    type: "slider",
    tab: "style",
    section: "Typography",
    min: 8,
    max: 120,
    units: ["px", "rem", "em"],
    responsive: true,
  }),
  c({
    key: "fontWeight",
    label: "Weight",
    type: "select",
    tab: "style",
    section: "Typography",
    options: [300, 400, 500, 600, 700, 800, 900].map((w) => ({
      value: String(w),
      label: String(w),
    })),
  }),
  c({
    key: "textTransform",
    label: "Transform",
    type: "select",
    tab: "style",
    section: "Typography",
    options: [
      { value: "", label: "Default" },
      { value: "uppercase", label: "Uppercase" },
      { value: "lowercase", label: "Lowercase" },
      { value: "capitalize", label: "Capitalize" },
    ],
  }),
  c({
    key: "fontStyle",
    label: "Style",
    type: "select",
    tab: "style",
    section: "Typography",
    options: [
      { value: "", label: "Default" },
      { value: "normal", label: "Normal" },
      { value: "italic", label: "Italic" },
    ],
  }),
  c({
    key: "textDecoration",
    label: "Decoration",
    type: "select",
    tab: "style",
    section: "Typography",
    options: [
      { value: "", label: "Default" },
      { value: "underline", label: "Underline" },
      { value: "line-through", label: "Line through" },
      { value: "none", label: "None" },
    ],
  }),
  c({
    key: "lineHeight",
    label: "Line height",
    type: "slider",
    tab: "style",
    section: "Typography",
    min: 0.8,
    max: 3,
    step: 0.05,
    responsive: true,
  }),
  c({
    key: "letterSpacing",
    label: "Letter spacing",
    type: "slider",
    tab: "style",
    section: "Typography",
    min: -3,
    max: 12,
    step: 0.1,
    units: ["px", "em"],
    responsive: true,
  }),
  c({
    key: "textAlign",
    label: "Alignment",
    type: "choice",
    tab: "style",
    section: "Typography",
    options: ALIGN_OPTIONS,
    responsive: true,
  }),
  c({
    key: "textShadow",
    label: "Text shadow",
    type: "text",
    tab: "style",
    section: "Text shadow",
    placeholder: "0 1px 2px rgb(0 0 0 / .3)",
  }),
  c({
    key: "blendMode",
    label: "Blend mode",
    type: "select",
    tab: "style",
    section: "Text shadow",
    options: [
      "normal",
      "multiply",
      "screen",
      "overlay",
      "darken",
      "lighten",
      "difference",
    ].map((v) => ({
      value: v === "normal" ? "" : v,
      label: v,
    })),
  }),
  c({
    key: "background",
    label: "Background",
    type: "color",
    tab: "style",
    section: "Background",
  }),
  c({
    key: "backgroundImage",
    label: "Background image",
    type: "image",
    tab: "style",
    section: "Background",
  }),
  c({
    key: "backgroundSize",
    label: "Background size",
    type: "select",
    tab: "style",
    section: "Background",
    options: [
      { value: "", label: "Default" },
      { value: "cover", label: "Cover" },
      { value: "contain", label: "Contain" },
      { value: "auto", label: "Auto" },
    ],
    showWhen: { key: "backgroundImage", equals: [] },
  }),
  c({
    key: "borderWidth",
    label: "Border width",
    type: "slider",
    tab: "style",
    section: "Border",
    min: 0,
    max: 20,
    responsive: true,
  }),
  c({
    key: "borderStyle",
    label: "Border style",
    type: "select",
    tab: "style",
    section: "Border",
    options: ["none", "solid", "dashed", "dotted"].map((v) => ({
      value: v,
      label: v,
    })),
  }),
  c({
    key: "borderColor",
    label: "Border colour",
    type: "color",
    tab: "style",
    section: "Border",
  }),
  c({
    key: "radius",
    label: "Radius",
    type: "slider",
    tab: "style",
    section: "Border",
    min: 0,
    max: 80,
    responsive: true,
  }),
  c({
    key: "boxShadow",
    label: "Box shadow",
    type: "text",
    tab: "style",
    section: "Effects",
    placeholder: "0 10px 30px rgb(0 0 0 / .12)",
  }),
  c({
    key: "opacity",
    label: "Opacity",
    type: "slider",
    tab: "style",
    section: "Effects",
    min: 0,
    max: 1,
    step: 0.05,
    responsive: true,
  }),
];

export const ADVANCED_CONTROLS: Control[] = [
  c({
    key: "margin",
    label: "Margin",
    type: "dimensions",
    tab: "advanced",
    section: "Layout",
    units: [...UNITS],
    responsive: true,
  }),
  c({
    key: "padding",
    label: "Padding",
    type: "dimensions",
    tab: "advanced",
    section: "Layout",
    units: [...UNITS],
    responsive: true,
  }),
  c({
    key: "width",
    label: "Width",
    type: "slider",
    tab: "advanced",
    section: "Layout",
    min: 0,
    max: 100,
    units: ["%", "px", "vw"],
    responsive: true,
  }),
  c({
    key: "position",
    label: "Position",
    type: "select",
    tab: "advanced",
    section: "Layout",
    options: ["", "relative", "absolute", "sticky", "fixed"].map((v) => ({
      value: v,
      label: v || "Default",
    })),
  }),
  c({
    key: "zIndex",
    label: "Z-index",
    type: "number",
    tab: "advanced",
    section: "Layout",
    min: -10,
    max: 999,
  }),
  c({
    key: "animation",
    label: "Entrance animation",
    type: "select",
    tab: "interactions",
    section: "Entrance animation",
    options: [
      { value: "", label: "None" },
      { value: "fade", label: "Fade in" },
      { value: "fade-up", label: "Fade up" },
      { value: "fade-down", label: "Fade down" },
      { value: "zoom", label: "Zoom in" },
      { value: "slide-left", label: "Slide from left" },
      { value: "slide-right", label: "Slide from right" },
    ],
  }),
  c({
    key: "animationDuration",
    label: "Duration (ms)",
    type: "slider",
    tab: "interactions",
    section: "Entrance animation",
    min: 80,
    max: 2000,
    step: 20,
  }),
  c({
    key: "animationDelay",
    label: "Delay (ms)",
    type: "slider",
    tab: "interactions",
    section: "Entrance animation",
    min: 0,
    max: 2000,
    step: 20,
  }),
  c({
    key: "animationRepeat",
    label: "Play",
    type: "select",
    tab: "interactions",
    section: "Entrance animation",
    options: [
      { value: "", label: "Once" },
      { value: "repeat", label: "Every time it enters view" },
    ],
  }),

  c({
    key: "rotate",
    label: "Rotate (deg)",
    type: "slider",
    tab: "advanced",
    section: "Transform",
    min: -180,
    max: 180,
    responsive: true,
  }),
  c({
    key: "scale",
    label: "Scale",
    type: "slider",
    tab: "advanced",
    section: "Transform",
    min: 0.2,
    max: 3,
    step: 0.05,
    responsive: true,
  }),
  c({
    key: "translateY",
    label: "Offset Y",
    type: "slider",
    tab: "advanced",
    section: "Transform",
    min: -200,
    max: 200,
    responsive: true,
  }),
  c({
    key: "hideDesktop",
    label: "Hide on desktop",
    type: "switch",
    tab: "advanced",
    section: "Responsive",
  }),
  c({
    key: "hideTablet",
    label: "Hide on tablet",
    type: "switch",
    tab: "advanced",
    section: "Responsive",
  }),
  c({
    key: "hideMobile",
    label: "Hide on mobile",
    type: "switch",
    tab: "advanced",
    section: "Responsive",
  }),
  c({
    key: "cssId",
    label: "CSS ID",
    type: "text",
    tab: "advanced",
    section: "Attributes",
    placeholder: "hero-title",
  }),
  c({
    key: "cssClasses",
    label: "CSS classes",
    type: "text",
    tab: "advanced",
    section: "Attributes",
    placeholder: "promo dark",
  }),
  c({
    key: "customCss",
    label: "Custom CSS",
    type: "code",
    tab: "advanced",
    section: "Custom CSS",
    placeholder: "selector { color: red }",
  }),
];

/* ------------------------------------------------------------------ */
/* Container content controls                                          */
/* ------------------------------------------------------------------ */

const CONTAINER_CONTROLS: Control[] = [
  c({
    key: "layout",
    label: "Container layout",
    type: "choice",
    tab: "content",
    section: "Layout",
    options: [
      { value: "flex", label: "Flexbox" },
      { value: "grid", label: "Grid" },
    ],
  }),
  c({
    key: "contentWidth",
    label: "Content width",
    type: "choice",
    tab: "content",
    section: "Layout",
    options: [
      { value: "boxed", label: "Boxed" },
      { value: "full", label: "Full width" },
    ],
    responsive: true,
  }),
  c({
    key: "maxWidth",
    label: "Max width",
    type: "slider",
    tab: "content",
    section: "Layout",
    min: 320,
    max: 1920,
    responsive: true,
    showWhen: { key: "contentWidth", equals: ["boxed"] },
  }),
  c({
    key: "direction",
    label: "Direction",
    type: "choice",
    tab: "content",
    section: "Layout",
    options: [
      { value: "row", label: "Row" },
      { value: "column", label: "Column" },
      { value: "row-reverse", label: "Row reversed" },
      { value: "column-reverse", label: "Column reversed" },
    ],
    responsive: true,
    showWhen: { key: "layout", equals: ["flex"] },
  }),
  c({
    key: "columns",
    label: "Columns",
    type: "slider",
    tab: "content",
    section: "Layout",
    min: 1,
    max: 12,
    responsive: true,
    showWhen: { key: "layout", equals: ["grid"] },
  }),
  c({
    key: "justify",
    label: "Justify",
    type: "select",
    tab: "content",
    section: "Layout",
    options: [
      "flex-start",
      "center",
      "flex-end",
      "space-between",
      "space-around",
      "space-evenly",
    ].map((v) => ({
      value: v,
      label: v.replace("flex-", "").replace("-", " "),
    })),
    responsive: true,
  }),
  c({
    key: "align",
    label: "Align items",
    type: "select",
    tab: "content",
    section: "Layout",
    options: ["flex-start", "center", "flex-end", "stretch"].map((v) => ({
      value: v,
      label: v.replace("flex-", ""),
    })),
    responsive: true,
  }),
  c({
    key: "wrap",
    label: "Wrap",
    type: "choice",
    tab: "content",
    section: "Layout",
    options: [
      { value: "nowrap", label: "No wrap" },
      { value: "wrap", label: "Wrap" },
    ],
    responsive: true,
    showWhen: { key: "layout", equals: ["flex"] },
  }),
  c({
    key: "gap",
    label: "Gap",
    type: "slider",
    tab: "content",
    section: "Layout",
    min: 0,
    max: 120,
    responsive: true,
  }),
  c({
    key: "paddingY",
    label: "Vertical padding",
    type: "slider",
    tab: "content",
    section: "Spacing",
    min: 0,
    max: 200,
    responsive: true,
  }),
  c({
    key: "paddingX",
    label: "Horizontal padding",
    type: "slider",
    tab: "content",
    section: "Spacing",
    min: 0,
    max: 200,
    responsive: true,
  }),
  c({
    key: "minHeight",
    label: "Min height",
    type: "slider",
    tab: "content",
    section: "Size",
    min: 0,
    max: 1200,
    responsive: true,
  }),
  c({
    key: "basis",
    label: "Width in parent (%)",
    type: "slider",
    tab: "content",
    section: "Size",
    min: 5,
    max: 100,
    responsive: true,
  }),
];

/* ------------------------------------------------------------------ */
/* Widget content controls                                             */
/* ------------------------------------------------------------------ */

const CONTENT: Record<string, Control[]> = {
  container: CONTAINER_CONTROLS,
  grid: CONTAINER_CONTROLS,
  heading: [
    c({
      key: "text",
      label: "Title",
      type: "textarea",
      tab: "content",
      section: "Title",
    }),
    c({
      key: "href",
      label: "Link",
      type: "link",
      tab: "content",
      section: "Title",
      placeholder: "https://",
    }),
    c({
      key: "level",
      label: "HTML tag",
      type: "select",
      tab: "content",
      section: "Title",
      options: [1, 2, 3, 4, 5, 6].map((l) => ({
        value: String(l),
        label: `H${l}`,
      })),
    }),
    c({
      key: "textAlign",
      label: "Alignment",
      type: "choice",
      tab: "content",
      section: "Title",
      options: ALIGN_OPTIONS,
      responsive: true,
    }),
  ],
  text: [
    c({
      key: "text",
      label: "Text",
      type: "textarea",
      tab: "content",
      section: "Text",
    }),
    c({
      key: "textAlign",
      label: "Alignment",
      type: "choice",
      tab: "content",
      section: "Text",
      options: ALIGN_OPTIONS,
      responsive: true,
    }),
  ],
  "text-editor": [
    c({
      key: "text",
      label: "Content",
      type: "richtext",
      tab: "content",
      section: "Text",
    }),
    c({
      key: "textAlign",
      label: "Alignment",
      type: "choice",
      tab: "content",
      section: "Text",
      options: ALIGN_OPTIONS,
      responsive: true,
    }),
  ],
  image: [
    c({
      key: "url",
      label: "Choose image",
      type: "image",
      tab: "content",
      section: "Image",
    }),
    c({
      key: "alt",
      label: "Alt text",
      type: "text",
      tab: "content",
      section: "Image",
      help: "Describe the picture for screen readers.",
    }),
    c({
      key: "href",
      label: "Link",
      type: "link",
      tab: "content",
      section: "Image",
    }),
    c({
      key: "width",
      label: "Width (%)",
      type: "slider",
      tab: "content",
      section: "Image",
      min: 10,
      max: 100,
      responsive: true,
    }),
    c({
      key: "textAlign",
      label: "Alignment",
      type: "choice",
      tab: "content",
      section: "Image",
      options: ALIGN_OPTIONS,
      responsive: true,
    }),
  ],
  video: [
    c({
      key: "url",
      label: "Video URL",
      type: "text",
      tab: "content",
      section: "Video",
      placeholder: "https://youtube.com/watch?v=…",
    }),
    c({
      key: "title",
      label: "Accessible title",
      type: "text",
      tab: "content",
      section: "Video",
    }),
    c({
      key: "ratio",
      label: "Aspect ratio",
      type: "select",
      tab: "content",
      section: "Video",
      options: ["16:9", "4:3", "1:1", "9:16"].map((v) => ({
        value: v,
        label: v,
      })),
    }),
  ],
  button: [
    c({
      key: "label",
      label: "Text",
      type: "text",
      tab: "content",
      section: "Button",
    }),
    c({
      key: "href",
      label: "Link",
      type: "link",
      tab: "content",
      section: "Button",
    }),
    c({
      key: "variant",
      label: "Type",
      type: "choice",
      tab: "content",
      section: "Button",
      options: [
        { value: "primary", label: "Primary" },
        { value: "outline", label: "Outline" },
        { value: "ghost", label: "Ghost" },
      ],
    }),
    c({
      key: "size",
      label: "Size",
      type: "choice",
      tab: "content",
      section: "Button",
      options: [
        { value: "sm", label: "Small" },
        { value: "md", label: "Medium" },
        { value: "lg", label: "Large" },
      ],
    }),
    c({
      key: "textAlign",
      label: "Alignment",
      type: "choice",
      tab: "content",
      section: "Button",
      options: ALIGN_OPTIONS,
      responsive: true,
    }),
  ],
  divider: [
    c({
      key: "style",
      label: "Style",
      type: "select",
      tab: "content",
      section: "Divider",
      options: ["solid", "dashed", "dotted", "double"].map((v) => ({
        value: v,
        label: v,
      })),
    }),
    c({
      key: "weight",
      label: "Weight",
      type: "slider",
      tab: "content",
      section: "Divider",
      min: 1,
      max: 20,
    }),
    c({
      key: "width",
      label: "Width (%)",
      type: "slider",
      tab: "content",
      section: "Divider",
      min: 10,
      max: 100,
      responsive: true,
    }),
  ],
  spacer: [
    c({
      key: "height",
      label: "Height",
      type: "slider",
      tab: "content",
      section: "Spacer",
      min: 4,
      max: 400,
      responsive: true,
    }),
  ],
  map: [
    c({
      key: "query",
      label: "Location",
      type: "text",
      tab: "content",
      section: "Map",
    }),
    c({
      key: "zoom",
      label: "Zoom",
      type: "slider",
      tab: "content",
      section: "Map",
      min: 1,
      max: 20,
    }),
    c({
      key: "height",
      label: "Height",
      type: "slider",
      tab: "content",
      section: "Map",
      min: 120,
      max: 800,
      responsive: true,
    }),
  ],
  icon: [
    c({
      key: "icon",
      label: "Icon",
      type: "icon",
      tab: "content",
      section: "Icon",
    }),
    c({
      key: "size",
      label: "Size",
      type: "slider",
      tab: "content",
      section: "Icon",
      min: 12,
      max: 200,
      responsive: true,
    }),
    c({
      key: "href",
      label: "Link",
      type: "link",
      tab: "content",
      section: "Icon",
    }),
    c({
      key: "textAlign",
      label: "Alignment",
      type: "choice",
      tab: "content",
      section: "Icon",
      options: ALIGN_OPTIONS,
      responsive: true,
    }),
  ],
  tabs: [
    c({
      key: "items",
      label: "Tabs",
      type: "repeater",
      tab: "content",
      section: "Tabs",
      fields: [
        c({
          key: "title",
          label: "Title",
          type: "text",
          tab: "content",
          section: "Tabs",
        }),
        c({
          key: "content",
          label: "Content",
          type: "textarea",
          tab: "content",
          section: "Tabs",
        }),
      ],
    }),
  ],
  accordion: [
    c({
      key: "items",
      label: "Items",
      type: "repeater",
      tab: "content",
      section: "Accordion",
      fields: [
        c({
          key: "title",
          label: "Title",
          type: "text",
          tab: "content",
          section: "Accordion",
        }),
        c({
          key: "content",
          label: "Content",
          type: "textarea",
          tab: "content",
          section: "Accordion",
        }),
      ],
    }),
  ],
  toggle: [
    c({
      key: "items",
      label: "Items",
      type: "repeater",
      tab: "content",
      section: "Toggle",
      fields: [
        c({
          key: "title",
          label: "Title",
          type: "text",
          tab: "content",
          section: "Toggle",
        }),
        c({
          key: "content",
          label: "Content",
          type: "textarea",
          tab: "content",
          section: "Toggle",
        }),
      ],
    }),
  ],
  "image-box": [
    c({
      key: "url",
      label: "Image",
      type: "image",
      tab: "content",
      section: "Image box",
    }),
    c({
      key: "title",
      label: "Title",
      type: "text",
      tab: "content",
      section: "Image box",
    }),
    c({
      key: "text",
      label: "Description",
      type: "textarea",
      tab: "content",
      section: "Image box",
    }),
    c({
      key: "href",
      label: "Link",
      type: "link",
      tab: "content",
      section: "Image box",
    }),
    c({
      key: "textAlign",
      label: "Alignment",
      type: "choice",
      tab: "content",
      section: "Image box",
      options: ALIGN_OPTIONS,
      responsive: true,
    }),
  ],
  "icon-box": [
    c({
      key: "icon",
      label: "Icon",
      type: "icon",
      tab: "content",
      section: "Icon box",
    }),
    c({
      key: "title",
      label: "Title",
      type: "text",
      tab: "content",
      section: "Icon box",
    }),
    c({
      key: "text",
      label: "Description",
      type: "textarea",
      tab: "content",
      section: "Icon box",
    }),
    c({
      key: "href",
      label: "Link",
      type: "link",
      tab: "content",
      section: "Icon box",
    }),
    c({
      key: "textAlign",
      label: "Alignment",
      type: "choice",
      tab: "content",
      section: "Icon box",
      options: ALIGN_OPTIONS,
      responsive: true,
    }),
  ],
  carousel: [
    c({
      key: "items",
      label: "Slides",
      type: "repeater",
      tab: "content",
      section: "Carousel",
      fields: [
        c({
          key: "url",
          label: "Image",
          type: "image",
          tab: "content",
          section: "Carousel",
        }),
        c({
          key: "alt",
          label: "Alt text",
          type: "text",
          tab: "content",
          section: "Carousel",
        }),
      ],
    }),
    c({
      key: "perView",
      label: "Slides per view",
      type: "slider",
      tab: "content",
      section: "Carousel",
      min: 1,
      max: 6,
      responsive: true,
    }),
    c({
      key: "gap",
      label: "Gap",
      type: "slider",
      tab: "content",
      section: "Carousel",
      min: 0,
      max: 60,
    }),
  ],
  gallery: [
    c({
      key: "items",
      label: "Images",
      type: "repeater",
      tab: "content",
      section: "Gallery",
      fields: [
        c({
          key: "url",
          label: "Image",
          type: "image",
          tab: "content",
          section: "Gallery",
        }),
        c({
          key: "alt",
          label: "Alt text",
          type: "text",
          tab: "content",
          section: "Gallery",
        }),
      ],
    }),
    c({
      key: "columns",
      label: "Columns",
      type: "slider",
      tab: "content",
      section: "Gallery",
      min: 1,
      max: 6,
      responsive: true,
    }),
    c({
      key: "gap",
      label: "Gap",
      type: "slider",
      tab: "content",
      section: "Gallery",
      min: 0,
      max: 60,
    }),
  ],
  "icon-list": [
    c({
      key: "icon",
      label: "Icon",
      type: "icon",
      tab: "content",
      section: "List",
    }),
    c({
      key: "items",
      label: "Items",
      type: "repeater",
      tab: "content",
      section: "List",
      fields: [
        c({
          key: "text",
          label: "Text",
          type: "text",
          tab: "content",
          section: "List",
        }),
        c({
          key: "href",
          label: "Link",
          type: "link",
          tab: "content",
          section: "List",
        }),
      ],
    }),
  ],
  counter: [
    c({
      key: "start",
      label: "Start",
      type: "number",
      tab: "content",
      section: "Counter",
    }),
    c({
      key: "end",
      label: "End",
      type: "number",
      tab: "content",
      section: "Counter",
    }),
    c({
      key: "prefix",
      label: "Prefix",
      type: "text",
      tab: "content",
      section: "Counter",
    }),
    c({
      key: "suffix",
      label: "Suffix",
      type: "text",
      tab: "content",
      section: "Counter",
    }),
    c({
      key: "title",
      label: "Title",
      type: "text",
      tab: "content",
      section: "Counter",
    }),
  ],
  progress: [
    c({
      key: "title",
      label: "Title",
      type: "text",
      tab: "content",
      section: "Progress",
    }),
    c({
      key: "percent",
      label: "Percentage",
      type: "slider",
      tab: "content",
      section: "Progress",
      min: 0,
      max: 100,
    }),
    c({
      key: "showPercent",
      label: "Show percentage",
      type: "switch",
      tab: "content",
      section: "Progress",
    }),
  ],
  testimonial: [
    c({
      key: "text",
      label: "Quote",
      type: "textarea",
      tab: "content",
      section: "Testimonial",
    }),
    c({
      key: "author",
      label: "Name",
      type: "text",
      tab: "content",
      section: "Testimonial",
    }),
    c({
      key: "role",
      label: "Role",
      type: "text",
      tab: "content",
      section: "Testimonial",
    }),
    c({
      key: "url",
      label: "Photo",
      type: "image",
      tab: "content",
      section: "Testimonial",
    }),
    c({
      key: "textAlign",
      label: "Alignment",
      type: "choice",
      tab: "content",
      section: "Testimonial",
      options: ALIGN_OPTIONS,
      responsive: true,
    }),
  ],
  social: [
    c({
      key: "items",
      label: "Networks",
      type: "repeater",
      tab: "content",
      section: "Social",
      fields: [
        c({
          key: "network",
          label: "Network",
          type: "select",
          tab: "content",
          section: "Social",
          options: [
            "facebook",
            "instagram",
            "youtube",
            "linkedin",
            "x",
            "whatsapp",
          ].map((v) => ({ value: v, label: v })),
        }),
        c({
          key: "href",
          label: "Link",
          type: "link",
          tab: "content",
          section: "Social",
        }),
      ],
    }),
    c({
      key: "textAlign",
      label: "Alignment",
      type: "choice",
      tab: "content",
      section: "Social",
      options: ALIGN_OPTIONS,
      responsive: true,
    }),
  ],
  alert: [
    c({
      key: "tone",
      label: "Type",
      type: "select",
      tab: "content",
      section: "Alert",
      options: ["info", "success", "warning", "danger"].map((v) => ({
        value: v,
        label: v,
      })),
    }),
    c({
      key: "title",
      label: "Title",
      type: "text",
      tab: "content",
      section: "Alert",
    }),
    c({
      key: "text",
      label: "Description",
      type: "textarea",
      tab: "content",
      section: "Alert",
    }),
  ],
  html: [
    c({
      key: "html",
      label: "HTML",
      type: "code",
      tab: "content",
      section: "HTML",
    }),
  ],
  "app-block": [
    c({
      key: "block",
      label: "Block name",
      type: "text",
      tab: "content",
      section: "App block",
      placeholder: "reviews",
    }),
    c({
      key: "params",
      label: "Parameters",
      type: "text",
      tab: "content",
      section: "App block",
      placeholder: "limit=6",
    }),
  ],
  anchor: [
    c({
      key: "anchorId",
      label: "Anchor id",
      type: "text",
      tab: "content",
      section: "Anchor",
      help: "Link to it with #your-id",
    }),
  ],
  "read-more": [
    c({
      key: "label",
      label: "Label",
      type: "text",
      tab: "content",
      section: "Read more",
    }),
  ],
  rating: [
    c({
      key: "value",
      label: "Rating",
      type: "slider",
      tab: "content",
      section: "Rating",
      min: 0,
      max: 5,
      step: 0.5,
    }),
    c({
      key: "max",
      label: "Out of",
      type: "slider",
      tab: "content",
      section: "Rating",
      min: 3,
      max: 10,
    }),
    c({
      key: "textAlign",
      label: "Alignment",
      type: "choice",
      tab: "content",
      section: "Rating",
      options: ALIGN_OPTIONS,
      responsive: true,
    }),
  ],
  "text-path": [
    c({
      key: "text",
      label: "Text",
      type: "text",
      tab: "content",
      section: "Text path",
    }),
    c({
      key: "path",
      label: "Path",
      type: "select",
      tab: "content",
      section: "Text path",
      options: ["circle", "arc", "wave", "line"].map((v) => ({
        value: v,
        label: v,
      })),
    }),
    c({
      key: "size",
      label: "Size",
      type: "slider",
      tab: "content",
      section: "Text path",
      min: 80,
      max: 600,
    }),
  ],
  // Ported from the theme engine (flat scalar props mirror theme defaults).
  faq: [
    c({
      key: "heading",
      label: "Heading",
      type: "text",
      tab: "content",
      section: "FAQ",
    }),
    ...[1, 2, 3].flatMap((i) => [
      c({
        key: `q${i}`,
        label: `Question ${i}`,
        type: "text",
        tab: "content",
        section: `Item ${i}`,
      }),
      c({
        key: `a${i}`,
        label: `Answer ${i}`,
        type: "textarea",
        tab: "content",
        section: `Item ${i}`,
      }),
    ]),
  ],
  marquee: [
    c({
      key: "text",
      label: "Text",
      type: "text",
      tab: "content",
      section: "Marquee",
    }),
    c({
      key: "speed",
      label: "Seconds per loop",
      type: "number",
      tab: "content",
      section: "Marquee",
      min: 5,
      max: 120,
    }),
    c({
      key: "pauseOnHover",
      label: "Pause on hover",
      type: "switch",
      tab: "content",
      section: "Marquee",
    }),
  ],
  countdown: [
    c({
      key: "label",
      label: "Label",
      type: "text",
      tab: "content",
      section: "Countdown",
    }),
    c({
      key: "endsAt",
      label: "Ends at (ISO date-time)",
      type: "text",
      tab: "content",
      section: "Countdown",
      placeholder: "2026-12-31T23:59:00",
    }),
  ],
  banner: [
    c({
      key: "text",
      label: "Message",
      type: "text",
      tab: "content",
      section: "Banner",
    }),
    c({
      key: "tone",
      label: "Tone",
      type: "select",
      tab: "content",
      section: "Banner",
      options: [
        { value: "info", label: "Info" },
        { value: "warn", label: "Warning" },
        { value: "success", label: "Success" },
      ],
    }),
  ],
  trust_bar: [
    ...[1, 2, 3, 4].flatMap((i) => [
      c({
        key: `i${i}Title`,
        label: `Item ${i} title`,
        type: "text",
        tab: "content",
        section: `Item ${i}`,
      }),
      c({
        key: `i${i}Body`,
        label: `Item ${i} body`,
        type: "text",
        tab: "content",
        section: `Item ${i}`,
      }),
      c({
        key: `i${i}Icon`,
        label: `Item ${i} icon key`,
        type: "text",
        tab: "content",
        section: `Item ${i}`,
      }),
    ]),
  ],
  announcement_bar: [
    ...[1, 2, 3].map((i) =>
      c({
        key: `m${i}`,
        label: `Message ${i}`,
        type: "text",
        tab: "content",
        section: "Messages",
      }),
    ),
    c({
      key: "href",
      label: "Link",
      type: "text",
      tab: "content",
      section: "Messages",
      placeholder: "https://",
    }),
    c({
      key: "dismissible",
      label: "Dismissible",
      type: "switch",
      tab: "content",
      section: "Behaviour",
    }),
    c({
      key: "rotateMs",
      label: "Rotation in ms (0 = off)",
      type: "number",
      tab: "content",
      section: "Behaviour",
      min: 0,
      max: 60000,
    }),
  ],
  // Heritage + hero batch: keys mirror theme field keys exactly.
  heritage_story: [
    c({ key: "image", label: "Image URL", type: "text", tab: "content", section: "Story" }),
    c({ key: "headline", label: "Headline", type: "text", tab: "content", section: "Story" }),
    c({ key: "body", label: "Body", type: "textarea", tab: "content", section: "Story" }),
    c({ key: "ctaLabel", label: "CTA label", type: "text", tab: "content", section: "Story" }),
    c({ key: "ctaUrl", label: "CTA URL", type: "text", tab: "content", section: "Story" }),
    c({
      key: "layout",
      label: "Layout",
      type: "select",
      tab: "content",
      section: "Story",
      options: [
        { value: "image-left", label: "Image left" },
        { value: "image-right", label: "Image right" },
        { value: "full-width", label: "Full width" },
      ],
    }),
  ],
  editorial_banner: [
    c({ key: "image", label: "Image URL", type: "text", tab: "content", section: "Banner" }),
    c({ key: "headline", label: "Headline", type: "text", tab: "content", section: "Banner" }),
    c({ key: "subhead", label: "Subhead", type: "text", tab: "content", section: "Banner" }),
    c({ key: "ctaLabel", label: "CTA label", type: "text", tab: "content", section: "Banner" }),
    c({ key: "ctaUrl", label: "CTA URL", type: "text", tab: "content", section: "Banner" }),
  ],
  editorial_hero: [
    c({ key: "eyebrow", label: "Eyebrow", type: "text", tab: "content", section: "Hero" }),
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Hero" }),
    c({ key: "body", label: "Body", type: "textarea", tab: "content", section: "Hero" }),
    c({ key: "ctaLabel", label: "CTA label", type: "text", tab: "content", section: "Hero" }),
    c({ key: "ctaHref", label: "CTA link", type: "text", tab: "content", section: "Hero" }),
    c({ key: "imageUrl", label: "Image URL", type: "text", tab: "content", section: "Hero" }),
    c({
      key: "layout",
      label: "Layout",
      type: "select",
      tab: "content",
      section: "Hero",
      options: [
        { value: "stacked", label: "Stacked" },
        { value: "split", label: "Split" },
      ],
    }),
    c({ key: "scrim", label: "Scrim", type: "switch", tab: "content", section: "Hero" }),
  ],
  lookbook: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Lookbook" }),
    ...[1, 2, 3, 4].flatMap((i) => [
      c({ key: `i${i}Image`, label: `Image ${i} URL`, type: "text", tab: "content", section: `Tile ${i}` }),
      c({ key: `i${i}Alt`, label: `Image ${i} alt`, type: "text", tab: "content", section: `Tile ${i}` }),
      c({ key: `i${i}Href`, label: `Image ${i} link`, type: "text", tab: "content", section: `Tile ${i}` }),
    ]),
    c({ key: "offset", label: "Offset tiles", type: "switch", tab: "content", section: "Lookbook" }),
  ],
  hero: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Hero" }),
    c({ key: "subheading", label: "Subheading", type: "text", tab: "content", section: "Hero" }),
    c({ key: "ctaLabel", label: "CTA label", type: "text", tab: "content", section: "Hero" }),
    c({ key: "ctaHref", label: "CTA link", type: "text", tab: "content", section: "Hero" }),
    c({
      key: "align",
      label: "Alignment",
      type: "select",
      tab: "content",
      section: "Hero",
      options: [
        { value: "left", label: "Left" },
        { value: "center", label: "Center" },
      ],
    }),
    c({ key: "image", label: "Image URL", type: "text", tab: "content", section: "Hero" }),
    c({ key: "s2Heading", label: "Slide 2 heading", type: "text", tab: "content", section: "Slides" }),
    c({ key: "s2Image", label: "Slide 2 image", type: "text", tab: "content", section: "Slides" }),
    c({ key: "s3Heading", label: "Slide 3 heading", type: "text", tab: "content", section: "Slides" }),
    c({ key: "s3Image", label: "Slide 3 image", type: "text", tab: "content", section: "Slides" }),
  ],
  textile_showcase: [
    c({ key: "headline", label: "Headline", type: "text", tab: "content", section: "Showcase" }),
    c({
      key: "items",
      label: "Items",
      type: "repeater",
      tab: "content",
      section: "Showcase",
      fields: [
        c({ key: "image", label: "Image URL", type: "text", tab: "content", section: "Showcase" }),
        c({ key: "title", label: "Title", type: "text", tab: "content", section: "Showcase" }),
        c({ key: "subtitle", label: "Subtitle", type: "text", tab: "content", section: "Showcase" }),
      ],
    }),
  ],
  department_grid: [
    c({
      key: "departments",
      label: "Departments",
      type: "repeater",
      tab: "content",
      section: "Grid",
      fields: [
        c({ key: "image", label: "Image URL", type: "text", tab: "content", section: "Grid" }),
        c({ key: "title", label: "Title", type: "text", tab: "content", section: "Grid" }),
        c({ key: "href", label: "Link URL", type: "text", tab: "content", section: "Grid" }),
      ],
    }),
    c({ key: "columns", label: "Columns", type: "number", tab: "content", section: "Grid", min: 2, max: 6 }),
  ],
  story_trunk: [
    c({ key: "headline", label: "Headline", type: "text", tab: "content", section: "Timeline" }),
    c({
      key: "items",
      label: "Items",
      type: "repeater",
      tab: "content",
      section: "Timeline",
      fields: [
        c({ key: "year", label: "Year", type: "text", tab: "content", section: "Timeline" }),
        c({ key: "title", label: "Title", type: "text", tab: "content", section: "Timeline" }),
        c({ key: "body", label: "Body", type: "textarea", tab: "content", section: "Timeline" }),
        c({ key: "image", label: "Image URL", type: "text", tab: "content", section: "Timeline" }),
      ],
    }),
  ],
  marquee_strip: [
    c({
      key: "items",
      label: "Items",
      type: "repeater",
      tab: "content",
      section: "Strip",
      fields: [
        c({ key: "text", label: "Text", type: "text", tab: "content", section: "Strip" }),
        c({ key: "icon", label: "Icon", type: "text", tab: "content", section: "Strip" }),
      ],
    }),
    c({
      key: "speed",
      label: "Speed",
      type: "select",
      tab: "content",
      section: "Strip",
      options: [
        { value: "slow", label: "Slow" },
        { value: "normal", label: "Normal" },
        { value: "fast", label: "Fast" },
      ],
    }),
  ],
  hero_carousel: [
    c({
      key: "slides",
      label: "Slides",
      type: "repeater",
      tab: "content",
      section: "Slides",
      fields: [
        c({ key: "image", label: "Image URL", type: "text", tab: "content", section: "Slides" }),
        c({ key: "headline", label: "Headline", type: "text", tab: "content", section: "Slides" }),
        c({ key: "subhead", label: "Subhead", type: "text", tab: "content", section: "Slides" }),
        c({ key: "ctaLabel", label: "CTA label", type: "text", tab: "content", section: "Slides" }),
        c({ key: "ctaUrl", label: "CTA URL", type: "text", tab: "content", section: "Slides" }),
        c({ key: "caption", label: "Caption", type: "text", tab: "content", section: "Slides" }),
      ],
    }),
    c({ key: "autoAdvanceMs", label: "Auto-advance (ms)", type: "number", tab: "content", section: "Slides", min: 1000, max: 15000 }),
  ],
  testimonial_carousel: [
    c({
      key: "testimonials",
      label: "Testimonials",
      type: "repeater",
      tab: "content",
      section: "Testimonials",
      fields: [
        c({ key: "quote", label: "Quote", type: "textarea", tab: "content", section: "Testimonials" }),
        c({ key: "author", label: "Author", type: "text", tab: "content", section: "Testimonials" }),
        c({ key: "role", label: "Role", type: "text", tab: "content", section: "Testimonials" }),
        c({ key: "avatar", label: "Avatar URL", type: "text", tab: "content", section: "Testimonials" }),
      ],
    }),
    c({ key: "autoAdvanceMs", label: "Auto-advance (ms)", type: "number", tab: "content", section: "Testimonials", min: 1000, max: 15000 }),
  ],
};

const COMMERCE_CONTROLS: Control[] = [
  c({
    key: "source",
    label: "Source",
    type: "select",
    tab: "content",
    section: "Query",
    options: [
      { value: "auto", label: "Latest products" },
      { value: "featured", label: "Featured" },
      { value: "collection", label: "Collection" },
      { value: "manual", label: "Hand-picked" },
    ],
  }),
  c({
    key: "collection",
    label: "Collection handle",
    type: "text",
    tab: "content",
    section: "Query",
    showWhen: { key: "source", equals: ["collection"] },
  }),
  c({
    key: "limit",
    label: "How many",
    type: "slider",
    tab: "content",
    section: "Query",
    min: 1,
    max: 24,
  }),
  c({
    key: "columns",
    label: "Columns",
    type: "slider",
    tab: "content",
    section: "Layout",
    min: 1,
    max: 6,
    responsive: true,
  }),
];

const COMMERCE_KEYS = [
  "products",
  "product-categories",
  "add-to-cart",
  "cart",
  "checkout",
  "menu-cart",
  "reviews",
];

export function contentControls(el: string): Control[] {
  if (CONTENT[el]) return CONTENT[el]!;
  if (COMMERCE_KEYS.includes(el)) return COMMERCE_CONTROLS;
  return [
    c({
      key: "text",
      label: "Text",
      type: "textarea",
      tab: "content",
      section: "Content",
    }),
  ];
}

export function controlsFor(node: StudioNode): Control[] {
  return [...contentControls(node.el), ...STYLE_CONTROLS, ...ADVANCED_CONTROLS];
}

export function controlsForTab(node: StudioNode, tab: ControlTab): Control[] {
  return controlsFor(node).filter((control) => control.tab === tab);
}

export type ControlSection = { title: string; controls: Control[] };

export function sectionsForTab(
  node: StudioNode,
  tab: ControlTab,
): ControlSection[] {
  const out: ControlSection[] = [];
  for (const control of controlsForTab(node, tab)) {
    const last = out[out.length - 1];
    if (last && last.title === control.section) last.controls.push(control);
    else out.push({ title: control.section, controls: [control] });
  }
  return out;
}

/** Honour `showWhen`, so grid-only controls disappear in flex mode. */
export function isControlVisible(
  control: Control,
  settings: NodeSettings,
): boolean {
  if (!control.showWhen) return true;
  const value = settings[control.showWhen.key];
  if (control.showWhen.equals.length === 0)
    return value !== undefined && value !== "" && value !== null;
  return control.showWhen.equals.some((candidate) => candidate === value);
}

/**
 * Panel-level grouping: `General · Style · Interactions`. The Style tab keeps
 * the Advanced controls (attributes, custom CSS, layout) as accordions at the
 * bottom, which is where Elementor V4 puts them.
 */
export function sectionsForPanelTab(
  node: StudioNode,
  panel: PanelTab,
): (ControlSection & { advanced: boolean })[] {
  const out: (ControlSection & { advanced: boolean })[] = [];
  for (const tab of PANEL_TAB_CONTROLS[panel]) {
    for (const section of sectionsForTab(node, tab)) {
      out.push({ ...section, advanced: tab === "advanced" });
    }
  }
  return out;
}

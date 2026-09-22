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
    c({
      key: "items",
      label: "Questions",
      type: "repeater",
      tab: "content",
      section: "FAQ",
      fields: [
        c({
          key: "question",
          label: "Question",
          type: "text",
          tab: "content",
          section: "FAQ",
        }),
        c({
          key: "answer",
          label: "Answer",
          type: "textarea",
          tab: "content",
          section: "FAQ",
        }),
      ],
    }),
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
    c({
      key: "items",
      label: "Badges",
      type: "repeater",
      tab: "content",
      section: "Trust bar",
      fields: [
        c({ key: "icon", label: "Icon key", type: "text", tab: "content", section: "Trust bar" }),
        c({ key: "title", label: "Title", type: "text", tab: "content", section: "Trust bar" }),
        c({ key: "body", label: "Body", type: "text", tab: "content", section: "Trust bar" }),
      ],
    }),
  ],
  announcement_bar: [
    c({
      key: "items",
      label: "Messages",
      type: "repeater",
      tab: "content",
      section: "Messages",
      fields: [
        c({ key: "text", label: "Message", type: "text", tab: "content", section: "Messages" }),
      ],
    }),
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
    c({
      key: "items",
      label: "Tiles",
      type: "repeater",
      tab: "content",
      section: "Lookbook",
      fields: [
        c({ key: "image", label: "Image URL", type: "text", tab: "content", section: "Lookbook" }),
        c({ key: "alt", label: "Alt text", type: "text", tab: "content", section: "Lookbook" }),
        c({ key: "href", label: "Link", type: "text", tab: "content", section: "Lookbook" }),
      ],
    }),
    c({ key: "offset", label: "Offset tiles", type: "switch", tab: "content", section: "Lookbook" }),
  ],
  hero: [
    c({
      key: "items",
      label: "Slides",
      type: "repeater",
      tab: "content",
      section: "Slides",
      fields: [
        c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Slides" }),
        c({ key: "image", label: "Image URL", type: "text", tab: "content", section: "Slides" }),
        c({ key: "subheading", label: "Subheading", type: "text", tab: "content", section: "Slides" }),
        c({ key: "ctaLabel", label: "Button label", type: "text", tab: "content", section: "Slides" }),
        c({ key: "ctaHref", label: "Button link", type: "text", tab: "content", section: "Slides" }),
      ],
    }),
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
  feature_row: [
    c({ key: "itemOne", label: "Item 1", type: "text", tab: "content", section: "Items" }),
    c({ key: "itemTwo", label: "Item 2", type: "text", tab: "content", section: "Items" }),
    c({ key: "itemThree", label: "Item 3", type: "text", tab: "content", section: "Items" }),
  ],
  utility_bar: [
    c({ key: "note", label: "Note", type: "text", tab: "content", section: "Bar" }),
    c({ key: "l1Label", label: "Link 1 label", type: "text", tab: "content", section: "Links" }),
    c({ key: "l1Href", label: "Link 1 URL", type: "text", tab: "content", section: "Links" }),
    c({ key: "l2Label", label: "Link 2 label", type: "text", tab: "content", section: "Links" }),
    c({ key: "l2Href", label: "Link 2 URL", type: "text", tab: "content", section: "Links" }),
    c({ key: "l3Label", label: "Link 3 label", type: "text", tab: "content", section: "Links" }),
    c({ key: "l3Href", label: "Link 3 URL", type: "text", tab: "content", section: "Links" }),
    c({ key: "showLanguage", label: "Show language toggle", type: "switch", tab: "content", section: "Bar" }),
  ],
  footer_sitemap: [
    c({
      key: "items",
      label: "Columns",
      type: "repeater",
      tab: "content",
      section: "Columns",
      fields: [
        c({ key: "title", label: "Column title", type: "text", tab: "content", section: "Columns" }),
        c({
          key: "links",
          label: "Links (one per line: Label|/href)",
          type: "textarea",
          tab: "content",
          section: "Columns",
          placeholder: "New in|/\nBest sellers|/sale",
          help: "One link per line. “Label” alone links to “#”.",
        }),
      ],
    }),
  ],
  doc_links: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Documents" }),
    ...[1, 2, 3, 4].flatMap((i) => [
      c({ key: `d${i}Label`, label: `Doc ${i} label`, type: "text", tab: "content", section: `Doc ${i}` }),
      c({ key: `d${i}Href`, label: `Doc ${i} link`, type: "text", tab: "content", section: `Doc ${i}` }),
      c({ key: `d${i}Meta`, label: `Doc ${i} type / size`, type: "text", tab: "content", section: `Doc ${i}` }),
    ]),
  ],
  claim_chips: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Claims" }),
    ...[1, 2, 3, 4, 5, 6].flatMap((i) => [
      c({ key: `c${i}Label`, label: `Claim ${i}`, type: "text", tab: "content", section: `Claim ${i}` }),
      c({ key: `c${i}Source`, label: `Source ${i}`, type: "text", tab: "content", section: `Claim ${i}` }),
    ]),
  ],
  texture_strip: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Textures" }),
    ...[1, 2, 3, 4].flatMap((i) => [
      c({ key: `t${i}Image`, label: `Image ${i} URL`, type: "text", tab: "content", section: `Tile ${i}` }),
      c({ key: `t${i}Label`, label: `Label ${i}`, type: "text", tab: "content", section: `Tile ${i}` }),
      c({ key: `t${i}Alt`, label: `Alt ${i}`, type: "text", tab: "content", section: `Tile ${i}` }),
    ]),
  ],
  split_feature: [
    c({ key: "eyebrow", label: "Eyebrow", type: "text", tab: "content", section: "Feature" }),
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Feature" }),
    c({ key: "body", label: "Body", type: "textarea", tab: "content", section: "Feature" }),
    c({ key: "ctaLabel", label: "Link label", type: "text", tab: "content", section: "Feature" }),
    c({ key: "ctaHref", label: "Link URL", type: "text", tab: "content", section: "Feature" }),
    c({ key: "imageUrl", label: "Image URL", type: "text", tab: "content", section: "Feature" }),
    c({ key: "imageAlt", label: "Image alt", type: "text", tab: "content", section: "Feature" }),
    c({ key: "flip", label: "Image on the right", type: "switch", tab: "content", section: "Feature" }),
  ],
  notice: [
    c({ key: "text", label: "Message", type: "textarea", tab: "content", section: "Notice" }),
    c({
      key: "tone", label: "Tone", type: "select", tab: "content", section: "Notice",
      options: [
        { value: "info", label: "Info" },
        { value: "success", label: "Success" },
        { value: "warning", label: "Warning" },
        { value: "danger", label: "Danger" },
      ],
    }),
    c({ key: "dismissible", label: "Dismissible", type: "switch", tab: "content", section: "Notice" }),
  ],
  empty_state: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Empty" }),
    c({ key: "body", label: "Body", type: "textarea", tab: "content", section: "Empty" }),
    c({ key: "clearLabel", label: "Clear label", type: "text", tab: "content", section: "Empty" }),
    c({ key: "showSuggestions", label: "Show suggested products", type: "switch", tab: "content", section: "Empty" }),
    c({ key: "limit", label: "Max suggestions", type: "number", tab: "content", section: "Empty", min: 1, max: 12 }),
  ],
  breadcrumb: [
    c({ key: "homeLabel", label: "Home label", type: "text", tab: "content", section: "Trail" }),
  ],
  brand_strip: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Brands" }),
    c({ key: "limit", label: "How many", type: "number", tab: "content", section: "Brands", min: 1, max: 32 }),
    c({ key: "columns", label: "Columns", type: "number", tab: "content", section: "Brands", min: 2, max: 6 }),
    c({ key: "kind", label: "Kind", type: "text", tab: "content", section: "Brands" }),
  ],
  subbrand_bar: [
    c({ key: "activeBrand", label: "Active brand", type: "text", tab: "content", section: "Brands" }),
    c({ key: "tagline", label: "Tagline", type: "text", tab: "content", section: "Brands" }),
    ...[1, 2, 3, 4, 5].flatMap((i) => [
      c({ key: `b${i}Name`, label: `Brand ${i} name`, type: "text", tab: "content", section: `Brand ${i}` }),
      c({ key: `b${i}Href`, label: `Brand ${i} link`, type: "text", tab: "content", section: `Brand ${i}` }),
    ]),
  ],
  support_strip: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Support" }),
    ...[1, 2, 3, 4].flatMap((i) => [
      c({ key: `t${i}Title`, label: `Tile ${i} title`, type: "text", tab: "content", section: `Tile ${i}` }),
      c({ key: `t${i}Body`, label: `Tile ${i} body`, type: "text", tab: "content", section: `Tile ${i}` }),
      c({ key: `t${i}Href`, label: `Tile ${i} link`, type: "text", tab: "content", section: `Tile ${i}` }),
    ]),
  ],
  social_strip: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Social" }),
    c({ key: "href", label: "Profile link", type: "text", tab: "content", section: "Social" }),
    ...[1, 2, 3, 4, 5, 6].map((i) =>
      c({ key: `i${i}Image`, label: `Image ${i} URL`, type: "text", tab: "content", section: "Tiles" }),
    ),
  ],
  logo: [
    c({ key: "image", label: "Logo image URL", type: "text", tab: "content", section: "Logo" }),
    c({ key: "alt", label: "Alt text", type: "text", tab: "content", section: "Logo" }),
    c({ key: "text", label: "Wordmark (used when no image)", type: "text", tab: "content", section: "Logo" }),
    c({ key: "href", label: "Link", type: "text", tab: "content", section: "Logo" }),
    c({ key: "height", label: "Height in px (16-120)", type: "number", tab: "content", section: "Logo", min: 16, max: 120 }),
  ],
  how_to_use: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Steps" }),
    ...[1, 2, 3, 4, 5].flatMap((i) => [
      c({ key: `s${i}Title`, label: `Step ${i}`, type: "text", tab: "content", section: `Step ${i}` }),
      c({ key: `s${i}Body`, label: `Step ${i} body`, type: "textarea", tab: "content", section: `Step ${i}` }),
    ]),
    c({ key: "author", label: "Author name", type: "text", tab: "content", section: "Attribution" }),
    c({ key: "authorRole", label: "Author expertise / role", type: "text", tab: "content", section: "Attribution" }),
    c({ key: "reviewedBy", label: "Reviewed by", type: "text", tab: "content", section: "Attribution" }),
    c({ key: "reviewedOn", label: "Reviewed on (YYYY-MM-DD)", type: "text", tab: "content", section: "Attribution" }),
  ],
  buying_guide: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Guide" }),
    c({ key: "body", label: "Body", type: "textarea", tab: "content", section: "Guide" }),
    ...[1, 2, 3, 4].flatMap((i) => [
      c({ key: `l${i}Label`, label: `Link ${i} label`, type: "text", tab: "content", section: `Link ${i}` }),
      c({ key: `l${i}Href`, label: `Link ${i} URL`, type: "text", tab: "content", section: `Link ${i}` }),
    ]),
    c({ key: "author", label: "Author name", type: "text", tab: "content", section: "Attribution" }),
    c({ key: "authorRole", label: "Author expertise / role", type: "text", tab: "content", section: "Attribution" }),
    c({ key: "reviewedBy", label: "Reviewed by", type: "text", tab: "content", section: "Attribution" }),
    c({ key: "reviewedOn", label: "Reviewed on (YYYY-MM-DD)", type: "text", tab: "content", section: "Attribution" }),
  ],
  care_panel: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Care" }),
    c({ key: "composition", label: "Composition", type: "textarea", tab: "content", section: "Care" }),
    c({ key: "care", label: "Care instructions", type: "textarea", tab: "content", section: "Care" }),
    c({ key: "origin", label: "Made in", type: "text", tab: "content", section: "Care" }),
    c({ key: "open", label: "Start open", type: "switch", tab: "content", section: "Care" }),
  ],
  safety_note: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Safety" }),
    c({ key: "body", label: "Body", type: "textarea", tab: "content", section: "Safety" }),
    c({ key: "howTo", label: "Patch test steps", type: "textarea", tab: "content", section: "Safety" }),
    c({ key: "howToLabel", label: "Disclosure label", type: "text", tab: "content", section: "Safety" }),
  ],
  fit_note: [
    c({
      key: "fit", label: "Fit", type: "select", tab: "content", section: "Fit",
      options: [
        { value: "small", label: "Runs small" },
        { value: "true", label: "True to size" },
        { value: "large", label: "Runs large" },
      ],
    }),
    c({ key: "note", label: "Note", type: "text", tab: "content", section: "Fit" }),
    c({ key: "modelHeight", label: "Model height", type: "text", tab: "content", section: "Fit" }),
    c({ key: "modelSize", label: "Size worn", type: "text", tab: "content", section: "Fit" }),
  ],
  authenticity_badge: [
    c({ key: "label", label: "Badge label", type: "text", tab: "content", section: "Badge" }),
    c({ key: "note", label: "Source note", type: "text", tab: "content", section: "Badge" }),
    c({ key: "verified", label: "Verified", type: "switch", tab: "content", section: "Badge" }),
    c({ key: "source", label: "Verification link", type: "text", tab: "content", section: "Badge", placeholder: "https://" }),
  ],
  sustain_badge: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Claims" }),
    ...[1, 2, 3].flatMap((i) => [
      c({ key: `c${i}Label`, label: `Claim ${i}`, type: "text", tab: "content", section: `Claim ${i}` }),
      c({ key: `c${i}Source`, label: `Claim ${i} source`, type: "text", tab: "content", section: `Claim ${i}` }),
    ]),
  ],
  discount_badge: [
    c({ key: "label", label: "Prefix label", type: "text", tab: "content", section: "Badge" }),
    c({ key: "priceMinor", label: "Price (minor units)", type: "number", tab: "content", section: "Badge", min: 0 }),
    c({ key: "compareAtMinor", label: "Was price (minor units)", type: "number", tab: "content", section: "Badge", min: 0 }),
  ],
  batch_info: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Batch" }),
    c({ key: "mfgLabel", label: "Manufactured label", type: "text", tab: "content", section: "Dates" }),
    c({ key: "mfgDate", label: "Manufactured date", type: "text", tab: "content", section: "Dates" }),
    c({ key: "expiryLabel", label: "Expiry label", type: "text", tab: "content", section: "Dates" }),
    c({ key: "expiryDate", label: "Expiry date", type: "text", tab: "content", section: "Dates" }),
    c({ key: "batchLabel", label: "Batch label", type: "text", tab: "content", section: "Batch" }),
    c({ key: "batchCode", label: "Batch code", type: "text", tab: "content", section: "Batch" }),
    c({ key: "paoMonths", label: "Period after opening (months)", type: "number", tab: "content", section: "Batch", min: 0, max: 60 }),
  ],
  delivery_promise: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Delivery" }),
    c({ key: "insideLabel", label: "Zone 1 label", type: "text", tab: "content", section: "Zones" }),
    c({ key: "insideDays", label: "Zone 1 estimate", type: "text", tab: "content", section: "Zones" }),
    c({ key: "outsideLabel", label: "Zone 2 label", type: "text", tab: "content", section: "Zones" }),
    c({ key: "outsideDays", label: "Zone 2 estimate", type: "text", tab: "content", section: "Zones" }),
    c({ key: "note", label: "Note", type: "textarea", tab: "content", section: "Delivery" }),
  ],
  free_shipping_bar: [
    c({ key: "freeShippingLabel", label: "Prefix", type: "text", tab: "content", section: "Bar" }),
    c({ key: "freeShippingSuffix", label: "Suffix", type: "text", tab: "content", section: "Bar" }),
    c({ key: "freeShippingDone", label: "Unlocked text", type: "text", tab: "content", section: "Bar" }),
  ],
  stock_delivery: [
    c({ key: "handle", label: "Product handle", type: "text", tab: "content", section: "Stock" }),
    c({ key: "lowStockAt", label: "Low-stock threshold", type: "number", tab: "content", section: "Stock", min: 1 }),
    c({ key: "cutOff", label: "Dispatch cut-off", type: "text", tab: "content", section: "Stock" }),
  ],
  rank_list: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "List" }),
    c({ key: "limit", label: "How many", type: "number", tab: "content", section: "List", min: 1, max: 20 }),
    c({ key: "collection", label: "Collection handle", type: "text", tab: "content", section: "List" }),
  ],
  seller_card: [
    c({ key: "name", label: "Seller name", type: "text", tab: "content", section: "Seller" }),
    c({ key: "tagline", label: "Tagline", type: "text", tab: "content", section: "Seller" }),
    c({ key: "logoUrl", label: "Logo URL", type: "text", tab: "content", section: "Seller" }),
    c({ key: "rating", label: "Rating out of 5", type: "number", tab: "content", section: "Seller", min: 0, max: 5 }),
    c({ key: "policy", label: "Policy line", type: "text", tab: "content", section: "Seller" }),
    c({ key: "linkLabel", label: "Link label", type: "text", tab: "content", section: "Seller" }),
    c({ key: "linkHref", label: "Link URL", type: "text", tab: "content", section: "Seller", placeholder: "https://" }),
  ],
  category_header: [
    c({ key: "heading", label: "Title", type: "text", tab: "content", section: "Header" }),
    c({ key: "body", label: "Description", type: "textarea", tab: "content", section: "Header" }),
    c({ key: "imageUrl", label: "Banner image", type: "text", tab: "content", section: "Header" }),
    c({ key: "scrim", label: "Darken banner behind text", type: "switch", tab: "content", section: "Header" }),
    c({ key: "showCount", label: "Show result count", type: "switch", tab: "content", section: "Header" }),
    c({ key: "showBreadcrumb", label: "Show breadcrumb", type: "switch", tab: "content", section: "Header" }),
    c({ key: "homeLabel", label: "Breadcrumb home label", type: "text", tab: "content", section: "Header" }),
  ],
  collection_story: [
    c({ key: "eyebrow", label: "Eyebrow", type: "text", tab: "content", section: "Story" }),
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Story" }),
    c({ key: "body", label: "Prose", type: "textarea", tab: "content", section: "Story" }),
    c({ key: "ctaLabel", label: "Link label", type: "text", tab: "content", section: "Story" }),
    c({ key: "ctaHref", label: "Link URL", type: "text", tab: "content", section: "Story" }),
    c({ key: "imageUrl", label: "Background image", type: "text", tab: "content", section: "Story" }),
    c({ key: "scrim", label: "Darken image behind text", type: "switch", tab: "content", section: "Story" }),
  ],
  brand_rail: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Rail" }),
    c({ key: "limit", label: "How many", type: "number", tab: "content", section: "Rail", min: 1, max: 32 }),
  ],
  concern_rail: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Rail" }),
    c({ key: "terms", label: "Concern slugs (comma separated)", type: "text", tab: "content", section: "Rail" }),
    c({ key: "collection", label: "Collection handle", type: "text", tab: "content", section: "Rail" }),
    c({ key: "showRating", label: "Show rating", type: "switch", tab: "content", section: "Rail" }),
  ],
  back_in_stock: [
    c({ key: "handle", label: "Product handle", type: "text", tab: "content", section: "Form" }),
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Form" }),
    c({ key: "body", label: "Body", type: "textarea", tab: "content", section: "Form" }),
    c({ key: "buttonLabel", label: "Button label", type: "text", tab: "content", section: "Form" }),
    c({ key: "consentText", label: "Consent line", type: "text", tab: "content", section: "Form" }),
  ],
  price_block: [
    c({ key: "showCompareAt", label: "Show compare-at price", type: "switch", tab: "content", section: "Price" }),
    c({ key: "note", label: "Note under price", type: "text", tab: "content", section: "Price" }),
  ],
  price_sparkline: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "History" }),
    c({ key: "handle", label: "Product handle", type: "text", tab: "content", section: "History" }),
    c({ key: "summary", label: "Text alternative", type: "textarea", tab: "content", section: "History" }),
    c({ key: "emptyText", label: "Empty message", type: "text", tab: "content", section: "History" }),
    c({ key: "days", label: "Window in days (7-365)", type: "number", tab: "content", section: "History", min: 7, max: 365 }),
  ],
  deal_card: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Deal" }),
    c({ key: "badgeLabel", label: "Save badge label", type: "text", tab: "content", section: "Deal" }),
    c({ key: "endsAt", label: "Ends at (ISO date-time)", type: "text", tab: "content", section: "Deal" }),
    c({ key: "ctaLabel", label: "Button label", type: "text", tab: "content", section: "Deal" }),
    c({ key: "ctaHref", label: "Button link", type: "text", tab: "content", section: "Deal" }),
  ],
  deal_strip: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Strip" }),
    c({ key: "badgeLabel", label: "Save badge label", type: "text", tab: "content", section: "Strip" }),
    c({ key: "collection", label: "Collection handle", type: "text", tab: "content", section: "Strip" }),
    c({ key: "limit", label: "How many", type: "number", tab: "content", section: "Strip", min: 1, max: 24 }),
  ],
  sponsored_slot: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Slot" }),
    c({ key: "limit", label: "How many", type: "number", tab: "content", section: "Slot", min: 1, max: 8 }),
  ],
  subbrand_spotlight: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Spotlight" }),
    c({ key: "subheading", label: "Subheading", type: "text", tab: "content", section: "Spotlight" }),
    ...[1, 2, 3, 4].flatMap((i) => [
      c({ key: `b${i}Name`, label: `Brand ${i} name`, type: "text", tab: "content", section: `Brand ${i}` }),
      c({ key: `b${i}Tagline`, label: `Brand ${i} tagline`, type: "text", tab: "content", section: `Brand ${i}` }),
      c({ key: `b${i}Image`, label: `Brand ${i} image`, type: "text", tab: "content", section: `Brand ${i}` }),
      c({ key: `b${i}Href`, label: `Brand ${i} link`, type: "text", tab: "content", section: `Brand ${i}` }),
    ]),
  ],
  size_guide: [
    c({ key: "heading", label: "Drawer title", type: "text", tab: "content", section: "Size guide" }),
    c({ key: "openLabel", label: "Trigger label", type: "text", tab: "content", section: "Size guide" }),
    c({ key: "unit", label: "Default unit", type: "select", tab: "content", section: "Size guide", options: [{ value: "cm", label: "Centimetres" }, { value: "in", label: "Inches" }] }),
    c({ key: "c1Label", label: "Measurement 1", type: "text", tab: "content", section: "Columns" }),
    c({ key: "c2Label", label: "Measurement 2", type: "text", tab: "content", section: "Columns" }),
    c({ key: "c3Label", label: "Measurement 3", type: "text", tab: "content", section: "Columns" }),
    ...[1, 2, 3, 4].flatMap((i) => [
      c({ key: `r${i}Label`, label: `Size ${i}`, type: "text", tab: "content", section: `Size ${i}` }),
      c({ key: `r${i}c1`, label: `Size ${i} · m1 (cm)`, type: "number", tab: "content", section: `Size ${i}` }),
      c({ key: `r${i}c2`, label: `Size ${i} · m2 (cm)`, type: "number", tab: "content", section: `Size ${i}` }),
      c({ key: `r${i}c3`, label: `Size ${i} · m3 (cm)`, type: "number", tab: "content", section: `Size ${i}` }),
    ]),
    c({ key: "note", label: "Note", type: "textarea", tab: "content", section: "Size guide" }),
  ],
  routine_builder: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Routine" }),
    c({ key: "amLabel", label: "Morning label", type: "text", tab: "content", section: "Routine" }),
    c({ key: "pmLabel", label: "Night label", type: "text", tab: "content", section: "Routine" }),
    c({ key: "swapLabel", label: "Swap label", type: "text", tab: "content", section: "Routine" }),
    c({ key: "addAllLabel", label: "Add-all label", type: "text", tab: "content", section: "Routine" }),
    c({ key: "note", label: "Note", type: "text", tab: "content", section: "Routine" }),
    c({ key: "limit", label: "Steps (2-6)", type: "number", tab: "content", section: "Routine", min: 2, max: 6 }),
    c({ key: "collection", label: "Collection handle", type: "text", tab: "content", section: "Routine" }),
  ],
  sample_picker: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Samples" }),
    c({ key: "thresholdText", label: "Threshold text", type: "text", tab: "content", section: "Samples" }),
    c({ key: "collection", label: "Samples collection handle", type: "text", tab: "content", section: "Samples" }),
    c({ key: "limit", label: "Samples shown (1-4)", type: "number", tab: "content", section: "Samples", min: 1, max: 4 }),
  ],
  shade_finder: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Shade finder" }),
    c({ key: "undertonePrompt", label: "Undertone question", type: "text", tab: "content", section: "Shade finder" }),
    c({ key: "depthPrompt", label: "Depth question", type: "text", tab: "content", section: "Shade finder" }),
    c({ key: "emptyText", label: "Empty text", type: "text", tab: "content", section: "Shade finder" }),
    c({ key: "handle", label: "Product handle", type: "text", tab: "content", section: "Shade finder" }),
  ],
  skin_quiz: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Skin quiz" }),
    c({ key: "body", label: "Body", type: "textarea", tab: "content", section: "Skin quiz" }),
    c({ key: "typePrompt", label: "Skin type question", type: "text", tab: "content", section: "Questions" }),
    c({ key: "concernPrompt", label: "Concern question", type: "text", tab: "content", section: "Questions" }),
    c({ key: "sensitivityPrompt", label: "Sensitivity question", type: "text", tab: "content", section: "Questions" }),
    c({ key: "finishPrompt", label: "Finish question", type: "text", tab: "content", section: "Questions" }),
    c({ key: "resultText", label: "Result text", type: "text", tab: "content", section: "Result" }),
    c({ key: "resultLabel", label: "Result link label", type: "text", tab: "content", section: "Result" }),
    c({ key: "resultPath", label: "Result path", type: "text", tab: "content", section: "Result" }),
  ],
  quiz: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Quiz" }),
    c({ key: "resultBase", label: "Result URL base", type: "text", tab: "content", section: "Quiz" }),
    c({ key: "resultLabel", label: "Result button label", type: "text", tab: "content", section: "Quiz" }),
    ...[1, 2, 3].flatMap((i) => [
      c({ key: `q${i}Key`, label: `Step ${i} filter key`, type: "text", tab: "content", section: `Step ${i}` }),
      c({ key: `q${i}Label`, label: `Step ${i} question`, type: "text", tab: "content", section: `Step ${i}` }),
      c({ key: `q${i}Choices`, label: `Step ${i} choices (comma separated)`, type: "textarea", tab: "content", section: `Step ${i}` }),
      c({ key: `q${i}Multiple`, label: `Step ${i} allows multiple`, type: "switch", tab: "content", section: `Step ${i}` }),
    ]),
    c({ key: "consentText", label: "Consent line", type: "text", tab: "content", section: "Quiz" }),
  ],
  consult_cta: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Consult" }),
    c({ key: "body", label: "Body", type: "textarea", tab: "content", section: "Consult" }),
    c({ key: "whatsapp", label: "WhatsApp number", type: "text", tab: "content", section: "Channels" }),
    c({ key: "whatsappLabel", label: "WhatsApp label", type: "text", tab: "content", section: "Channels" }),
    c({ key: "phone", label: "Phone number", type: "text", tab: "content", section: "Channels" }),
    c({ key: "callLabel", label: "Call label", type: "text", tab: "content", section: "Channels" }),
    c({ key: "fieldLabel", label: "Field label", type: "text", tab: "content", section: "Form" }),
    c({ key: "buttonLabel", label: "Button label", type: "text", tab: "content", section: "Form" }),
    c({ key: "pendingText", label: "Confirmation text", type: "text", tab: "content", section: "Form" }),
    c({ key: "consentText", label: "Consent text", type: "text", tab: "content", section: "Form" }),
  ],
  gift_builder: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Gift set" }),
    c({ key: "size", label: "Items in set (2-6)", type: "number", tab: "content", section: "Gift set", min: 2, max: 6 }),
    c({ key: "messageLabel", label: "Message field label", type: "text", tab: "content", section: "Gift set" }),
    c({ key: "buttonLabel", label: "Button label", type: "text", tab: "content", section: "Gift set" }),
    c({ key: "note", label: "Note", type: "text", tab: "content", section: "Gift set" }),
    c({ key: "collection", label: "Collection handle", type: "text", tab: "content", section: "Gift set" }),
    c({ key: "limit", label: "Choices shown", type: "number", tab: "content", section: "Gift set", min: 1, max: 24 }),
  ],
  bundle_builder: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Bundle" }),
    c({ key: "collection", label: "Collection handle", type: "text", tab: "content", section: "Bundle" }),
    c({ key: "limit", label: "Max add-ons (2-6)", type: "number", tab: "content", section: "Bundle", min: 2, max: 6 }),
    c({ key: "buttonLabel", label: "Button label", type: "text", tab: "content", section: "Bundle" }),
    c({ key: "note", label: "Note", type: "text", tab: "content", section: "Bundle" }),
  ],
  shoppable_image: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Shoppable image" }),
    c({ key: "imageUrl", label: "Image URL", type: "text", tab: "content", section: "Shoppable image" }),
    c({ key: "altText", label: "Image alt", type: "text", tab: "content", section: "Shoppable image" }),
    c({ key: "limit", label: "Max pins (1-4)", type: "number", tab: "content", section: "Shoppable image", min: 1, max: 4 }),
    c({ key: "collection", label: "Collection handle", type: "text", tab: "content", section: "Shoppable image" }),
    ...[1, 2, 3, 4].flatMap((i) => [
      c({ key: `p${i}x`, label: `Pin ${i} X %`, type: "number", tab: "content", section: `Pin ${i}`, min: 0, max: 100 }),
      c({ key: `p${i}y`, label: `Pin ${i} Y %`, type: "number", tab: "content", section: `Pin ${i}`, min: 0, max: 100 }),
    ]),
  ],
  compare_table: [
    c({ key: "caption", label: "Caption", type: "text", tab: "content", section: "Compare" }),
    c({ key: "limit", label: "Max products (1-4)", type: "number", tab: "content", section: "Compare", min: 1, max: 4 }),
    c({ key: "collection", label: "Collection handle", type: "text", tab: "content", section: "Compare" }),
    c({ key: "r1Label", label: "Row 1 label", type: "text", tab: "content", section: "Rows" }),
    c({ key: "r2Label", label: "Row 2 label", type: "text", tab: "content", section: "Rows" }),
    c({ key: "r3Label", label: "Row 3 label", type: "text", tab: "content", section: "Rows" }),
    c({ key: "r4Label", label: "Row 4 label", type: "text", tab: "content", section: "Rows" }),
  ],
  spec_table: [
    c({ key: "caption", label: "Caption", type: "text", tab: "content", section: "Spec table" }),
    c({ key: "columnLabel", label: "Column heading", type: "text", tab: "content", section: "Spec table" }),
    c({ key: "grouped", label: "Collapsible groups", type: "switch", tab: "content", section: "Spec table" }),
    c({ key: "handle", label: "Product handle", type: "text", tab: "content", section: "Spec table" }),
    c({
      key: "items",
      label: "Rows",
      type: "repeater",
      tab: "content",
      section: "Spec table",
      fields: [
        c({ key: "group", label: "Group", type: "text", tab: "content", section: "Spec table" }),
        c({ key: "label", label: "Label", type: "text", tab: "content", section: "Spec table" }),
        c({ key: "value", label: "Value", type: "text", tab: "content", section: "Spec table" }),
      ],
    }),
  ],
  spec_highlights: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Highlights" }),
    c({ key: "columns", label: "Tiles per row (2-6)", type: "number", tab: "content", section: "Highlights", min: 2, max: 6 }),
    ...[1, 2, 3, 4, 5, 6].flatMap((i) => [
      c({ key: `t${i}Label`, label: `Tile ${i} label`, type: "text", tab: "content", section: `Tile ${i}` }),
      c({ key: `t${i}Value`, label: `Tile ${i} value`, type: "text", tab: "content", section: `Tile ${i}` }),
    ]),
  ],
  ingredient_glossary: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Glossary" }),
    ...[1, 2, 3, 4, 5, 6].flatMap((i) => [
      c({ key: `g${i}Term`, label: `Term ${i}`, type: "text", tab: "content", section: `Term ${i}` }),
      c({ key: `g${i}Body`, label: `Body ${i}`, type: "textarea", tab: "content", section: `Term ${i}` }),
    ]),
  ],
  ingredient_list: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Ingredients" }),
    ...[1, 2, 3, 4, 5, 6].flatMap((i) => [
      c({ key: `i${i}Name`, label: `Ingredient ${i}`, type: "text", tab: "content", section: `Ingredient ${i}` }),
      c({ key: `i${i}Amount`, label: `Amount ${i}`, type: "text", tab: "content", section: `Ingredient ${i}` }),
      c({ key: `i${i}Gloss`, label: `Gloss ${i}`, type: "text", tab: "content", section: `Ingredient ${i}` }),
    ]),
    c({ key: "inci", label: "Full INCI list", type: "textarea", tab: "content", section: "INCI" }),
    c({ key: "inciLabel", label: "INCI disclosure label", type: "text", tab: "content", section: "INCI" }),
    c({ key: "handle", label: "Product handle", type: "text", tab: "content", section: "INCI" }),
  ],
  ingredient_rail: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Rail" }),
    ...[1, 2, 3, 4].flatMap((i) => [
      c({ key: `i${i}Name`, label: `Ingredient ${i} (Latin)`, type: "text", tab: "content", section: `Ingredient ${i}` }),
      c({ key: `i${i}Gloss`, label: `Ingredient ${i} gloss`, type: "text", tab: "content", section: `Ingredient ${i}` }),
    ]),
    c({ key: "collection", label: "Collection handle", type: "text", tab: "content", section: "Rail" }),
    c({ key: "limit", label: "Max products", type: "number", tab: "content", section: "Rail", min: 1, max: 24 }),
    c({ key: "cardVariant", label: "Card style", type: "select", tab: "content", section: "Rail", options: [{ value: "compact", label: "Compact" }, { value: "wide", label: "Wide" }] }),
  ],
  payment_methods: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Payment" }),
    c({ key: "note", label: "Note", type: "textarea", tab: "content", section: "Payment" }),
    c({ key: "emptyText", label: "Empty text", type: "text", tab: "content", section: "Payment" }),
  ],
  payment_icons: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Payment icons" }),
    c({ key: "marks", label: "Marks (comma separated)", type: "textarea", tab: "content", section: "Payment icons" }),
  ],
  emi_calculator: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "EMI" }),
    c({ key: "handle", label: "Product handle", type: "text", tab: "content", section: "EMI" }),
    c({ key: "note", label: "Note", type: "text", tab: "content", section: "EMI" }),
    c({ key: "emptyText", label: "Empty message", type: "text", tab: "content", section: "EMI" }),
    c({ key: "perMonthLabel", label: "Per-month label", type: "text", tab: "content", section: "EMI" }),
  ],
  order_tracker: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Tracker" }),
    c({ key: "step1", label: "Stage 1 label", type: "text", tab: "content", section: "Stages" }),
    c({ key: "step2", label: "Stage 2 label", type: "text", tab: "content", section: "Stages" }),
    c({ key: "step3", label: "Stage 3 label", type: "text", tab: "content", section: "Stages" }),
    c({ key: "step4", label: "Stage 4 label", type: "text", tab: "content", section: "Stages" }),
    c({ key: "note", label: "Note", type: "textarea", tab: "content", section: "Tracker" }),
  ],
  product_grid: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Products" }),
    c({ key: "limit", label: "How many", type: "number", tab: "content", section: "Products", min: 1, max: 48 }),
    c({ key: "columns", label: "Columns", type: "number", tab: "content", section: "Products", min: 2, max: 4 }),
  ],
  product_rail: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Rail" }),
    c({ key: "limit", label: "How many", type: "number", tab: "content", section: "Rail", min: 1, max: 24 }),
    c({ key: "collection", label: "Collection handle", type: "text", tab: "content", section: "Rail" }),
  ],
  product_media: [
    c({ key: "altText", label: "Alt text", type: "text", tab: "content", section: "Media" }),
    c({ key: "ratio", label: "Aspect ratio", type: "select", tab: "content", section: "Media", options: [{ value: "1/1", label: "Square" }, { value: "4/3", label: "4:3" }, { value: "16/9", label: "16:9" }] }),
    c({ key: "showThumbnails", label: "Show thumbnails", type: "switch", tab: "content", section: "Media" }),
    c({ key: "zoom", label: "Enable zoom", type: "switch", tab: "content", section: "Media" }),
    ...[1, 2, 3, 4].map((i) =>
      c({ key: `image${i}`, label: `Image ${i} URL`, type: "text", tab: "content", section: "Media" }),
    ),
  ],
  product_meta: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Details" }),
  ],
  product_qna: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Q&A" }),
    c({ key: "askLabel", label: "Ask button label", type: "text", tab: "content", section: "Q&A" }),
    c({ key: "askHref", label: "Ask button link", type: "text", tab: "content", section: "Q&A" }),
    c({ key: "handle", label: "Product handle", type: "text", tab: "content", section: "Q&A" }),
    c({
      key: "items",
      label: "Questions",
      type: "repeater",
      tab: "content",
      section: "Q&A",
      fields: [
        c({ key: "question", label: "Question", type: "text", tab: "content", section: "Q&A" }),
        c({ key: "answer", label: "Answer", type: "textarea", tab: "content", section: "Q&A" }),
      ],
    }),
  ],
  collection_grid: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Collections" }),
    c({ key: "limit", label: "How many", type: "number", tab: "content", section: "Collections", min: 1, max: 24 }),
    c({ key: "columns", label: "Columns", type: "number", tab: "content", section: "Collections", min: 2, max: 4 }),
  ],
  account_cart: [
    c({ key: "accountLabel", label: "Account label", type: "text", tab: "content", section: "Header" }),
    c({ key: "cartLabel", label: "Cart label", type: "text", tab: "content", section: "Header" }),
  ],
  cart_drawer: [
    c({ key: "heading", label: "Drawer title", type: "text", tab: "content", section: "Cart" }),
    c({ key: "triggerLabel", label: "Trigger label", type: "text", tab: "content", section: "Cart" }),
    c({ key: "ctaLabel", label: "Checkout button label", type: "text", tab: "content", section: "Cart" }),
    c({ key: "emptyText", label: "Empty text", type: "text", tab: "content", section: "Cart" }),
  ],
  cart_lines: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Cart" }),
    c({ key: "removeLabel", label: "Remove label", type: "text", tab: "content", section: "Cart" }),
    c({ key: "emptyText", label: "Empty text", type: "text", tab: "content", section: "Cart" }),
  ],
  cart_summary: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Summary" }),
    c({ key: "totalLabel", label: "Total label", type: "text", tab: "content", section: "Summary" }),
    c({ key: "ctaLabel", label: "Checkout button label", type: "text", tab: "content", section: "Summary" }),
    c({ key: "emptyText", label: "Empty text", type: "text", tab: "content", section: "Summary" }),
  ],
  checkout_steps: [
    c({ key: "heading", label: "Accessible label", type: "text", tab: "content", section: "Steps" }),
    c({ key: "step1", label: "Step 1 label", type: "text", tab: "content", section: "Steps" }),
    c({ key: "activeStep", label: "Active step (1-4)", type: "number", tab: "content", section: "Steps", min: 1, max: 4 }),
  ],
  search_command: [
    c({ key: "placeholder", label: "Placeholder", type: "text", tab: "content", section: "Search" }),
    c({ key: "buttonLabel", label: "Button label", type: "text", tab: "content", section: "Search" }),
    c({ key: "limit", label: "Max suggestions", type: "number", tab: "content", section: "Search", min: 1, max: 12 }),
  ],
  facet_sidebar: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Filters" }),
    c({ key: "limit", label: "Max options per group", type: "number", tab: "content", section: "Filters", min: 1, max: 48 }),
    c({ key: "clearLabel", label: "Clear label", type: "text", tab: "content", section: "Filters" }),
  ],
  pagination: [
    c({ key: "moreLabel", label: "Load-more label", type: "text", tab: "content", section: "Pagination" }),
    c({ key: "prevLabel", label: "Previous label", type: "text", tab: "content", section: "Pagination" }),
    c({ key: "nextLabel", label: "Next label", type: "text", tab: "content", section: "Pagination" }),
  ],
  result_toolbar: [
    c({ key: "countLabel", label: "Count noun", type: "text", tab: "content", section: "Toolbar" }),
    c({ key: "filtersLabel", label: "Mobile filters label", type: "text", tab: "content", section: "Toolbar" }),
    c({ key: "sortLabel", label: "Sort label", type: "text", tab: "content", section: "Toolbar" }),
  ],
  blog_archive: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Archive" }),
    c({ key: "limit", label: "Articles shown", type: "number", tab: "content", section: "Archive", min: 1, max: 24 }),
    c({ key: "columns", label: "Columns", type: "number", tab: "content", section: "Archive", min: 1, max: 4 }),
    c({ key: "emptyText", label: "Empty state text", type: "text", tab: "content", section: "Archive" }),
  ],
  blog_pager: [
    c({ key: "align", label: "Alignment", type: "select", tab: "content", section: "Pagination", options: [{ value: "left", label: "Left" }, { value: "center", label: "Centre" }, { value: "right", label: "Right" }] }),
  ],
  blog_terms: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Topics" }),
    c({ key: "style", label: "Style", type: "select", tab: "content", section: "Topics", options: [{ value: "pills", label: "Pills" }, { value: "list", label: "List" }] }),
  ],
  review_list: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Reviews" }),
    c({ key: "limit", label: "Reviews per page", type: "number", tab: "content", section: "Reviews", min: 1, max: 24 }),
    c({ key: "emptyText", label: "Empty state text", type: "text", tab: "content", section: "Reviews" }),
  ],
  rating_summary: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Ratings" }),
    c({ key: "handle", label: "Product handle", type: "text", tab: "content", section: "Ratings" }),
  ],
  recently_viewed: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "History" }),
    c({ key: "limit", label: "How many", type: "number", tab: "content", section: "History", min: 1, max: 12 }),
  ],
  wishlist_button: [
    c({ key: "addLabel", label: "Label", type: "text", tab: "content", section: "Wishlist" }),
    c({ key: "savedLabel", label: "Saved label", type: "text", tab: "content", section: "Wishlist" }),
  ],
  compare_tray: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Compare" }),
    c({ key: "compareLabel", label: "Compare button", type: "text", tab: "content", section: "Compare" }),
    c({ key: "clearLabel", label: "Clear button", type: "text", tab: "content", section: "Compare" }),
    c({ key: "emptyText", label: "Empty message", type: "text", tab: "content", section: "Compare" }),
  ],
  bundle_offer: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Bundle" }),
    c({ key: "buttonLabel", label: "Button label", type: "text", tab: "content", section: "Bundle" }),
    ...[1, 2, 3, 4].flatMap((i) => [
      c({ key: `i${i}Label`, label: `Item ${i} label`, type: "text", tab: "content", section: `Item ${i}` }),
      c({ key: `i${i}VariantId`, label: `Item ${i} variant ID`, type: "text", tab: "content", section: `Item ${i}` }),
    ]),
  ],
  add_to_cart: [
    c({ key: "label", label: "Button label", type: "text", tab: "content", section: "Add to cart" }),
    c({ key: "showQuantity", label: "Show quantity picker", type: "switch", tab: "content", section: "Add to cart" }),
  ],
  rewards_club: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Rewards" }),
    c({ key: "body", label: "Body", type: "textarea", tab: "content", section: "Rewards" }),
    ...[1, 2, 3].flatMap((i) => [
      c({ key: `tier${i}Name`, label: `Tier ${i} name`, type: "text", tab: "content", section: `Tier ${i}` }),
      c({ key: `tier${i}Points`, label: `Tier ${i} threshold`, type: "text", tab: "content", section: `Tier ${i}` }),
    ]),
    c({ key: "buttonLabel", label: "Button label", type: "text", tab: "content", section: "Rewards" }),
    c({ key: "buttonHref", label: "Button link", type: "text", tab: "content", section: "Rewards" }),
  ],
  wedding_shop: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Wedding" }),
    c({ key: "body", label: "Body", type: "textarea", tab: "content", section: "Wedding" }),
    ...[1, 2, 3].flatMap((i) => [
      c({ key: `c${i}Name`, label: `Collection ${i} name`, type: "text", tab: "content", section: `Collection ${i}` }),
      c({ key: `c${i}Href`, label: `Collection ${i} link`, type: "text", tab: "content", section: `Collection ${i}` }),
    ]),
    c({ key: "buttonLabel", label: "Button label", type: "text", tab: "content", section: "Wedding" }),
    c({ key: "buttonHref", label: "Button link", type: "text", tab: "content", section: "Wedding" }),
  ],
  gift_finder: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Finder" }),
    c({ key: "body", label: "Body", type: "textarea", tab: "content", section: "Finder" }),
    ...[1, 2, 3].flatMap((i) => [
      c({ key: `o${i}Label`, label: `Occasion ${i} label`, type: "text", tab: "content", section: `Occasion ${i}` }),
      c({ key: `o${i}Query`, label: `Occasion ${i} search`, type: "text", tab: "content", section: `Occasion ${i}` }),
    ]),
    c({ key: "buttonLabel", label: "Button label", type: "text", tab: "content", section: "Finder" }),
    c({ key: "buttonHref", label: "Button link", type: "text", tab: "content", section: "Finder" }),
  ],
  rich_text: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Text block" }),
    c({ key: "body", label: "Body", type: "textarea", tab: "content", section: "Text block" }),
  ],
  form: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Contact form" }),
    c({ key: "body", label: "Intro text", type: "textarea", tab: "content", section: "Contact form" }),
    c({ key: "nameLabel", label: "Name label", type: "text", tab: "content", section: "Fields" }),
    c({ key: "emailLabel", label: "Email label", type: "text", tab: "content", section: "Fields" }),
    c({ key: "phoneLabel", label: "Phone label", type: "text", tab: "content", section: "Fields" }),
    c({ key: "messageLabel", label: "Message label", type: "text", tab: "content", section: "Fields" }),
    c({ key: "buttonLabel", label: "Button label", type: "text", tab: "content", section: "Submit" }),
    c({ key: "successText", label: "Thank-you text", type: "textarea", tab: "content", section: "Submit" }),
    c({ key: "consentText", label: "Consent text", type: "text", tab: "content", section: "Submit" }),
    c({ key: "showPhone", label: "Ask for a phone number", type: "switch", tab: "content", section: "Fields" }),
  ],
  nav_menu: [
    c({ key: "menuId", label: "Menu (from Content › Menus — blank for manual links)", type: "text", tab: "content", section: "Menu", placeholder: "Menu ID or handle" }),
    c({ key: "heading", label: "Heading (optional)", type: "text", tab: "content", section: "Menu" }),
    c({
      key: "items",
      label: "Menu items",
      type: "repeater",
      tab: "content",
      section: "Menu",
      fields: [
        c({ key: "label", label: "Label", type: "text", tab: "content", section: "Menu" }),
        c({ key: "href", label: "Link", type: "text", tab: "content", section: "Menu" }),
      ],
    }),
    c({
      key: "layout",
      label: "Direction",
      type: "select",
      tab: "content",
      section: "Menu",
      options: [
        { value: "row", label: "Horizontal" },
        { value: "column", label: "Vertical" },
      ],
    }),
    c({ key: "align", label: "Alignment", type: "text", tab: "content", section: "Menu" }),
  ],
  newsletter: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Newsletter" }),
    c({ key: "body", label: "Body", type: "textarea", tab: "content", section: "Newsletter" }),
    c({ key: "buttonLabel", label: "Button label", type: "text", tab: "content", section: "Newsletter" }),
    c({ key: "consentText", label: "Consent line", type: "text", tab: "content", section: "Newsletter" }),
  ],
  sticky_bar: [
    c({ key: "text", label: "Message", type: "text", tab: "content", section: "Sticky bar" }),
    c({ key: "ctaLabel", label: "Button label", type: "text", tab: "content", section: "Sticky bar" }),
    c({ key: "ctaHref", label: "Button link", type: "text", tab: "content", section: "Sticky bar" }),
    c({
      key: "position",
      label: "Position",
      type: "select",
      tab: "content",
      section: "Sticky bar",
      options: [
        { value: "bottom", label: "Bottom" },
        { value: "top", label: "Top" },
      ],
    }),
  ],
  mega_menu: [
    c({ key: "menuId", label: "Menu (from Content › Menus — blank for live taxonomy)", type: "text", tab: "content", section: "Mega menu", placeholder: "Menu ID or handle" }),
    c({ key: "label", label: "Trigger label", type: "text", tab: "content", section: "Mega menu" }),
    c({ key: "limit", label: "Max top-level entries", type: "number", tab: "content", section: "Mega menu", min: 1, max: 24 }),
    c({ key: "columns", label: "Columns (1-4)", type: "number", tab: "content", section: "Mega menu", min: 1, max: 4 }),
  ],
  buy_box: [
    c({ key: "handle", label: "Product handle", type: "text", tab: "content", section: "Buy box" }),
    c({ key: "label", label: "Button label", type: "text", tab: "content", section: "Buy box" }),
    c({ key: "showQuantity", label: "Show quantity picker", type: "switch", tab: "content", section: "Buy box" }),
    c({ key: "showCompareAt", label: "Show compare-at price", type: "switch", tab: "content", section: "Buy box" }),
    c({ key: "note", label: "Note under price", type: "textarea", tab: "content", section: "Buy box" }),
    c({ key: "promise", label: "Delivery line", type: "text", tab: "content", section: "Buy box" }),
  ],
  variant_picker: [
    c({ key: "handle", label: "Product handle", type: "text", tab: "content", section: "Variant picker" }),
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Variant picker" }),
    c({
      key: "mode",
      label: "Display mode",
      type: "select",
      tab: "content",
      section: "Variant picker",
      options: [
        { value: "chip", label: "Chips" },
        { value: "dropdown", label: "Dropdown" },
        { value: "swatch", label: "Swatches" },
        { value: "shade", label: "Shades" },
        { value: "matrix", label: "Matrix" },
      ],
    }),
    c({ key: "axisOneLabel", label: "Axis 1 label", type: "text", tab: "content", section: "Variant picker" }),
    c({ key: "axisTwoLabel", label: "Axis 2 label", type: "text", tab: "content", section: "Variant picker" }),
  ],
  sticky_buy_bar: [
    c({ key: "handle", label: "Product handle", type: "text", tab: "content", section: "Sticky buy bar" }),
    c({ key: "label", label: "Button label", type: "text", tab: "content", section: "Sticky buy bar" }),
    c({ key: "showPrice", label: "Show price", type: "switch", tab: "content", section: "Sticky buy bar" }),
    c({ key: "dockAfter", label: "Dock after (px scrolled)", type: "number", tab: "content", section: "Sticky buy bar", min: 0, max: 4000 }),
  ],
  filter_chips: [
    c({ key: "clearLabel", label: "Clear label", type: "text", tab: "content", section: "Filter chips" }),
    c({ key: "emptyText", label: "Text when nothing is filtered", type: "text", tab: "content", section: "Filter chips" }),
    c({ key: "showWhenEmpty", label: "Show when nothing is filtered", type: "switch", tab: "content", section: "Filter chips" }),
  ],
  size_selector: [
    c({ key: "handle", label: "Product handle", type: "text", tab: "content", section: "Size selector" }),
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Size selector" }),
    c({ key: "notifyLabel", label: "Out-of-stock action label", type: "text", tab: "content", section: "Size selector" }),
    c({ key: "guideLabel", label: "Size guide link label", type: "text", tab: "content", section: "Size selector" }),
  ],
  complete_the_look: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Complete the look" }),
    c({ key: "limit", label: "Max items (2-6)", type: "number", tab: "content", section: "Complete the look", min: 2, max: 6 }),
    c({ key: "collection", label: "Collection handle", type: "text", tab: "content", section: "Complete the look" }),
    c({ key: "buttonLabel", label: "Add-all label", type: "text", tab: "content", section: "Complete the look" }),
  ],
  circle_categories: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Categories" }),
    ...[1, 2, 3, 4, 5, 6, 7, 8].flatMap((i) => [
      c({ key: `c${i}Title`, label: `Category ${i} title`, type: "text", tab: "content", section: `Category ${i}` }),
      c({ key: `c${i}Image`, label: `Category ${i} image`, type: "text", tab: "content", section: `Category ${i}` }),
      c({ key: `c${i}Href`, label: `Category ${i} link`, type: "text", tab: "content", section: `Category ${i}` }),
    ]),
  ],
  store_locator: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Stores" }),
    ...[1, 2, 3].flatMap((i) => [
      c({ key: `s${i}Name`, label: `Store ${i} name`, type: "text", tab: "content", section: `Store ${i}` }),
      c({ key: `s${i}Address`, label: `Store ${i} address`, type: "textarea", tab: "content", section: `Store ${i}` }),
      c({ key: `s${i}Hours`, label: `Store ${i} hours`, type: "text", tab: "content", section: `Store ${i}` }),
      c({ key: `s${i}Phone`, label: `Store ${i} phone`, type: "text", tab: "content", section: `Store ${i}` }),
    ]),
  ],
  ugc_gallery: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Gallery" }),
    c({ key: "limit", label: "Max tiles (2-12)", type: "number", tab: "content", section: "Gallery", min: 2, max: 12 }),
    c({ key: "collection", label: "Collection handle", type: "text", tab: "content", section: "Gallery" }),
    c({ key: "note", label: "Caption", type: "textarea", tab: "content", section: "Gallery" }),
  ],
  trade_in: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Trade-in" }),
    c({ key: "body", label: "Body", type: "textarea", tab: "content", section: "Trade-in" }),
    c({ key: "buttonLabel", label: "Button label", type: "text", tab: "content", section: "Trade-in" }),
    c({ key: "pendingText", label: "Confirmation text", type: "text", tab: "content", section: "Trade-in" }),
    c({ key: "consentText", label: "Consent text", type: "text", tab: "content", section: "Trade-in" }),
  ],
  combo_card: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Combo" }),
    c({ key: "body", label: "Body", type: "textarea", tab: "content", section: "Combo" }),
    c({ key: "buttonLabel", label: "Button label", type: "text", tab: "content", section: "Combo" }),
    c({ key: "note", label: "Note", type: "text", tab: "content", section: "Combo" }),
    c({ key: "collection", label: "Pack collection handle", type: "text", tab: "content", section: "Combo" }),
    c({ key: "limit", label: "Items shown (2-6)", type: "number", tab: "content", section: "Combo", min: 2, max: 6 }),
    ...[1, 2, 3, 4].map((i) =>
      c({ key: `i${i}VariantId`, label: `Item ${i} variant ID`, type: "text", tab: "content", section: `Item ${i}` }),
    ),
  ],
  loyalty_strip: [
    c({ key: "label", label: "Label", type: "text", tab: "content", section: "Loyalty" }),
    c({ key: "handle", label: "Product handle", type: "text", tab: "content", section: "Loyalty" }),
  ],
  warranty_panel: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Warranty" }),
    c({ key: "months", label: "Warranty months (0-120)", type: "number", tab: "content", section: "Warranty", min: 0, max: 120 }),
    c({ key: "coverage", label: "Coverage", type: "textarea", tab: "content", section: "Warranty" }),
    c({ key: "official", label: "Official import", type: "switch", tab: "content", section: "Warranty" }),
    c({ key: "officialLabel", label: "Official label", type: "text", tab: "content", section: "Warranty" }),
    c({ key: "parallelLabel", label: "Parallel label", type: "text", tab: "content", section: "Warranty" }),
    ...[1, 2, 3].flatMap((i) => [
      c({ key: `s${i}Name`, label: `Centre ${i} name`, type: "text", tab: "content", section: `Centre ${i}` }),
      c({ key: `s${i}Address`, label: `Centre ${i} address`, type: "text", tab: "content", section: `Centre ${i}` }),
    ]),
  ],
  before_after: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Gallery" }),
    c({ key: "beforeImage", label: "Before image", type: "text", tab: "content", section: "Before" }),
    c({ key: "beforeAlt", label: "Before alt", type: "text", tab: "content", section: "Before" }),
    c({ key: "beforeLabel", label: "Before label", type: "text", tab: "content", section: "Before" }),
    c({ key: "afterImage", label: "After image", type: "text", tab: "content", section: "After" }),
    c({ key: "afterAlt", label: "After alt", type: "text", tab: "content", section: "After" }),
    c({ key: "afterLabel", label: "After label", type: "text", tab: "content", section: "After" }),
    c({ key: "disclaimer", label: "Disclaimer", type: "textarea", tab: "content", section: "Gallery" }),
  ],
  refill_widget: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Refill" }),
    c({ key: "body", label: "Body", type: "textarea", tab: "content", section: "Refill" }),
    ...[1, 2, 3].flatMap((i) => [
      c({ key: `c${i}Label`, label: `Cadence ${i}`, type: "text", tab: "content", section: `Cadence ${i}` }),
      c({ key: `c${i}Value`, label: `Cadence ${i} days`, type: "text", tab: "content", section: `Cadence ${i}` }),
    ]),
    c({ key: "buttonLabel", label: "Button label", type: "text", tab: "content", section: "Refill" }),
    c({ key: "handle", label: "Refill product handle", type: "text", tab: "content", section: "Refill" }),
  ],
  quick_view: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Quick view" }),
    c({ key: "buttonLabel", label: "Button label", type: "text", tab: "content", section: "Quick view" }),
    c({ key: "limit", label: "Max products", type: "number", tab: "content", section: "Quick view", min: 1, max: 24 }),
  ],
  department_strip: [
    c({ key: "heading", label: "Heading", type: "text", tab: "content", section: "Departments" }),
    c({ key: "limit", label: "Max departments", type: "number", tab: "content", section: "Departments", min: 1, max: 24 }),
  ],
  columns: [
    c({ key: "columns", label: "Columns (1-4)", type: "number", tab: "content", section: "Layout", min: 1, max: 4 }),
    c({ key: "gap", label: "Gap in px (0-64)", type: "number", tab: "content", section: "Layout", min: 0, max: 64 }),
    c({ key: "padY", label: "Vertical padding in px (0-160)", type: "number", tab: "content", section: "Spacing", min: 0, max: 160 }),
    c({ key: "maxW", label: "Width", type: "select", tab: "content", section: "Layout", options: [{ value: "container", label: "Container" }, { value: "narrow", label: "Narrow" }, { value: "full", label: "Full width" }] }),
    c({ key: "align", label: "Alignment", type: "select", tab: "content", section: "Layout", options: [{ value: "left", label: "Left" }, { value: "center", label: "Centre" }] }),
    c({ key: "bg", label: "Background", type: "select", tab: "content", section: "Style", options: [{ value: "none", label: "None" }, { value: "surface", label: "Surface" }, { value: "muted", label: "Muted" }] }),
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

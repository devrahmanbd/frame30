import { songoskritiPreviewSource } from "./src/lib/themes/songoskriti/preview.js";
import { assemblePreviewTemplates } from "./src/lib/theme-preview-nav.js";

const source = songoskritiPreviewSource();
const templates = assemblePreviewTemplates(source);

console.log(JSON.stringify(templates.product, null, 2));

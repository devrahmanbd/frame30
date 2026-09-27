import { songoskritiPreviewSource } from "./src/lib/themes/songoskriti/preview.js";
import { assemblePreviewTemplates } from "./src/lib/theme-preview-nav.js";

const source = songoskritiPreviewSource();
const templates = assemblePreviewTemplates(source);

console.log("product main length:", templates.product.main.length);
console.log("collection main length:", templates.collection.main.length);
console.log("product main type:", templates.product.main[0].type);
console.log("collection main type:", templates.collection.main[0].type);

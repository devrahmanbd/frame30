import type { ThemeTemplates } from "../builder-ast";

export interface MerchantAdaptData {
  name: string;
  nameBn?: string | null;
  supportEmail?: string | null;
  supportPhone?: string | null;
  locations?: Array<{ name: string; slug?: string }> | null;
}

function adaptText(
  text: string,
  merchant: MerchantAdaptData,
  isBn: boolean,
): string {
  let s = text;
  if (isBn) {
    s = s.replaceAll("সংস্কৃতি", merchant.nameBn || merchant.name);
  }
  s = s.replaceAll("Songoskriti", merchant.name);

  // If text contains newline or contact/location strings, process line-by-line
  if (
    s.includes("\n") ||
    s.includes("care@songoskriti.com") ||
    s.includes("+880 96 1234 5678") ||
    s.includes("Flagship") ||
    s.includes("ফ্ল্যাগশিপ") ||
    s.includes("Uttara") ||
    s.includes("উত্তরা") ||
    s.includes("Gulshan") ||
    s.includes("গুলশান") ||
    s.includes("Chattogram") ||
    s.includes("চট্টগ্রাম") ||
    s.includes("Support: 10AM - 9PM") ||
    s.includes("সাপোর্ট: সকাল ১০টা - রাত ৯টা")
  ) {
    const lines = s.split("\n");
    const filteredLines: string[] = [];

    for (const line of lines) {
      // Email
      if (line.includes("care@songoskriti.com")) {
        if (merchant.supportEmail) {
          filteredLines.push(
            isBn
              ? `ইমেইল: ${merchant.supportEmail}|mailto:${merchant.supportEmail}`
              : `Email: ${merchant.supportEmail}|mailto:${merchant.supportEmail}`,
          );
        }
        continue;
      }

      // Phone
      if (
        line.includes("+880 96 1234 5678") ||
        line.includes("+৮৮০ ৯৬ ১২৩৪ ৫৬৭৮")
      ) {
        if (merchant.supportPhone) {
          filteredLines.push(
            isBn
              ? `ফোন: ${merchant.supportPhone}|/pages/contact`
              : `Phone: ${merchant.supportPhone}|/pages/contact`,
          );
        }
        continue;
      }

      // Flagships / store locations
      if (
        line.includes("Flagship") ||
        line.includes("ফ্ল্যাগশিপ") ||
        line.includes("Uttara") ||
        line.includes("উত্তরা") ||
        line.includes("Gulshan") ||
        line.includes("গুলশান") ||
        line.includes("Chattogram") ||
        line.includes("চট্টগ্রাম")
      ) {
        if (merchant.locations && merchant.locations.length > 0) {
          filteredLines.push(
            isBn
              ? `শাখা: ${merchant.locations.map((l) => l.name).join(" · ")}`
              : `Stores: ${merchant.locations.map((l) => l.name).join(" · ")}`,
          );
        }
        continue;
      }

      // Support line
      if (
        line.includes("Support: 10AM - 9PM") ||
        line.includes("সাপোর্ট: সকাল ১০টা - রাত ৯টা")
      ) {
        if (merchant.supportPhone || merchant.supportEmail) {
          filteredLines.push(line);
        }
        continue;
      }

      filteredLines.push(line);
    }

    return filteredLines.join("\n");
  }

  return s;
}

function adaptValue(
  val: unknown,
  merchant: MerchantAdaptData,
  key?: string,
): unknown {
  if (typeof val === "string") {
    const isBn = Boolean(key && key.endsWith("_bn"));
    return adaptText(val, merchant, isBn);
  }
  if (Array.isArray(val)) {
    return val.map((v) => adaptValue(v, merchant, key));
  }
  if (val && typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      out[k] = adaptValue(v, merchant, k);
    }
    return out;
  }
  return val;
}

function adaptSection(
  section: any,
  merchant: MerchantAdaptData,
  templateKey: string,
): any | null {
  if (!section || typeof section !== "object") return section;

  // Drop sample copy rich_text on product template
  if (templateKey === "product" && section.type === "rich_text") {
    const body = section.props?.body;
    if (
      typeof body === "string" &&
      (body.includes("Sample product page — prices and stock are sample data") ||
        body.includes("ordering is disabled in the preview"))
    ) {
      return null;
    }
  }

  // Drop empty rich_text colophons when unconfigured
  if (section.type === "rich_text") {
    const body = section.props?.body;
    if (typeof body === "string") {
      const adapted = adaptText(body, merchant, false);
      if (!adapted.trim()) {
        return null;
      }
    }
  }

  const props = section.props
    ? (adaptValue(section.props, merchant) as Record<string, unknown>)
    : undefined;
  const children = Array.isArray(section.children)
    ? section.children
        .map((c: any) => adaptSection(c, merchant, templateKey))
        .filter((c: any) => c !== null)
    : undefined;

  return {
    ...section,
    ...(props ? { props } : {}),
    ...(children ? { children } : {}),
  };
}

export function adaptThemeTemplatesForMerchant(
  templates: ThemeTemplates,
  merchant: MerchantAdaptData,
): ThemeTemplates {
  const result: ThemeTemplates = {};

  for (const [templateKey, ast] of Object.entries(templates)) {
    if (!ast || typeof ast !== "object") {
      result[templateKey] = ast;
      continue;
    }

    const adaptSectionList = (list: any[]) =>
      Array.isArray(list)
        ? list
            .map((s) => adaptSection(s, merchant, templateKey))
            .filter((s) => s !== null)
        : [];

    result[templateKey] = {
      header: adaptSectionList(ast.header),
      main: adaptSectionList(ast.main),
      footer: adaptSectionList(ast.footer),
    };
  }

  return result;
}

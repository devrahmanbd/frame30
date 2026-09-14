/**
 * Phase 12 — markdown bridge for storefront pages.
 *
 * Pages have always been stored as markdown (`storefront_pages.body_markdown`),
 * while posts use the sanitised block markup in `blog-body.ts`. The shared
 * Classic editor edits *blocks*, so pages need a lossless-enough round trip:
 *
 *   markdown ──markdownToBlocks──▶ Block[] ──blocksToMarkdown──▶ markdown
 *
 * The subset is deliberate and matches what the editor toolbar can produce:
 * headings (`##`–`####`), paragraphs, bullet / numbered lists, block quotes,
 * fenced code, horizontal rules, images, tables and the `<!--more-->` split.
 * Inline: **strong**, *em*, `code`, ~~strike~~, <u>underline</u> and links.
 *
 * Everything still flows through `parseInline`, so a page body can never carry
 * markup the block model does not allow — the storefront renderer relies on it.
 */
import {
  blockToHtml,
  inlineToHtml,
  parseInline,
  type Block,
  type HeadingLevel,
  type Inline,
  type TextAlign,
} from "@/lib/blog-body";

/* ---------------------------------------------------------- inline: md → html */

const ESCAPE: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };

/**
 * Convert one markdown inline run to the allow-listed HTML `parseInline`
 * understands. Raw `<u>`/`<s>`/`<br>` tags are the only HTML we let through,
 * and they survive only because the sanitiser knows them.
 */
export function inlineMarkdownToHtml(source: string): string {
  const kept: string[] = [];
  let text = source.replace(/<\/?(u|s|br)\s*\/?>/gi, (tag) => {
    kept.push(tag);
    return `\u0000${kept.length - 1}\u0000`;
  });
  text = text.replace(/[&<>]/g, (c) => ESCAPE[c] ?? c);
  // Code spans first so their contents are never re-interpreted.
  text = text.replace(/`([^`\n]+)`/g, (_m, code: string) => `<code>${code}</code>`);
  text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_m, alt: string) => alt);
  text = text.replace(
    /\[([^\]]{1,200})\]\(([^)\s]{1,2048})(?:\s+"[^"]*")?\)/g,
    (_m, label: string, href: string) => `<a href="${href.replace(/"/g, "&quot;")}">${label}</a>`,
  );
  text = text.replace(/\*\*([^*]+?)\*\*/g, "<strong>$1</strong>");
  text = text.replace(/__([^_]+?)__/g, "<strong>$1</strong>");
  text = text.replace(/~~([^~]+?)~~/g, "<s>$1</s>");
  text = text.replace(/(^|[^*\w])\*([^*\n]+?)\*(?!\w)/g, "$1<em>$2</em>");
  text = text.replace(/(^|[^_\w])_([^_\n]+?)_(?!\w)/g, "$1<em>$2</em>");
  text = text.replace(/ {2,}\n/g, "<br />");
  text = text.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => kept[Number(i)] ?? "");
  return text;
}

/* ---------------------------------------------------------- inline: html → md */

function escapeMd(value: string): string {
  return value.replace(/([\\`*_~[\]])/g, "\\$1");
}

export function inlineToMarkdown(nodes: Inline[]): string {
  return nodes
    .map((node) => {
      switch (node.t) {
        case "text":
          return escapeMd(node.v);
        case "br":
          return "  \n";
        case "strong":
          return `**${inlineToMarkdown(node.c)}**`;
        case "em":
          return `*${inlineToMarkdown(node.c)}*`;
        case "code":
          return `\`${node.c.map((n) => (n.t === "text" ? n.v : "")).join("")}\``;
        case "s":
          return `~~${inlineToMarkdown(node.c)}~~`;
        case "u":
          return `<u>${inlineToMarkdown(node.c)}</u>`;
        case "link":
          return `[${inlineToMarkdown(node.c)}](${node.href})`;
      }
    })
    .join("");
}

/* --------------------------------------------------------------- md → blocks */

const ALIGN_OPEN = /^<!--\s*align:(center|right)\s*-->\s*/i;

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableDivider(line: string): boolean {
  return /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line);
}

export function markdownToBlocks(markdown: string): Block[] {
  const lines = (markdown ?? "").replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;

  const inline = (raw: string): Inline[] => parseInline(inlineMarkdownToHtml(raw));

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    // <!--more-->
    if (/^<!--\s*more\s*-->$/i.test(trimmed)) {
      blocks.push({ type: "more" });
      index += 1;
      continue;
    }

    // Fenced code
    const fence = /^```([a-z0-9+#-]{0,20})\s*$/i.exec(trimmed);
    if (fence) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !/^```\s*$/.test(lines[index] ?? "")) {
        code.push(lines[index] ?? "");
        index += 1;
      }
      index += 1; // closing fence
      blocks.push({ type: "code", lang: (fence[1] ?? "").toLowerCase(), code: code.join("\n") });
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      index += 1;
      continue;
    }

    // Alignment marker + heading / paragraph
    let align: TextAlign | undefined;
    let content = trimmed;
    const alignMatch = ALIGN_OPEN.exec(content);
    if (alignMatch) {
      align = alignMatch[1]!.toLowerCase() as TextAlign;
      content = content.slice(alignMatch[0].length);
    }

    // Heading
    const heading = /^(#{1,6})\s+(.*?)\s*#*$/.exec(content);
    if (heading) {
      // `#` is reserved for the page title, so it renders as an h2 like `##`.
      const level = Math.min(Math.max(heading[1]!.length, 2), 4) as HeadingLevel;
      const nodes = inline(heading[2] ?? "");
      if (nodes.length)
        blocks.push({ type: "heading", level, inline: nodes, ...(align ? { align } : {}) });
      index += 1;
      continue;
    }

    // Image on its own line
    const image = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/.exec(content);
    if (image) {
      const src = image[2] ?? "";
      const dims = /#(\d+)x(\d+)$/.exec(src);
      blocks.push({
        type: "image",
        src: dims ? src.slice(0, -dims[0].length) : src,
        alt: image[1] ?? "",
        width: dims ? Number(dims[1]) : 0,
        height: dims ? Number(dims[2]) : 0,
        caption: image[3] ?? "",
      });
      index += 1;
      continue;
    }

    // Block quote
    if (/^>\s?/.test(content)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index] ?? "")) {
        quote.push((lines[index] ?? "").replace(/^\s*>\s?/, ""));
        index += 1;
      }
      const nodes = inline(quote.join(" "));
      if (nodes.length) blocks.push({ type: "quote", inline: nodes });
      continue;
    }

    // Lists
    const bullet = /^[-*+]\s+/;
    const ordered = /^\d+[.)]\s+/;
    if (bullet.test(content) || ordered.test(content)) {
      const isOrdered = ordered.test(content);
      const marker = isOrdered ? ordered : bullet;
      const items: Inline[][] = [];
      while (index < lines.length) {
        const current = (lines[index] ?? "").trim();
        if (!marker.test(current)) break;
        const nodes = inline(current.replace(marker, ""));
        if (nodes.length) items.push(nodes);
        index += 1;
      }
      if (items.length) blocks.push({ type: "list", ordered: isOrdered, items });
      continue;
    }

    // Table: header row + divider
    if (content.includes("|") && isTableDivider(lines[index + 1] ?? "")) {
      const head = splitTableRow(content).map(inline);
      index += 2;
      const rows: Inline[][][] = [];
      while (
        index < lines.length &&
        (lines[index] ?? "").includes("|") &&
        (lines[index] ?? "").trim()
      ) {
        rows.push(splitTableRow(lines[index] ?? "").map(inline));
        index += 1;
      }
      blocks.push({ type: "table", head, rows });
      continue;
    }

    // Paragraph: consecutive non-blank, non-block lines
    const para: string[] = [content];
    index += 1;
    while (index < lines.length) {
      const next = (lines[index] ?? "").trim();
      if (
        !next ||
        /^#{1,6}\s/.test(next) ||
        /^```/.test(next) ||
        /^>\s?/.test(next) ||
        bullet.test(next) ||
        ordered.test(next) ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(next) ||
        /^<!--/.test(next)
      )
        break;
      para.push(next);
      index += 1;
    }
    const nodes = inline(para.join("\n"));
    if (nodes.length)
      blocks.push({ type: "paragraph", inline: nodes, ...(align ? { align } : {}) });
  }

  return blocks;
}

/* --------------------------------------------------------------- blocks → md */

function alignPrefix(align: TextAlign | undefined): string {
  return align && align !== "left" ? `<!-- align:${align} -->\n` : "";
}

export function blocksToMarkdown(blocks: Block[]): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case "paragraph":
          return alignPrefix(block.align) + inlineToMarkdown(block.inline);
        case "heading":
          return (
            alignPrefix(block.align) +
            `${"#".repeat(block.level)} ${inlineToMarkdown(block.inline)}`
          );
        case "list":
          return block.items
            .map((item, i) => `${block.ordered ? `${i + 1}.` : "-"} ${inlineToMarkdown(item)}`)
            .join("\n");
        case "quote":
          return `> ${inlineToMarkdown(block.inline).replace(/\n/g, "\n> ")}`;
        case "code":
          return `\`\`\`${block.lang}\n${block.code}\n\`\`\``;
        case "hr":
          return "---";
        case "image": {
          const size = block.width && block.height ? `#${block.width}x${block.height}` : "";
          const caption = block.caption ? ` "${block.caption.replace(/"/g, "'")}"` : "";
          return `![${block.alt.replace(/\]/g, "")}](${block.src}${size}${caption})`;
        }
        case "table": {
          const width = Math.max(block.head.length, ...block.rows.map((r) => r.length), 1);
          const row = (cells: Inline[][]) =>
            `| ${Array.from({ length: width }, (_, i) => inlineToMarkdown(cells[i] ?? []).replace(/\|/g, "\\|")).join(" | ")} |`;
          const divider = `| ${Array.from({ length: width }, () => "---").join(" | ")} |`;
          return [row(block.head), divider, ...block.rows.map(row)].join("\n");
        }
        case "more":
          return "<!--more-->";
      }
    })
    .join("\n\n");
}

/* ----------------------------------------------------------- html rendering */

/** Storefront-safe HTML for a markdown page body. */
export function renderMarkdownBlocks(markdown: string): string {
  return markdownToBlocks(markdown).map(blockToHtml).join("\n");
}

/** Plain text for word counts / SEO analysis. */
export function markdownToText(markdown: string): string {
  return markdownToBlocks(markdown)
    .map((block) => {
      if ("inline" in block) return inlineToHtml(block.inline).replace(/<[^>]+>/g, "");
      if (block.type === "list")
        return block.items.map((i) => inlineToHtml(i).replace(/<[^>]+>/g, "")).join(" ");
      if (block.type === "code") return block.code;
      if (block.type === "image") return block.alt;
      return "";
    })
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

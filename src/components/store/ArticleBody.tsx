/**
 * Phase 1 — storefront rendering of an article body.
 *
 * The body is stored as sanitised block markup, but we still do not hand it to
 * `dangerouslySetInnerHTML`: rows predating the block model exist, and a single
 * future bug in the sanitiser would become stored XSS on every storefront. So
 * the reader path re-parses into the model and renders React elements. That is
 * belt *and* braces, costs nothing at render time, and ships zero client JS —
 * this component is SSR-only output with no hooks and no interactivity.
 */
import { Fragment } from "react";
import type { Block, Inline } from "@/lib/blog-body";
import { parseBody } from "@/lib/blog-body";
import { articleHeadingIds } from "@/lib/blog-reader";
import { isBuilderBody, parseBuilderBody, renderBuilderHtml } from "@/lib/page-builder";

function renderInline(nodes: Inline[]): React.ReactNode {
  return nodes.map((node, index) => {
    switch (node.t) {
      case "text":
        return <Fragment key={index}>{node.v}</Fragment>;
      case "br":
        return <br key={index} />;
      case "strong":
        return <strong key={index}>{renderInline(node.c)}</strong>;
      case "em":
        return <em key={index}>{renderInline(node.c)}</em>;
      case "code":
        return (
          <code key={index} className="rounded bg-muted px-1 py-0.5 text-[0.9em]">
            {renderInline(node.c)}
          </code>
        );
      case "link": {
        const external = /^https?:/i.test(node.href);
        return (
          <a
            key={index}
            href={node.href}
            className="text-primary underline"
            {...(external ? { rel: "noopener nofollow ugc", target: "_blank" } : {})}
          >
            {renderInline(node.c)}
          </a>
        );
      }
    }
  });
}

function renderBlock(block: Block, key: number, headingAnchor?: string): React.ReactNode {
  switch (block.type) {
    case "paragraph":
      return <p key={key}>{renderInline(block.inline)}</p>;
    case "heading": {
      const Tag = `h${block.level}` as "h2" | "h3" | "h4";
      const size = block.level === 2 ? "text-2xl" : block.level === 3 ? "text-xl" : "text-lg";
      return (
        <Tag id={headingAnchor} key={key} className={`scroll-mt-24 mt-8 font-semibold ${size}`}>
          {renderInline(block.inline)}
        </Tag>
      );
    }
    case "list":
      return block.ordered ? (
        <ol key={key} className="ml-6 list-decimal space-y-1">
          {block.items.map((item, index) => (
            <li key={index}>{renderInline(item)}</li>
          ))}
        </ol>
      ) : (
        <ul key={key} className="ml-6 list-disc space-y-1">
          {block.items.map((item, index) => (
            <li key={index}>{renderInline(item)}</li>
          ))}
        </ul>
      );
    case "quote":
      return (
        <blockquote key={key} className="border-l-2 border-border pl-4 italic text-muted-foreground">
          <p>{renderInline(block.inline)}</p>
        </blockquote>
      );
    case "code":
      return (
        <pre key={key} className="overflow-x-auto rounded-fq-md bg-muted p-3 text-xs">
          <code>{block.code}</code>
        </pre>
      );
    case "hr":
      return <hr key={key} className="border-border" />;
    case "image":
      return (
        <figure key={key} className="space-y-2">
          <img
            src={block.src}
            alt={block.alt}
            width={block.width || undefined}
            height={block.height || undefined}
            loading="lazy"
            decoding="async"
            className="h-auto w-full rounded-fq-md border border-border"
          />
          {block.caption && <figcaption className="text-sm text-muted-foreground">{block.caption}</figcaption>}
        </figure>
      );
    case "table":
      return (
        <div key={key} className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            {block.head.length > 0 && (
              <thead>
                <tr>
                  {block.head.map((cell, index) => (
                    <th key={index} scope="col" className="border border-border px-2 py-1 text-left">
                      {renderInline(cell)}
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex} className="border border-border px-2 py-1">
                      {renderInline(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "more":
      // The split marker is an authoring concept; readers see the whole post.
      return null;
  }
}

export function ArticleBody({ body, className = "" }: { body: string; className?: string }) {
  // Phase 17: a post authored in the page builder stores its document in the
  // same column; the builder renderer escapes every author value it prints.
  const builderDoc = isBuilderBody(body) ? parseBuilderBody(body) : null;
  if (builderDoc)
    return (
      <div
        className={`fq-builder-page ${className}`}
        dangerouslySetInnerHTML={{ __html: renderBuilderHtml(builderDoc) }}
      />
    );
  const blocks = parseBody(body);
  const headingIds = articleHeadingIds(blocks);
  return <div className={`space-y-4 text-base leading-relaxed ${className}`}>{blocks.map((block, index) => renderBlock(block, index, headingIds.get(index)))}</div>;
}

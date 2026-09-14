import { CodeBlock } from "@/components/docs/CodeBlock";
import { EndpointTable } from "@/components/docs/EndpointTable";
import { TryItPanel } from "@/components/docs/TryItPanel";
import { anchorsByBlock, type DocPage } from "@/lib/docs";

/**
 * Renders the structured block tree.
 *
 * The tree is the single source: the TOC, the search index and this renderer
 * all walk the same blocks, so an anchor in the sidebar always exists in the
 * page. Every H2/H3 gets a deep-link anchor with a visible, keyboard-reachable
 * "link to this section" control — hover-only anchors are unusable on touch.
 */
export function DocBlocks({ page }: { page: DocPage }) {
  const anchors = anchorsByBlock(page);

  return (
    <>
      {page.blocks.map((block, index) => {
        switch (block.kind) {
          case "h": {
            const anchor = anchors.get(index) ?? `section-${index}`;
            const Tag = block.level === 2 ? "h2" : "h3";
            return (
              <Tag
                key={index}
                id={anchor}
                className={
                  block.level === 2
                    ? "group mt-12 scroll-mt-24 font-bangla-display text-2xl font-bold"
                    : "group mt-8 scroll-mt-24 text-lg font-semibold"
                }
              >
                {block.text}
                <a
                  href={`#${anchor}`}
                  aria-label={`Link to section: ${block.text}`}
                  className="ml-2 text-muted-foreground opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
                >
                  #
                </a>
              </Tag>
            );
          }
          case "p":
            return (
              <p key={index} className="mt-4 leading-relaxed text-foreground/90">
                {block.text}
              </p>
            );
          case "list":
            return block.ordered ? (
              <ol key={index} className="mt-4 list-decimal space-y-2 pl-6 text-foreground/90">
                {block.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ol>
            ) : (
              <ul key={index} className="mt-4 list-disc space-y-2 pl-6 text-foreground/90">
                {block.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            );
          case "code":
            return (
              <CodeBlock
                key={index}
                code={block.code}
                lang={block.lang}
                {...(block.caption ? { caption: block.caption } : {})}
              />
            );
          case "table":
            return (
              <div key={index} className="my-6 overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  {block.caption && (
                    <caption className="mb-2 text-left text-xs uppercase tracking-wide text-muted-foreground">
                      {block.caption}
                    </caption>
                  )}
                  <thead>
                    <tr className="border-b border-border text-left">
                      {block.head.map((cell, i) => (
                        <th key={i} scope="col" className="py-2 pr-4 font-semibold">
                          {cell}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, r) => (
                      <tr key={r} className="border-b border-border/60 align-top">
                        {row.map((cell, c) => (
                          <td key={c} className="py-2 pr-4 tabular-nums">
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "note":
            return (
              <aside
                key={index}
                role="note"
                className={
                  block.tone === "warn"
                    ? "my-6 rounded-fq-md border-l-4 border-warning bg-warning-soft p-4 text-sm text-warning-foreground"
                    : "my-6 rounded-fq-md border-l-4 border-info bg-info-soft p-4 text-sm"
                }
              >
                {block.text}
              </aside>
            );
          case "endpoints":
            return <EndpointTable key={index} />;
          case "tryit":
            return <TryItPanel key={index} routeKey={block.route} />;
          default:
            return null;
        }
      })}
    </>
  );
}

/**
 * Oceanblue-v2 wiring (Tasks 3–5, grown per task).
 *
 * Part 1 (Task 3): header/footer chrome asserts.
 * Part 2 (Task 4): homepage asserts (appended).
 * Part 3 (Task 5): secondary template asserts (appended).
 */
import { describe, expect, it } from "vitest";
import type { PropValue, Section, SectionType } from "../../builder-ast";
import { buildFooterMain } from "./footer";
import { buildHeaderMain } from "./header";

type Stub = (type: SectionType, props?: Record<string, PropValue>) => Section;

const stub: Stub = (type, props = {}) => ({
  id: `${type}-1`,
  type,
  props: { ...props },
});

describe("oceanblue-v2 header chrome", () => {
  it("emits one dismissible rotating announcement_bar with _bn twins", () => {
    const header = buildHeaderMain(stub);
    const bars = header.filter((s) => s.type === "announcement_bar");
    expect(bars).toHaveLength(1);
    const props = bars[0]!.props;
    expect(props.dismissible).toBe(true);
    expect(typeof props.rotateMs).toBe("number");
    expect(props.m1).toBeTruthy();
    expect(props.m1_bn).toBeTruthy();
    const items = props.items as Array<Record<string, unknown>>;
    expect(items.length).toBeGreaterThanOrEqual(2);
    for (const item of items) {
      expect(item.text).toBeTruthy();
      expect(item.text_bn).toBeTruthy();
    }
  });

  it("has no dead links anywhere in the header", () => {
    const header = buildHeaderMain(stub);
    expect(JSON.stringify(header)).not.toContain('href="#"');
    expect(JSON.stringify(header)).not.toContain('"#"');
  });
});

describe("oceanblue-v2 footer chrome", () => {
  it("emits sitemap + payments + about colophon, never a newsletter", () => {
    const footer = buildFooterMain(stub);
    const types = footer.map((s) => s.type);
    expect(types).toContain("footer_sitemap");
    expect(types).toContain("payment_icons");
    expect(types).toContain("rich_text");
    expect(types).not.toContain("newsletter");
  });

  it("has no dead links or dead socials anywhere in the footer", () => {
    const footer = buildFooterMain(stub);
    const raw = JSON.stringify(footer);
    expect(raw).not.toContain('href="#"');
    expect(raw).not.toContain('"#"');
  });

  it("carries bilingual twins on shopper-facing footer strings", () => {
    const footer = buildFooterMain(stub);
    const sitemap = footer.find((s) => s.type === "footer_sitemap")!;
    expect(sitemap.props.statementHeading).toBeTruthy();
    expect(sitemap.props.statementHeading_bn).toBeTruthy();
    expect(sitemap.props.c1Title).toBeTruthy();
    expect(sitemap.props.c1Title_bn).toBeTruthy();
  });
});

---
name: seo-audit
description: When the user wants to audit, review, or diagnose SEO issues. Also use when the user mentions "SEO audit," "technical SEO," "why am I not ranking," "SEO issues," "on-page SEO," "meta tags review," or "SEO health check."
---

# SEO Audit

Expert in search engine optimization. Identify SEO issues and provide actionable recommendations.

## Audit Framework (Priority Order)

1. **Crawlability & Indexation** – Can Google find and index it?
2. **Technical Foundations** – Is the site fast and functional?
3. **On-Page Optimization** – Is content optimized?
4. **Content Quality & E-E-A-T** – Does it deserve to rank?
5. **Authority & Links** – Does it have credibility?

## Technical SEO Checklist

### Crawlability
- Robots.txt doesn't block important paths
- XML sitemap exists, accessible, contains canonical URLs
- Important pages within ~3 clicks of homepage
- No orphan pages

### Indexation
- `site:domain.com` shows expected pages
- No incorrect `noindex` on key pages
- Canonical tags correct (self-referencing, HTTPS consistent)
- No redirect chains/loops

### Core Web Vitals
- LCP < 2.5s
- INP < 200ms
- CLS < 0.1

### Mobile
- Responsive design
- Tap target sizing (44x44px min)
- Same content as desktop

## On-Page SEO

### Title Tags
- Unique per page
- Primary keyword near beginning
- 50-60 characters
- Compelling and click-worthy

### Meta Descriptions
- Unique per page
- 150-160 characters
- Includes primary keyword
- Clear value proposition

### Heading Structure
- One H1 per page
- H1 contains primary keyword
- Logical hierarchy (H1 → H2 → H3)
- Never skip heading levels

### Content
- Keyword in first 100 words
- Sufficient depth for topic
- Answers search intent
- Not competing with other internal pages

## Output Format

For each issue provide:
- **Issue**: What's wrong
- **Impact**: High / Medium / Low
- **Evidence**: How you found it
- **Fix**: Specific recommendation
- **Priority**: 1-5

Then provide a **Prioritized Action Plan**: Critical blockers → High-impact → Quick wins → Long-term.

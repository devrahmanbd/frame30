---
name: schema-markup
description: When the user wants to add, fix, or optimize schema markup and structured data. Also use when the user mentions "schema markup," "structured data," "JSON-LD," "rich snippets," "schema.org," "FAQ schema," "product schema," "review schema," or "breadcrumb schema."
---

# Schema Markup

Expert in structured data and schema.org markup. Implement JSON-LD that helps search engines understand content and enables rich results.

## Core Principles

1. **Accuracy First** – Schema must accurately represent page content
2. **Use JSON-LD** – Google-recommended format, easier to maintain
3. **Follow Google's Guidelines** – Only use markup Google supports
4. **Validate Everything** – Test before deploying

## Common Schema Types

### Article / BlogPosting
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Page Title",
  "image": "https://example.com/image.jpg",
  "datePublished": "2024-01-15T08:00:00+00:00",
  "author": { "@type": "Person", "name": "Jane Doe" },
  "publisher": { "@type": "Organization", "name": "Example Co" }
}
```

### Product
```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Product Name",
  "image": "https://example.com/product.jpg",
  "offers": {
    "@type": "Offer",
    "priceCurrency": "USD",
    "price": "99.99",
    "availability": "https://schema.org/InStock"
  },
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "4.8",
    "reviewCount": "127"
  }
}
```

### FAQPage
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is schema markup?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Schema markup is a structured data vocabulary..."
      }
    }
  ]
}
```

### Organization
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Example Company",
  "url": "https://example.com",
  "logo": "https://example.com/logo.png",
  "sameAs": ["https://twitter.com/example", "https://linkedin.com/company/example"]
}
```

### BreadcrumbList
```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://example.com" },
    { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://example.com/blog" }
  ]
}
```

### SoftwareApplication
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Example App",
  "applicationCategory": "BusinessApplication",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" }
}
```

## Validation

- **Google Rich Results Test**: https://search.google.com/test/rich-results
- **Schema.org Validator**: https://validator.schema.org/

## Implementation (Next.js)
```jsx
<script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(schema) }} />
```

## Common Errors
- Missing required properties
- Invalid values (dates must be ISO 8601)
- Schema doesn't match visible page content

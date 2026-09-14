/**
 * Phase 12.6 — Omnichannel Support Transcript & Audit Export Engine
 *
 * Provides structured, compliance-grade exports of moderated support conversations
 * in Markdown, JSONL, and CSV formats, with optional PII redaction.
 * Adheres to docs/10-ai-support §7 & docs/13-export-sdk.
 */

import { redactPii } from "./support-guardrails";
import { computeSlaMetrics } from "./support-sla";

export type ExportFormat = "markdown" | "jsonl" | "csv";

export type ExportOptions = {
  redactPii?: boolean;
  includeInternalNotes?: boolean;
};

export type ExportConversationMetadata = {
  id: string;
  merchantId: string;
  merchantName?: string | null;
  channel: string;
  status: string;
  takeoverMode?: string | null;
  priority?: string | null;
  orderNumber?: string | null;
  createdAt: string;
  lastCustomerMessageAt?: string | null;
  lastOperatorMessageAt?: string | null;
  resolvedAt?: string | null;
  assignedOperatorId?: string | null;
  operatorNotes?: string | null;
};

export type ExportMessageItem = {
  id: string;
  role: string;
  body: string;
  createdAt: string;
  isInternalNote?: boolean;
  sentByOperatorId?: string | null;
};

/**
 * Format conversation transcript as Markdown.
 */
export function exportToMarkdown(
  rawConv: ExportConversationMetadata | Record<string, unknown>,
  rawMessages: (ExportMessageItem | Record<string, unknown>)[],
  options: ExportOptions = {},
): string {
  const conv = normalizeConv(rawConv);
  const messages = rawMessages.map(normalizeMessage);

  const sla = computeSlaMetrics({
    priority: conv.priority,
    createdAt: conv.createdAt,
    lastCustomerMessageAt: conv.lastCustomerMessageAt,
    lastOperatorMessageAt: conv.lastOperatorMessageAt,
    resolvedAt: conv.resolvedAt,
    status: conv.status,
  });

  const lines: string[] = [
    `# Support Conversation Transcript`,
    ``,
    `**Conversation ID**: \`${conv.id}\`  `,
    `**Merchant**: ${conv.merchantName ?? conv.merchantId}  `,
    `**Channel:** ${conv.channel}  `,
    `**Status**: \`${conv.status}\` | **Takeover Mode**: \`${conv.takeoverMode ?? "ai"}\` | **Priority:** ${conv.priority ?? "normal"}  `,
    `**Created**: ${new Date(conv.createdAt).toUTCString()}  `,
    conv.resolvedAt ? `**Resolved**: ${new Date(conv.resolvedAt).toUTCString()}  ` : "",
    conv.orderNumber ? `**Order Ref**: \`#${conv.orderNumber}\`  ` : "",
    `**SLA Status**: ${sla.slaStatus.toUpperCase()} (TTFR: ${sla.formattedTtfr}, Resolution: ${sla.formattedResolutionTime})  `,
    ``,
    `---`,
    ``,
    `## Transcript`,
    ``,
  ].filter(Boolean);

  const filtered = options.includeInternalNotes
    ? messages
    : messages.filter((m) => !m.isInternalNote);

  for (const m of filtered) {
    let body = m.body;
    if (options.redactPii) {
      body = redactPii(body).text;
    }
    const d = new Date(m.createdAt);
    const validDate = isNaN(d.getTime()) ? new Date() : d;
    const time = validDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const date = validDate.toISOString().slice(0, 10);

    if (m.isInternalNote) {
      lines.push(`🔒 **Internal Staff Note** *(${date} ${time})* — Operator \`${m.sentByOperatorId ?? "Staff"}\``);
      lines.push(`> ${body.replace(/\n/g, "\n> ")}`);
      lines.push(``);
    } else if (m.role === "agent") {
      lines.push(`### 👤 Operator (${date} ${time})`);
      lines.push(`${body}`);
      lines.push(``);
    } else if (m.role === "bot") {
      lines.push(`### 🤖 AI Support Assistant (${date} ${time})`);
      lines.push(`${body}`);
      lines.push(``);
    } else {
      lines.push(`### 🛍 Customer (${date} ${time})`);
      lines.push(`${body}`);
      lines.push(``);
    }
  }

  if (options.includeInternalNotes && conv.operatorNotes) {
    let notes = conv.operatorNotes;
    if (options.redactPii) {
      notes = redactPii(notes).text;
    }
    lines.push(`---`);
    lines.push(``);
    lines.push(`## Private Operator Scratchpad`);
    lines.push(notes);
    lines.push(``);
  }

  return lines.join("\n");
}

/**
 * Format conversation transcript as JSON Lines (JSONL).
 */
export function exportToJsonl(
  rawConv: ExportConversationMetadata | Record<string, unknown>,
  rawMessages: (ExportMessageItem | Record<string, unknown>)[],
  options: ExportOptions = {},
): string {
  const conv = normalizeConv(rawConv);
  const messages = rawMessages.map(normalizeMessage);

  const filtered = options.includeInternalNotes
    ? messages
    : messages.filter((m) => !m.isInternalNote);

  const lines: string[] = [];

  for (const m of filtered) {
    let body = m.body;
    if (options.redactPii) {
      body = redactPii(body).text;
    }
    lines.push(
      JSON.stringify({
        conversationId: conv.id,
        messageId: m.id,
        role: m.role === "agent" ? "operator" : m.role === "user" ? "customer" : m.role,
        body,
        isInternalNote: Boolean(m.isInternalNote),
        sentByOperatorId: m.sentByOperatorId ?? null,
        createdAt: m.createdAt,
      }),
    );
  }

  return lines.join("\n");
}

/**
 * Escape CSV fields according to RFC 4180.
 */
function escapeCsv(field: string | null | undefined): string {
  if (field === null || field === undefined) return "";
  const str = String(field);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Format conversation transcript as CSV.
 */
export function exportToCsv(
  rawConv: ExportConversationMetadata | Record<string, unknown>,
  rawMessages: (ExportMessageItem | Record<string, unknown>)[],
  options: ExportOptions = {},
): string {
  const conv = normalizeConv(rawConv);
  const messages = rawMessages.map(normalizeMessage);

  const filtered = options.includeInternalNotes
    ? messages
    : messages.filter((m) => !m.isInternalNote);

  const header = "message_id,timestamp,role,is_internal_note,sender_id,body";
  const rows: string[] = [header];

  for (const m of filtered) {
    let body = m.body;
    if (options.redactPii) {
      body = redactPii(body).text;
    }
    rows.push(
      [
        escapeCsv(m.id),
        escapeCsv(m.createdAt),
        escapeCsv(m.role),
        escapeCsv(m.isInternalNote ? "true" : "false"),
        escapeCsv(m.sentByOperatorId ?? ""),
        escapeCsv(body),
      ].join(","),
    );
  }

  return rows.join("\n");
}

/**
 * Helper to normalize conversation metadata from either camelCase or snake_case.
 */
function normalizeConv(c: any): ExportConversationMetadata {
  return {
    id: c.id,
    merchantId: c.merchantId ?? c.merchant_id ?? "",
    merchantName: c.merchantName ?? c.merchant_name,
    channel: c.channel ?? "chat",
    status: c.status ?? "open",
    priority: c.priority ?? "normal",
    takeoverMode: c.takeoverMode ?? c.takeover_mode ?? "ai",
    orderNumber: c.orderNumber ?? c.order_number,
    createdAt: c.createdAt ?? c.created_at ?? new Date().toISOString(),
    resolvedAt: c.resolvedAt ?? c.resolved_at,
    lastCustomerMessageAt: c.lastCustomerMessageAt ?? c.last_customer_message_at,
    lastOperatorMessageAt: c.lastOperatorMessageAt ?? c.last_operator_message_at,
    operatorNotes: c.operatorNotes ?? c.operator_notes,
  };
}

/**
 * Helper to normalize message items from either camelCase or snake_case.
 */
function normalizeMessage(m: any): ExportMessageItem {
  return {
    id: m.id,
    role: m.role,
    body: m.body,
    createdAt: m.createdAt ?? m.created_at ?? new Date().toISOString(),
    sentByOperatorId: m.sentByOperatorId ?? m.sent_by_operator_id,
    isInternalNote: m.isInternalNote ?? m.is_internal_note ?? false,
  };
}

/**
 * Unified export runner.
 */
export function exportConversationTranscript(
  conv: ExportConversationMetadata | Record<string, unknown>,
  messages: (ExportMessageItem | Record<string, unknown>)[],
  format: ExportFormat,
  options: ExportOptions = {},
): {
  content: string;
  contentType: string;
  filename: string;
} {
  const normConv = normalizeConv(conv);
  const baseName = `transcript-${normConv.id}`;

  switch (format) {
    case "jsonl":
      return {
        content: exportToJsonl(normConv, messages, options),
        contentType: "application/x-ndjson; charset=utf-8",
        filename: `${baseName}.jsonl`,
      };
    case "csv":
      return {
        content: exportToCsv(normConv, messages, options),
        contentType: "text/csv; charset=utf-8",
        filename: `${baseName}.csv`,
      };
    case "markdown":
    default:
      return {
        content: exportToMarkdown(normConv, messages, options),
        contentType: "text/markdown; charset=utf-8",
        filename: `${baseName}.md`,
      };
  }
}

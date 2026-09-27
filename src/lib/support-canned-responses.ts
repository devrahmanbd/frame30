/**
 * Phase 12.6 — Operator Canned Responses & Macro Snippet Engine
 *
 * Provides high-efficiency, bilingual (English + Bengali) pre-approved macros
 * for live support operators on `/root/ai` handling human takeovers.
 *
 * Supports variable interpolation ({{orderNumber}}, {{merchantName}}, {{operatorName}}),
 * fuzzy keyword searching, category taxonomy, and shortcut expansion (/greeting, /order, etc.).
 *
 * TODO-5: the /refund macro is advisory-only. Its EN/BN bodies are the shared
 * guardrail templates (ADVISORY_REFUND_TEMPLATE_EN/BN) so operator copy can
 * never promise an initiated refund; it always points at a support ticket.
 */

import {
  ADVISORY_REFUND_TEMPLATE_BN,
  ADVISORY_REFUND_TEMPLATE_EN,
} from "./support-guardrails";

export type MacroCategory =
  | "greetings"
  | "order_inquiry"
  | "shipping_courier"
  | "refunds_returns"
  | "delays"
  | "resolution_closure"
  | "escalation";

export type CannedResponse = {
  id: string;
  shortcut: string; // e.g. "/greeting", "/order", "/shipping"
  title: string;
  titleBn: string;
  category: MacroCategory;
  templateEn: string;
  templateBn: string;
  body: string;
  bodyBn: string;
  variables: string[]; // e.g. ["customerName", "merchantName"]
};

export type MacroContext = {
  customerName?: string | null;
  merchantName?: string | null;
  orderNumber?: string | null;
  operatorName?: string | null;
  ticketId?: string | null;
  channel?: string | null;
  courierName?: string | null;
  trackingCode?: string | null;
  refundTimeline?: string | null;
};

export const STANDARD_CANNED_RESPONSES: CannedResponse[] = [
  {
    id: "macro_greeting_intro",
    shortcut: "/greeting",
    title: "Greeting & Operator Introduction",
    titleBn: "অভিবাদন ও পরিচয়",
    category: "greetings",
    templateEn:
      "Hello! My name is {{operatorName}} from {{merchantName}} support. I've taken over this chat and I'm ready to assist you today. How may I help?",
    templateBn:
      "হ্যালো! আমি {{merchantName}} সাপোর্টের পক্ষ থেকে {{operatorName}}। আপনার বিষয়টি সমাধান করতে আমি সরাসরি যুক্ত হয়েছি। আপনাকে কীভাবে সাহায্য করতে পারি?",
    body: "Hello! My name is {{operatorName}} from {{merchantName}} support. I've taken over this chat and I'm ready to assist you today. How may I help?",
    bodyBn:
      "হ্যালো! আমি {{merchantName}} সাপোর্টের পক্ষ থেকে {{operatorName}}। আপনার বিষয়টি সমাধান করতে আমি সরাসরি যুক্ত হয়েছি। আপনাকে কীভাবে সাহায্য করতে পারি?",
    variables: ["operatorName", "merchantName"],
  },
  {
    id: "macro_order_lookup",
    shortcut: "/order",
    title: "Request Order Number & Phone",
    titleBn: "অর্ডার নম্বর ও ফোন নম্বর চাওয়া",
    category: "order_inquiry",
    templateEn:
      "To check the exact status of your package, could you please share your order number (e.g. #1002) and the phone number used during checkout?",
    templateBn:
      "আপনার পার্সেলটির সঠিক তথ্য দেখতে অনুগ্রহ করে আপনার অর্ডার নম্বর (যেমন #1002) এবং অর্ডারে ব্যবহৃত ফোন নম্বরটি জানাবেন কি?",
    body: "To check the exact status of your package, could you please share your order number (e.g. #1002) and the phone number used during checkout?",
    bodyBn:
      "আপনার পার্সেলটির সঠিক তথ্য দেখতে অনুগ্রহ করে আপনার অর্ডার নম্বর (যেমন #1002) এবং অর্ডারে ব্যবহৃত ফোন নম্বরটি জানাবেন কি?",
    variables: [],
  },
  {
    id: "macro_shipping_transit",
    shortcut: "/shipping",
    title: "Courier In-Transit Update",
    titleBn: "কুরিয়ার ট্র্যাকিং ও ডেলিভারি আপডেট",
    category: "shipping_courier",
    templateEn:
      "Your order #{{orderNumber}} has been handed over to {{courierName}}. The tracking code is {{trackingCode}}. Deliveries in Dhaka typically arrive in 24-48 hours, and outside Dhaka within 3-5 business days.",
    templateBn:
      "আপনার অর্ডার #{{orderNumber}} টি {{courierName}} কুরিয়ারে হস্তান্তর করা হয়েছে। ট্র্যাকিং কোড: {{trackingCode}}। ঢাকার ভেতরে ২৪-৪৮ ঘণ্টার মধ্যে এবং ঢাকার বাইরে ৩-৫ কার্যদিবসে ডেলিভারি সম্পন্ন হয়।",
    body: "Your order #{{orderNumber}} has been handed over to {{courierName}}. The tracking code is {{trackingCode}}. Deliveries in Dhaka typically arrive in 24-48 hours, and outside Dhaka within 3-5 business days.",
    bodyBn:
      "আপনার অর্ডার #{{orderNumber}} টি {{courierName}} কুরিয়ারে হস্তান্তর করা হয়েছে। ট্র্যাকিং কোড: {{trackingCode}}। ঢাকার ভেতরে ২৪-৪৮ ঘণ্টার মধ্যে এবং ঢাকার বাইরে ৩-৫ কার্যদিবসে ডেলিভারি সম্পন্ন হয়।",
    variables: ["orderNumber", "courierName", "trackingCode"],
  },
  {
    id: "macro_refund_procedure",
    shortcut: "/refund",
    title: "Refund Status Advisory (Ticket-Based)",
    titleBn: "রিফান্ড পরামর্শ (টিকিট-ভিত্তিক)",
    category: "refunds_returns",
    templateEn: ADVISORY_REFUND_TEMPLATE_EN,
    templateBn: ADVISORY_REFUND_TEMPLATE_BN,
    body: ADVISORY_REFUND_TEMPLATE_EN,
    bodyBn: ADVISORY_REFUND_TEMPLATE_BN,
    variables: ["ticketId", "orderNumber"],
  },
  {
    id: "macro_shipping_delay_apology",
    shortcut: "/delay",
    title: "Logistics Delay Apology",
    titleBn: "ডেলিভারি বিলম্বের জন্য ক্ষমা প্রার্থনা",
    category: "delays",
    templateEn:
      "We sincerely apologize for the unexpected delay with order #{{orderNumber}}. Due to high delivery volume, our courier team is running slightly behind schedule. We are actively expediting your parcel.",
    templateBn:
      "অর্ডার #{{orderNumber}} পৌঁছাতে অপ্রত্যাশিত বিলম্বের জন্য আমরা আন্তরিকভাবে দুঃখিত। অতিরিক্ত ডেলিভারি চাপের কারণে কুরিয়ার টিমের কিছুটা সময় লাগছে। আমরা দ্রুত পার্সেল পৌঁছানোর ব্যবস্থা করছি।",
    body: "We sincerely apologize for the unexpected delay with order #{{orderNumber}}. Due to high delivery volume, our courier team is running slightly behind schedule. We are actively expediting your parcel.",
    bodyBn:
      "অর্ডার #{{orderNumber}} পৌঁছাতে অপ্রত্যাশিত বিলম্বের জন্য আমরা আন্তরিকভাবে দুঃখিত। অতিরিক্ত ডেলিভারি চাপের কারণে কুরিয়ার টিমের কিছুটা সময় লাগছে। আমরা দ্রুত পার্সেল পৌঁছানোর ব্যবস্থা করছি।",
    variables: ["orderNumber"],
  },
  {
    id: "macro_issue_resolved",
    shortcut: "/resolved",
    title: "Resolution Confirmation & Closure",
    titleBn: "সমস্যা সমাধান ও চ্যাট সমাপ্তি",
    category: "resolution_closure",
    templateEn:
      "We're glad we could resolve this for you! If you need anything else, please don't hesitate to reach back out. Wishing you a wonderful day with {{merchantName}}!",
    templateBn:
      "আপনার সমস্যার সমাধান করতে পেরে আমরা আনন্দিত! অন্য কোনো তথ্যের প্রয়োজন হলে নির্দ্বিধায় যোগাযোগ করবেন। {{merchantName}} এর সাথে থাকার জন্য ধন্যবাদ!",
    body: "We're glad we could resolve this for you! If you need anything else, please don't hesitate to reach back out. Wishing you a wonderful day with {{merchantName}}!",
    bodyBn:
      "আপনার সমস্যার সমাধান করতে পেরে আমরা আনন্দিত! অন্য কোনো তথ্যের প্রয়োজন হলে নির্দ্বিধায় যোগাযোগ করবেন। {{merchantName}} এর সাথে থাকার জন্য ধন্যবাদ!",
    variables: ["merchantName"],
  },
  {
    id: "macro_escalation_specialist",
    shortcut: "/escalate",
    title: "Internal Technical Escalation",
    titleBn: "সিনিয়র স্পেশালিস্টের কাছে পাঠানো",
    category: "escalation",
    templateEn:
      "I have escalated your request to our senior logistics and finance leads for review. We will reach back to you via phone or email as soon as an update is available.",
    templateBn:
      "আমি আপনার বিষয়টি আমাদের সিনিয়র লজিস্টিকস ও ফিন্যান্স টিমের কাছে পাঠিয়েছি। প্রয়োজনীয় আপডেট পেলেই আপনাকে ফোন বা ইমেইলে দ্রুত জানানো হবে।",
    body: "I have escalated your request to our senior logistics and finance leads for review. We will reach back to you via phone or email as soon as an update is available.",
    bodyBn:
      "আমি আপনার বিষয়টি আমাদের সিনিয়র লজিস্টিকস ও ফিন্যান্স টিমের কাছে পাঠিয়েছি। প্রয়োজনীয় আপডেট পেলেই আপনাকে ফোন বা ইমেইলে দ্রুত জানানো হবে।",
    variables: [],
  },
];

export const CANNED_RESPONSES = STANDARD_CANNED_RESPONSES;

/**
 * Interpolate dynamic parameters into a macro string.
 * Example: "Hello {{operatorName}}" + { operatorName: "Zara" } -> "Hello Zara"
 */
export function interpolateMacro(
  template: string,
  context: MacroContext = {},
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => {
    const val = (context as Record<string, string | null | undefined>)[key];
    if (val !== undefined && val !== null && val !== "") {
      return String(val);
    }
    // Fallback labels for unpopulated variables
    switch (key) {
      case "operatorName":
        return "Specialist";
      case "merchantName":
        return "our store";
      case "orderNumber":
        return "[Order #]";
      case "courierName":
        return "our courier partner";
      case "trackingCode":
        return "[Tracking Code]";
      case "refundTimeline":
        return "3–5 business days";
      case "ticketId":
        return "[Ticket #]";
      default:
        return `[${key}]`;
    }
  });
}

/**
 * Search canned responses by title, shortcut, or body keywords.
 */
export function searchCannedResponses(
  query: string,
  category?: MacroCategory | "all",
  responses: CannedResponse[] = STANDARD_CANNED_RESPONSES,
): CannedResponse[] {
  const q = query.trim().toLowerCase().replace(/^\//, "");
  return responses.filter((r) => {
    if (category && category !== "all" && r.category !== category) {
      return false;
    }
    if (!q) return true;
    const shortcutMatch = r.shortcut.toLowerCase().includes(q);
    const titleMatch =
      r.title.toLowerCase().includes(q) || r.titleBn.includes(q);
    const bodyMatch =
      r.templateEn.toLowerCase().includes(q) || r.templateBn.includes(q);
    return shortcutMatch || titleMatch || bodyMatch;
  });
}

/**
 * Find macro by exact shortcut (e.g. "/greeting" or "/order").
 */
export function findMacroByShortcut(
  shortcut: string,
  responses: CannedResponse[] = STANDARD_CANNED_RESPONSES,
): CannedResponse | undefined {
  const norm = shortcut.startsWith("/")
    ? shortcut.toLowerCase()
    : `/${shortcut.toLowerCase()}`;
  return responses.find((r) => r.shortcut.toLowerCase() === norm);
}

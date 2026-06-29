/**
 * Shared backend constants.
 *
 * Single source of truth for the values that were previously duplicated across
 * server.js, store.js, and line.js (statuses, priorities, validation limits,
 * and LINE integration settings). Import from here rather than re-typing
 * literals so the API contract stays consistent in one place.
 */

export const SERVICE_NAME = "omni-inbox";
export const SERVICE_VERSION = "0.4.0";
export const DEFAULT_PORT = 4317;

/** Conversation lifecycle states, in workflow order. */
export const CONVERSATION_STATUSES = ["open", "pending", "resolved"];
export const DEFAULT_STATUS = "open";

/** Conversation priorities, lowest to highest. */
export const CONVERSATION_PRIORITIES = ["low", "normal", "high"];
export const DEFAULT_PRIORITY = "normal";

/** Conversation fields a PATCH may change (also used to sanitise audit metadata). */
export const CONVERSATION_PATCH_FIELDS = ["status", "priority", "assigneeId", "tags"];

/** Validation and retention limits applied throughout the API and store. */
export const LIMITS = {
  noteText: 2_000,
  messageText: 5_000,
  tagLength: 40,
  maxTags: 8,
  webhookEvents: 100,
  auditEvents: 500,
  webhookEventIds: 500,
  jsonBody: "1mb",
  page: { min: 1, max: 10_000, default: 1 },
  pageSize: { min: 1, max: 100, default: 50 },
  auditLimit: { min: 1, max: 100, default: 50 }
};

/** LINE Messaging API integration. */
export const LINE_API_BASE = "https://api.line.me";
export const DEMO_TOKEN_PREFIX = "demo-token-";
/** Reply tokens are valid for ~60s; stay safely inside that window. */
export const REPLY_WINDOW_MS = 55_000;
/** Abort outbound LINE API calls that hang longer than this. */
export const LINE_REQUEST_TIMEOUT_MS = 8_000;

/** Meta Graph API integration for Messenger and Instagram connectors. */
export const META_GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v23.0";
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
export const META_REQUEST_TIMEOUT_MS = 8_000;
export const META_DEMO_TOKEN_PREFIX = "demo-meta-token-";

/**
 * Request-body validation for the write endpoints. Each validator returns an
 * array of `{ field, message }` errors (empty when the input is valid), which
 * server.js surfaces as a 400 with a `details` payload.
 */

import { canAccessAccount, getAccount, getUser } from "./store.js";
import { CONVERSATION_STATUSES, CONVERSATION_PRIORITIES, CONVERSATION_PATCH_FIELDS, LIMITS } from "./constants.js";

/**
 * Validate an account create/update. For updates, missing fields fall back to
 * the stored values so a partial PATCH-style update stays valid.
 */
export function validateAccount(input = {}) {
  const errors = [];
  const existing = input.id ? getAccount(String(input.id)) : null;
  if (!String(input.name || existing?.name || "").trim()) {
    errors.push({ field: "name", message: "Name is required" });
  }
  if (!String(input.channelSecret || existing?.channelSecret || "").trim()) {
    errors.push({ field: "channelSecret", message: "Channel secret is required" });
  }
  if (!String(input.channelAccessToken || existing?.channelAccessToken || "").trim()) {
    errors.push({ field: "channelAccessToken", message: "Channel access token is required" });
  }
  return errors;
}

/** Validate a conversation PATCH against the supported fields and access rules. */
export function validateConversationPatch(patch = {}, accountId) {
  const errors = [];
  const keys = Object.keys(patch);
  if (!keys.some((key) => CONVERSATION_PATCH_FIELDS.includes(key))) {
    errors.push({ field: "body", message: "No supported fields were provided" });
  }
  if (patch.status !== undefined && !CONVERSATION_STATUSES.includes(patch.status)) {
    errors.push({ field: "status", message: "Unsupported status" });
  }
  if (patch.priority !== undefined && !CONVERSATION_PRIORITIES.includes(patch.priority)) {
    errors.push({ field: "priority", message: "Unsupported priority" });
  }
  if (patch.assigneeId !== undefined) {
    const assigneeId = String(patch.assigneeId || "");
    const assignee = assigneeId ? getUser(assigneeId) : null;
    if (assigneeId && (!assignee || !canAccessAccount(assignee, accountId))) {
      errors.push({ field: "assigneeId", message: "Assignee cannot access this account" });
    }
  }
  if (patch.tags !== undefined && (!Array.isArray(patch.tags) || patch.tags.some((tag) => String(tag).trim().length > LIMITS.tagLength))) {
    errors.push({ field: "tags", message: `Tags must be an array of values up to ${LIMITS.tagLength} characters` });
  }
  return errors;
}

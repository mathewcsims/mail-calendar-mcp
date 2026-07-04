import { z } from "zod";
import { runJxa } from "../../jxa/runner.js";
import { requireConfirm } from "../register.js";
import { McpToolError } from "../../errors.js";
import type { ToolDef } from "../register.js";

const recipient = z.union([
  z.string().describe("Bare email address"),
  z.object({ address: z.string(), name: z.string().optional() }),
]);

const fromAddressDescription =
  "One of the account's configured email addresses (see mail_list_accounts' emailAddresses) that determines which account this is sent/saved from. On a multi-account setup, omitting this silently falls back to Mail.app's global 'send new messages from' preference, which may not be the account you intend — confirmed via testing this can default to an unexpected account.";

const composeFieldsBase = {
  subject: z.string().optional(),
  content: z.string().optional().describe("Plaintext body."),
  to: z.array(recipient).optional(),
  cc: z.array(recipient).optional(),
  bcc: z.array(recipient).optional(),
  attachmentPaths: z.array(z.string()).optional().describe("Local file paths to attach. Attachment insertion is unverified on this system — see README known limitations."),
};

/** For creating a brand-new compose session: fromAddress is required, not just recommended. */
const composeFieldsNew = {
  fromAddress: z.string().describe(`REQUIRED — ${fromAddressDescription}`),
  ...composeFieldsBase,
};

/** For updating an already-open session, or for send (which may target an existing session): optional. */
const composeFieldsUpdate = {
  fromAddress: z.string().optional().describe(fromAddressDescription),
  ...composeFieldsBase,
};

export const mailComposeSendTools: ToolDef<z.ZodRawShape>[] = [
  {
    name: "mail_create_draft",
    description:
      "Create a new draft email (saved to the account's Drafts mailbox). Returns a composeSessionId usable with mail_send_message, mail_update_draft — valid only until Mail.app next restarts.",
    inputSchema: composeFieldsNew,
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args) => runJxa("mail-drafts", { op: "createDraft", ...args }, { appName: "Mail", retryable: false, timeoutMs: 25_000 }),
  },
  {
    name: "mail_create_reply_draft",
    description: "Create a reply draft to an existing message, with quoted original content prefilled.",
    inputSchema: {
      accountName: z.string(),
      mailboxPath: z.array(z.string()).min(1),
      messageId: z.number(),
      replyToAll: z.boolean().optional(),
      additionalContent: z.string().optional().describe("Text to prepend above the quoted original."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args) => runJxa("mail-drafts", { op: "createReplyDraft", ...args }, { appName: "Mail", retryable: false, timeoutMs: 25_000 }),
  },
  {
    name: "mail_create_forward_draft",
    description: "Create a forward draft of an existing message.",
    inputSchema: {
      accountName: z.string(),
      mailboxPath: z.array(z.string()).min(1),
      messageId: z.number(),
      to: z.array(recipient).optional(),
      cc: z.array(recipient).optional(),
      additionalContent: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args) => runJxa("mail-drafts", { op: "createForwardDraft", ...args }, { appName: "Mail", retryable: false, timeoutMs: 25_000 }),
  },
  {
    name: "mail_update_draft",
    description: "Update fields (subject/content/recipients) of an open draft compose session by composeSessionId.",
    inputSchema: { composeSessionId: z.number(), ...composeFieldsUpdate },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args) => runJxa("mail-drafts", { op: "updateDraft", ...args }, { appName: "Mail", retryable: false }),
  },
  {
    name: "mail_list_drafts",
    description: "List persisted drafts in an account's Drafts mailbox.",
    inputSchema: { accountName: z.string() },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("mail-drafts", { op: "listDrafts", ...args }, { appName: "Mail" }),
  },
  {
    name: "mail_delete_draft",
    description: "Delete a persisted draft from the Drafts mailbox (recoverable via Trash, like mail_delete_message).",
    inputSchema: { accountName: z.string(), draftMessageId: z.number() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    handler: async (args) => runJxa("mail-drafts", { op: "deleteDraft", ...args }, { appName: "Mail", retryable: false }),
  },
  {
    name: "mail_send_message",
    description:
      "[IRREVERSIBLE] Send an email. Either pass composeSessionId to send an existing draft from this Mail.app session, or pass to/subject/content directly to compose and send in one call. Requires confirm:true.",
    inputSchema: { composeSessionId: z.number().optional(), confirm: z.boolean().optional(), ...composeFieldsUpdate },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    handler: async (args: { confirm?: boolean; composeSessionId?: number; fromAddress?: string } & Record<string, unknown>) => {
      requireConfirm(args.confirm, "send this email");
      if (args.composeSessionId == null && !args.fromAddress) {
        throw new McpToolError("INVALID_INPUT", `fromAddress is required — ${fromAddressDescription}`);
      }
      const { confirm: _confirm, ...rest } = args;
      return runJxa("mail-drafts", { op: "send", ...rest }, { appName: "Mail", retryable: false, timeoutMs: 30_000 });
    },
  },
];

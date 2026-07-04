import { z } from "zod";
import { runJxa } from "../../jxa/runner.js";
import type { ToolDef } from "../register.js";

const mailboxLocator = {
  accountName: z.string(),
  mailboxPath: z.array(z.string()).min(1),
};

const messageLocator = {
  ...mailboxLocator,
  messageId: z.number().optional().describe("Mail's internal numeric message id (fast, exact)."),
  rfc822MessageId: z.string().optional().describe("RFC822 Message-ID header value, if messageId isn't known."),
};

export const mailMessageReadTools: ToolDef<z.ZodRawShape>[] = [
  {
    name: "mail_search_messages",
    description:
      "Search/list messages in a mailbox with optional filters (read status, flagged status, subject/sender substring). Paginated: default limit 50, max 500.",
    inputSchema: {
      ...mailboxLocator,
      readStatus: z.boolean().optional(),
      flaggedStatus: z.boolean().optional(),
      subjectContains: z.string().optional(),
      senderContains: z.string().optional(),
      limit: z.number().int().min(1).max(500).optional(),
      offset: z.number().int().min(0).optional(),
    },
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("mail-messages", { op: "search", ...args }, { appName: "Mail" }),
  },
  {
    name: "mail_get_message",
    description: "Get full metadata and plaintext body for a single message.",
    inputSchema: messageLocator,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("mail-messages", { op: "get", ...args }, { appName: "Mail" }),
  },
  {
    name: "mail_get_message_source",
    description: "Get the full raw RFC822 source (headers + MIME body) of a message. Use this to extract HTML bodies or inspect MIME structure.",
    inputSchema: messageLocator,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("mail-messages", { op: "getSource", ...args }, { appName: "Mail" }),
  },
  {
    name: "mail_get_message_headers",
    description: "Get just the raw header block of a message.",
    inputSchema: messageLocator,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("mail-messages", { op: "getHeaders", ...args }, { appName: "Mail" }),
  },
  {
    name: "mail_list_attachments",
    description: "List attachments on a message (name, size, download state) without downloading them.",
    inputSchema: messageLocator,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("mail-messages", { op: "listAttachments", ...args }, { appName: "Mail" }),
  },
  {
    name: "mail_get_attachment",
    description: "Save one attachment (by its index from mail_list_attachments) to a local directory. Refuses attachments that would need more than a reasonable size — check size via mail_list_attachments first for anything large.",
    inputSchema: { ...messageLocator, index: z.number().int().min(0), destDirectory: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args) => runJxa("mail-messages", { op: "getAttachment", ...args }, { appName: "Mail", retryable: false }),
  },
];

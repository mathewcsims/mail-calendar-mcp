import { z } from "zod";
import { runJxa } from "../../jxa/runner.js";
import { requireConfirm } from "../register.js";
import type { ToolDef } from "../register.js";

const messageLocator = {
  accountName: z.string(),
  mailboxPath: z.array(z.string()).min(1),
  messageId: z.number().optional(),
  rfc822MessageId: z.string().optional(),
};

export const mailMessageMutateTools: ToolDef<z.ZodRawShape>[] = [
  {
    name: "mail_set_read_status",
    description: "Mark a message as read or unread.",
    inputSchema: { ...messageLocator, value: z.boolean() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("mail-messages", { op: "setReadStatus", ...args }, { appName: "Mail", retryable: false }),
  },
  {
    name: "mail_set_flagged",
    description: "Flag or unflag a message.",
    inputSchema: { ...messageLocator, value: z.boolean() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("mail-messages", { op: "setFlagged", ...args }, { appName: "Mail", retryable: false }),
  },
  {
    name: "mail_set_flag_color",
    description: "Set a message's colored-flag index (-1 clears the flag; 0-6 select a color per Mail.app's flag palette).",
    inputSchema: { ...messageLocator, colorIndex: z.number().int().min(-1).max(6) },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("mail-messages", { op: "setFlagColor", ...args }, { appName: "Mail", retryable: false }),
  },
  {
    name: "mail_move_message",
    description: "Move a message to a different mailbox (recoverable — just relocates it).",
    inputSchema: {
      ...messageLocator,
      destAccountName: z.string().optional().describe("Defaults to the same account as accountName."),
      destMailboxPath: z.array(z.string()).min(1),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args) => runJxa("mail-messages", { op: "move", ...args }, { appName: "Mail", retryable: false }),
  },
  {
    name: "mail_copy_message",
    description: "Copy a message to a different mailbox, leaving the original in place.",
    inputSchema: {
      ...messageLocator,
      destAccountName: z.string().optional(),
      destMailboxPath: z.array(z.string()).min(1),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args) => runJxa("mail-messages", { op: "copy", ...args }, { appName: "Mail", retryable: false }),
  },
  {
    name: "mail_delete_message",
    description: "Move a message to Trash. Recoverable — it stays in the account's Trash mailbox until emptied.",
    inputSchema: messageLocator,
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    handler: async (args) => runJxa("mail-messages", { op: "delete", ...args }, { appName: "Mail", retryable: false }),
  },
  {
    name: "mail_permanently_delete_message",
    description:
      "[IRREVERSIBLE] Permanently delete a message, bypassing/purging Trash. This cannot be undone. Requires confirm:true.",
    inputSchema: { ...messageLocator, confirm: z.boolean().optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    handler: async (args: { confirm?: boolean } & Record<string, unknown>) => {
      requireConfirm(args.confirm, "permanently delete this message");
      const { confirm: _confirm, ...rest } = args;
      return runJxa("mail-messages", { op: "permanentlyDelete", ...rest }, { appName: "Mail", retryable: false });
    },
  },
];

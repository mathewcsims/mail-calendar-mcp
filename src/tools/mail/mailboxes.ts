import { z } from "zod";
import { runJxa } from "../../jxa/runner.js";
import { requireConfirm } from "../register.js";
import type { ToolDef } from "../register.js";

const accountNameSchema = { accountName: z.string() };
const pathSchema = { path: z.array(z.string()).min(1).describe('Mailbox path, e.g. ["INBOX"] or ["INBOX","Subfolder"]') };

export const mailMailboxTools: ToolDef<z.ZodRawShape>[] = [
  {
    name: "mail_list_mailboxes",
    description: "List the full mailbox/folder tree (including nested subfolders and unread counts) for a Mail account.",
    inputSchema: accountNameSchema,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("mail-mailboxes", { op: "list", ...args }, { appName: "Mail" }),
  },
  {
    name: "mail_create_mailbox",
    description: "Create a new mailbox/folder under an account, optionally nested under an existing parent mailbox path.",
    inputSchema: {
      accountName: z.string(),
      name: z.string(),
      parentPath: z.array(z.string()).optional().describe("Path of the parent mailbox to nest under, if any."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args) => runJxa("mail-mailboxes", { op: "create", ...args }, { appName: "Mail", retryable: false }),
  },
  {
    name: "mail_rename_mailbox",
    description:
      "Rename an existing mailbox/folder. Confirmed via testing to be unreliable via AppleScript/JXA on at least some accounts — expect a PLATFORM_LIMITATION error and rename manually in Mail.app as a fallback.",
    inputSchema: { accountName: z.string(), path: pathSchema.path, newName: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("mail-mailboxes", { op: "rename", ...args }, { appName: "Mail", retryable: false }),
  },
  {
    name: "mail_delete_mailbox",
    description:
      "[IRREVERSIBLE] Permanently delete a mailbox/folder and everything in it. Known to be unreliable for cloud-synced accounts (iCloud/Exchange/IMAP) due to a Mail.app scripting limitation — may fail with PLATFORM_LIMITATION. Requires confirm:true.",
    inputSchema: { accountName: z.string(), path: pathSchema.path, confirm: z.boolean().optional() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    handler: async (args: { confirm?: boolean } & Record<string, unknown>) => {
      requireConfirm(args.confirm, "delete this mailbox and everything in it");
      const { confirm: _confirm, ...rest } = args;
      return runJxa("mail-mailboxes", { op: "delete", ...rest }, { appName: "Mail", retryable: false });
    },
  },
];

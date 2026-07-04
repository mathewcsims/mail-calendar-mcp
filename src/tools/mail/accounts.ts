import { z } from "zod";
import { runJxa } from "../../jxa/runner.js";
import type { ToolDef } from "../register.js";

const accountNameSchema = { accountName: z.string().describe("Mail account name, e.g. as shown in mail_list_accounts") };

export const mailAccountTools: ToolDef<z.ZodRawShape>[] = [
  {
    name: "mail_list_accounts",
    description: "List every Mail account configured in Mail.app (iCloud, Google, Exchange, IMAP, etc.) with type, enabled state, and email addresses.",
    inputSchema: {},
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async () => runJxa("mail-accounts", { op: "list" }, { appName: "Mail" }),
  },
  {
    name: "mail_get_account",
    description: "Get details for a single Mail account by name.",
    inputSchema: accountNameSchema,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("mail-accounts", { op: "get", ...args }, { appName: "Mail" }),
  },
  {
    name: "mail_get_account_stats",
    description: "Get unread message counts for an account, broken down by mailbox (recursive).",
    inputSchema: accountNameSchema,
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("mail-accounts", { op: "stats", ...args }, { appName: "Mail" }),
  },
];

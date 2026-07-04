import { z } from "zod";
import { runJxa } from "../../jxa/runner.js";
import type { ToolDef } from "../register.js";

export const mailSignatureTools: ToolDef<z.ZodRawShape>[] = [
  {
    name: "mail_list_signatures",
    description: "List all Mail signatures (name + content).",
    inputSchema: {},
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async () => runJxa("mail-signatures", { op: "list" }, { appName: "Mail" }),
  },
  {
    name: "mail_create_signature",
    description: "Create a new Mail signature.",
    inputSchema: { name: z.string(), content: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    handler: async (args) => runJxa("mail-signatures", { op: "create", ...args }, { appName: "Mail", retryable: false }),
  },
  {
    name: "mail_update_signature",
    description: "Update an existing Mail signature's content.",
    inputSchema: { name: z.string(), content: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    handler: async (args) => runJxa("mail-signatures", { op: "update", ...args }, { appName: "Mail", retryable: false }),
  },
  {
    name: "mail_delete_signature",
    description: "Delete a Mail signature.",
    inputSchema: { name: z.string() },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
    handler: async (args) => runJxa("mail-signatures", { op: "delete", ...args }, { appName: "Mail", retryable: false }),
  },
  {
    name: "mail_list_rules",
    description:
      "List existing Mail rules (name, enabled state). Read-only: creating/editing rules is not achievable via AppleScript/JXA — Mail's rule automation only supports rules invoking a script as an action, not external rule creation. Manage rules in Mail.app > Settings > Rules.",
    inputSchema: {},
    annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    handler: async () => runJxa("mail-signatures", { op: "listRules" }, { appName: "Mail" }),
  },
];

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { z } from "zod";
import { McpToolError } from "../errors.js";
import { log } from "../logging.js";

export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDef<Args extends z.ZodRawShape> {
  name: string;
  title?: string;
  description: string;
  inputSchema: Args;
  annotations?: ToolAnnotations;
  handler: (args: z.objectOutputType<Args, z.ZodTypeAny>) => Promise<unknown>;
}

/** Defense-in-depth for the highest-gate irreversible tools (send, permanent-delete, etc.):
 *  even if a harness's own permission gating is bypassed or misconfigured, the tool itself
 *  refuses to act without an explicit confirm:true from the caller. */
export function requireConfirm(confirm: boolean | undefined, action: string): void {
  if (confirm !== true) {
    throw new McpToolError(
      "INVALID_INPUT",
      `Refusing to ${action} without confirm: true. This action is irreversible — pass confirm: true to proceed.`
    );
  }
}

export function registerAll(server: McpServer, defs: ToolDef<z.ZodRawShape>[]): void {
  for (const def of defs) {
    server.registerTool(
      def.name,
      {
        title: def.title,
        description: def.description,
        inputSchema: def.inputSchema,
        annotations: def.annotations,
      },
      async (args: Record<string, unknown>) => {
        try {
          const data = await def.handler(args as never);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
          };
        } catch (err) {
          if (err instanceof McpToolError) {
            log.warn("tool error", { tool: def.name, code: err.code, message: err.message });
            return {
              isError: true,
              content: [{ type: "text" as const, text: JSON.stringify(err.toContent(), null, 2) }],
            };
          }
          log.error("unexpected tool error", { tool: def.name, error: String(err) });
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: JSON.stringify({ code: "UNEXPECTED_OSA_ERROR", message: String(err) }, null, 2),
              },
            ],
          };
        }
      }
    );
  }
}

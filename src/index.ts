import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerAll } from "./tools/register.js";
import { statusTools } from "./tools/status.js";
import { mailAccountTools } from "./tools/mail/accounts.js";
import { mailMailboxTools } from "./tools/mail/mailboxes.js";
import { mailMessageReadTools } from "./tools/mail/messages-read.js";
import { mailMessageMutateTools } from "./tools/mail/messages-mutate.js";
import { mailComposeSendTools } from "./tools/mail/compose-send.js";
import { mailSignatureTools } from "./tools/mail/signatures.js";
import { calendarCalendarTools } from "./tools/calendar/calendars.js";
import { calendarEventReadTools } from "./tools/calendar/events-read.js";
import { calendarEventWriteTools } from "./tools/calendar/events-write.js";
import { calendarAttendeeTools } from "./tools/calendar/attendees.js";
import { calendarAvailabilityTools } from "./tools/calendar/availability.js";
import { log } from "./logging.js";

async function main() {
  const server = new McpServer({
    name: "mail-calendar-mcp",
    version: "0.1.0",
  });

  registerAll(server, [
    ...statusTools,
    ...mailAccountTools,
    ...mailMailboxTools,
    ...mailMessageReadTools,
    ...mailMessageMutateTools,
    ...mailComposeSendTools,
    ...mailSignatureTools,
    ...calendarCalendarTools,
    ...calendarEventReadTools,
    ...calendarEventWriteTools,
    ...calendarAttendeeTools,
    ...calendarAvailabilityTools,
  ]);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info("mail-calendar-mcp server started");
}

main().catch((err) => {
  log.error("fatal startup error", { error: String(err) });
  process.exit(1);
});

// Health-check for Mail.app / Calendar.app. Deliberately checks `running()` before
// touching any other property, since referencing most Application properties in JXA
// implicitly launches the app — we want to report "not running" rather than launch it.
function run(argv) {
  try {
    const params = JSON.parse(argv[0] || "{}");
    const appName = params.appName;
    if (appName !== "Mail" && appName !== "Calendar") {
      return JSON.stringify({
        ok: false,
        error: { code: "INVALID_INPUT", message: `Unsupported appName: ${appName}` },
      });
    }

    const app = Application(appName);
    const isRunning = app.running();
    const detail = {};
    let responsive = false;

    if (isRunning) {
      try {
        if (appName === "Mail") {
          detail.accountCount = app.accounts.length;
        } else {
          detail.calendarCount = app.calendars.length;
        }
        responsive = true;
      } catch (innerErr) {
        detail.innerError = String(innerErr);
      }
    }

    return JSON.stringify({
      ok: true,
      data: { appName, running: isRunning, responsive, ...detail },
    });
  } catch (e) {
    return JSON.stringify({
      ok: false,
      error: { code: "UNEXPECTED_OSA_ERROR", message: String(e) },
    });
  }
}

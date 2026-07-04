function ok(data) {
  return JSON.stringify({ ok: true, data });
}
function fail(code, message, detail) {
  return JSON.stringify({ ok: false, error: { code, message, detail } });
}
function tryProp(fn, fallback) {
  try {
    return fn();
  } catch (e) {
    return fallback === undefined ? null : fallback;
  }
}
function runWithEnvelope(fn) {
  try {
    return ok(fn());
  } catch (e) {
    if (e && e.code) return fail(e.code, e.message, e.detail);
    return fail("UNEXPECTED_OSA_ERROR", String(e));
  }
}
function findSignature(Mail, name) {
  const sig = Mail.signatures.byName(name);
  try {
    sig.name();
  } catch (e) {
    throw { code: "NOT_FOUND", message: `No such signature: ${name}` };
  }
  return sig;
}

function run(argv) {
  const params = JSON.parse(argv[0] || "{}");
  const Mail = Application("Mail");

  return runWithEnvelope(() => {
    switch (params.op) {
      case "list": {
        return Mail.signatures().map((s) => ({
          name: tryProp(() => s.name()),
          content: tryProp(() => s.content()),
        }));
      }
      case "create": {
        const sig = Mail.make({ new: "signature", withProperties: { name: params.name, content: params.content } });
        return { created: true, name: sig.name() };
      }
      case "update": {
        const sig = findSignature(Mail, params.name);
        sig.content = params.content;
        return { updated: true, content: sig.content() };
      }
      case "delete": {
        const sig = findSignature(Mail, params.name);
        sig.delete();
        return { deleted: true };
      }
      case "listRules": {
        // Mail rules can only be created/edited via Mail.app's UI — the AppleScript
        // dictionary exposes rule objects for inspection so a rule can invoke a script as
        // an *action*, not so external code can create/edit rules. Read-only by design.
        return Mail.rules().map((r) => ({
          name: tryProp(() => r.name()),
          enabled: tryProp(() => r.enabled()),
        }));
      }
      default:
        throw { code: "INVALID_INPUT", message: `Unknown op: ${params.op}` };
    }
  });
}

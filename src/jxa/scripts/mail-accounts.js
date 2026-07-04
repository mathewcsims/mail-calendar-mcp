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
function findAccount(Mail, accountName) {
  const acc = Mail.accounts.byName(accountName);
  try {
    acc.name();
  } catch (e) {
    throw { code: "NOT_FOUND", message: `No such Mail account: ${accountName}` };
  }
  return acc;
}
function runWithEnvelope(fn) {
  try {
    return ok(fn());
  } catch (e) {
    if (e && e.code) return fail(e.code, e.message, e.detail);
    return fail("UNEXPECTED_OSA_ERROR", String(e));
  }
}

function serializeAccount(a) {
  return {
    name: tryProp(() => a.name()),
    enabled: tryProp(() => a.enabled()),
    accountType: tryProp(() => a.accountType()),
    userName: tryProp(() => a.userName()),
    fullName: tryProp(() => a.fullName()),
    emailAddresses: tryProp(() => a.emailAddresses(), []),
  };
}

function countUnreadRecursive(box) {
  let total = tryProp(() => box.unreadCount(), 0);
  const nested = tryProp(() => box.mailboxes(), []);
  for (const child of nested) total += countUnreadRecursive(child);
  return total;
}

function run(argv) {
  const params = JSON.parse(argv[0] || "{}");
  const Mail = Application("Mail");

  return runWithEnvelope(() => {
    switch (params.op) {
      case "list": {
        return Mail.accounts().map(serializeAccount);
      }
      case "get": {
        const acc = findAccount(Mail, params.accountName);
        return serializeAccount(acc);
      }
      case "stats": {
        const acc = findAccount(Mail, params.accountName);
        const boxes = tryProp(() => acc.mailboxes(), []);
        const unreadByMailbox = boxes.map((b) => ({
          mailbox: tryProp(() => b.name()),
          unread: countUnreadRecursive(b),
        }));
        const totalUnread = unreadByMailbox.reduce((sum, m) => sum + m.unread, 0);
        return { account: params.accountName, totalUnread, unreadByMailbox };
      }
      default:
        throw { code: "INVALID_INPUT", message: `Unknown op: ${params.op}` };
    }
  });
}

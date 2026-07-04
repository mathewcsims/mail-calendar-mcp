// NOTE: this file is NOT loaded by osascript directly (JXA has no cross-file import
// without an ObjC bridge dance). It exists purely as the canonical source for the small
// helper block that gets copy-pasted into the top of every mail-*.js / calendar-*.js
// script below, so the pattern only has to be understood once. Keep the two in sync.

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

// path: array of mailbox name segments, e.g. ["INBOX", "Subfolder"]
function findMailbox(account, path) {
  let box = account.mailboxes.byName(path[0]);
  try {
    box.name();
  } catch (e) {
    throw { code: "NOT_FOUND", message: `No such mailbox: ${path.join(" > ")}` };
  }
  for (let i = 1; i < path.length; i++) {
    box = box.mailboxes.byName(path[i]);
    try {
      box.name();
    } catch (e) {
      throw { code: "NOT_FOUND", message: `No such mailbox: ${path.join(" > ")}` };
    }
  }
  return box;
}

function serializeMessage(m) {
  return {
    id: tryProp(() => m.id()),
    subject: tryProp(() => m.subject()),
    sender: tryProp(() => m.sender()),
    dateReceived: tryProp(() => String(m.dateReceived())),
    dateSent: tryProp(() => String(m.dateSent())),
    readStatus: tryProp(() => m.readStatus()),
    flaggedStatus: tryProp(() => m.flaggedStatus()),
    flagIndex: tryProp(() => m.flagIndex()),
    messageId: tryProp(() => m.messageId()),
    mailbox: tryProp(() => m.mailbox().name()),
    to: tryProp(() => m.toRecipients().map((r) => ({ name: r.name(), address: r.address() })), []),
    cc: tryProp(() => m.ccRecipients().map((r) => ({ name: r.name(), address: r.address() })), []),
  };
}

function runWithEnvelope(fn) {
  try {
    return ok(fn());
  } catch (e) {
    if (e && e.code) return fail(e.code, e.message, e.detail);
    return fail("UNEXPECTED_OSA_ERROR", String(e));
  }
}

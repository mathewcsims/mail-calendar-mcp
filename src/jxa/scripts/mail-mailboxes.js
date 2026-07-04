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
function runWithEnvelope(fn) {
  try {
    return ok(fn());
  } catch (e) {
    if (e && e.code) return fail(e.code, e.message, e.detail);
    return fail("UNEXPECTED_OSA_ERROR", String(e));
  }
}

function serializeMailboxTree(box, parentPath) {
  const name = tryProp(() => box.name());
  const path = [...parentPath, name];
  const children = tryProp(() => box.mailboxes(), []);
  return {
    name,
    path,
    unreadCount: tryProp(() => box.unreadCount(), 0),
    children: children.map((c) => serializeMailboxTree(c, path)),
  };
}

function run(argv) {
  const params = JSON.parse(argv[0] || "{}");
  const Mail = Application("Mail");

  return runWithEnvelope(() => {
    switch (params.op) {
      case "list": {
        const acc = findAccount(Mail, params.accountName);
        return acc.mailboxes().map((b) => serializeMailboxTree(b, [])).map((tree) => ({
          ...tree,
          path: [params.accountName, ...tree.path],
        }));
      }
      case "create": {
        const acc = findAccount(Mail, params.accountName);
        const parentPath = params.parentPath || [];
        const at = parentPath.length ? findMailbox(acc, parentPath) : acc;
        const box = Mail.make({ new: "mailbox", withProperties: { name: params.name }, at });
        return { created: true, name: box.name() };
      }
      case "rename": {
        const acc = findAccount(Mail, params.accountName);
        const box = findMailbox(acc, params.path);
        try {
          box.name = params.newName;
        } catch (e) {
          // Confirmed via testing (two different object-reference styles, two different
          // failure modes) that renaming a mailbox's `name` property via JXA does not work
          // reliably on this system — a genuine platform limitation, not a transient error.
          throw {
            code: "PLATFORM_LIMITATION",
            message:
              "Mail refused to rename this mailbox via scripting. Renaming a mailbox's name property is unreliable via AppleScript/JXA — rename it manually in Mail.app instead.",
            detail: String(e),
          };
        }
        return { renamed: true, newName: box.name() };
      }
      case "delete": {
        const acc = findAccount(Mail, params.accountName);
        const box = findMailbox(acc, params.path);
        try {
          box.delete();
        } catch (e) {
          // Confirmed via testing: deleting a mailbox on a cloud-synced account (iCloud/
          // Exchange/IMAP) frequently fails at the AppleEvent level even though the same
          // command works for local ("On My Mac") mailboxes. Surface this distinctly
          // rather than a raw AppleEvent error.
          throw {
            code: "PLATFORM_LIMITATION",
            message:
              "Mail refused to delete this mailbox via scripting. This is a known limitation for cloud-synced accounts (iCloud/Exchange/IMAP) — mailbox deletion via AppleScript/JXA is unreliable for server-backed mailboxes. Try deleting it manually in Mail.app, or verify this mailbox belongs to a local (On My Mac) account.",
            detail: String(e),
          };
        }
        return { deleted: true };
      }
      default:
        throw { code: "INVALID_INPUT", message: `Unknown op: ${params.op}` };
    }
  });
}

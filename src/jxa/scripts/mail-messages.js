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
function findMessageById(box, id) {
  const m = box.messages.byId(id);
  try {
    m.id();
  } catch (e) {
    throw { code: "NOT_FOUND", message: `No such message id ${id} in mailbox` };
  }
  return m;
}
function findMessageByRfc822Id(box, rfc822Id) {
  const matches = box.messages.whose({ messageId: rfc822Id })();
  if (!matches.length) {
    throw { code: "NOT_FOUND", message: `No message with Message-ID ${rfc822Id} in mailbox` };
  }
  return matches[0];
}
function resolveMessage(Mail, params) {
  const acc = findAccount(Mail, params.accountName);
  const box = findMailbox(acc, params.mailboxPath);
  if (params.messageId != null) return findMessageById(box, params.messageId);
  if (params.rfc822MessageId) return findMessageByRfc822Id(box, params.rfc822MessageId);
  throw { code: "INVALID_INPUT", message: "Must provide messageId or rfc822MessageId" };
}

function buildWhoseFilter(params) {
  const clause = {};
  if (params.readStatus !== undefined) clause.readStatus = params.readStatus;
  if (params.flaggedStatus !== undefined) clause.flaggedStatus = params.flaggedStatus;
  if (params.subjectContains) clause.subject = { _contains: params.subjectContains };
  if (params.senderContains) clause.sender = { _contains: params.senderContains };
  return clause;
}

function run(argv) {
  const params = JSON.parse(argv[0] || "{}");
  const Mail = Application("Mail");

  return runWithEnvelope(() => {
    switch (params.op) {
      case "search": {
        const acc = findAccount(Mail, params.accountName);
        const box = findMailbox(acc, params.mailboxPath);
        const clause = buildWhoseFilter(params);
        const all = Object.keys(clause).length ? box.messages.whose(clause)() : box.messages();
        const limit = Math.min(params.limit || 50, 500);
        const offset = params.offset || 0;
        const page = all.slice(offset, offset + limit);
        return {
          total: all.length,
          offset,
          limit,
          hasMore: offset + limit < all.length,
          messages: page.map(serializeMessage),
        };
      }
      case "get": {
        const m = resolveMessage(Mail, params);
        return {
          ...serializeMessage(m),
          content: tryProp(() => m.content()),
        };
      }
      case "getSource": {
        const m = resolveMessage(Mail, params);
        return { source: tryProp(() => m.source()) };
      }
      case "getHeaders": {
        const m = resolveMessage(Mail, params);
        const source = tryProp(() => m.source(), "");
        const blankLineIdx = source.search(/\r?\n\r?\n/);
        const headerBlock = blankLineIdx >= 0 ? source.slice(0, blankLineIdx) : source;
        return { headers: headerBlock };
      }
      case "listAttachments": {
        const m = resolveMessage(Mail, params);
        const atts = tryProp(() => m.mailAttachments(), []);
        return atts.map((a, idx) => ({
          index: idx,
          name: tryProp(() => a.name()),
          fileSize: tryProp(() => a.fileSize()),
          downloaded: tryProp(() => a.downloaded()),
        }));
      }
      case "getAttachment": {
        const m = resolveMessage(Mail, params);
        const atts = tryProp(() => m.mailAttachments(), []);
        const att = atts[params.index];
        if (!att) throw { code: "NOT_FOUND", message: `No attachment at index ${params.index}` };
        att.save({ in: Path(params.destDirectory) });
        return { savedTo: `${params.destDirectory}/${att.name()}` };
      }
      case "setReadStatus": {
        const m = resolveMessage(Mail, params);
        m.readStatus = params.value;
        return { readStatus: m.readStatus() };
      }
      case "setFlagged": {
        const m = resolveMessage(Mail, params);
        m.flaggedStatus = params.value;
        return { flaggedStatus: m.flaggedStatus() };
      }
      case "setFlagColor": {
        const m = resolveMessage(Mail, params);
        m.flagIndex = params.colorIndex;
        return { flagIndex: m.flagIndex() };
      }
      case "move": {
        const m = resolveMessage(Mail, params);
        const destAcc = findAccount(Mail, params.destAccountName || params.accountName);
        const destBox = findMailbox(destAcc, params.destMailboxPath);
        m.move({ to: destBox });
        return { moved: true };
      }
      case "copy": {
        const m = resolveMessage(Mail, params);
        const destAcc = findAccount(Mail, params.destAccountName || params.accountName);
        const destBox = findMailbox(destAcc, params.destMailboxPath);
        m.duplicate({ to: destBox });
        return { copied: true };
      }
      case "delete": {
        const m = resolveMessage(Mail, params);
        m.delete();
        return { deleted: true, permanently: false };
      }
      case "permanentlyDelete": {
        const acc = findAccount(Mail, params.accountName);
        const box = findMailbox(acc, params.mailboxPath);
        const m = params.messageId != null
          ? findMessageById(box, params.messageId)
          : findMessageByRfc822Id(box, params.rfc822MessageId);
        const rfc822Id = tryProp(() => m.messageId());
        const currentMailboxName = tryProp(() => m.mailbox().name());
        const isTrash = /trash|deleted/i.test(currentMailboxName || "");
        // Mail's `delete` command moves a message to its account's Trash the first time;
        // calling it again on a message already residing in Trash purges it permanently.
        m.delete();
        if (!isTrash) {
          if (!rfc822Id) {
            throw {
              code: "PLATFORM_LIMITATION",
              message:
                "Message moved to Trash, but could not re-locate it there (no Message-ID header) to purge permanently. It is now in Trash and can be deleted manually.",
            };
          }
          const trashBox = acc.mailboxes().find((b) => /trash|deleted/i.test(tryProp(() => b.name(), "")));
          if (!trashBox) {
            throw {
              code: "PLATFORM_LIMITATION",
              message: "Message moved to Trash, but this account's Trash mailbox could not be located to purge it permanently.",
            };
          }
          const inTrash = trashBox.messages.whose({ messageId: rfc822Id })();
          if (!inTrash.length) {
            throw {
              code: "PLATFORM_LIMITATION",
              message: "Message moved to Trash, but it was not found there yet to purge permanently (Mail may still be syncing). Retry shortly.",
            };
          }
          inTrash[0].delete();
        }
        return { deleted: true, permanently: true };
      }
      default:
        throw { code: "INVALID_INPUT", message: `Unknown op: ${params.op}` };
    }
  });
}

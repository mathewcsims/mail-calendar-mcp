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
    mailbox: tryProp(() => m.mailbox().name()),
    to: tryProp(() => m.toRecipients().map((r) => ({ name: r.name(), address: r.address() })), []),
  };
}

// Building the properties object with an explicit `name: undefined` key (rather than
// omitting the key) breaks the JXA->AppleScript bridge with "Can't convert types." —
// confirmed via testing. Only include `name` when a real value is present.
function recipientProps(addr) {
  if (typeof addr === "string") return { address: addr };
  const props = { address: addr.address };
  if (addr.name) props.name = addr.name;
  return props;
}

function addRecipients(Mail, msg, params) {
  for (const addr of params.to || []) {
    msg.toRecipients.push(Mail.ToRecipient(recipientProps(addr)));
  }
  for (const addr of params.cc || []) {
    msg.ccRecipients.push(Mail.CcRecipient(recipientProps(addr)));
  }
  for (const addr of params.bcc || []) {
    msg.bccRecipients.push(Mail.BccRecipient(recipientProps(addr)));
  }
}

// NOTE: attachment insertion via JXA is one of the least certain corners of Mail's
// scripting dictionary (no sdef available on this machine to confirm exact syntax).
// This is the standard documented approach; treat failures here as PLATFORM_LIMITATION
// rather than a hard crash, and re-verify empirically before relying on it.
function addAttachments(Mail, msg, filePaths) {
  for (const filePath of filePaths || []) {
    try {
      Mail.make({
        new: "attachment",
        withProperties: { fileName: Path(filePath) },
        at: msg.content.paragraphs[-1],
      });
    } catch (e) {
      throw {
        code: "PLATFORM_LIMITATION",
        message: `Failed to attach file ${filePath}. Attachment insertion via JXA is unverified on this system — see README known limitations.`,
        detail: String(e),
      };
    }
  }
}

function run(argv) {
  const params = JSON.parse(argv[0] || "{}");
  const Mail = Application("Mail");

  return runWithEnvelope(() => {
    switch (params.op) {
      case "createDraft": {
        const props = { subject: params.subject || "", content: params.content || "", visible: false };
        // Without an explicit sender, Mail silently uses its global "send new messages
        // from" default account — confirmed via testing this can be a different account
        // than expected (e.g. a work account) on a multi-account setup. Always pass it
        // through explicitly when the caller provides one.
        if (params.fromAddress) props.sender = params.fromAddress;
        const msg = Mail.make({ new: "outgoingMessage", withProperties: props });
        addRecipients(Mail, msg, params);
        addAttachments(Mail, msg, params.attachmentPaths);
        msg.save();
        return {
          composeSessionId: msg.id(),
          note: "composeSessionId is valid only for the current Mail.app process lifetime (until Mail.app restarts). The draft is also persisted in the account's Drafts mailbox for browsing.",
        };
      }
      case "createReplyDraft": {
        const acc = findAccount(Mail, params.accountName);
        const box = findMailbox(acc, params.mailboxPath);
        const original = box.messages.byId(params.messageId);
        const reply = original.reply({ openingWindow: false, replyToAll: !!params.replyToAll });
        if (params.additionalContent) {
          reply.content = `${params.additionalContent}\n\n${reply.content()}`;
        }
        reply.save();
        return { composeSessionId: reply.id() };
      }
      case "createForwardDraft": {
        const acc = findAccount(Mail, params.accountName);
        const box = findMailbox(acc, params.mailboxPath);
        const original = box.messages.byId(params.messageId);
        const fwd = original.forward({ openingWindow: false });
        addRecipients(Mail, fwd, params);
        if (params.additionalContent) {
          fwd.content = `${params.additionalContent}\n\n${fwd.content()}`;
        }
        fwd.save();
        return { composeSessionId: fwd.id() };
      }
      case "updateDraft": {
        const draft = Mail.outgoingMessages.byId(params.composeSessionId);
        try {
          draft.id();
        } catch (e) {
          throw {
            code: "NOT_FOUND",
            message: `No open compose session with id ${params.composeSessionId}. It may have already been sent, deleted, or Mail.app may have restarted since it was created.`,
          };
        }
        if (params.subject !== undefined) draft.subject = params.subject;
        if (params.content !== undefined) draft.content = params.content;
        addRecipients(Mail, draft, params);
        draft.save();
        return { updated: true };
      }
      case "listDrafts": {
        const acc = findAccount(Mail, params.accountName);
        const draftsBox = findMailbox(acc, ["Drafts"]);
        return draftsBox.messages().map(serializeMessage);
      }
      case "deleteDraft": {
        const acc = findAccount(Mail, params.accountName);
        const draftsBox = findMailbox(acc, ["Drafts"]);
        const msg = draftsBox.messages.byId(params.draftMessageId);
        try {
          msg.id();
        } catch (e) {
          throw { code: "NOT_FOUND", message: `No draft with id ${params.draftMessageId}` };
        }
        msg.delete();
        return { deleted: true };
      }
      case "send": {
        // Two supported paths: send an in-session compose object by id, or build+send fresh.
        if (params.composeSessionId != null) {
          const msg = Mail.outgoingMessages.byId(params.composeSessionId);
          try {
            msg.id();
          } catch (e) {
            throw {
              code: "NOT_FOUND",
              message: `No open compose session with id ${params.composeSessionId}. If this draft predates the current Mail.app process (e.g. Mail was restarted), it cannot be resent this way — recreate and send it fresh instead.`,
            };
          }
          msg.send();
          return { sent: true, via: "composeSessionId" };
        }
        const sendProps = { subject: params.subject || "", content: params.content || "", visible: false };
        if (params.fromAddress) sendProps.sender = params.fromAddress;
        const msg = Mail.make({ new: "outgoingMessage", withProperties: sendProps });
        addRecipients(Mail, msg, params);
        addAttachments(Mail, msg, params.attachmentPaths);
        msg.send();
        return { sent: true, via: "freshCompose" };
      }
      default:
        throw { code: "INVALID_INPUT", message: `Unknown op: ${params.op}` };
    }
  });
}

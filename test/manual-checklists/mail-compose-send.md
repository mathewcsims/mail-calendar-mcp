# Mail: compose, drafts, send, signatures

All `to`/send tests must target only your own address(es) — never a real third party.

| # | Precondition | Tool call | Expected result | Pass/Fail |
|---|---|---|---|---|
| 1 | — | `mail_create_draft` with `fromAddress` set to a non-default account | Draft appears in **that account's** Drafts mailbox, not Mail's global default account | [ ] |
| 2 | — | `mail_create_draft` **without** `fromAddress` | Should be rejected by the schema (required field) — confirm it can't silently use the wrong account | [ ] |
| 3 | Existing message | `mail_create_reply_draft` with `replyToAll:true` | Draft has quoted original content, correct recipients | [ ] |
| 4 | Existing message | `mail_create_forward_draft` | Draft has quoted original content | [ ] |
| 5 | Draft from #1, same Mail.app session | `mail_update_draft` via `composeSessionId` | Subject/content change reflected in Mail.app's Drafts window | [ ] |
| 6 | — | `mail_send_message` with `confirm:true`, `to` = your own address | Email arrives in your own inbox within a minute | [ ] |
| 7 | — | `mail_send_message` **without** `confirm:true` | Rejected with `INVALID_INPUT`, nothing sent | [ ] |
| 8 | Draft persisted in a prior Mail.app session (i.e. Mail.app has restarted since) | `mail_send_message` via its old `composeSessionId` | Expected to fail with `NOT_FOUND` per README — confirm the error message explains why | [ ] |
| 9 | — | `mail_add_attachment_to_draft` | **Unverified per README** — confirm whether it actually attaches the file; update README with the real result either way | [ ] |
| 10 | — | `mail_list_signatures` / `mail_create_signature` / `mail_update_signature` / `mail_delete_signature` | Each reflected correctly in Mail.app > Settings > Signatures | [ ] |

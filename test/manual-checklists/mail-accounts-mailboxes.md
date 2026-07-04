# Mail: accounts & mailboxes

Precondition for all destructive rows: use a non-work account (e.g. iCloud), never a work/employer account.

| # | Precondition | Tool call | Expected result | Pass/Fail |
|---|---|---|---|---|
| 1 | — | `mail_list_accounts` | Returns all configured accounts with correct type/enabled/emailAddresses | [ ] |
| 2 | — | `mail_get_account_stats` for one account | `totalUnread` matches what Mail.app's sidebar shows for that account | [ ] |
| 3 | — | `mail_list_mailboxes` for an account with subfolders | Nested `children` structure matches Mail.app's sidebar | [ ] |
| 4 | — | `mail_create_mailbox` with a new name | New folder appears in Mail.app's sidebar immediately | [ ] |
| 5 | Mailbox from #4 exists | `mail_rename_mailbox` | **Expected to fail** with `PLATFORM_LIMITATION` per README — confirm error message is clear, not a raw AppleEvent error | [ ] |
| 6 | Mailbox from #4 exists, on a cloud-synced account | `mail_delete_mailbox` with `confirm:true` | **Expected to fail** with `PLATFORM_LIMITATION` on cloud accounts per README — confirm error message is clear | [ ] |
| 7 | A local "On My Mac" mailbox exists (create manually in Mail.app if none) | `mail_rename_mailbox` / `mail_delete_mailbox` | Re-test on a local account — may behave differently than cloud-synced; update README if so | [ ] |

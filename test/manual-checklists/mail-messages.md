# Mail: messages (read & mutate)

All mutation tests should run against messages in the `Testing/MCP-Scratch` mailbox, never a real mailbox with meaningful mail.

| # | Precondition | Tool call | Expected result | Pass/Fail |
|---|---|---|---|---|
| 1 | Mailbox with >50 messages | `mail_search_messages` with default limit | Returns exactly 50, `hasMore:true`, `total` matches full count | [ ] |
| 2 | Same as #1 | `mail_search_messages` with `offset:50` | Returns the next page, no overlap with #1 | [ ] |
| 3 | — | `mail_search_messages` with `readStatus:false` | Only unread messages returned; count matches Mail.app's unread filter | [ ] |
| 4 | A message with an attachment | `mail_list_attachments` then `mail_get_attachment` | File saved to `destDirectory` matches the real attachment (open it, compare) | [ ] |
| 5 | Any message, currently read | `mail_set_read_status` to `false` | Message shows as unread in Mail.app UI | [ ] |
| 6 | Any message | `mail_set_flagged` to `true`, then `mail_set_flag_color` | Flag appears with correct color in Mail.app UI | [ ] |
| 7 | Message in MCP-Scratch | `mail_move_message` to a different mailbox | Message appears in destination, gone from source, in Mail.app UI | [ ] |
| 8 | Message in MCP-Scratch | `mail_copy_message` to a different mailbox | Message appears in both mailboxes | [ ] |
| 9 | Message in MCP-Scratch | `mail_delete_message` | Message moves to Trash, recoverable | [ ] |
| 10 | Message already in Trash | `mail_permanently_delete_message` with `confirm:true` | Message gone from Trash entirely, not recoverable | [ ] |

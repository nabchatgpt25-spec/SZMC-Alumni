/*
# Tighten messaging table privileges

Plain-English summary: the messaging tables were granted full read/write access to the anonymous role and to full create/update/delete on every column for signed-in users. This migration removes all access from anonymous visitors and limits signed-in users to the actions and columns the messaging screens actually use. Row-level security policies still decide which rows each user can see or change.

1. Modified tables
- conversations: signed-in users can read and start conversations. No direct update or delete.
- conversation_participants: signed-in users can read, join, update only last_read_at and is_muted, and leave (delete their own row).
- messages: signed-in users can read and send. Updates are limited to body, edited_at and deleted_at (edit and soft delete).

2. Security changes
- All privileges for the anon role are revoked on the three tables.
- Privileges for authenticated are revoked, then re-granted with the minimum verbs and columns above.
- No policies are changed.

3. Notes
- The message trigger that updates conversations.last_message_at is SECURITY DEFINER, so it does not need extra grants.
*/

REVOKE ALL ON conversations, conversation_participants, messages FROM anon, authenticated;

GRANT SELECT, INSERT ON conversations TO authenticated;

GRANT SELECT, INSERT ON conversation_participants TO authenticated;
GRANT UPDATE (last_read_at, is_muted) ON conversation_participants TO authenticated;
GRANT DELETE ON conversation_participants TO authenticated;

GRANT SELECT, INSERT ON messages TO authenticated;
GRANT UPDATE (body, edited_at, deleted_at) ON messages TO authenticated;

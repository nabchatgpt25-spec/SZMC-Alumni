import { Client } from 'pg';

export const MESSAGING_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS public.user_message_settings (
  profile_id BIGINT PRIMARY KEY,
  who_can_message VARCHAR(50) DEFAULT 'everyone',
  read_receipts_enabled BOOLEAN DEFAULT TRUE,
  sound_enabled BOOLEAN DEFAULT TRUE,
  notification_preview_enabled BOOLEAN DEFAULT TRUE,
  email_notification_digest BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.conversations (
  id TEXT PRIMARY KEY,
  created_by BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_message_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.conversation_participants (
  conversation_id TEXT REFERENCES public.conversations(id) ON DELETE CASCADE,
  profile_id BIGINT,
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  is_muted BOOLEAN DEFAULT FALSE,
  PRIMARY KEY (conversation_id, profile_id)
);

CREATE TABLE IF NOT EXISTS public.messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id BIGINT,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

ALTER TABLE public.user_message_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON public.user_message_settings TO anon, authenticated, service_role;
GRANT ALL ON public.conversations TO anon, authenticated, service_role;
GRANT ALL ON public.conversation_participants TO anon, authenticated, service_role;
GRANT ALL ON public.messages TO anon, authenticated, service_role;

DROP POLICY IF EXISTS "allow_all_message_settings" ON public.user_message_settings;
CREATE POLICY "allow_all_message_settings" ON public.user_message_settings FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_conversations" ON public.conversations;
CREATE POLICY "allow_all_conversations" ON public.conversations FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_participants" ON public.conversation_participants;
CREATE POLICY "allow_all_participants" ON public.conversation_participants FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "allow_all_messages" ON public.messages;
CREATE POLICY "allow_all_messages" ON public.messages FOR ALL TO anon, authenticated, service_role USING (true) WITH CHECK (true);
`;

export async function attemptBootstrapMessagingTables(): Promise<{
  success: boolean;
  message: string;
}> {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return { success: false, message: 'DATABASE_URL not configured' };
  }

  try {
    let servername: string | undefined = undefined;
    try {
      const u = new URL(dbUrl);
      servername = u.hostname;
    } catch {}

    const client = new Client({
      connectionString: dbUrl,
      ssl: {
        rejectUnauthorized: false,
        servername,
      },
      connectionTimeoutMillis: 7000,
    });

    await client.connect();
    await client.query(MESSAGING_SCHEMA_SQL);
    await client.end();
    console.log('[Database] Messaging and Message Settings tables provisioned successfully via PostgreSQL.');
    return { success: true, message: 'Tables provisioned successfully in PostgreSQL database' };
  } catch (err: any) {
    console.warn('[Database] Direct Postgres bootstrap attempt notice:', err.message);
    return { success: false, message: err.message };
  }
}

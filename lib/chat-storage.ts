import { neon } from "@neondatabase/serverless";

export type StoredChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  createdAt: string;
};

export type StoredLink = {
  id: string;
  url: string;
  description: string;
  createdAt: string;
};

const MAX_LIMIT = 500;

let schemaInitPromise: Promise<void> | null = null;

function getDatabaseUrl() {
  const value = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!value) {
    throw new Error("DATABASE_URL or POSTGRES_URL is not configured");
  }
  return value;
}

function getSqlClient() {
  return neon(getDatabaseUrl());
}

async function ensureSchema() {
  if (schemaInitPromise) {
    return schemaInitPromise;
  }

  schemaInitPromise = (async () => {
    const sql = getSqlClient();
    await sql`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('assistant', 'user')),
        text TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_chat_messages_chat_id_created_at
      ON chat_messages (chat_id, created_at)
    `;

    await sql`
      CREATE TABLE IF NOT EXISTS saved_links (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        url TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;

    await sql`
      CREATE INDEX IF NOT EXISTS idx_saved_links_chat_id_created_at
      ON saved_links (chat_id, created_at)
    `;

  })();

  return schemaInitPromise;
}

export function createStorageId() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export async function appendChatMessage(chatId: string, role: "assistant" | "user", text: string) {
  await ensureSchema();
  const sql = getSqlClient();
  const id = createStorageId();

  await sql`
    INSERT INTO chat_messages (id, chat_id, role, text)
    VALUES (${id}, ${chatId}, ${role}, ${text})
  `;

  return id;
}

export async function listChatMessages(chatId: string, limit: number) {
  await ensureSchema();
  const sql = getSqlClient();
  const safeLimit = Math.max(1, Math.min(Number.isFinite(limit) ? limit : 100, MAX_LIMIT));

  const rows = (await sql`
    SELECT id, role, text, created_at
    FROM chat_messages
    WHERE chat_id = ${chatId}
    ORDER BY created_at DESC
    LIMIT ${safeLimit}
  `) as Array<{ id: string; role: "assistant" | "user"; text: string; created_at: string | Date }>;

  return rows
    .slice()
    .reverse()
    .map((row) => ({
      id: row.id,
      role: row.role,
      text: row.text,
      createdAt: new Date(row.created_at).toISOString(),
    })) satisfies StoredChatMessage[];
}

export async function clearChatMessages(chatId: string) {
  await ensureSchema();
  const sql = getSqlClient();
  await sql`DELETE FROM chat_messages WHERE chat_id = ${chatId}`;
}

export async function addSavedLink(chatId: string, url: string, description: string) {
  await ensureSchema();
  const sql = getSqlClient();
  const id = createStorageId().slice(0, 8);

  await sql`
    INSERT INTO saved_links (id, chat_id, url, description)
    VALUES (${id}, ${chatId}, ${url}, ${description})
  `;

  const [row] = (await sql`
    SELECT id, url, description, created_at
    FROM saved_links
    WHERE id = ${id}
    LIMIT 1
  `) as Array<{ id: string; url: string; description: string; created_at: string | Date }>;

  return {
    id: row.id,
    url: row.url,
    description: row.description,
    createdAt: new Date(row.created_at).toISOString(),
  } satisfies StoredLink;
}

export async function listSavedLinks(chatId: string) {
  await ensureSchema();
  const sql = getSqlClient();

  const rows = (await sql`
    SELECT id, url, description, created_at
    FROM saved_links
    WHERE chat_id = ${chatId}
    ORDER BY created_at DESC
  `) as Array<{ id: string; url: string; description: string; created_at: string | Date }>;

  return rows.map((row) => ({
    id: row.id,
    url: row.url,
    description: row.description,
    createdAt: new Date(row.created_at).toISOString(),
  })) satisfies StoredLink[];
}

export async function removeSavedLink(chatId: string, id: string) {
  await ensureSchema();
  const sql = getSqlClient();
  const rows = (await sql`
    DELETE FROM saved_links
    WHERE chat_id = ${chatId} AND id = ${id}
    RETURNING id
  `) as Array<{ id: string }>;

  return rows.length > 0;
}

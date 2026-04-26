import { clearChatMessages, listChatMessages } from "@/lib/chat-storage";

function getLimit(raw: string | null) {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return 200;
  }
  return Math.min(value, 500);
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const chatId = url.searchParams.get("chatId")?.trim();
    if (!chatId) {
      return Response.json({ error: "chatId обязателен" }, { status: 400 });
    }

    const limit = getLimit(url.searchParams.get("limit"));
    const messages = await listChatMessages(chatId, limit);
    return Response.json({ messages });
  } catch {
    return Response.json({ error: "Не удалось получить историю" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { chatId?: string };
    const chatId = body.chatId?.trim();
    if (!chatId) {
      return Response.json({ error: "chatId обязателен" }, { status: 400 });
    }

    await clearChatMessages(chatId);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Не удалось очистить историю" }, { status: 500 });
  }
}

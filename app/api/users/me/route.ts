import { getTelegramUserById, upsertTelegramUser } from "@/lib/chat-storage";

function telegramIdFromChatId(chatId: string | null) {
  if (!chatId) return null;
  const trimmed = chatId.trim();
  if (!trimmed.startsWith("tg:")) return null;
  const value = trimmed.slice(3).trim();
  return value || null;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const chatId = url.searchParams.get("chatId");
    const telegramId = telegramIdFromChatId(chatId);
    if (!telegramId) {
      return Response.json({ user: null });
    }

    const user = await getTelegramUserById(telegramId);
    return Response.json({ user });
  } catch {
    return Response.json({ error: "Не удалось получить профиль пользователя" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      telegramId?: string;
      username?: string;
      firstName?: string;
      lastName?: string;
      photoUrl?: string;
      source?: "telegram_login" | "miniapp" | "bot";
    };

    const telegramId = body.telegramId?.trim();
    if (!telegramId) {
      return Response.json({ error: "telegramId обязателен" }, { status: 400 });
    }

    const source = body.source || "miniapp";
    await upsertTelegramUser({
      telegramId,
      username: body.username,
      firstName: body.firstName,
      lastName: body.lastName,
      photoUrl: body.photoUrl,
      source,
    });

    const user = await getTelegramUserById(telegramId);
    return Response.json({ ok: true, user });
  } catch {
    return Response.json({ error: "Не удалось обновить профиль пользователя" }, { status: 500 });
  }
}

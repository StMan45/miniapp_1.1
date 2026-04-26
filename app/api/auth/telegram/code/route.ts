import { consumeTelegramLoginCode, getTelegramUserById } from "@/lib/chat-storage";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { code?: string };
    const code = body.code?.trim();
    if (!code || !/^\d{6}$/.test(code)) {
      return Response.json({ error: "Введите 6-значный код из Telegram бота" }, { status: 400 });
    }

    const telegramId = await consumeTelegramLoginCode(code);
    if (!telegramId) {
      return Response.json({ error: "Код недействителен или истек" }, { status: 401 });
    }

    const user = await getTelegramUserById(telegramId);
    if (!user) {
      return Response.json({ error: "Профиль Telegram не найден. Напишите боту /start и повторите." }, { status: 404 });
    }

    return Response.json({
      ok: true,
      chatId: `tg:${telegramId}`,
      user: {
        telegramId: user.telegramId,
        username: user.username,
        firstName: user.firstName,
        lastName: user.lastName,
        photoUrl: user.photoUrl,
        authDate: user.authDate,
        source: user.source,
      },
    });
  } catch {
    return Response.json({ error: "Не удалось авторизоваться по коду" }, { status: 500 });
  }
}

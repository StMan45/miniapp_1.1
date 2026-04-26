import { upsertTelegramUser } from "@/lib/chat-storage";
import { TelegramLoginPayload, verifyTelegramLoginPayload } from "@/lib/telegram-auth";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as TelegramLoginPayload;
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return Response.json({ error: "TELEGRAM_BOT_TOKEN не задан" }, { status: 500 });
    }

    const verified = verifyTelegramLoginPayload(payload, botToken);
    if (!verified.ok) {
      return Response.json({ error: verified.error }, { status: 401 });
    }

    await upsertTelegramUser({
      telegramId: verified.user.telegramId,
      username: verified.user.username,
      firstName: verified.user.firstName,
      lastName: verified.user.lastName,
      photoUrl: verified.user.photoUrl,
      authDate: verified.user.authDateIso,
      source: "telegram_login",
    });

    return Response.json({
      ok: true,
      chatId: `tg:${verified.user.telegramId}`,
      user: {
        telegramId: verified.user.telegramId,
        username: verified.user.username,
        firstName: verified.user.firstName,
        lastName: verified.user.lastName,
        photoUrl: verified.user.photoUrl,
        authDate: verified.user.authDateIso,
        source: "telegram_login",
      },
    });
  } catch {
    return Response.json({ error: "Не удалось выполнить Telegram авторизацию" }, { status: 500 });
  }
}

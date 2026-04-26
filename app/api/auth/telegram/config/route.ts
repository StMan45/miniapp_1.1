export const runtime = "nodejs";

let cachedBotUsername = "";
let cacheExpiresAt = 0;

export async function GET() {
  try {
    const now = Date.now();
    if (cachedBotUsername && now < cacheExpiresAt) {
      return Response.json({ botUsername: cachedBotUsername });
    }

    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      return Response.json({ error: "TELEGRAM_BOT_TOKEN не задан" }, { status: 500 });
    }

    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const data = (await response.json()) as {
      ok?: boolean;
      result?: { username?: string };
      description?: string;
    };

    const username = data.result?.username?.trim();
    if (!response.ok || !data.ok || !username) {
      return Response.json(
        { error: data.description || "Не удалось получить username бота через Telegram API" },
        { status: 502 }
      );
    }

    cachedBotUsername = username;
    cacheExpiresAt = now + 1000 * 60 * 10;

    return Response.json({ botUsername: username });
  } catch {
    return Response.json({ error: "Не удалось загрузить конфигурацию Telegram Login" }, { status: 500 });
  }
}

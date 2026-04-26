import { addSavedLink, listSavedLinks, removeSavedLink } from "@/lib/chat-storage";

function inferDescriptionByUrl(rawUrl: string) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./i, "").toLowerCase();
    const path = parsed.pathname.toLowerCase();
    const sourceName = host.split(".")[0] || "сайт";
    const combined = `${host} ${path}`;

    const topicDictionary: Array<{ pattern: RegExp; label: string }> = [
      { pattern: /\b(news|journal|meduza|forbes|rbc|bbc|cnn)\b/, label: "новости и аналитика" },
      { pattern: /\b(course|learn|academy|edu|udemy|coursera|stepik)\b/, label: "обучение и развитие навыков" },
      { pattern: /\b(github|dev|docs|stack|code|npm)\b/, label: "разработка и технологии" },
      { pattern: /\b(shop|store|market|amazon|ozon|wb)\b/, label: "товары и покупки" },
      { pattern: /\b(travel|trip|hotel|booking|aviasales)\b/, label: "путешествия" },
      { pattern: /\b(movie|film|serial|series|kino|rezka|netflix)\b/, label: "фильмы и сериалы" },
      { pattern: /\b(music|spotify|sound|audio)\b/, label: "музыка и аудио" },
      { pattern: /\b(sport|football|nba|ufc|f1)\b/, label: "спорт" },
    ];

    const foundTopic = topicDictionary.find((item) => item.pattern.test(combined));
    const topic = foundTopic?.label || "материалы по теме сайта";

    return `Полезная ссылка: ${topic} (${sourceName}).`;
  } catch {
    return "Полезная ссылка по теме сайта.";
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const chatId = url.searchParams.get("chatId")?.trim();
    if (!chatId) {
      return Response.json({ error: "chatId обязателен" }, { status: 400 });
    }

    const links = await listSavedLinks(chatId);
    return Response.json({ links });
  } catch {
    return Response.json({ error: "Не удалось получить ссылки" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      chatId?: string;
      url?: string;
      description?: string;
    };

    const chatId = body.chatId?.trim();
    const url = body.url?.trim();
    const description = body.description?.trim() || "";

    if (!chatId) {
      return Response.json({ error: "chatId обязателен" }, { status: 400 });
    }
    if (!url) {
      return Response.json({ error: "url обязателен" }, { status: 400 });
    }
    if (!/^https?:\/\/\S+/i.test(url)) {
      return Response.json({ error: "Некорректный URL" }, { status: 400 });
    }

    const safeDescription = description || inferDescriptionByUrl(url);
    const link = await addSavedLink(chatId, url, safeDescription);
    return Response.json({ link });
  } catch {
    return Response.json({ error: "Не удалось сохранить ссылку" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { chatId?: string; id?: string };
    const chatId = body.chatId?.trim();
    const id = body.id?.trim();

    if (!chatId || !id) {
      return Response.json({ error: "chatId и id обязательны" }, { status: 400 });
    }

    const removed = await removeSavedLink(chatId, id);
    if (!removed) {
      return Response.json({ error: "Ссылка не найдена" }, { status: 404 });
    }

    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Не удалось удалить ссылку" }, { status: 500 });
  }
}

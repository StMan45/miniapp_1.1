import { addSavedLink, listSavedLinks, removeSavedLink } from "@/lib/chat-storage";

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

    const link = await addSavedLink(chatId, url, description);
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

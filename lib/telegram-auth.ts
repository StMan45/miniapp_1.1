import crypto from "node:crypto";

export type TelegramLoginPayload = {
  id?: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date?: number | string;
  hash?: string;
};

function toFlatRecord(payload: TelegramLoginPayload) {
  return {
    id: String(payload.id ?? "").trim(),
    first_name: String(payload.first_name ?? "").trim(),
    last_name: String(payload.last_name ?? "").trim(),
    username: String(payload.username ?? "").trim(),
    photo_url: String(payload.photo_url ?? "").trim(),
    auth_date: String(payload.auth_date ?? "").trim(),
    hash: String(payload.hash ?? "").trim(),
  };
}

export function verifyTelegramLoginPayload(payload: TelegramLoginPayload, botToken: string) {
  const data = toFlatRecord(payload);
  if (!data.id || !data.auth_date || !data.hash) {
    return { ok: false as const, error: "Некорректные данные Telegram Login" };
  }

  const checkString = Object.entries(data)
    .filter(([key, value]) => key !== "hash" && Boolean(value))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");

  const secretKey = crypto.createHash("sha256").update(botToken).digest();
  const expectedHash = crypto.createHmac("sha256", secretKey).update(checkString).digest("hex");

  const expectedBuffer = Buffer.from(expectedHash, "hex");
  const actualBuffer = Buffer.from(data.hash, "hex");
  const isValidHash =
    expectedBuffer.length === actualBuffer.length && crypto.timingSafeEqual(expectedBuffer, actualBuffer);

  if (!isValidHash) {
    return { ok: false as const, error: "Не удалось подтвердить Telegram подпись" };
  }

  const authDateSeconds = Number(data.auth_date);
  if (!Number.isFinite(authDateSeconds)) {
    return { ok: false as const, error: "Некорректный auth_date" };
  }

  // Accept only reasonably recent logins.
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds - authDateSeconds > 60 * 60 * 24) {
    return { ok: false as const, error: "Telegram login устарел, повторите авторизацию" };
  }

  return {
    ok: true as const,
    user: {
      telegramId: data.id,
      firstName: data.first_name,
      lastName: data.last_name,
      username: data.username,
      photoUrl: data.photo_url,
      authDateIso: new Date(authDateSeconds * 1000).toISOString(),
    },
  };
}

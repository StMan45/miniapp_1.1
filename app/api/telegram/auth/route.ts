import crypto from "node:crypto";
import { NextResponse } from "next/server";

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN ?? "";

function createTelegramSecretKey(token: string) {
  return crypto.createHmac("sha256", "WebAppData").update(token).digest();
}

function buildDataCheckString(initData: string) {
  const params = new URLSearchParams(initData);
  params.delete("hash");

  return [...params.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

function verifyTelegramInitData(initData: string, token: string) {
  if (!token) {
    return { ok: false, error: "TELEGRAM_BOT_TOKEN is not configured" };
  }

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");

  if (!hash) {
    return { ok: false, error: "Hash is missing in initData" };
  }

  const dataCheckString = buildDataCheckString(initData);
  const secret = createTelegramSecretKey(token);
  const calculatedHash = crypto
    .createHmac("sha256", secret)
    .update(dataCheckString)
    .digest("hex");

  if (calculatedHash !== hash) {
    return { ok: false, error: "Invalid initData hash" };
  }

  return { ok: true };
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const initData = typeof body?.initData === "string" ? body.initData : "";

    if (!initData) {
      return NextResponse.json(
        { ok: false, error: "initData is required" },
        { status: 400 },
      );
    }

    const verification = verifyTelegramInitData(initData, BOT_TOKEN);
    if (!verification.ok) {
      return NextResponse.json(
        { ok: false, error: verification.error },
        { status: 401 },
      );
    }

    const userRaw = new URLSearchParams(initData).get("user");
    const user = userRaw ? JSON.parse(userRaw) : null;

    return NextResponse.json({ ok: true, user });
  } catch {
    return NextResponse.json(
      { ok: false, error: "Unexpected server error" },
      { status: 500 },
    );
  }
}

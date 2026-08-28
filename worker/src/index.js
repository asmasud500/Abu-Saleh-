import { DurableObject } from "cloudflare:workers";

const ALLOWED_ORIGIN = "https://asmasud500.github.io";
const MAX_MESSAGE = 1000;
const MAX_NAME = 60;
const MAX_CONTACT = 120;
const MAX_URLS = 3;
const MAX_BODY = 15000;

function cors(origin) {
  const allowed = origin === ALLOWED_ORIGIN ? ALLOWED_ORIGIN : "null";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Session-ID, X-Chat-Client",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains"
  };
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), { status, headers: cors(origin) });
}

function clean(value, max) {
  return String(value ?? "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, max);
}

function countUrls(text) {
  return (text.match(/https?:\/\//gi) || []).length;
}

function validSession(value) {
  return /^[a-f0-9-]{36}$/i.test(value);
}

function sessionFromTelegramMessage(message) {
  const source = message?.reply_to_message?.text || message?.reply_to_message?.caption || "";
  const match = source.match(/\[CHAT:([a-f0-9-]{36})\]/i);
  return match ? match[1] : null;
}

async function telegram(env, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const result = await response.json();
  if (!response.ok || !result.ok) throw new Error("Telegram API request failed");
  return result.result;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      if (origin !== ALLOWED_ORIGIN) return new Response(null, { status: 403 });
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    // Telegram webhook: no browser CORS is required here.
    if (url.pathname === "/telegram-webhook") {
      if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

      const secret = request.headers.get("X-Telegram-Bot-Api-Secret-Token");
      if (!secret || !env.TELEGRAM_WEBHOOK_SECRET || secret !== env.TELEGRAM_WEBHOOK_SECRET) {
        return new Response("Forbidden", { status: 403 });
      }

      try {
        const length = Number(request.headers.get("Content-Length") || 0);
        if (length > MAX_BODY) return new Response("Payload Too Large", { status: 413 });

        const update = await request.json();
        const message = update.message;
        if (!message || String(message.chat?.id) !== String(env.ADMIN_CHAT_ID)) return new Response("OK");

        const sessionId = sessionFromTelegramMessage(message);
        if (!sessionId) return new Response("OK");

        const replyText = clean(message.text || message.caption || "", MAX_MESSAGE);
        if (!replyText) return new Response("OK");

        const objectId = env.CHAT_SESSIONS.idFromName(sessionId);
        const stub = env.CHAT_SESSIONS.get(objectId);
        await stub.fetch("https://chat/internal/reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: replyText,
            telegramMessageId: Number(message.message_id || 0)
          })
        });

        return new Response("OK");
      } catch (error) {
        console.error("webhook_error", error instanceof Error ? error.message : "unknown");
        // Return 200 to avoid an endless Telegram retry loop for malformed updates.
        return new Response("OK");
      }
    }

    if (origin !== ALLOWED_ORIGIN) {
      return json({ ok: false, error: "Origin not allowed" }, 403, origin);
    }

    if (url.pathname === "/health" && request.method === "GET") {
      return json({ ok: true, service: "abu-saleh-chat" }, 200, origin);
    }

    if (url.pathname === "/chat" && request.method === "GET") {
      const session = clean(url.searchParams.get("session"), 80);
      if (!validSession(session)) return json({ ok: false, error: "Invalid session" }, 400, origin);

      const stub = env.CHAT_SESSIONS.get(env.CHAT_SESSIONS.idFromName(session));
      const response = await stub.fetch("https://chat/internal/messages");
      const data = await response.json();
      return json(data, response.status, origin);
    }

    if (url.pathname !== "/chat" || request.method !== "POST") {
      return json({ ok: false, error: "Not found" }, 404, origin);
    }

    if (request.headers.get("X-Chat-Client") !== "abu-saleh-web") {
      return json({ ok: false, error: "Invalid client" }, 403, origin);
    }

    const contentType = request.headers.get("Content-Type") || "";
    if (!contentType.toLowerCase().startsWith("application/json")) {
      return json({ ok: false, error: "JSON required" }, 415, origin);
    }

    const ip = request.headers.get("CF-Connecting-IP") || "unknown";

    if (env.IP_RATE_LIMIT) {
      const ipLimit = await env.IP_RATE_LIMIT.limit({ key: `ip:${ip}` });
      if (!ipLimit.success) return json({ ok: false, error: "Too many requests. Try again later." }, 429, origin);
    }

    let data;
    try {
      const length = Number(request.headers.get("Content-Length") || 0);
      if (length > MAX_BODY) return json({ ok: false, error: "Request too large" }, 413, origin);
      data = await request.json();
    } catch {
      return json({ ok: false, error: "Invalid JSON" }, 400, origin);
    }

    // Honeypot: bots that fill this hidden field are rejected before Telegram is contacted.
    if (clean(data.website, 100)) return json({ ok: false, error: "Spam detected" }, 400, origin);

    const session = clean(data.session, 80);
    const name = clean(data.name, MAX_NAME);
    const contact = clean(data.contact, MAX_CONTACT);
    const message = clean(data.message, MAX_MESSAGE);

    if (!validSession(session) || !name || !message) {
      return json({ ok: false, error: "Name, session and message are required" }, 400, origin);
    }

    if (countUrls(message) > MAX_URLS) {
      return json({ ok: false, error: "Too many links" }, 400, origin);
    }

    if (env.SESSION_RATE_LIMIT) {
      const sessionLimit = await env.SESSION_RATE_LIMIT.limit({ key: `session:${session}` });
      if (!sessionLimit.success) return json({ ok: false, error: "Please slow down and try again." }, 429, origin);
    }

    const stub = env.CHAT_SESSIONS.get(env.CHAT_SESSIONS.idFromName(session));
    const response = await stub.fetch("https://chat/internal/message", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session, name, contact, message, ip })
    });

    const result = await response.json();
    return json(result, response.status, origin);
  }
};

export class ChatSession extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          direction TEXT NOT NULL,
          text TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          telegram_message_id INTEGER
        )
      `);
      this.ctx.storage.sql.exec(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_telegram_message
        ON messages(telegram_message_id)
        WHERE telegram_message_id IS NOT NULL AND telegram_message_id > 0
      `);
    });
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;

    if (path === "/internal/messages" && request.method === "GET") {
      const rows = this.ctx.storage.sql.exec(
        "SELECT id, direction, text, created_at FROM messages ORDER BY id DESC LIMIT 50"
      ).toArray().reverse();
      return Response.json({ ok: true, messages: rows });
    }

    if (path === "/internal/reply" && request.method === "POST") {
      const data = await request.json();
      const text = clean(data.text, MAX_MESSAGE);
      const telegramMessageId = Number(data.telegramMessageId || 0);
      if (!text) return Response.json({ ok: false, error: "Empty reply" }, { status: 400 });

      try {
        this.ctx.storage.sql.exec(
          "INSERT OR IGNORE INTO messages (direction,text,created_at,telegram_message_id) VALUES (?,?,?,?)",
          "admin", text, Date.now(), telegramMessageId
        );
      } catch (error) {
        console.error("reply_store_error", error instanceof Error ? error.message : "unknown");
        return Response.json({ ok: false }, { status: 500 });
      }

      return Response.json({ ok: true });
    }

    if (path === "/internal/message" && request.method === "POST") {
      const data = await request.json();
      const session = clean(data.session, 80);
      const name = clean(data.name, MAX_NAME);
      const contact = clean(data.contact, MAX_CONTACT);
      const text = clean(data.message, MAX_MESSAGE);

      const previous = this.ctx.storage.sql.exec(
        "SELECT text, created_at FROM messages WHERE direction='visitor' ORDER BY id DESC LIMIT 1"
      ).toArray()[0];

      // Duplicate-message protection inside a session.
      if (previous && previous.text === text && Date.now() - Number(previous.created_at) < 60000) {
        return Response.json({ ok: true, duplicate: true });
      }

      this.ctx.storage.sql.exec(
        "INSERT INTO messages (direction,text,created_at) VALUES (?,?,?)",
        "visitor", text, Date.now()
      );

      const telegramText =
        `💬 NEW WEBSITE MESSAGE\n\n[CHAT:${session}]\n👤 Name: ${name}\n📧 Contact: ${contact || "Not provided"}\n\n💬 ${text}`;

      try {
        const sent = await telegram(this.env, "sendMessage", {
          chat_id: this.env.ADMIN_CHAT_ID,
          text: telegramText,
          disable_web_page_preview: true
        });
        return Response.json({ ok: true, messageId: sent.message_id });
      } catch (error) {
        console.error("telegram_send_error", error instanceof Error ? error.message : "unknown");
        return Response.json({ ok: false, error: "Message delivery failed" }, { status: 502 });
      }
    }

    return new Response("Not found", { status: 404 });
  }
}

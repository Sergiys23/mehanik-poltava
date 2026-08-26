import app from "./worker.js";

const SESSION_MAX_AGE = 12 * 60 * 60 * 1000;
const RATE_TABLE = `
  CREATE TABLE IF NOT EXISTS security_rate_limits (
    key TEXT PRIMARY KEY,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL
  )
`;

const EXTRA_HEADERS = {
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-dns-prefetch-control": "off",
  "x-permitted-cross-domain-policies": "none",
  "cross-origin-opener-policy": "same-origin"
};

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      ...EXTRA_HEADERS,
      ...extra
    }
  });
}

function cookie(req, name) {
  const raw = req.headers.get("cookie") || "";
  const item = raw
    .split(";")
    .map(v => v.trim())
    .find(v => v.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
}

function b64(bytes) {
  let s = "";
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function hmac(secret, value) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  return b64(new Uint8Array(await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value)
  )));
}

function sessionSecret(env) {
  return env.SESSION_SECRET || env.SUPERADMIN_PASSWORD || env.ADMIN_PASSWORD || "";
}

async function sessionRole(req, env) {
  const secret = sessionSecret(env);
  if (!secret) return null;

  const token = cookie(req, "mehanik_session");
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [role, timestamp, signature] = parts;
  if (!/^(admin|superadmin)$/.test(role)) return null;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Date.now() - ts < 0 || Date.now() - ts > SESSION_MAX_AGE) {
    return null;
  }

  const expected = await hmac(secret, `${role}.${timestamp}`);
  if (signature !== expected) return null;
  return role;
}

function ip(req) {
  return String(
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-real-ip") ||
    "unknown"
  ).slice(0, 120);
}

async function rateLimit(env, key, max, windowSeconds) {
  if (!env.DB) return { allowed: true };
  try {

  await env.DB.prepare(RATE_TABLE).run();

  const now = Math.floor(Date.now() / 1000);
  const existing = await env.DB.prepare(
    `SELECT window_start,count FROM security_rate_limits WHERE key=?`
  ).bind(key).first();

  if (!existing || now - Number(existing.window_start) >= windowSeconds) {
    await env.DB.prepare(
      `INSERT OR REPLACE INTO security_rate_limits(key,window_start,count) VALUES(?,?,1)`
    ).bind(key, now).run();
    return { allowed: true, remaining: max - 1 };
  }

  const count = Number(existing.count || 0);
  if (count >= max) {
    return {
      allowed: false,
      retryAfter: Math.max(1, windowSeconds - (now - Number(existing.window_start)))
    };
  }

  await env.DB.prepare(
    `UPDATE security_rate_limits SET count=count+1 WHERE key=?`
  ).bind(key).run();

  return { allowed: true, remaining: Math.max(0, max - count - 1) };
  } catch (err) {
    console.error("security rate-limit unavailable:", err);
    return { allowed: true };
  }
}

async function cleanupRateLimits(env) {
  if (!env.DB || Math.random() > 0.02) return;
  try {
    const cutoff = Math.floor(Date.now() / 1000) - 86400;
    await env.DB.prepare(`DELETE FROM security_rate_limits WHERE window_start < ?`).bind(cutoff).run();
  } catch {}
}

function mutating(method) {
  return !["GET", "HEAD", "OPTIONS"].includes(method);
}

async function requireSuperadmin(req, env) {
  const role = await sessionRole(req, env);
  if (!role) return json({ error: "Потрібна авторизація або сесія прострочена" }, 401);
  if (role !== "superadmin") return json({ error: "Потрібні права superadmin" }, 403);
  return null;
}

function sensitiveAdminRoute(pathname, method) {
  if (pathname === "/api/google/start") return true;
  if (pathname === "/api/media/delete") return true;
  if (pathname === "/api/admin/telegram/setup") return true;
  if (pathname === "/api/admin/reviews" && mutating(method)) return true;
  if (pathname === "/api/admin/works" && mutating(method)) return true;
  if (pathname === "/api/admin/mechanics" && mutating(method)) return true;
  if (pathname === "/api/admin/blocks" && mutating(method)) return true;
  if (pathname === "/api/admin/history" && method === "DELETE") return true;
  return false;
}

async function publicRateLimit(req, env, pathname) {
  const address = ip(req);

  if (pathname === "/api/auth/login" && req.method === "POST") {
    return rateLimit(env, `login:${address}`, 10, 600);
  }

  if (pathname === "/api/bookings" && req.method === "POST") {
    return rateLimit(env, `booking:${address}`, 5, 600);
  }

  if (pathname === "/api/reviews" && req.method === "POST") {
    return rateLimit(env, `review:${address}`, 3, 600);
  }

  if (pathname === "/api/ai" && req.method === "POST") {
    return rateLimit(env, `public-ai:${address}`, 20, 600);
  }

  if (pathname === "/api/media/upload" && req.method === "POST") {
    return rateLimit(env, `media-upload:${address}`, 20, 3600);
  }

  if (pathname === "/api/admin/ai" && req.method === "POST") {
    return rateLimit(env, `admin-ai:${address}`, 30, 600);
  }

  return { allowed: true };
}

function withSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(EXTRA_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function handle(request, env, ctx) {
  const url = new URL(request.url);
  const pathname = url.pathname;

  try { await cleanupRateLimits(env); } catch (err) { console.error("rate-limit cleanup:", err); }

  const limited = await publicRateLimit(request, env, pathname);
  if (!limited.allowed) {
    return json(
      { error: "Забагато запитів. Спробуйте пізніше." },
      429,
      { "retry-after": String(limited.retryAfter || 60) }
    );
  }

  if (sensitiveAdminRoute(pathname, request.method)) {
    const denied = await requireSuperadmin(request, env);
    if (denied) return denied;
  }

  let response = await app.fetch(request, env, ctx);

  if (pathname === "/api/auth/login" && request.method === "POST" && response.ok) {
    const headers = new Headers(response.headers);
    const setCookie = headers.get("set-cookie");
    if (setCookie) {
      headers.set(
        "set-cookie",
        setCookie
          .replace(/Max-Age=604800/gi, `Max-Age=${SESSION_MAX_AGE / 1000}`)
          .replace(/SameSite=Strict/gi, "SameSite=Strict; Priority=High")
      );
    }
    response = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }

  return withSecurityHeaders(response);
}

export default {
  async fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },

  async scheduled(event, env, ctx) {
    if (typeof app.scheduled === "function") {
      return app.scheduled(event, env, ctx);
    }
  }
};

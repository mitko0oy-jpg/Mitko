// Small helpers shared by all API functions: JSON responses, errors, cookies, body parsing.

export class HttpError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const bad = (code: string, message: string) => new HttpError(400, code, message);
export const unauthorized = (message = "Влез в профила си.") => new HttpError(401, "unauthorized", message);
export const forbidden = (message = "Нямаш достъп до това.") => new HttpError(403, "forbidden", message);
export const notFound = (message = "Не е намерено.") => new HttpError(404, "not_found", message);
export const tooMany = (message = "Твърде много опити. Изчакай малко и опитай пак.") => new HttpError(429, "rate_limited", message);

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

// Wraps a handler so thrown HttpErrors become JSON responses and anything else a generic 500.
export function handle(fn: (req: Request, ctx: any) => Promise<Response>) {
  return async (req: Request, ctx: any): Promise<Response> => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        // JSON-only POSTs: a cross-site HTML form cannot send this content type without CORS.
        const ct = req.headers.get("content-type") || "";
        if (!ct.includes("application/json")) throw new HttpError(415, "unsupported", "Очаква се JSON.");
      }
      return await fn(req, ctx);
    } catch (e: any) {
      if (e instanceof HttpError) return json({ error: e.code, message: e.message }, e.status);
      console.error(e);
      return json({ error: "server_error", message: "Нещо се обърка. Опитай пак след малко." }, 500);
    }
  };
}

export async function body<T = any>(req: Request, maxBytes = 64_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "too_large", "Заявката е твърде голяма.");
  if (!text) return {} as T;
  try {
    return JSON.parse(text);
  } catch {
    throw bad("bad_json", "Невалидни данни.");
  }
}

// Path after a prefix, e.g. sub(req, "/api/auth/") on /api/auth/login -> ["login"]
export function sub(req: Request, prefix: string): string[] {
  const p = new URL(req.url).pathname;
  return p.startsWith(prefix) ? p.slice(prefix.length).split("/").filter(Boolean).map(decodeURIComponent) : [];
}

export function getCookie(req: Request, name: string): string | null {
  const raw = req.headers.get("cookie") || "";
  for (const part of raw.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

export function cookieHeader(name: string, value: string, maxAgeSec: number, secure: boolean): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? "; Secure" : ""}`;
}

export const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function clientIp(req: Request, ctx: any): string {
  return (ctx && ctx.ip) || req.headers.get("x-nf-client-connection-ip") || req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
}

export const env = (k: string): string | undefined => {
  const g: any = globalThis as any;
  return g.Netlify?.env?.get?.(k) ?? process.env[k];
};

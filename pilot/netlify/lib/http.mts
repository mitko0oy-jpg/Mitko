// Small HTTP helpers shared by the functions.
export const env = (k: string): string | undefined => {
  const g: any = globalThis as any;
  return g.Netlify?.env?.get?.(k) ?? process.env[k];
};

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) {
    super(message);
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });
}

export function fail(e: any): Response {
  if (e instanceof HttpError) return json({ error: e.code, message: e.message, details: e.details }, e.status);
  if (e?.status && e?.message) return json({ error: "error", message: e.message, details: e.details }, e.status);
  console.error(e);
  return json({ error: "server", message: "Нещо се обърка на сървъра. Опитай пак." }, 500);
}

export function cookie(req: Request, name: string): string | null {
  const c = req.headers.get("cookie") || "";
  for (const part of c.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}

export async function body(req: Request): Promise<any> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "bad_json", "Невалидна заявка.");
  }
}

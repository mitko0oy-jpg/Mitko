// Zadarma API: the agent's outgoing calls go through Zadarma's callback.
//
// Why: Zadarma lets a Bulgarian number make calls only from Bulgaria, and
// ElevenLabs calls from its own servers abroad, so those calls are blocked
// ("These calls are only possible within the country"). With a callback,
// Zadarma itself rings the customer first and, when they answer, connects
// them to our number +359 2 437 0192. That number forwards to ElevenLabs
// (SIP URI), so for ElevenLabs it is an ordinary incoming call. The order
// data reaches the agent through the conversation initiation webhook
// (netlify/functions/el-init.mts, lib/callback.mjs).
import { createHash, createHmac } from "node:crypto";

const API = "https://api.zadarma.com";

/** PHP's urlencode(): what Zadarma's http_build_query signs. */
export function phpUrlencode(s) {
  return encodeURIComponent(String(s))
    .replace(/[!'()*~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, "+");
}

/** Params sorted by name and joined the way PHP's http_build_query does. */
export function buildQuery(params) {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== null)
    .sort()
    .map((k) => `${phpUrlencode(k)}=${phpUrlencode(params[k])}`)
    .join("&");
}

/**
 * Zadarma's signature: base64( hex( HMAC-SHA1(path + query + md5(query), secret) ) ).
 * `path` is the method path, e.g. "/v1/request/callback/".
 */
export function sign(path, query, secret) {
  const md5 = createHash("md5").update(query).digest("hex");
  const hex = createHmac("sha1", secret).update(path + query + md5).digest("hex");
  return Buffer.from(hex).toString("base64");
}

/** GET a Zadarma API method. Throws on HTTP errors and on `status: "error"`. */
export async function zadarmaGet({ key, secret, path, params = {}, fetchImpl = fetch }) {
  if (!key || !secret) throw new Error("Zadarma API key/secret are not set (ZADARMA_KEY, ZADARMA_SECRET)");
  const query = buildQuery(params);
  const res = await fetchImpl(`${API}${path}${query ? "?" + query : ""}`, {
    headers: { Authorization: `${key}:${sign(path, query, secret)}` },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = { status: "error", message: text };
  }
  if (!res.ok || body.status !== "success") {
    const err = new Error(`Zadarma ${path} failed (${res.status}): ${body.message || text}`.slice(0, 400));
    // 429 and 5xx are worth trying again later; anything else needs a look.
    err.status = res.status === 200 ? 400 : res.status;
    throw err;
  }
  return body;
}

/**
 * Ask Zadarma to ring `to` and, when they answer, connect them to `from`.
 * - from: our number (+35924370192). Ringing the number itself is faster than an extension.
 * - to:   the customer, with a leading "+", or the PBX adds 359 a second time.
 * - sip:  the PBX extension the call is billed to (e.g. "100").
 * - predicted: 1 = ring the customer first, connect the agent only when they answer.
 */
export function requestCallback({ key, secret, from, to, sip, predicted = 1, fetchImpl = fetch }) {
  const digits = String(to).replace(/\D/g, "");
  return zadarmaGet({
    key,
    secret,
    path: "/v1/request/callback/",
    params: { from, to: "+" + digits, ...(sip ? { sip } : {}), ...(predicted ? { predicted } : {}) },
    fetchImpl,
  });
}

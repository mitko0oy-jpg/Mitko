import type { Config } from "@netlify/functions";
import { requireUser } from "../lib/auth.mts";
import { formatCode, newCode, normalizeCode } from "../lib/codes.mts";
import { event, hit, one, q, tx } from "../lib/db.mts";
import { bad, body, clientIp, forbidden, handle, HttpError, json, notFound, str, sub, tooMany } from "../lib/http.mts";
import { cleanLabel, cleanState, DEVICE_IDLE_DAYS, deviceHash, latestBank, mergeState, publicId, validDevice } from "../lib/trener.mts";

// НВО тренажор, opened with a personal code from a PDF or a box sticker. No account and no password:
// the code is the key, each code works on up to max_devices browsers, and the grades are kept with the code.

const devicesOf = async (code: string, me?: string) =>
  (await q<any>("SELECT device, label, created_at, last_seen FROM trener_devices WHERE code = $1 ORDER BY created_at", [code])).map((d) => ({
    id: publicId(d.device),
    label: d.label,
    since: d.created_at,
    lastSeen: d.last_seen,
    me: d.device === me,
  }));

const bgDate = (d: string | Date) => new Intl.DateTimeFormat("bg-BG", { timeZone: "Europe/Sofia", day: "numeric", month: "numeric", year: "numeric" }).format(new Date(d));

// Access runs for `months` from the first opening, or until the batch's fixed `valid_until`.
const START_EXPIRY = `expires_at = COALESCE(expires_at, CASE WHEN valid_until IS NOT NULL THEN valid_until
  WHEN months IS NOT NULL THEN now() + make_interval(months => months) END)`;

// Validity for a new batch: {months: 12} or {validUntil: "2027-06-30"}; neither means no limit.
function termOf(b: any) {
  const months = Number(b.months);
  if (Number.isInteger(months) && months >= 1 && months <= 60) return { months, validUntil: null };
  if (typeof b.validUntil === "string" && /^\d{4}-\d{2}-\d{2}$/.test(b.validUntil)) return { months: null, validUntil: `${b.validUntil}T23:59:59+03:00` };
  return { months: null, validUntil: null };
}

function codeOf(raw: unknown) {
  const code = normalizeCode(str(raw, 40));
  if (code.length < 8) throw bad("code", "Провери кода – той е от 10 букви и цифри.");
  return code;
}

async function findKey(req: Request, ctx: any, code: string, forUpdate?: (text: string, p?: unknown[]) => Promise<any[]>) {
  const rows = forUpdate
    ? await forUpdate("SELECT * FROM trener_keys WHERE code = $1 FOR UPDATE", [code])
    : await q("SELECT * FROM trener_keys WHERE code = $1", [code]);
  const key = rows[0];
  if (!key) {
    // Guessing codes is pointless (31^10 combinations), but slow it down anyway.
    if (!(await hit(`trener-miss:${clientIp(req, ctx)}`, 20, 3600))) throw tooMany();
    throw notFound("Няма такъв код. Провери буквите и цифрите.");
  }
  if (key.disabled_at) throw new HttpError(403, "disabled", "Този код е спрян. Свържи се с Еду БЕЛ.");
  if (key.expires_at && new Date(key.expires_at) < new Date()) throw new HttpError(403, "expired", `Достъпът до тренажора изтече на ${bgDate(key.expires_at)}`);
  return key;
}

async function requireDevice(code: string, raw: unknown) {
  if (!validDevice(raw)) throw bad("device", "Отвори тренажора от линка отново.");
  const dev = deviceHash(raw);
  const row = await one("SELECT 1 FROM trener_devices WHERE code = $1 AND device = $2", [code, dev]);
  if (!row) throw new HttpError(409, "device_removed", "Това устройство вече не е записано към кода.");
  return dev;
}

export default handle(async (req, ctx) => {
  const parts = sub(req, "/api/trener/");
  if (parts[0] === "admin") return admin(req, parts.slice(1));
  if (req.method !== "POST") throw notFound();
  if (!(await hit(`trener:${clientIp(req, ctx)}`, 600, 600))) throw tooMany();
  const b = await body(req, 400_000);
  const code = codeOf(b.code);

  // Opens the trainer on this browser: registers it if there is a free place, then sends the grades and the questions.
  if (parts[0] === "open") {
    if (!validDevice(b.device)) throw bad("device", "Отвори тренажора от линка отново.");
    const dev = deviceHash(b.device);
    const res = await tx(async (t) => {
      const key = await findKey(req, ctx, code, t);
      await t(`DELETE FROM trener_devices WHERE code = $1 AND last_seen < now() - make_interval(days => $2)`, [code, DEVICE_IDLE_DAYS]);
      const [known] = await t("SELECT 1 FROM trener_devices WHERE code = $1 AND device = $2", [code, dev]);
      let isNew = false;
      if (known) {
        await t("UPDATE trener_devices SET last_seen = now() WHERE code = $1 AND device = $2", [code, dev]);
      } else {
        const [{ n }] = await t<{ n: number }>("SELECT count(*)::int AS n FROM trener_devices WHERE code = $1", [code]);
        if (n >= key.max_devices) return { full: true, key };
        await t("INSERT INTO trener_devices (code, device, label) VALUES ($1, $2, $3)", [code, dev, cleanLabel(b.label)]);
        isNew = true;
      }
      let state = key.state;
      if (b.state) {
        state = mergeState(key.state, b.state);
        await t("UPDATE trener_keys SET state = $2 WHERE code = $1", [code, JSON.stringify(state)]);
      }
      const [dates] = await t(`UPDATE trener_keys SET first_used = COALESCE(first_used, now()), last_used = now(), ${START_EXPIRY} WHERE code = $1 RETURNING expires_at`, [code]);
      // A batch with a fixed end date can be opened for the first time after that date.
      if (dates.expires_at && new Date(dates.expires_at) < new Date()) throw new HttpError(403, "expired", `Достъпът до тренажора изтече на ${bgDate(dates.expires_at)}`);
      return { full: false, key, state: cleanState(state), isNew, expiresAt: dates.expires_at };
    });
    if (res.full) {
      await event("trener_devices_full", { batch: res.key.batch });
      return json(
        {
          error: "devices_full",
          message: `Този код вече е отворен на ${res.key.max_devices} устройства.`,
          maxDevices: res.key.max_devices,
          idleDays: DEVICE_IDLE_DAYS,
          devices: await devicesOf(code),
        },
        409,
      );
    }
    if (res.isNew) await event("trener_device_added", { batch: res.key.batch });
    const bank = await latestBank();
    if (!bank) throw new HttpError(503, "not_ready", "Тренажорът още се подготвя. Опитай пак след малко.");
    return json({
      code: formatCode(code),
      maxDevices: res.key.max_devices,
      idleDays: DEVICE_IDLE_DAYS,
      expiresAt: res.expiresAt,
      devices: await devicesOf(code, dev),
      state: res.state,
      bankId: bank.id,
      bank: Number(b.have) === bank.id ? undefined : bank.data,
    });
  }

  // Saves the grades; results from other devices are merged in, never lost.
  if (parts[0] === "save") {
    await findKey(req, ctx, code);
    const dev = await requireDevice(code, b.device);
    const state = await tx(async (t) => {
      const [key] = await t("SELECT state FROM trener_keys WHERE code = $1 FOR UPDATE", [code]);
      const merged = mergeState(key.state, b.state);
      await t("UPDATE trener_keys SET state = $2, last_used = now() WHERE code = $1", [code, JSON.stringify(merged)]);
      await t("UPDATE trener_devices SET last_seen = now() WHERE code = $1 AND device = $2", [code, dev]);
      return merged;
    });
    return json({ state });
  }

  // Frees a place: from one of the registered devices, remove another one (or this one).
  if (parts[0] === "forget") {
    await findKey(req, ctx, code);
    const dev = await requireDevice(code, b.device);
    const target = str(b.target, 20);
    const all = await q<any>("SELECT device FROM trener_devices WHERE code = $1", [code]);
    const victim = all.find((d) => publicId(d.device) === target);
    if (!victim) throw notFound("Това устройство вече е премахнато.");
    await q("DELETE FROM trener_devices WHERE code = $1 AND device = $2", [code, victim.device]);
    await event("trener_device_removed", { self: victim.device === dev });
    return json({ devices: await devicesOf(code, dev), removedSelf: victim.device === dev });
  }

  throw notFound();
});

// Support page for the owner (/kodove/): find a code, free its devices, stop or restart it, add a note.
async function admin(req: Request, parts: string[]) {
  await requireUser(req, ["admin"]);

  if (req.method === "GET" && parts[0] === "summary") {
    const batches = await q(
      `SELECT batch, count(*)::int AS total,
              count(first_used)::int AS used,
              count(*) FILTER (WHERE last_used > now() - interval '7 days')::int AS active7,
              count(disabled_at)::int AS disabled, count(*) FILTER (WHERE expires_at < now())::int AS expired,
              min(created_at) AS created_at, max(months) AS months, max(valid_until) AS valid_until
         FROM trener_keys GROUP BY batch ORDER BY min(created_at) DESC`,
    );
    const full = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM (SELECT k.code FROM trener_keys k JOIN trener_devices d ON d.code = k.code
        GROUP BY k.code, k.max_devices HAVING count(*) >= k.max_devices) x`,
    );
    const bank = await one("SELECT id, created_at, jsonb_array_length(data->'questions') AS questions FROM trener_bank ORDER BY id DESC LIMIT 1");
    return json({ batches, full: full?.n || 0, bank });
  }

  // A new batch of codes: stickers for the boxes or PDFs for customers. Printed from /kodove/.
  if (req.method === "POST" && parts[0] === "codes") {
    const b = await body(req);
    const count = Math.max(1, Math.min(500, Number(b.count) || 1));
    const batch = str(b.batch, 60) || `партида-${new Date().toISOString().slice(0, 10)}`;
    const term = termOf(b);
    const codes: string[] = [];
    while (codes.length < count) {
      const c = newCode();
      const r = await q(
        "INSERT INTO trener_keys (code, batch, max_devices, months, valid_until) VALUES ($1, $2, 3, $3, $4) ON CONFLICT (code) DO NOTHING RETURNING code",
        [c, batch, term.months, term.validUntil],
      );
      if (r.length) codes.push(formatCode(c));
    }
    await event("trener_codes_created", { batch, count });
    return json({ batch, codes, months: term.months, validUntil: term.validUntil });
  }

  // The codes of one batch, to print them again (optionally only the ones nobody has opened yet).
  if (req.method === "GET" && parts[0] === "batch") {
    const sp = new URL(req.url).searchParams;
    const rows = await q<any>(
      `SELECT code, first_used, disabled_at, note, months, valid_until FROM trener_keys WHERE batch = $1 AND ($2 = '' OR first_used IS NULL) ORDER BY created_at, code`,
      [sp.get("batch") || "", sp.get("unused") === "1" ? "1" : ""],
    );
    return json({ codes: rows.map((r) => ({ code: formatCode(r.code), used: !!r.first_used, disabled: !!r.disabled_at, note: r.note, months: r.months, validUntil: r.valid_until })) });
  }

  if (req.method === "GET" && parts[0] === "key") {
    const code = codeOf(new URL(req.url).searchParams.get("code"));
    const key = await one<any>("SELECT * FROM trener_keys WHERE code = $1", [code]);
    if (!key) throw notFound("Няма такъв код.");
    return json({ key: keyView(key), devices: await devicesOf(code) });
  }

  if (req.method === "POST" && parts[0] === "key") {
    const b = await body(req);
    const code = codeOf(b.code);
    const key = await one<any>("SELECT * FROM trener_keys WHERE code = $1", [code]);
    if (!key) throw notFound("Няма такъв код.");
    if (b.action === "free") await q("DELETE FROM trener_devices WHERE code = $1", [code]);
    else if (b.action === "disable") await q("UPDATE trener_keys SET disabled_at = now() WHERE code = $1", [code]);
    else if (b.action === "enable") await q("UPDATE trener_keys SET disabled_at = NULL WHERE code = $1", [code]);
    else if (b.action === "note") await q("UPDATE trener_keys SET note = $2 WHERE code = $1", [code, str(b.note, 300)]);
    else if (b.action === "extend") {
      // Opened: push the end date (from today if it already passed). Not opened yet: a longer term from the first opening.
      const n = Math.max(1, Math.min(36, Number(b.months) || 12));
      if (key.first_used) await q("UPDATE trener_keys SET expires_at = GREATEST(COALESCE(expires_at, now()), now()) + make_interval(months => $2) WHERE code = $1", [code, n]);
      else await q("UPDATE trener_keys SET months = COALESCE(months, 0) + $2, valid_until = NULL WHERE code = $1", [code, n]);
    }
    else throw bad("action", "Непознато действие.");
    const fresh = await one<any>("SELECT * FROM trener_keys WHERE code = $1", [code]);
    return json({ key: keyView(fresh), devices: await devicesOf(code) });
  }
  throw forbidden();
}

function keyView(k: any) {
  const hist = Array.isArray(k.state?.hist) ? k.state.hist : [];
  const last = hist[hist.length - 1];
  return {
    code: formatCode(k.code),
    batch: k.batch,
    note: k.note,
    maxDevices: k.max_devices,
    createdAt: k.created_at,
    firstUsed: k.first_used,
    lastUsed: k.last_used,
    disabled: !!k.disabled_at,
    months: k.months,
    validUntil: k.valid_until,
    expiresAt: k.expires_at,
    expired: !!k.expires_at && new Date(k.expires_at) < new Date(),
    tests: hist.length,
    last: last ? { m: last.m, p: last.p, n: last.n, d: last.d } : null,
  };
}

export const config: Config = { path: "/api/trener/*" };

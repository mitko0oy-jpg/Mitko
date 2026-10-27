import { hasFullAccess } from "./access.mts";
import { hit, one, q } from "./db.mts";
import { env, HttpError, tooMany } from "./http.mts";

const FREE_TOTAL = () => Number(env("AI_FREE_TOTAL") || 20); // lifetime messages without a pass
const PAID_DAILY = () => Number(env("AI_PAID_DAILY") || 60);
const GLOBAL_DAILY = () => Number(env("AI_GLOBAL_DAILY") || 3000);

// Checks the child's AI allowance and counts one use. Throws a friendly error when it is used up.
export async function spend(childId: number, parentId: number, grade: number) {
  if (!(await hit(`ai:burst:${childId}`, 12, 60))) throw tooMany("Много въпроси наведнъж. Изчакай минута.");
  const today = new Date().toISOString().slice(0, 10);
  if (!(await hit(`ai:global:${today}`, GLOBAL_DAILY(), 86400))) {
    throw new HttpError(503, "ai_busy", "AI е натоварен днес. Опитай утре.");
  }
  const full = await hasFullAccess(parentId, grade);
  if (full) {
    const r = await one<{ count: number }>("SELECT count FROM ai_usage WHERE child_id = $1 AND day = $2", [childId, today]);
    if ((r?.count || 0) >= PAID_DAILY()) throw new HttpError(429, "ai_daily", "Стига толкова за днес – утре продължаваме!");
  } else {
    const r = await one<{ n: number }>("SELECT COALESCE(sum(count), 0)::int AS n FROM ai_usage WHERE child_id = $1", [childId]);
    if ((r?.n || 0) >= FREE_TOTAL()) {
      throw new HttpError(402, "ai_free_used", "Безплатните разговори свършиха. Покажи на родител, за да отключи пълния достъп.");
    }
  }
  await q(
    "INSERT INTO ai_usage (child_id, day, count) VALUES ($1, $2, 1) ON CONFLICT (child_id, day) DO UPDATE SET count = ai_usage.count + 1",
    [childId, today],
  );
}

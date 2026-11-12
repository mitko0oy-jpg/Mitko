// Minimal Telegram bot client: send a message to Mitko's chat.

export async function sendTelegram({ token, chatId, text, fetchImpl = fetch }) {
  if (!token || !chatId) {
    console.log("[telegram not configured]\n" + text);
    return false;
  }
  const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", link_preview_options: { is_disabled: true } }),
  });
  if (!res.ok) {
    console.error("Telegram send failed", res.status, (await res.text()).slice(0, 300));
    return false;
  }
  return true;
}

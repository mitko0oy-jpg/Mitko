// Print station: waits for new waybills and prints their labels (Speedy together, Econt one by one).
import { api, COURIER, esc, shell, when } from "./app.js";

const $ = (id) => document.getElementById(id);
await shell("pechat");

let busy = false;
let queue = [];
const KEY = "pechat-auto";
try {
  $("auto").checked = localStorage.getItem(KEY) === "1";
} catch {
  /* private window */
}
$("auto").onchange = () => {
  try {
    localStorage.setItem(KEY, $("auto").checked ? "1" : "0");
  } catch {
    /* ignore */
  }
  if ($("auto").checked) tick();
};

function printPdf(url) {
  return new Promise((resolve, reject) => {
    const frame = $("frame");
    frame.onload = () => {
      try {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        setTimeout(resolve, 1500);
      } catch (e) {
        // Some browsers do not allow printing a PDF from a frame: open it in a tab instead.
        window.open(url, "_blank", "noopener");
        resolve();
      }
    };
    frame.onerror = reject;
    frame.src = url;
  });
}

async function fetchPdf(ids) {
  const res = await fetch(`/api/waybills/label?ids=${ids.join(",")}`, { credentials: "same-origin" });
  if (!res.ok) {
    let msg = "Етикетът не се отвори.";
    try {
      msg = (await res.json()).message || msg;
    } catch {
      /* not json */
    }
    throw new Error(msg);
  }
  return URL.createObjectURL(await res.blob());
}

async function printBatch(list) {
  const speedy = list.filter((o) => o.courier === "speedy");
  const groups = [...(speedy.length ? [speedy] : []), ...list.filter((o) => o.courier !== "speedy").map((o) => [o])];
  for (const g of groups) {
    const ids = g.map((o) => o.id);
    try {
      const url = await fetchPdf(ids);
      await printPdf(url);
      for (const o of g) $("done").insertAdjacentHTML("afterbegin", `<li>№ ${esc(o.order_no)} – ${esc(COURIER[o.courier] || o.courier)} ${esc(o.tracking_no)}<div class="muted small">${when(new Date().toISOString())}</div></li>`);
    } catch (e) {
      for (const o of g) $("done").insertAdjacentHTML("afterbegin", `<li class="err">№ ${esc(o.order_no)} – ${esc(e.message)}</li>`);
    }
  }
}

function render() {
  $("queue").innerHTML = queue.length
    ? `<table class="tbl"><tbody>${queue
        .map((o) => `<tr><td><b>№ ${esc(o.order_no)}</b> <span class="muted small">${esc(o.shop_label)}</span></td><td>${esc(o.customer_name)}</td><td>${esc(COURIER[o.courier] || o.courier)} ${esc(o.tracking_no)}</td><td class="muted small">${when(o.at)}</td></tr>`)
        .join("")}</tbody></table>`
    : `<div class="empty">Няма нови товарителници.</div>`;
  $("printAll").disabled = !queue.length || busy;
}

async function tick() {
  if (busy) return;
  try {
    queue = (await api("/api/waybills/queue")).queue;
    $("checked").textContent = `проверено ${new Date().toLocaleTimeString("bg-BG", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`;
    render();
    if ($("auto").checked && queue.length) {
      busy = true;
      render();
      await printBatch(queue);
      busy = false;
      queue = (await api("/api/waybills/queue")).queue;
      render();
    }
  } catch (e) {
    busy = false;
    $("checked").textContent = e.message;
  }
}

$("printAll").onclick = async () => {
  busy = true;
  render();
  await printBatch(queue);
  busy = false;
  tick();
};

tick();
setInterval(tick, 20000);

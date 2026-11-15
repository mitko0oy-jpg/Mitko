import { html, icon, eur, pct, toast, x2, ask } from "../ui.js";
import { isDemo, resetDemo } from "../api.js";

const CONN = {
  meta: ["Мета (Marketing API v27)", "META_TOKEN – токен на системен потребител с ads_read и ads_management"],
  sales: ["Магазин (ConvertBuilder)", "SALES_MCP_URL (сървърът за продажби), SALES_URL или уебхук към /api/hook/orders"],
  ai: ["Claude (през Netlify AI Gateway)", "Включва се сам в Netlify – без ключ"],
  video: ["Higgsfield (банери и видео)", "Ключ от console.higgsfield.ai – HIGGSFIELD_API_KEY"],
  adlib: ["Библиотека с реклами", "Същият токен на Мета + потвърдена самоличност"],
};
const ST = { ok: ["свързано", "good"], demo: ["демо", "honey"], missing: ["не е свързано", "warn"], error: ["грешка", "bad"], unknown: ["?", "muted"] };

export default {
  range: false,
  async render({ call }) {
    const d = await call("settingsView");
    const S = d.settings;
    let theme = "auto";
    try {
      theme = localStorage.getItem("pilot.theme") || "auto";
    } catch {}
    return html`
      <section class="card m-only" style="padding:6px 18px;margin-bottom:18px;flex-direction:column">
        ${[["kreativi", "image", "Креативи"], ["pazar", "globe", "Пазар"], ["obuchenie", "brain", "Обучение"]].map(([h, ic, t]) => html`<a class="line" href="#${h}" style="grid-template-columns:auto 1fr auto;gap:12px"><span class="muted">${icon(ic)}</span><span class="n">${t}</span><span class="faint">${icon("chevron")}</span></a>`)}
      </section>

      <section class="card hero">
        <div class="row between" style="align-items:flex-start">
          <div><h2>Себестойност и разходи</h2>
            <p class="verdict" style="margin-top:8px">${S.econ.costsConfirmedAt ? html`Потвърдени на <b>${new Date(S.econ.costsConfirmedAt).toLocaleDateString("bg-BG")}</b>${S.econ.tabloImportedAt ? " – пренесени от „Табло Печалба“" : ""}.` : html`Пренеси ги от „Табло Печалба“ – веднъж, за минута. След това всичко е тук.`}</p></div>
          ${S.econ.costsConfirmedAt ? html`<span class="pill good">${icon("check")} готово</span>` : html`<span class="pill warn">не са потвърдени</span>`}
        </div>
        ${S.econ.costsConfirmedAt ? "" : html`<ol class="small" style="margin:14px 0 0;padding-left:20px;line-height:1.8"><li>В „Табло Печалба“ натисни <b>Архив</b> – телефонът запазва файл <span class="mono">tablo-arhiv-….json</span>.</li><li>Тук натисни <b>Качи архива</b> и избери файла.</li></ol>`}
        <div class="row" style="margin-top:18px">
          <label class="btn ${S.econ.costsConfirmedAt ? "" : "honey"}" for="tabloFile" style="cursor:pointer">${icon("upload")} Качи архива от „Табло Печалба“</label><input type="file" id="tabloFile" accept=".json,application/json" hidden>
          ${S.econ.costsConfirmedAt ? "" : html`<button class="btn ghost" data-act="confirmCosts">Цените по-долу са верни</button>`}
        </div>
      </section>
      <div class="grid g2" style="margin-top:18px">
        <section class="card">
          <div class="card-h"><h2>Продукти</h2></div>
          <p class="tiny muted" style="margin-top:-6px">Себестойността е <b>за цялата поръчка</b>, както в „Табло Печалба“ (с подаръка и доставката). Носи я най-скъпият разпознат продукт; допълнителните платени артикули добавят % от цената си. Ако доставката не е включена – впиши куриер в „Направления и доставка“.</p>
          <div class="tbl-wrap"><table class="tbl" id="prods"><thead><tr><th>Продукт</th><th>Ключови думи</th><th>Себест. €</th><th></th></tr></thead><tbody>
            ${S.econ.products.map((p) => html`<tr><td><input class="input" name="name" value="${p.name}"></td><td><input class="input" name="keys" value="${p.keys}"></td><td><input class="input" name="cost" type="number" step="0.01" style="width:80px" value="${p.cost}"></td><td><button class="btn xs ghost" data-act="delRow">${icon("x")}</button></td></tr>`)}
          </tbody></table></div>
          <div class="row" style="margin-top:10px"><button class="btn sm" data-act="addProd">${icon("plus")} Продукт</button><button class="btn primary sm" data-act="saveProds">Запази</button></div>
        </section>
        <section class="card">
          <div class="card-h"><h2>Фиксирани разходи на месец</h2><span class="hint">${eur(d.fixedPerDay)} на ден</span></div>
          <div class="tbl-wrap"><table class="tbl" id="fixed"><thead><tr><th>Разход</th><th>€ / месец</th><th></th></tr></thead><tbody>
            ${Object.entries(S.econ.fixedMonthly || {}).map(([k, v]) => html`<tr><td><input class="input" name="k" value="${k}"></td><td><input class="input" name="v" type="number" style="width:100px" value="${v}"></td><td><button class="btn xs ghost" data-act="delRow">${icon("x")}</button></td></tr>`)}
          </tbody></table></div>
          <div class="row" style="margin-top:10px"><button class="btn sm" data-act="addFixed">${icon("plus")} Разход</button><button class="btn primary sm" data-act="saveFixed">Запази</button></div>
        </section>
      </div>


      <details class="card" style="margin-top:18px">
        <summary>${icon("gear")} Още настройки – марж, връзки, направления, конкуренти</summary>
      <div class="grid g2">
        <section class="card flat" style="padding:0;margin-top:22px">
          <div class="card-h"><h2>${icon("target")} Марж</h2><span class="hint">Изискването: минимум 25–30%</span></div>
          <div class="grid g2" style="gap:12px">
            <div class="field"><label>Минимум (под него режем)</label><input class="input" id="mFloor" type="number" step="1" value="${Math.round(S.econ.marginFloor * 100)}"></div>
            <div class="field"><label>Цел (над нея скалираме)</label><input class="input" id="mTarget" type="number" step="1" value="${Math.round(S.econ.marginTarget * 100)}"></div>
            <div class="field"><label>Себестойност по подразбиране (% от цената)</label><input class="input" id="mCogs" type="number" step="1" value="${Math.round((S.econ.defaultCogsPct ?? 0.3) * 100)}"></div>
            <div class="field"><label>Месечен рекламен бюджет (€, по желание)</label><input class="input" id="mBudget" type="number" value="${S.monthlyBudget ?? ""}"></div>
          </div>
          <p class="tiny muted">Маржът = нетен оборот (без ДДС, само платените пратки) − стока − куриер и наложен платеж − върнати пратки − реклама, разделено на нетния оборот.</p>
          <button class="btn primary sm" data-act="saveMargin">Запази</button>
        </section>
        <section class="card flat" style="padding:0;margin-top:22px">
          <div class="card-h"><h2>${icon("refresh")} Връзки</h2>${isDemo() ? html`<span class="pill honey">демо</span>` : ""}</div>
          <div class="list">${Object.entries(CONN).map(([k, [name, how]]) => {
            const s = d.connections[k] || "missing";
            return html`<div class="item" style="padding:9px 0"><div class="body"><div class="t small">${name}</div><div class="r tiny">${how}</div></div><span class="pill ${(ST[s] || ST.unknown)[1]}">${(ST[s] || ST.unknown)[0]}</span></div>`;
          })}</div>
          ${isDemo() ? html`<p class="tiny muted">В демо режим всичко е примерно. За истинските акаунти приложението се качва в Netlify и токените се въвеждат там като скрити настройки – никога в кода.</p><button class="btn sm" data-act="reset">${icon("undo")} Изчисти демо промените</button>` : ""}
        </section>
      </div>

      <section class="card flat" style="padding:0;margin-top:22px" style="margin-top:16px">
        <div class="card-h"><h2>Направления и доставка</h2><span class="hint">ДДС, куриер и връщания – за реалния марж</span></div>
        <div class="tbl-wrap"><table class="tbl" id="accts"><thead><tr><th>Направление</th><th>Държава</th><th>ДДС %</th><th>Куриер €</th><th>Наложен пл. %</th><th>Връщане €</th><th>Сайтове</th><th>Потвърдени</th><th>Доставени</th><th>Мета↔магазин</th><th>Вкл.</th></tr></thead><tbody>
          ${d.accounts.map((a) => html`<tr data-id="${a.id}">
            <td class="l"><b class="strong">${a.name}</b></td>
            <td><select class="select" name="country" style="width:80px">${["BG", "SK", "SI", "HU"].map((c) => html`<option ${a.country === c ? "selected" : ""}>${c}</option>`)}</select></td>
            <td><input class="input" name="vat" type="number" style="width:70px" value="${Math.round((a.vat ?? 0.2) * 100)}"></td>
            <td><input class="input" name="courier" type="number" step="0.1" style="width:75px" value="${a.courier ?? 4}"></td>
            <td><input class="input" name="codFeePct" type="number" step="0.1" style="width:70px" value="${((a.codFeePct ?? 0.012) * 100).toFixed(1)}"></td>
            <td><input class="input" name="returnCost" type="number" step="0.1" style="width:75px" value="${a.returnCost ?? 3.5}"></td>
            <td><input class="input" name="sites" style="width:110px" value="${(a.sites || []).join(",")}"></td>
            <td>${pct(a.rates?.confirm)}</td><td>${pct(a.rates?.deliver)}</td><td>×${x2(a.q)}</td>
            <td><label class="switch"><input type="checkbox" name="on" ${a.on !== false ? "checked" : ""}><span></span></label></td>
          </tr>`)}
        </tbody></table></div>
        <button class="btn primary sm" data-act="saveAccts" style="margin-top:10px">Запази</button>
      </section>

      <section class="card flat" style="padding:0;margin-top:22px" style="margin-top:16px">
        <div class="card-h"><h2>Как се разпределят кампаниите</h2><span class="hint">Един рекламен акаунт може да върти няколко магазина</span></div>
        <p class="tiny muted" style="margin-top:-6px">Всяка кампания отива в първото направление, чиято ключова дума се среща в името ѝ. Ако няма такава – в направлението по подразбиране на акаунта (Словения → BeeVenom SI, Словакия → SK, Унгария → HU, останалите → BeeVenom BG). Поръчките отиват по сайт.</p>
        <div class="tbl-wrap"><table class="tbl" id="lines"><thead><tr><th>Направление</th><th>Държава</th><th>Сайтове</th><th>Ключови думи в името на кампанията</th><th></th></tr></thead><tbody>
          ${(S.lines || []).map((l) => html`<tr data-id="${l.id}"><td><input class="input" name="name" value="${l.name}"></td><td><select class="select" name="country" style="width:80px">${["BG", "SK", "SI", "HU"].map((c) => html`<option ${l.country === c ? "selected" : ""}>${c}</option>`)}</select></td><td><input class="input" name="sites" style="width:120px" value="${(l.sites || []).join(",")}"></td><td><input class="input" name="keywords" value="${(l.keywords || []).join(", ")}"></td><td><button class="btn xs ghost" data-act="delRow">${icon("x")}</button></td></tr>`)}
        </tbody></table></div>
        <div class="row" style="margin-top:10px"><button class="btn sm" data-act="addLine">${icon("plus")} Направление</button><button class="btn primary sm" data-act="saveLines">Запази</button></div>
      </section>

      <div class="grid g2" style="margin-top:22px">
        <section class="card flat" style="padding:0;margin-top:22px">
          <div class="card-h"><h2>${icon("globe")} Ключови думи за търсене</h2><span class="hint">Google Trends + Библиотеката с реклами</span></div>
          ${["BG", "SK", "SI", "HU"].map((c) => html`<div class="field" style="margin-bottom:8px"><label>${c}</label><input class="input" data-kw="${c}" value="${(S.keywords[c] || []).join(", ")}"></div>`)}
          <button class="btn primary sm" data-act="saveKw">Запази</button>
        </section>
        <section class="card flat" style="padding:0;margin-top:22px">
          <div class="card-h"><h2>${icon("users")} Конкуренти</h2><span class="hint">ID на Facebook страници (по едно на ред: id, име, държава)</span></div>
          <textarea class="input" id="comp" rows="6" placeholder="1234567890, АртроГел, BG">${(S.competitors || []).map((c) => `${c.pageId}, ${c.name}, ${c.country}`).join("\n")}</textarea>
          <div class="row" style="margin-top:10px"><button class="btn primary sm" data-act="saveComp">Запази</button><span class="tiny muted">Нови конкуренти се откриват и сами – по ключовите думи.</span></div>
        </section>
      </div>

      </details>

      <section class="card" style="margin-top:18px">
        <div class="card-h"><h2>Изглед</h2></div>
        <div class="seg">${[["auto", "Автоматично"], ["light", "Светъл"], ["dark", "Тъмен"]].map(([k, l]) => html`<button data-act="theme" data-v="${k}" class="${theme === k ? "on" : ""}">${l}</button>`)}</div>
      </section>`;
  },
  mount(page, ctx) {
    const save = async (patch, msg = "Запазено") => {
      try {
        await ctx.call("saveSettings", patch);
        toast(msg);
        ctx.refresh();
      } catch (err) {
        toast(err.message);
      }
    };
    page.querySelector("#tabloFile")?.addEventListener("change", async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const json = JSON.parse(await f.text());
        const r = await ctx.call("importTablo", json);
        toast(`Заредени ${r.products} продукта и ${r.fixed} фиксирани разхода`);
        ctx.refresh();
      } catch (err) {
        toast(err.message || "Файлът не може да се прочете");
      }
    });
    page.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-act]");
      if (!b || b.tagName === "INPUT") return;
      const a = b.dataset.act;
      if (a === "confirmCosts") {
        try {
          await ctx.call("confirmCosts");
          toast("Благодаря – маржът вече се смята с тези цени");
          ctx.refresh();
        } catch (err) {
          toast(err.message);
        }
      } else if (a === "saveMargin") {
        const f = Number(page.querySelector("#mFloor").value) / 100, t = Number(page.querySelector("#mTarget").value) / 100;
        if (t < f) return toast("Целта трябва да е над минимума");
        const mb = page.querySelector("#mBudget").value;
        save({ econ: { marginFloor: f, marginTarget: t, defaultCogsPct: Number(page.querySelector("#mCogs").value) / 100 }, monthlyBudget: mb ? Number(mb) : null });
      } else if (a === "saveAccts") {
        const accounts = {};
        page.querySelectorAll("#accts tbody tr").forEach((tr) => {
          const v = (n) => tr.querySelector(`[name="${n}"]`);
          accounts[tr.dataset.id] = { country: v("country").value, vat: Number(v("vat").value) / 100, courier: Number(v("courier").value), codFeePct: Number(v("codFeePct").value) / 100, returnCost: Number(v("returnCost").value), sites: v("sites").value.split(",").map((s) => s.trim()).filter(Boolean), on: v("on").checked };
        });
        save({ accounts });
      } else if (a === "addLine") {
        page.querySelector("#lines tbody").insertAdjacentHTML("beforeend", `<tr data-id="l${Date.now().toString(36)}"><td><input class="input" name="name"></td><td><select class="select" name="country" style="width:80px"><option>BG</option><option>SK</option><option>SI</option><option>HU</option></select></td><td><input class="input" name="sites" style="width:120px"></td><td><input class="input" name="keywords"></td><td><button class="btn xs ghost" data-act="delRow">✕</button></td></tr>`);
      } else if (a === "saveLines") {
        const lines = [...page.querySelectorAll("#lines tbody tr")].map((tr) => ({
          id: tr.dataset.id,
          name: tr.querySelector('[name="name"]').value.trim(),
          country: tr.querySelector('[name="country"]').value,
          sites: tr.querySelector('[name="sites"]').value.split(",").map((x) => x.trim()).filter(Boolean),
          keywords: tr.querySelector('[name="keywords"]').value.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean),
        })).filter((l) => l.name);
        save({ lines }, "Запазено – важи от следващото опресняване");
      } else if (a === "addProd") {
        page.querySelector("#prods tbody").insertAdjacentHTML("beforeend", '<tr><td><input class="input" name="name"></td><td><input class="input" name="keys"></td><td><input class="input" name="cost" type="number" step="0.01" style="width:80px"></td><td><button class="btn xs ghost" data-act="delRow">✕</button></td></tr>');
      } else if (a === "addFixed") {
        page.querySelector("#fixed tbody").insertAdjacentHTML("beforeend", '<tr><td><input class="input" name="k"></td><td><input class="input" name="v" type="number" style="width:100px"></td><td><button class="btn xs ghost" data-act="delRow">✕</button></td></tr>');
      } else if (a === "delRow") {
        b.closest("tr").remove();
      } else if (a === "saveProds") {
        const products = [...page.querySelectorAll("#prods tbody tr")].map((tr) => ({ name: tr.querySelector('[name="name"]').value.trim(), keys: tr.querySelector('[name="keys"]').value.trim(), cost: Number(tr.querySelector('[name="cost"]').value) || 0 })).filter((p) => p.name);
        save({ econ: { products, costsConfirmedAt: new Date().toISOString() } });
      } else if (a === "saveFixed") {
        const fixedMonthly = {};
        page.querySelectorAll("#fixed tbody tr").forEach((tr) => {
          const k = tr.querySelector('[name="k"]').value.trim();
          if (k) fixedMonthly[k] = Number(tr.querySelector('[name="v"]').value) || 0;
        });
        save({ econ: { fixedMonthly } });
      } else if (a === "saveKw") {
        const keywords = {};
        page.querySelectorAll("[data-kw]").forEach((i) => (keywords[i.dataset.kw] = i.value.split(",").map((s) => s.trim()).filter(Boolean)));
        save({ keywords });
      } else if (a === "saveComp") {
        const competitors = page.querySelector("#comp").value.split("\n").map((l) => l.split(",").map((s) => s.trim())).filter((x) => x[0]).map(([pageId, name, country]) => ({ pageId, name: name || pageId, country: (country || "BG").toUpperCase() }));
        save({ competitors });
      } else if (a === "theme") {
        const v = b.dataset.v;
        try {
          v === "auto" ? localStorage.removeItem("pilot.theme") : localStorage.setItem("pilot.theme", v);
        } catch {}
        if (v === "auto") document.documentElement.removeAttribute("data-theme");
        else document.documentElement.setAttribute("data-theme", v);
        ctx.refresh();
      } else if (a === "reset") {
        if (await ask("Да изтрия ли всички демо промени?", { ok: "Изчисти", tone: "bad" })) resetDemo();
      }
    });
  },
};

/* OrderDesk – падащо меню с офисите на Еконт и Спиди в касата на ConvertBuilder (като „Линк за връзка“ в Middleware).
   Слага се на сайта на магазина с един ред от OrderDesk → Магазини → Чекаут:
     <script src="https://mitko-poruchki.netlify.app/k.js" data-shop="<магазин>" defer></script>
   Какво прави:
   1) взима настройките на магазина от OrderDesk (кои куриери, текстове, автомати);
   2) в касата познава методите за доставка по името им (Еконт/Спиди + офис/адрес) и им слага знак на куриера;
   3) при „До офис“ показва търсачка с всички офиси на куриера (град, квартал, адрес) вместо полето за адрес;
   4) записва избора в полето за адрес като „До офис econt[код]: име - адрес“ – OrderDesk го чете
      и товарителницата отива точно до този офис. Цените и сумите не пипа: те са на ConvertBuilder.
   Не чете и не праща лични данни. */
(function () {
  "use strict";
  var me = document.currentScript || document.querySelector('script[src*="/k.js"][data-shop]');
  if (!me || !window.fetch || !document.querySelector) return;
  var src = new URL(me.src, location.href);
  var BASE = src.origin;
  var SHOP = me.getAttribute("data-shop") || src.searchParams.get("s") || "";
  if (!/^[a-z0-9-]{1,40}$/i.test(SHOP)) return;
  if (window.__odk) return; // веднъж на страница
  window.__odk = true;

  var cfg = null;
  var offices = {}; // "econt" / "econt+a" → списък
  var loading = {};
  var current = null; // { courier, kind, label, conf }
  var STORE = "odk_pick_" + SHOP;

  // ---------- помощни ----------
  var norm = function (s) {
    return String(s || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[„“"'`.,()\[\]–—-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  };
  var LAT = [["sht", "щ"], ["sh", "ш"], ["ch", "ч"], ["zh", "ж"], ["ts", "ц"], ["yu", "ю"], ["ya", "я"], ["a", "а"], ["b", "б"], ["v", "в"], ["g", "г"], ["d", "д"], ["e", "е"], ["z", "з"], ["i", "и"], ["y", "й"], ["k", "к"], ["l", "л"], ["m", "м"], ["n", "н"], ["o", "о"], ["p", "п"], ["r", "р"], ["s", "с"], ["t", "т"], ["u", "у"], ["f", "ф"], ["h", "х"], ["c", "ц"], ["w", "в"], ["x", "кс"], ["q", "к"]];
  var toCyr = function (s) {
    var out = "";
    for (var i = 0; i < s.length; ) {
      var hit = null;
      for (var j = 0; j < LAT.length; j++) if (s.substr(i, LAT[j][0].length) === LAT[j][0]) { hit = LAT[j]; break; }
      if (hit) { out += hit[1]; i += hit[0].length; } else { out += s.charAt(i); i++; }
    }
    return out;
  };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  };
  var store = function (v) {
    try {
      if (v === undefined) return JSON.parse(sessionStorage.getItem(STORE) || "null");
      if (v === null) sessionStorage.removeItem(STORE);
      else sessionStorage.setItem(STORE, JSON.stringify(v));
    } catch (e) {}
    return null;
  };
  var setVal = function (el, v) {
    if (!el || el.value === v) return;
    try {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, v);
    } catch (e) {
      el.value = v;
    }
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    try {
      if (window.jQuery) window.jQuery(el).trigger("change");
    } catch (e) {}
  };
  var form = function () {
    var w = document.querySelector('[data-role="shipping-methods"]');
    return w && w.querySelector('input[name="shippingOption"]') ? w : null;
  };
  var field = function (name) {
    var w = document.querySelector(".payment-step-wrapper") || document;
    return w.querySelector('input[name="' + name + '"]');
  };

  // ---------- кой метод какъв е ----------
  var NAMES = { econt: "Еконт", speedy: "Спиди" };
  function kindOf(text) {
    var t = norm(text);
    var list = cfg.couriers;
    for (var i = 0; i < list.length; i++) if (list[i].title && norm(list[i].title) === t) return list[i];
    var courier = /еконт|econt|ekont/.test(t) ? "econt" : /спиди|speedy/.test(t) ? "speedy" : "";
    var type = /офис|office|автомат|apt/.test(t) ? "office" : /адрес|address|куриер|до врата/.test(t) ? "address" : "";
    if (!type || (type === "office" && !courier)) return null;
    for (var k = 0; k < list.length; k++) {
      var c = list[k];
      if (c.title) continue;
      var cc = c.kind.split("-")[0], ct = c.kind.split("-")[1];
      if (ct === type && (!courier || cc === courier)) return courier ? c : { kind: "any-address", text: c.text };
    }
    return null;
  }

  // ---------- изглед ----------
  function css() {
    if (document.getElementById("odk-css")) return;
    var s = document.createElement("style");
    s.id = "odk-css";
    s.textContent =
      ".odk-logo{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:6px;font:800 12px/1.4 Arial,sans-serif;letter-spacing:.04em;vertical-align:2px;font-style:normal}" +
      ".odk-logo.econt{background:#234398;color:#fff}.odk-logo.speedy{background:#d71920;color:#fff}" +
      ".odk-box{clear:both;width:100%;box-sizing:border-box;margin:6px 0 14px;padding:14px;border:2px solid #3d7136;border-radius:14px;background:#fff;font:16px/1.45 Arial,sans-serif;color:#1b2419;text-align:left}" +
      ".odk-box *{box-sizing:border-box}" +
      ".odk-h{font-weight:800;font-size:17px;margin:0 0 8px}" +
      ".odk-note,.odk-text{font-size:15px;color:#4a5547;margin:0 0 8px}.odk-text{margin:8px 0 0}" +
      ".odk-q{display:block;width:100%;height:52px;padding:0 14px;border:2px solid #b9c3b3;border-radius:10px;font-size:17px;background:#fff;color:#1b2419}" +
      ".odk-q:focus{outline:none;border-color:#3d7136;box-shadow:0 0 0 3px rgba(61,113,54,.18)}" +
      ".odk-list{margin-top:8px;max-height:330px;overflow:auto;border-radius:10px}" +
      ".odk-opt{display:block;width:100%;text-align:left;padding:11px 12px;margin:0 0 6px;border:1px solid #dfe5da;border-radius:10px;background:#f7faf5;cursor:pointer;font:inherit;color:inherit}" +
      ".odk-opt:hover,.odk-opt:focus{background:#eaf3e4;border-color:#3d7136;outline:none}" +
      ".odk-opt b{display:block;font-size:16px}.odk-opt span{display:block;font-size:14px;color:#5b6657}" +
      ".odk-hint{font-size:15px;color:#5b6657;padding:6px 2px}" +
      ".odk-picked{display:flex;gap:12px;align-items:flex-start;padding:12px;border-radius:10px;background:#eef6ea}" +
      ".odk-picked .odk-pin{font-size:22px;line-height:1}.odk-picked b{display:block;font-size:17px}.odk-picked span{display:block;font-size:15px;color:#4a5547}" +
      ".odk-change{margin-left:auto;flex:none;border:2px solid #3d7136;background:#fff;color:#2c5a2c;border-radius:999px;padding:7px 14px;font:700 15px Arial,sans-serif;cursor:pointer}" +
      ".odk-err{display:none;margin-top:8px;padding:10px 12px;border-radius:10px;background:#fff1ef;border:1px solid #f3c2bc;color:#8a1c12;font-weight:700}" +
      ".odk-box.need .odk-err{display:block}.odk-box.need{border-color:#b3261e}" +
      ".odk-hide{display:none!important}";
    document.head.appendChild(s);
  }

  function logos(w) {
    var labels = w.querySelectorAll("label");
    for (var i = 0; i < labels.length; i++) {
      var l = labels[i];
      var input = l.querySelector('input[name="shippingOption"]');
      if (!input) continue;
      var k = kindOf(l.textContent);
      var courier = k && k.kind ? k.kind.split("-")[0] : "";
      var has = l.querySelector(".odk-logo");
      if (NAMES[courier] && !has) {
        var e = document.createElement("em");
        e.className = "odk-logo " + courier;
        e.textContent = courier === "econt" ? "ЕКОНТ" : "SPEEDY";
        var price = l.querySelector(".price");
        if (price) l.insertBefore(e, price);
        else l.appendChild(e);
      } else if (has && !NAMES[courier]) has.remove();
    }
  }

  function selected(w) {
    var input = w.querySelector('input[name="shippingOption"]:checked');
    if (!input) return null;
    var label = input.closest("label");
    var k = label && kindOf(label.textContent);
    if (!k) return { kind: "", label: label };
    var parts = k.kind.split("-");
    return { courier: parts[0], type: parts[1], conf: k, label: label };
  }

  function addrFields(hide) {
    var a = field("shippingAddress");
    var c = field("shippingCity");
    if (a) a.classList.toggle("odk-hide", hide);
    if (c) (c.closest(".input-row") || c).classList.toggle("odk-hide", hide);
  }

  // Както го пишеше Middleware: Еконт „име - адрес“, Спиди „ИМЕ адрес“ (името на Спиди вече е „ГРАД - ОФИС“).
  var officeText = function (o, courier) {
    return "До офис " + courier + "[" + o[0] + "]: " + o[2] + (courier === "econt" ? " - " : " ") + o[3] + (o[4] === "a" ? " (автомат)" : "");
  };
  var titleCase = function (s) {
    return String(s || "").toLowerCase().replace(/(^|[\s-])(\S)/g, function (m, a, b) {
      return a + b.toUpperCase();
    });
  };

  function load(courier, automats) {
    var key = courier + (automats ? "+a" : "");
    if (offices[key]) return Promise.resolve(offices[key]);
    if (!loading[key])
      loading[key] = fetch(BASE + "/api/offices/" + courier + (automats ? "?apt=1" : ""), { credentials: "omit" })
        .then(function (r) {
          if (!r.ok) throw new Error(r.status);
          return r.json();
        })
        .then(function (d) {
          var list = (d && d.offices) || [];
          if (!list.length) throw new Error("empty");
          offices[key] = list.map(function (o) {
            return { o: o, hay: norm(o[1] + " " + o[2] + " " + o[3]), city: norm(o[1]) };
          });
          return offices[key];
        })
        .catch(function (e) {
          loading[key] = null;
          throw e;
        });
    return loading[key];
  }

  function search(list, q, city) {
    var words = norm(q).split(" ").filter(Boolean);
    var alt = /[a-z]/.test(norm(q)) ? toCyr(norm(q)).split(" ").filter(Boolean) : null;
    var test = function (x, ws) {
      for (var i = 0; i < ws.length; i++) if (x.hay.indexOf(ws[i]) < 0) return false;
      return true;
    };
    var out = [];
    if (!words.length) {
      if (!city) return [];
      var c = norm(city);
      for (var i = 0; i < list.length; i++) if (list[i].city === c) out.push(list[i]);
      return out.slice(0, 40);
    }
    for (var j = 0; j < list.length; j++) {
      var x = list[j];
      if (!test(x, words) && !(alt && test(x, alt))) continue;
      var first = alt && !test(x, words) ? alt[0] : words[0];
      var score = x.city === norm(q) ? 0 : x.city.indexOf(first) === 0 ? 1 : 2;
      out.push({ x: x, s: score });
    }
    out.sort(function (a, b) {
      return a.s - b.s || (a.x.city < b.x.city ? -1 : a.x.city > b.x.city ? 1 : 0);
    });
    return out.slice(0, 40).map(function (r) {
      return r.x;
    });
  }

  function box(sel) {
    var b = document.getElementById("odk-box");
    if (!b) {
      b = document.createElement("div");
      b.id = "odk-box";
      b.className = "odk-box";
    }
    if (b.previousElementSibling !== sel.label) sel.label.insertAdjacentElement("afterend", b);
    return b;
  }

  function draw(sel, list) {
    var b = box(sel);
    var key = sel.courier + (sel.conf.automats ? "+a" : "");
    var a = field("shippingAddress");
    var pick = store();
    var picked = pick && pick.courier === sel.courier && a && a.value === officeText(pick.o, sel.courier) ? pick.o : null;
    // изборът е пазен в браузъра, но полето е празно (касата се е презаредила) – връщаме го
    if (!picked && pick && pick.courier === sel.courier && a && !a.value) {
      choose(sel, pick.o, true);
      picked = pick.o;
    }
    var name = NAMES[sel.courier];
    if (b.getAttribute("data-k") === key + "|" + (picked ? picked[0] : "") && b.querySelector(".odk-h")) return;
    b.setAttribute("data-k", key + "|" + (picked ? picked[0] : ""));
    if (picked) {
      b.classList.remove("need");
      b.innerHTML =
        '<p class="odk-h">Офис на ' + esc(name) + "</p>" +
        '<div class="odk-picked"><span class="odk-pin" aria-hidden="true">📍</span><div><b>' + esc(picked[1] + " – " + picked[2]) + "</b><span>" + esc(picked[3]) + (picked[4] === "a" ? " · автомат" : "") + '</span></div><button type="button" class="odk-change">Смени</button></div>' +
        (sel.conf.text ? '<p class="odk-text">' + esc(sel.conf.text) + "</p>" : "");
      b.querySelector(".odk-change").onclick = function () {
        store(null);
        setVal(field("shippingAddress"), "");
        b.setAttribute("data-k", "");
        draw(sel, list);
        var q = b.querySelector(".odk-q");
        if (q) q.focus();
      };
      return;
    }
    var city = field("shippingCity");
    b.innerHTML =
      (cfg.note ? '<p class="odk-note">' + esc(cfg.note) + "</p>" : "") +
      '<p class="odk-h">Избери офис на ' + esc(name) + (sel.conf.automats ? " или автомат" : "") + "</p>" +
      '<input class="odk-q" type="search" autocomplete="off" placeholder="Напиши град или квартал, напр. Пловдив" aria-label="Търси офис на ' + esc(name) + '">' +
      '<div class="odk-list" role="listbox"></div>' +
      '<div class="odk-err">Избери офис от списъка, за да довършиш поръчката.</div>' +
      (sel.conf.text ? '<p class="odk-text">' + esc(sel.conf.text) + "</p>" : "");
    var q = b.querySelector(".odk-q");
    var out = b.querySelector(".odk-list");
    var show = function () {
      var found = search(list, q.value, q.value ? "" : city && city.value);
      if (!found.length) {
        out.innerHTML = '<div class="odk-hint">' + (q.value ? "Няма такъв офис. Опитай само с името на града." : "Започни да пишеш името на града – ще излязат офисите там.") + "</div>";
        return;
      }
      out.innerHTML = found
        .map(function (x, i) {
          return '<button type="button" class="odk-opt" role="option" data-i="' + i + '"><b>' + esc(x.o[1] + " – " + x.o[2]) + "</b><span>" + esc(x.o[3]) + (x.o[4] === "a" ? " · автомат" : "") + "</span></button>";
        })
        .join("");
      var btns = out.querySelectorAll(".odk-opt");
      for (var i = 0; i < btns.length; i++)
        btns[i].onclick = (function (o) {
          return function () {
            choose(sel, o);
            b.setAttribute("data-k", "");
            draw(sel, list);
          };
        })(found[i].o);
    };
    q.oninput = show;
    q.onkeydown = function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        var first = out.querySelector(".odk-opt");
        if (first) first.click();
      }
    };
    show();
  }

  function choose(sel, o, quiet) {
    setVal(field("shippingAddress"), officeText(o, sel.courier));
    var c = field("shippingCity");
    if (c && o[1]) setVal(c, titleCase(o[1]));
    if (!quiet) store({ courier: sel.courier, o: o });
  }

  function sync() {
    var w = form();
    if (!w || !cfg) return;
    css();
    logos(w);
    var sel = selected(w);
    var b = document.getElementById("odk-box");
    var a = field("shippingAddress");
    if (!sel || sel.type !== "office") {
      // адрес (или друго): нашият избор на офис не важи
      current = null;
      if (b) b.remove();
      addrFields(false);
      if (a && /^До офис (econt|speedy)\[/i.test(a.value)) setVal(a, "");
      return;
    }
    current = sel;
    var key = sel.courier + (sel.conf.automats ? "+a" : "");
    if (a && /^До офис (econt|speedy)\[/i.test(a.value) && a.value.toLowerCase().indexOf("до офис " + sel.courier + "[") !== 0) setVal(a, "");
    if (offices[key]) {
      addrFields(true);
      draw(sel, offices[key]);
      return;
    }
    var bx = box(sel);
    if (!bx.querySelector(".odk-wait")) bx.innerHTML = '<p class="odk-hint odk-wait">Зареждаме офисите на ' + esc(NAMES[sel.courier]) + "…</p>";
    load(sel.courier, sel.conf.automats).then(
      function () {
        sync();
      },
      function () {
        // без списък: оставяме обикновеното поле за адрес, за да може пак да се поръча
        var bb = document.getElementById("odk-box");
        if (bb) bb.remove();
        addrFields(false);
      },
    );
  }

  // Без избран офис поръчката не тръгва: спираме бутона и показваме защо.
  function guard(e) {
    if (!current || current.type !== "office") return;
    var t = e.target;
    var btn = t && t.closest && t.closest(".next-prev-buttons button, .next-prev-buttons a, button[type=submit], .payment-step-wrapper .btn-submit");
    if (e.type === "click" && !btn) return;
    var a = field("shippingAddress");
    if (a && /^До офис (econt|speedy)\[/i.test(a.value)) return;
    if (!offices[current.courier + (current.conf.automats ? "+a" : "")]) return; // списъкът не е зареден – полето е видимо
    e.preventDefault();
    e.stopImmediatePropagation();
    var b = document.getElementById("odk-box");
    if (b) {
      b.classList.add("need");
      if (b.scrollIntoView) b.scrollIntoView({ behavior: "smooth", block: "center" });
      var q = b.querySelector(".odk-q");
      if (q) setTimeout(function () { q.focus(); }, 400);
    }
  }

  var timer = null;
  var later = function () {
    clearTimeout(timer);
    timer = setTimeout(sync, 120);
  };

  function start() {
    fetch(BASE + "/api/kasa/" + encodeURIComponent(SHOP) + "?p=" + encodeURIComponent(location.pathname), { credentials: "omit" })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (c) {
        if (!c || !c.active || !c.couriers || !c.couriers.length) return;
        cfg = c;
        sync();
        document.addEventListener("change", function (e) {
          if (e.target && e.target.name === "shippingOption") later();
        });
        document.addEventListener("click", guard, true);
        document.addEventListener("submit", guard, true);
        try {
          new MutationObserver(function (m) {
            for (var i = 0; i < m.length; i++) {
              var n = m[i].target;
              if (n && n.closest && n.closest("#odk-box")) continue;
              later();
              return;
            }
          }).observe(document.querySelector(".payment-step-wrapper") || document.body, { childList: true, subtree: true });
        } catch (e) {}
        setInterval(sync, 2000); // касата на ConvertBuilder понякога се рисува наново
      })
      .catch(function () {});
  }

  // Чакаме формата за поръчка (идва по-късно от останалата страница).
  var tries = 0;
  (function wait() {
    if (form()) return start();
    if (++tries < 120) setTimeout(wait, 500);
  })();
})();

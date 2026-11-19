/* Здравец Натура · зарежда един блок на zdravets.eu в ConvertBuilder.
   В елемента „Код / HTML“ стои само един ред (името на блока е в data-zn):
     <script src="https://cdn.jsdelivr.net/gh/mitko0oy-jpg/Mitko@<commit>/landing/zdravets/load.js" data-zn="nachalo"></script>
   Блокът (landing/zdravets/<име>.html) се взима от jsDelivr за commit-а, записан в version.txt на клона
   в GitHub – така нова версия излиза без промяна в ConvertBuilder. Ако version.txt не се зареди,
   се ползва commit-а от адреса на този файл. */
(function () {
  "use strict";
  var me = document.currentScript;
  if (!me || !me.hasAttribute("data-zn")) return;
  var REPO = "mitko0oy-jpg/Mitko";
  var POINTER = "https://raw.githubusercontent.com/" + REPO + "/claude/nice-fermi-jth8hl/landing/zdravets/version.txt";
  var SHA = /^[0-9a-f]{40}$/;
  var own = /@([0-9a-f]{40})\//.exec(me.src || "");
  var fallback = own ? own[1] : null;

  // the block goes right before the script
  var host = document.createElement("div");
  var page = me.getAttribute("data-zn") || "";
  host.setAttribute("data-zn-host", page);
  me.parentNode.insertBefore(host, me);
  if (!/^[a-z0-9-]+$/.test(page)) return;
  if (page !== "poruchka" && page !== "dolu") host.style.minHeight = "100vh";

  function version() {
    var ctl = typeof AbortController === "function" ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, 2500);
    return fetch(POINTER, ctl ? { signal: ctl.signal } : {})
      .then(function (r) { return r.ok ? r.text() : ""; })
      .then(function (t) { t = t.trim(); return SHA.test(t) ? t : fallback; }, function () { return fallback; })
      .then(function (v) { clearTimeout(timer); return v; });
  }

  function block(v) {
    if (!v) return Promise.reject(new Error("no version"));
    return fetch("https://cdn.jsdelivr.net/gh/" + REPO + "@" + v + "/landing/zdravets/" + page + ".html")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); });
  }

  function mount(html) {
    var box = document.createElement("div");
    box.innerHTML = html;
    // scripts parsed through innerHTML never run: each one is swapped, in order and in its own place,
    // for a fresh copy, which runs as soon as it is in the page (the markup is all there by then)
    var scripts = Array.prototype.slice.call(box.querySelectorAll("script"));
    var parent = host.parentNode;
    while (box.firstChild) parent.insertBefore(box.firstChild, host);
    parent.removeChild(host);
    scripts.forEach(function (old) {
      var s = document.createElement("script");
      for (var i = 0; i < old.attributes.length; i++) s.setAttribute(old.attributes[i].name, old.attributes[i].value);
      s.text = old.text;
      old.parentNode.replaceChild(s, old);
    });
  }

  function fail() {
    host.style.minHeight = "";
    host.innerHTML = '<p style="max-width:34em;margin:60px auto;padding:0 20px;font:20px/1.5 system-ui,sans-serif;text-align:center;color:#1b2419">' +
      'Страницата не се зареди докрай. <a href="" style="color:#2c5a2c;font-weight:700">Опитайте отново</a> или поръчайте по телефона: ' +
      '<a href="tel:+359988880507" style="color:#2c5a2c;font-weight:700;white-space:nowrap">0988 88 05 07</a>.</p>';
  }

  version()
    .then(function (v) { return block(v).catch(function (e) { if (v !== fallback) return block(fallback); throw e; }); })
    .then(mount)
    .catch(fail);
})();

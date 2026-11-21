// Light / dark theme, before the page is drawn (no flash). "auto" follows the device.
// The phone's status bar (theme-color) follows the chosen theme too.
(function () {
  var COLORS = { light: "#ffffff", dark: "#151a20" };
  function sync() {
    var t = document.documentElement.getAttribute("data-theme");
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    for (var i = 0; i < metas.length; i++) {
      var m = metas[i];
      var own = /dark/.test(m.getAttribute("media") || "") ? "dark" : "light";
      m.setAttribute("content", COLORS[t === "light" || t === "dark" ? t : own]);
    }
  }
  window.odThemeColor = sync;
  try {
    var t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {
    /* private mode: follow the device */
  }
  sync();
})();

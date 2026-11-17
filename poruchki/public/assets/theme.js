// Light / dark theme, before the page is drawn (no flash). "auto" follows the device.
(function () {
  try {
    var t = localStorage.getItem("theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) {
    /* private mode: follow the device */
  }
})();

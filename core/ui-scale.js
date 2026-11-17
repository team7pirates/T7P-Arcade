// Big-screen scaling (v0.12.0). The design is sized for 1920×1080. On wider
// PC screens the whole app grows by the same amount the screen did:
// 1440p (2560 wide) = 1.33×, 4K (3840 wide) = 2×. Phones and laptops stay 1×.
// The height check keeps a short browser window from scaling past what fits.
(function () {
  var root = document.documentElement;
  function apply() {
    var w = window.innerWidth || 0, h = window.innerHeight || 0;
    var z = Math.min(w / 1920, h / 900, 2);
    z = z > 1.02 ? Math.round(z * 100) / 100 : 1;
    root.style.setProperty('--z', String(z));
    window.__uiZoom = z;
  }
  apply();
  window.addEventListener('resize', apply);
})();

(function () {
  if (window.location.protocol === "chrome-extension:") return;

  var hostEl = null;

  function showBanner() {
    if (hostEl) return;
    if (!document.body) {
      setTimeout(showBanner, 100);
      return;
    }

    hostEl = document.createElement("div");
    hostEl.id = "ulaval-study-banner-host";

    var shadow = hostEl.attachShadow({ mode: "closed" });
    shadow.innerHTML =
      "<style>" +
      "@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}" +
      ".b{position:fixed;bottom:16px;right:16px;z-index:2147483647;" +
      "font-family:Segoe UI,Arial,sans-serif;background:rgba(15,23,42,0.92);" +
      "border:1px solid #334155;border-radius:10px;padding:10px 16px;" +
      "color:#e2e8f0;font-size:12px;display:flex;align-items:center;gap:8px;" +
      "box-shadow:0 4px 20px rgba(0,0,0,0.4);user-select:none;}" +
      ".d{width:8px;height:8px;background:#ef4444;border-radius:50%;" +
      "animation:pulse 2s ease-in-out infinite;flex-shrink:0;}" +
      ".l{color:#e2e8f0;font-weight:600;}" +
      ".t{color:#94a3b8;font-size:11px;}" +
      "</style>" +
      '<div class="b">' +
      '<div class="d"></div>' +
      "<div>" +
      '<div class="l">Collecte en cours</div>' +
      '<div class="t">Étude Navigation Web — ULaval</div>' +
      "</div>" +
      "</div>";

    document.body.appendChild(hostEl);
  }

  function removeBanner() {
    if (hostEl) {
      hostEl.remove();
      hostEl = null;
    }
  }

  // Vérifier l'état au chargement
  try {
    chrome.storage.local.get(["isTracking"], function (result) {
      if (chrome.runtime.lastError) return;
      if (result && result.isTracking) showBanner();
    });
  } catch (e) {}

  // Réagir aux changements en temps réel
  try {
    chrome.storage.onChanged.addListener(function (changes) {
      if (changes.isTracking) {
        if (changes.isTracking.newValue) {
          showBanner();
        } else {
          removeBanner();
        }
      }
    });
  } catch (e) {}
})();

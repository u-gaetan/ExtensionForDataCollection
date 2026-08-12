(function () {
  if (window.location.protocol === "chrome-extension:") return;

  var hostEl = null;
  var observer = null;

  const bannerI18n = {
      fr: { label: "Collecte en cours", sub: "Étude Navigation Web — ULaval" },
      en: { label: "Data collection active", sub: "Web Navigation Study — ULaval" }
  };

  function showBanner(lang) {
    // if banner already exists and is in the document, do nothing
    if (hostEl && document.body && document.body.contains(hostEl)) {
        return;
    }
    if (hostEl) {
      removeBanner();
    }
    if (!document.body) {
      setTimeout(function() { showBanner(lang); }, 100);
      return;
    }

    const txt = bannerI18n[lang || 'fr'];

    hostEl = document.createElement("div");
    hostEl.id = "ulaval-study-banner-host";
    
    // positioning and styling of the host element
    hostEl.style.position = "fixed";
    hostEl.style.bottom = "16px";
    hostEl.style.right = "16px";
    hostEl.style.zIndex = "2147483647";

    var shadow = hostEl.attachShadow({ mode: "closed" });

    // creation and styling of the main banner block
    var mainBlock = document.createElement("div");
    mainBlock.style.display = "flex";
    mainBlock.style.alignItems = "center";
    mainBlock.style.gap = "8px";
    mainBlock.style.padding = "10px 16px";
    mainBlock.style.background = "rgba(15, 23, 42, 0.95)";
    mainBlock.style.border = "1px solid #334155";
    mainBlock.style.borderRadius = "10px";
    mainBlock.style.color = "#e2e8f0";
    mainBlock.style.fontSize = "12px";
    mainBlock.style.fontFamily = "Segoe UI, Arial, sans-serif";
    mainBlock.style.boxShadow = "0 4px 20px rgba(0,0,0,0.4)";
    mainBlock.style.userSelect = "none";

    // creation and styling of the pulsating dot
    var dot = document.createElement("div");
    dot.style.width = "8px";
    dot.style.height = "8px";
    dot.style.background = "#ef4444";
    dot.style.borderRadius = "50%";
    dot.style.flexShrink = "0";

    // animation for the pulsating effect
    dot.animate([
      { opacity: 1 },
      { opacity: 0.3 },
      { opacity: 1 }
    ], {
      duration: 2000,
      iterations: Infinity,
      easing: 'ease-in-out'
    });

    // text bloc
    var textContainer = document.createElement("div");

    var title = document.createElement("div");
    title.style.color = "#e2e8f0";
    title.style.fontWeight = "600";
    title.textContent = txt.label;

    var subtitle = document.createElement("div");
    subtitle.style.color = "#94a3b8";
    subtitle.style.fontSize = "11px";
    subtitle.style.marginTop = "2px";
    subtitle.textContent = txt.sub;

    textContainer.appendChild(title);
    textContainer.appendChild(subtitle);

    mainBlock.appendChild(dot);
    mainBlock.appendChild(textContainer);

    shadow.appendChild(mainBlock);
    document.body.appendChild(hostEl);

    // start observing to prevent removal by JS frameworks
    startObserving(lang);
  }

  function removeBanner() {
    stopObserving();
    if (hostEl) {
      hostEl.remove();
      hostEl = null;
    }
  }

  function startObserving(lang) {
    if (observer) return;
    observer = new MutationObserver(function() {
      if (hostEl && document.body && !document.body.contains(hostEl)) {
        document.body.appendChild(hostEl);
      }
    });
    observer.observe(document.body, { childList: true });
  }

  function stopObserving() {
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  // Verify if the study is active and show the banner accordingly
  try {
    chrome.storage.local.get(["isTracking", "currentLanguage"], function (result) {
      if (chrome.runtime.lastError) return;
      if (result && result.isTracking) showBanner(result.currentLanguage || 'fr');
    });
  } catch (e) {}

  // react to changes in tracking state and show/hide the banner accordingly
  try {
    chrome.storage.onChanged.addListener(function (changes) {
      chrome.storage.local.get(["isTracking", "currentLanguage"], function (result) {
        if (result && result.isTracking) {
          showBanner(result.currentLanguage || 'fr');
        } else {
          removeBanner();
        }
      });
    });
  } catch (e) {}
})();
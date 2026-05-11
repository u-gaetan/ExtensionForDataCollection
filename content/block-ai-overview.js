// =========================================================
// MASQUER L'APERÇU IA (AI Overview / Gemini) SUR GOOGLE
// Actif UNIQUEMENT quand l'étude est démarrée
// =========================================================
(function blockAIOverview() {
  // Ne s'exécute que sur les pages de recherche Google
  if (!window.location.hostname.match(/google\./)) return;
  if (!window.location.pathname.startsWith('/search')) return;

  var SELECTORS = [
    'div[data-async-type="aiOverview"]',
    'div[jsname="N760bl"]',
    '#eKIzJe',
    'div[data-attrid="AIOverview"]',
    'div.M8OgIe',
    'div[data-sgrd="true"]',
    'div.kno-rdesc[data-ai]',
    'sgai-container',
    'div[data-q-a-id="ai-overview"]',
    'div[jscontroller="M9mgyc"]',
    'div.g-blk[data-initq]'
  ];

  var ALL_SELECTORS = SELECTORS.join(', ');
  var style = null;
  var observer = null;

  function injectCSS() {
    if (style) return;
    style = document.createElement('style');
    style.id = 'block-ai-overview';
    style.textContent = SELECTORS.map(function(s) {
      return s + ' { display: none !important; visibility: hidden !important; height: 0 !important; overflow: hidden !important; }';
    }).join('\n');
    (document.head || document.documentElement).appendChild(style);
  }

  function removeCSS() {
    if (style) {
      style.remove();
      style = null;
    }
  }

  function removeAIOverview() {
    var elements = document.querySelectorAll(ALL_SELECTORS);
    elements.forEach(function(el) {
      if (el.offsetHeight > 50) {
        el.remove();
      }
    });
  }

  function startBlocking() {
    injectCSS();
    removeAIOverview();

    if (!observer) {
      observer = new MutationObserver(function() {
        removeAIOverview();
      });
    }

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    }

    // Arrêter l'observer après 15s
    setTimeout(function() {
      if (observer) observer.disconnect();
    }, 15000);
  }

  function stopBlocking() {
    removeCSS();
    if (observer) {
      observer.disconnect();
      observer = null;
    }
  }

  // ── Vérifier l'état du tracking ──
  chrome.storage.local.get(['isTracking'], function(result) {
    if (chrome.runtime.lastError) return;
    if (result.isTracking) {
      startBlocking();
    }
  });

  // ── Réagir aux changements d'état en temps réel ──
  chrome.storage.onChanged.addListener(function(changes) {
    if (changes.isTracking) {
      if (changes.isTracking.newValue) {
        startBlocking();
      } else {
        stopBlocking();
      }
    }
  });
})();

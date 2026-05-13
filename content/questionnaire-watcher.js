(function () {
  var href = window.location.href;
  if (href.indexOf("/questionnaire/") === -1) return;

  var completionSent = false;

  function sendCompletion() {
    if (completionSent) return;
    completionSent = true;

    try {
      chrome.storage.local.get(["isTracking"], function (result) {
        if (chrome.runtime.lastError) return;
        if (!result || !result.isTracking) return;

        chrome.runtime.sendMessage(
          { action: "questionnaire_completed" },
          function () {
            if (chrome.runtime.lastError) {
              // Ignorer silencieusement
            }
          }
        );
      });
    } catch (e) {}
  }

  // Méthode 1 : postMessage envoyé par renderEnd()
  window.addEventListener("message", function (event) {
    if (
      event.source === window &&
      event.data &&
      event.data.type === "QUESTIONNAIRE_COMPLETED"
    ) {
      sendCompletion();
    }
  });

  // Méthode 2 : Vérification périodique de l'URL (fallback SPA)
  var completionPaths = ["/fin", "/merci", "/complete", "/thank", "/termine", "/end"];
  var lastCheckedUrl = "";

  function checkUrl() {
    var currentUrl = window.location.href;
    if (currentUrl === lastCheckedUrl) return;
    lastCheckedUrl = currentUrl;

    var path = window.location.pathname.toLowerCase();
    for (var i = 0; i < completionPaths.length; i++) {
      if (path.indexOf(completionPaths[i]) !== -1) {
        setTimeout(sendCompletion, 2000);
        return;
      }
    }
  }

  // Vérifier immédiatement
  checkUrl();

  // Vérifier toutes les secondes (pour les SPA avec pushState)
  var checkInterval = setInterval(function () {
    checkUrl();
    if (completionSent) clearInterval(checkInterval);
  }, 1000);

  // Arrêter après 1h max
  setTimeout(function () {
    clearInterval(checkInterval);
  }, 3600000);

  // Reporter l'URL courante au background (pour le bouton retour)
  function reportUrl() {
    try {
      chrome.runtime.sendMessage(
        {
          action: "set_questionnaire_tab",
          tabId: null,
          url: window.location.href,
        },
        function () {
          if (chrome.runtime.lastError) {
            // Ignorer
          }
        }
      );
    } catch (e) {}
  }

  reportUrl();

  // Reporter chaque changement d'URL
  var lastReportedUrl = window.location.href;
  setInterval(function () {
    if (window.location.href !== lastReportedUrl) {
      lastReportedUrl = window.location.href;
      reportUrl();
    }
  }, 500);
})();

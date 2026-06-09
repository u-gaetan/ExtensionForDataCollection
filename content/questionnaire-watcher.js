// content/questionnaire-watcher.js
(function () {
  var href = window.location.href;
  if (href.indexOf("/questionnaire/") === -1) return;

  // Configuration de l'origine de confiance de votre étude
  var TRUSTED_ORIGIN = "https://api-lmv-ul-grh4cehth4f5b5gu.canadaeast-01.azurewebsites.net";
  var completionSent = false;

  function sendCompletion() {
    if (completionSent) return;
    completionSent = true;
    try {
      chrome.storage.local.get(["isTracking"], function (result) {
        if (chrome.runtime.lastError) return;
        if (!result || !result.isTracking) return;
        chrome.runtime.sendMessage({ action: "questionnaire_completed" }, function () {
          if (chrome.runtime.lastError) { /* Ignorer */ }
        });
      });
    } catch (e) {}
  }

  // ===== ÉCOUTER LES MESSAGES DE LA PAGE (app.js) =====
  window.addEventListener("message", function (event) {
    // SÉCURISATION : Rejeter tout message ne provenant pas de notre origine de confiance
    if (event.origin !== TRUSTED_ORIGIN) return;
    if (!event.data) return;

    // --- Enregistrement du Token JWT reçu ---
    if (event.data.type === "SET_TOKEN" && event.data.token) {
      chrome.runtime.sendMessage({ action: "set_token", token: event.data.token }, function() {
        if (chrome.runtime.lastError) { /* Ignorer */ }
      });
    }
    // --- Enregistrement de la langue sélectionnée ---
    else if (event.data.type === "SET_LANGUAGE") {
      chrome.runtime.sendMessage({ action: "set_language", language: event.data.language });
    }

    // --- Relais QUESTIONNAIRE_COMPLETED ---
    else if (event.data.type === "QUESTIONNAIRE_COMPLETED") {
      sendCompletion();
    }

    // --- Relais START_TRACKING ---
    else if (event.data.type === "START_TRACKING") {
      chrome.runtime.sendMessage({ action: "start_tracking" }, function() {
        if (chrome.runtime.lastError) { /* Ignorer */ }
      });
    }

    // --- Relais SET_PHASE (memory / research) ---
    else if (event.data.type === "SET_PHASE") {
      chrome.runtime.sendMessage({ action: "set_phase", phase: event.data.phase }, function() {
        if (chrome.runtime.lastError) { /* Ignorer */ }
      });
    }

    // --- Relais GET_NAV_COUNT ---
    else if (event.data.type === "GET_NAV_COUNT") {
      chrome.runtime.sendMessage({ action: "get_nav_count" }, function(response) {
        if (chrome.runtime.lastError) {
          window.postMessage({ type: "NAV_COUNT_RESULT", count: -1 }, "*");
          return;
        }
        window.postMessage({ type: "NAV_COUNT_RESULT", count: response.count }, "*");
      });
    }
    
    else if (event.data.type === "VERIFY_RESEARCH") {
      chrome.runtime.sendMessage({ action: "verify_research_done", startTime: event.data.startTime }, function(response) {
        if (chrome.runtime.lastError) {
          window.postMessage({ type: "RESEARCH_VERIFY_RESULT", activityCount: 1 }, "*");
          return;
        }
        window.postMessage({ type: "RESEARCH_VERIFY_RESULT", activityCount: response.activityCount }, "*");
      });
    }

    // --- Relais RESET_MEMORY_BYPASS ---
    else if (event.data.type === "RESET_MEMORY_BYPASS") {
        chrome.runtime.sendMessage({ action: "reset_memory_bypass" }, function() {
            if (chrome.runtime.lastError) { /* Ignorer */ }
        });
    }
  });

  // ===== DÉTECTION FIN PAR URL (fallback SPA) =====
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

  checkUrl();
  var checkInterval = setInterval(function () {
    checkUrl();
    if (completionSent) clearInterval(checkInterval);
  }, 1000);
  setTimeout(function () { clearInterval(checkInterval); }, 3600000);

  // ===== REPORTER L'URL AU BACKGROUND =====
  function reportUrl() {
    try {
      chrome.runtime.sendMessage({
        action: "set_questionnaire_tab",
        tabId: null,
        url: window.location.href,
      }, function () { if (chrome.runtime.lastError) { /* Ignorer */ } });
    } catch (e) {}
  }

  reportUrl();
  var lastReportedUrl = window.location.href;
  setInterval(function () {
    if (window.location.href !== lastReportedUrl) {
      lastReportedUrl = window.location.href;
      reportUrl();
    }
  }, 500);
})();
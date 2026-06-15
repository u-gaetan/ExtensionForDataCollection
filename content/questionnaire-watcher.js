(function () {
  var href = window.location.href;
  if (href.indexOf("/questionnaire/") === -1) return;

  var PRODUCTION_ORIGIN = "https://api-lmv-ul-grh4cehth4f5b5gu.canadaeast-01.azurewebsites.net";
  var completionSent = false;

  function isTrustedOrigin(origin) {
    return origin === PRODUCTION_ORIGIN;
  }

  function safeSendMessage(message, callback) {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      try {
        chrome.runtime.sendMessage(message, function(response) {
          if (chrome.runtime.lastError) {
            return;
          }
          if (callback) callback(response);
        });
      } catch (e) {
        // Ignorer l'exception d'invalidation
      }
    }
  }

  function sendCompletion() {
    if (completionSent) return;
    completionSent = true;
    
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
      chrome.storage.local.get(["isTracking"], function (result) {
        if (chrome.runtime.lastError || !result || !result.isTracking) return;
        safeSendMessage({ action: "questionnaire_completed" });
      });
    }
  }

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
      if (message.action === "external_terminate") {
        window.postMessage({ type: "EXTERNAL_TERMINATE", reason: message.reason }, window.location.origin);
        sendResponse({ success: true });
        return true;
      }
      if (message.action === "external_start_tracking") {
        window.postMessage({ type: "EXTERNAL_START" }, window.location.origin);
        sendResponse({ success: true });
        return true;
      }
    });
  }

  window.addEventListener("message", function (event) {
    if (!isTrustedOrigin(event.origin)) return;
    if (!event.data) return;

    if (event.data.type === "REQUEST_UNINSTALL") {
      safeSendMessage({ action: "uninstall_self" });
    }
    
    if (event.data.type === "PING_EXTENSION") {
      window.postMessage({ type: "PONG_EXTENSION" }, window.location.origin);
    }

    // Inclusion et transfert du paramètre de langue
    if (event.data.type === "EXCHANGE_SESSION" && event.data.participantId && event.data.token) {
      safeSendMessage({ 
        action: "import_session", 
        participantId: event.data.participantId, 
        token: event.data.token,
        language: event.data.language
      });
    }

    if (event.data.type === "SET_TOKEN" && event.data.token) {
      safeSendMessage({ action: "set_token", token: event.data.token });
    }

    if (event.data.type === "SET_LANGUAGE") {
      safeSendMessage({ action: "set_language", language: event.data.language });
    }

    if (event.data.type === "QUESTIONNAIRE_COMPLETED") {
      sendCompletion();
    }

    if (event.data.type === "START_TRACKING") {
      safeSendMessage({ action: "start_tracking" });
    }

    if (event.data.type === "SET_PHASE") {
      safeSendMessage({ action: "set_phase", phase: event.data.phase });
    }

    if (event.data.type === "GET_NAV_COUNT") {
      safeSendMessage({ action: "get_nav_count" }, function(response) {
        if (response) {
          window.postMessage({ type: "NAV_COUNT_RESULT", count: response.count }, "*");
        }
      });
    }
    
    if (event.data.type === "VERIFY_RESEARCH") {
      safeSendMessage({ action: "verify_research_done", startTime: event.data.startTime }, function(response) {
        if (response) {
          window.postMessage({ type: "RESEARCH_VERIFY_RESULT", activityCount: response.activityCount }, "*");
        }
      });
    }

    if (event.data.type === "STUDY_TERMINATED") {
      safeSendMessage({ action: "study_terminated", reason: event.data.reason });
    }

    if (event.data.type === "RESET_MEMORY_BYPASS") {
      safeSendMessage({ action: "reset_memory_bypass" });
    }
  });

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

  function reportUrl() {
    safeSendMessage({
      action: "set_questionnaire_tab",
      tabId: null,
      url: window.location.href,
    });
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
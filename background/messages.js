async function restoreState() {
  const r = await chrome.storage.local.get(
    ["participantId", "authToken", "isTracking", "currentLanguage"]
  );
  participantId   = r.participantId   || null;
  authToken       = r.authToken       || null;
  isTracking      = r.isTracking      || false;
  currentLanguage = r.currentLanguage || "fr";
}
restoreState();
chrome.runtime.onStartup.addListener(restoreState);

// ===== TIMERS DE FIN D'ÉTUDE (pilotés par le background) =====

const INACTIVITY_LIMIT_MIN = 60;   // 1 h 
const MAX_TIME_LIMIT_MIN   = 240;  // 4 h 

const ALARM_INACTIVITY = "study_inactivity";
const ALARM_MAXTIME    = "study_maxtime";

function startStudyTimers() {
  studyStartTime = Date.now();
  chrome.storage.local.set({ studyStartTime: studyStartTime });
  chrome.alarms.create(ALARM_MAXTIME, { when: studyStartTime + MAX_TIME_LIMIT_MIN * 60000 });
  resetInactivityAlarm();
}

function resetInactivityAlarm() {
  if (!isTracking || studyCompleted) return;
  chrome.alarms.create(ALARM_INACTIVITY, { delayInMinutes: INACTIVITY_LIMIT_MIN });
}

function clearStudyTimers() {
  chrome.alarms.clear(ALARM_INACTIVITY);
  chrome.alarms.clear(ALARM_MAXTIME);
}

function finalizeStudy(reason) {
  if (studyCompleted) return;            
  studyCompleted = true;
  isTracking = false;
  terminationReason = reason;
  stopAutoSend();
  clearStudyTimers();
  updateBadge(false);

  chrome.storage.local.set({ 
    isTracking: false, 
    studyCompleted: true, 
    terminationReason: reason 
  }, function () {
    saveStateNow();

    sendToServer(true).catch(function() {});

    if (questionnaireTabId) {
      chrome.tabs.sendMessage(questionnaireTabId, {
        action: "external_terminate",
        reason: reason
      }).catch(function () {});
    }
  });
}

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === ALARM_MAXTIME)        finalizeStudy("max_time");
  else if (alarm.name === ALARM_INACTIVITY) finalizeStudy("inactivity");
  else if (alarm.name === ALARM_AUTOSEND) {
    if (isTracking && sessionData.length > 0) {
      sendToServer(false).catch(function() {});
    }
  }
});

chrome.tabs.onActivated.addListener(function () { resetInactivityAlarm(); });
chrome.tabs.onUpdated.addListener(function (id, info) { if (info.url) resetInactivityAlarm(); });


chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (isTracking && !studyCompleted) resetInactivityAlarm();

  if (message.action === "import_session") {
    participantId = message.participantId;
    authToken = message.token;
    if (message.language) {
      currentLanguage = message.language;
    }
    chrome.storage.local.set({ 
      participantId: participantId, 
      authToken: authToken,
      currentLanguage: currentLanguage
    }, function() {
      saveStateNow();
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "set_token") {
    authToken = message.token;
    chrome.storage.local.set({ authToken: authToken });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "get_data") {
    var cleanData = sessionData.map(function (e) {
      var copy = {};
      for (var k in e) { if (k !== "_synced") copy[k] = e[k]; }
      return copy;
    });
    sendResponse({ data: cleanData });
    return true;
  }
  
  if (message.action === "set_language") {
    currentLanguage = message.language;
    chrome.storage.local.set({ currentLanguage: currentLanguage });
    sendResponse({ success: true });
    return true;
  } 

  // CORRECTION : Attendre la fin du vidage asynchrone avant de retourner la réponse
  if (message.action === "clear_data") {
    sessionData = [];
    tabHistory = {};
    currentVisitByTab = {};
    visitCounter = 0;
    questionnaireTabId = null;
    questionnaireUrl = null;
    studyCompleted = false;
    participantId = null; 
    authToken = null;     
    terminationReason = "unknown";

    chrome.storage.local.clear(function() {
      chrome.storage.local.set({ 
        isTracking: false,
        studyCompleted: false,
        terminationReason: "unknown"
      }, function() {
        saveStateNow();
        clearStudyTimers();
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.action === "start_tracking") {
    isTracking = true;
    studyCompleted = false;
    terminationReason = "unknown";

    chrome.storage.local.set({ isTracking: true, studyCompleted: false, terminationReason: "unknown" });
    updateBadge(true);
    startAutoSend();
    startStudyTimers();

    chrome.tabs.query({ url: "*://api-lmv-ul-grh4cehth4f5b5gu.canadaeast-01.azurewebsites.net/questionnaire/*" }, function (tabs) {
      let targetTab = null;
      if (tabs.length > 0) {
        targetTab = tabs[0];
      } else if (questionnaireTabId) {
        targetTab = { id: questionnaireTabId };
      }

      if (targetTab && targetTab.id) {
        chrome.tabs.update(targetTab.id, { active: true });
        if (targetTab.windowId) {
          chrome.windows.update(targetTab.windowId, { focused: true });
        }
        
        setTimeout(function() {
          chrome.tabs.sendMessage(targetTab.id, {
            action: "external_start_tracking"
          }).catch(function() {});
        }, 300);

        chrome.tabs.get(targetTab.id, function(t) {
          if (t && t.url) {
            var vid = "visit_" + (++visitCounter);
            currentVisitByTab[t.id] = vid;
            sessionData.push({
              type: "navigation",
              visitId: vid,
              url: t.url,
              parentUrl: "Demarrage de l'experience",
              tabId: t.id,
              timestamp: new Date().toISOString()
            });
            tabHistory[t.id] = t.url;
            saveStateNow();
          }
        });
      } else {
        var questionnaireUrl = "https://api-lmv-ul-grh4cehth4f5b5gu.canadaeast-01.azurewebsites.net/questionnaire/installation?pid=" + participantId;
        chrome.tabs.create({ url: questionnaireUrl, active: true }, function(newTab) {
          questionnaireTabId = newTab.id;
          chrome.storage.local.set({
            questionnaireTabId: newTab.id,
            questionnaireUrl: questionnaireUrl
          });
          saveStateNow();
        });
      }
    });

    sendResponse({ success: true });
    return true;
  }

  if (message.action === "study_terminated") {
    if (studyCompleted) {
        sendResponse({ success: true });
        return true;
    }

    studyCompleted = true;
    isTracking = false;
    // Mapping des raisons app.js -> clés reconnues par popup.js
    var raw = message.reason || "withdrawn";
    var map = {
        post_consent_refused: "withdrawn",   // retrait post-expérimental
        consent_refused:      "withdrawn",
        inactivity:           "inactivity",
        max_time:             "max_time",
        stopped_by_user:      "stopped_by_user"
    };
    terminationReason = map[raw] || "withdrawn";

    stopAutoSend();
    updateBadge(false);
    clearStudyTimers();
    chrome.storage.local.set({
      isTracking: false,
      studyCompleted: true,
      terminationReason: "withdrawn"
    }, function() {
      saveStateNow();
      sendToServer(true).then(function() {
        sendResponse({ success: true });
      }).catch(function() {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.action === "get_extension_ids") {
    (async function () {
      if (!participantId) await getOrCreateParticipantId();
      sendResponse({
        participantId: participantId,
        isTracking: isTracking,
        studyCompleted: studyCompleted
      });
    })();
    return true;
  }

  if (message.action === "stop_tracking") {
    stopAutoSend();
    isTracking = false;
    studyCompleted = true; 
    terminationReason = "stopped_by_user";
    updateBadge(false);
    clearStudyTimers();
    
    chrome.storage.local.set({ 
      isTracking: false,
      studyCompleted: true,
      terminationReason: "stopped_by_user"
    }, function() {
      saveStateNow();

      if (questionnaireTabId) {
        chrome.tabs.sendMessage(questionnaireTabId, { 
          action: "external_terminate", 
          reason: "stopped_by_user" 
        }).catch(function() {});
      }

      sendToServer(true).then(function (result) {
        sendResponse(result);
      }).catch(function(err) {
        sendResponse({ success: false, error: err.message });
      });
    });
    return true;
  }

  if (message.action === "send_to_server") {
    sendToServer(false).then(function (result) {
      sendResponse(result);
    });
    return true;
  }

  if (message.action === "set_questionnaire_tab") {
    questionnaireTabId = message.tabId || (sender.tab ? sender.tab.id : questionnaireTabId);
    questionnaireUrl = message.url || questionnaireUrl;
    chrome.storage.local.set({
      questionnaireTabId: questionnaireTabId,
      questionnaireUrl: questionnaireUrl
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "get_questionnaire_info") {
    let url = questionnaireUrl;
    if (!url && participantId) {
      url = "https://api-lmv-ul-grh4cehth4f5b5gu.canadaeast-01.azurewebsites.net/questionnaire/installation?pid=" + participantId;
    }
    sendResponse({
      tabId: questionnaireTabId,
      url: url
    });
    return true;
  }

  if (message.action === "questionnaire_completed") {
    if (!isTracking) {
      sendResponse({ success: false, error: "Pas en cours" });
      return true;
    }

    studyCompleted = true;
    isTracking = false;
    terminationReason = "completed";
    stopAutoSend();
    updateBadge(false);
    clearStudyTimers();

    chrome.storage.local.set({
      isTracking: false,
      studyCompleted: true,
      terminationReason: "completed"
    }, function() {
      saveStateNow();
      sendToServer(true).then(function() {
        sendResponse({ success: true });
      }).catch(function() {
        sendResponse({ success: true });
      });
    });
    return true;
  }

  if (message.action === "uninstall_self") {
    try {
      chrome.management.uninstallSelf({ showConfirmDialog: true });
      sendResponse({ success: true });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
    return true;
  }

  if (message.type === "page_quittee" && message.visitId) {
    if (sender.tab && sender.tab.id) {
      message.tabId = sender.tab.id;
    }

    var existingIdx = -1;
    for (var i = 0; i < sessionData.length; i++) {
      if (sessionData[i].type === "page_quittee" && sessionData[i].visitId === message.visitId) {
        existingIdx = i;
        break;
      }
    }

    if (existingIdx !== -1) {
      if (message.temps_passe_ms >= sessionData[existingIdx].temps_passe_ms) {
        sessionData[existingIdx] = message;
      }
    } else {
      sessionData.push(message);
    }
    saveState();
    return;
  }

  if (isTracking && message.type) {
    if (sender.tab && sender.tab.id) {
      message.tabId = sender.tab.id;
      if (!message.visitId && currentVisitByTab[sender.tab.id]) {
        message.visitId = currentVisitByTab[sender.tab.id];
      }
    }
    sessionData.push(message);
    saveState();
  }

  if (message.action === "set_phase") {
    currentStudyPhase = message.phase;
    if (message.phase === "research") {
      memoryEmergencyBypass = {}; 
    }
    saveStateNow();
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "get_nav_count") {
    sendResponse({ count: visitCounter });
    return true;
  }

  if (message.action === "verify_research_done") {
    var externalActivityCount = 0;
    if (message.startTime) {
      var startTime = new Date(message.startTime).getTime();
      for (var i = sessionData.length - 1; i >= 0; i--) {
        var ev = sessionData[i];
        if (ev.timestamp) {
          var evTime = new Date(ev.timestamp).getTime();
          if (evTime >= startTime) {
            var isExternal = ev.url && 
                             !ev.url.includes('/questionnaire/') && 
                             !ev.url.startsWith('chrome-extension://') && 
                             !ev.url.startsWith('chrome://') &&
                             !ev.url.startsWith('about:');
            if (isExternal && (ev.type === 'navigation' || ev.type === 'tab_activated' || ev.type === 'clic')) {
              externalActivityCount++;
            }
          }
        }
      }
    }
    sendResponse({ activityCount: externalActivityCount });
    return true;
  }

  if (message.action === "allow_memory_emergency") {
      var tabId = (sender.tab ? sender.tab.id : null) || message.tabId;
      if (tabId) {
          memoryEmergencyBypass[tabId] = true;
      }
      saveStateNow();
      sendResponse({ success: true });
      return true;
  }

  if (message.action === "reset_memory_bypass") {
      memoryEmergencyBypass = {};
      saveStateNow();
      sendResponse({ success: true });
      return true;
  }

  if (message.action === "focus_questionnaire") {
    if (questionnaireTabId) {
      chrome.tabs.update(questionnaireTabId, { active: true });
    }
    sendResponse({ success: true });
    return true;
  }

  // ADDITION : Gestion de la demande d'identifiant de visite pour content.js
  if (message.action === "get_visit_id") {
    var tabId = sender.tab ? sender.tab.id : null;
    var vid = tabId ? currentVisitByTab[tabId] : null;

    // Si le suivi est actif mais qu'aucune visite n'est associée, génération à chaud
    if (!vid && tabId && isTracking) {
      vid = "visit_" + (++visitCounter);
      currentVisitByTab[tabId] = vid;
      saveStateNow();
    }

    sendResponse({ visitId: vid });
    return true;
  }
});
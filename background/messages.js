// ===== TIMERS DE FIN D'ÉTUDE (pilotés par le background) =====
const TEST_MODE = true;
const INACTIVITY_LIMIT_MIN = TEST_MODE ? 1 : 60;   // 1 h en prod
const MAX_TIME_LIMIT_MIN   = TEST_MODE ? 2 : 240;  // 4 h en prod

const ALARM_INACTIVITY = "study_inactivity";
const ALARM_MAXTIME    = "study_maxtime";

function startStudyTimers() {
  studyStartTime = Date.now();
  chrome.storage.local.set({ studyStartTime: studyStartTime });
  // Durée totale (absolue → survit au sommeil du SW)
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
  if (studyCompleted) return;            // anti double-déclenchement
  studyCompleted = true;
  isTracking = false;
  stopAutoSend();
  clearStudyTimers();
  updateBadge(false);
  chrome.storage.local.set({ isTracking: false, studyCompleted: true });
  saveStateNow();

  // Afficher l'écran de fin avec la bonne raison
  if (questionnaireTabId) {
    chrome.tabs.sendMessage(questionnaireTabId, {
      action: "external_terminate",
      reason: reason
    }).catch(function () {});
  }
}

chrome.alarms.onAlarm.addListener(function (alarm) {
  if (alarm.name === ALARM_MAXTIME)        finalizeStudy("max_time");
  else if (alarm.name === ALARM_INACTIVITY) finalizeStudy("inactivity");
});

// Réarme l'inactivité sur l'activité de N'IMPORTE QUEL onglet
chrome.tabs.onActivated.addListener(function () { resetInactivityAlarm(); });
chrome.tabs.onUpdated.addListener(function (id, info) { if (info.url) resetInactivityAlarm(); });


chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (isTracking && !studyCompleted) resetInactivityAlarm();


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

  if (message.action === "clear_data") {
    sessionData = [];
    tabHistory = {};
    currentVisitByTab = {};
    visitCounter = 0;
    questionnaireTabId = null;
    questionnaireUrl = null;
    studyCompleted = false;
    authToken = null;
    chrome.storage.local.set({ studyCompleted: false });
    saveStateNow();
    clearStudyTimers();
    sendResponse({ success: true });
    return true;
  }

  if (message.action === "get_visit_id") {
    var tabId = sender.tab ? sender.tab.id : null;
    sendResponse({
      visitId: tabId ? currentVisitByTab[tabId] || null : null
    });
    return true;
  }

  if (message.action === "start_tracking") {
    isTracking = true;
    studyCompleted = false;

    chrome.storage.local.set({ isTracking: true, studyCompleted: false });
    updateBadge(true);
    startAutoSend();
    startStudyTimers();

    chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
      if (tabs.length > 0) {
        var tab = tabs[0];
        var currentUrl = tab.url || "URL Inconnue";
        var vid = "visit_" + (++visitCounter);
        currentVisitByTab[tab.id] = vid;

        sessionData.push({
          type: "navigation",
          visitId: vid,
          url: currentUrl,
          parentUrl: "Demarrage de l'experience",
          tabId: tab.id,
          timestamp: new Date().toISOString()
        });

        tabHistory[tab.id] = currentUrl;
        saveStateNow();
        chrome.tabs.sendMessage(tab.id, {
          action: "url_changed",
          newUrl: currentUrl,
          visitId: vid
        }).catch(function () {});
      }
      sendResponse({ success: true });
    });
    return true;
  }

  // messages.js — À insérer dans le listener onMessage de messages.js

  if (message.action === "study_terminated") {
    studyCompleted = true;
    isTracking = false;
    stopAutoSend();
    updateBadge(false);
    clearStudyTimers();
    chrome.storage.local.set({
      isTracking: false,
      studyCompleted: true
    }, function() {
      saveStateNow();
      // Tentative d'envoi des dernières données accumulées
      sendToServer(true).catch(function() {});
      sendResponse({ success: true });
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
    studyCompleted = true; // Verrouille définitivement l'extension
    updateBadge(false);
    
    chrome.storage.local.set({ 
      isTracking: false,
      studyCompleted: true 
    }, function() {
      saveStateNow();

      // Envoi du signal d'arrêt à l'onglet du questionnaire s'il est ouvert
      if (questionnaireTabId) {
        chrome.tabs.sendMessage(questionnaireTabId, { 
          action: "external_terminate", 
          reason: "stopped_by_user" 
        }).catch(function() {});
      }
    });

    sendToServer(true).then(function (result) {
      sendResponse(result);
    });
    clearStudyTimers();
    return true;
  }

  if (message.action === "send_to_server") {
    sendToServer(true).then(function (result) {
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
    sendResponse({
      tabId: questionnaireTabId,
      url: questionnaireUrl
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
    stopAutoSend();
    updateBadge(false);

    chrome.storage.local.set({
      isTracking: false,
      studyCompleted: true
    });
    saveStateNow();

    // Envoyer les données en arrière-plan (le participant n'attend pas)
    sendToServer(true);

    sendResponse({ success: true });
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

  // --- GESTION DES PHASES (Unique) ---
  if (message.action === "set_phase") {
    currentStudyPhase = message.phase;
    if (message.phase === "research") {
      memoryEmergencyBypass = {}; // Réinitialisation des urgences quand on revient en recherche
    }
    saveStateNow();
    sendResponse({ success: true });
    return true;
  }

  // --- COMPTEUR DE NAVIGATIONS ---
  if (message.action === "get_nav_count") {
    sendResponse({ count: visitCounter });
    return true;
  }

  // --- VERIFICATEUR DE RECHERCHES EFFECTIVES (Unique - retourne activityCount) ---
  if (message.action === "verify_research_done") {
    var externalActivityCount = 0;
    if (message.startTime) {
      var startTime = new Date(message.startTime).getTime();
      for (var i = sessionData.length - 1; i >= 0; i--) {
        var ev = sessionData[i];
        if (ev.timestamp) {
          var evTime = new Date(ev.timestamp).getTime();
          // On ne compte que les activités survenues depuis le début de la question
          if (evTime >= startTime) {
            var isExternal = ev.url && 
                             !ev.url.includes('/questionnaire/') && 
                             !ev.url.startsWith('chrome-extension://') && 
                             !ev.url.startsWith('chrome://') &&
                             !ev.url.startsWith('about:');
            // Clics, changements d'onglets ou navigations sur de vrais sites internet
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

  // --- URGENCE MÉMOIRE ---
  if (message.action === "allow_memory_emergency") {
      var tabId = (sender.tab ? sender.tab.id : null) || message.tabId;
      if (tabId) {
          memoryEmergencyBypass[tabId] = true;
      }
      saveStateNow();
      sendResponse({ success: true });
      return true;
  }

  // --- RÉINITIALISATION DU BYPASS À CHAQUE QUESTION MÉMOIRE ---
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

});
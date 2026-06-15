let sessionData = [];
let tabHistory = {};
let isTracking = false;
let visitCounter = 0;
let currentVisitByTab = {};
let stateLoaded = false;
let autoSendInterval = null;
let participantId = null;
let saveTimer = null;
let authToken = null;
let questionnaireTabId = null;
let questionnaireUrl = null;
let studyCompleted = false;
let currentStudyPhase = "research"; // "research" ou "memory"
let memoryEmergencyBypass = {}; // Stocke les onglets autorisés en urgence
let terminationReason = "unknown";
let currentLanguage = "fr"; // Langue de l'étude par défaut

// Badge
function updateBadge(tracking) {
  try {
    if (tracking) {
      chrome.action.setBadgeText({ text: "REC" });
      chrome.action.setBadgeBackgroundColor({ color: "#ef4444" });
    } else {
      chrome.action.setBadgeText({ text: "" });
    }
  } catch (e) {
    // Ignorer si chrome.action n'est pas disponible
  }
}

async function getOrCreateParticipantId() {
  var storage = await chrome.storage.local.get(["participantId"]);
  if (storage.participantId) {
    participantId = storage.participantId;
  } else {
    participantId = null;
  }
  return participantId;
}

async function loadState() {
  try {
    var res = await chrome.storage.local.get([
      "isTracking",
      "sw_sessionData",
      "sw_tabHistory",
      "sw_currentVisitByTab",
      "sw_visitCounter",
      "authToken",
      "participantId",
      "questionnaireTabId",
      "questionnaireUrl",
      "studyCompleted",
      "currentStudyPhase", 
      "memoryEmergencyBypass",
      "terminationReason",
      "currentLanguage"
    ]);
    isTracking = res.isTracking || false;
    sessionData = res.sw_sessionData || [];
    tabHistory = res.sw_tabHistory || {};
    currentVisitByTab = res.sw_currentVisitByTab || {};
    visitCounter = res.sw_visitCounter || 0;
    authToken = res.authToken || null;
    participantId = res.participantId || null;
    questionnaireTabId = res.questionnaireTabId || null;
    questionnaireUrl = res.questionnaireUrl || null;
    studyCompleted = res.studyCompleted || false;
    currentStudyPhase = res.currentStudyPhase || "research";
    memoryEmergencyBypass = res.memoryEmergencyBypass || {};
    terminationReason = res.terminationReason || "unknown";
    currentLanguage = res.currentLanguage || "fr";
    stateLoaded = true;
    
    if (isTracking) startAutoSend();
    updateBadge(isTracking);
  } catch (e) {
    stateLoaded = true;
  }
}

function saveState() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(_doSave, 1000);
}

function saveStateNow() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  _doSave();
}

function _doSave() {
  chrome.storage.local.set({
    sw_sessionData: sessionData,
    sw_tabHistory: tabHistory,
    sw_currentVisitByTab: currentVisitByTab,
    sw_visitCounter: visitCounter,
    questionnaireTabId: questionnaireTabId,
    questionnaireUrl: questionnaireUrl,
    studyCompleted: studyCompleted,
    currentStudyPhase: currentStudyPhase,
    memoryEmergencyBypass: memoryEmergencyBypass,
    terminationReason: terminationReason,
    currentLanguage: currentLanguage
  });
}
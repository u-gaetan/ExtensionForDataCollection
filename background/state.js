let sessionData = [];
let tabHistory = {};
let isTracking = false;
let visitCounter = 0;
let currentVisitByTab = {};
let stateLoaded = false;
let currentSessionId = null;
let autoSendInterval = null;
let participantId = null;
let saveTimer = null;
let authToken = null;
let questionnaireTabId = null;
let questionnaireUrl = null;
let studyCompleted = false;

// Badge — défini ici car utilisé par loadState
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
    var timestamp = Date.now().toString(36);
    var random = Math.random().toString(36).slice(2, 6);
    participantId = "P-" + timestamp + "-" + random;
    await chrome.storage.local.set({ participantId: participantId });
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
      "sw_sessionId",
      "authToken",
      "questionnaireTabId",
      "questionnaireUrl",
      "studyCompleted"
    ]);
    isTracking = res.isTracking || false;
    sessionData = res.sw_sessionData || [];
    tabHistory = res.sw_tabHistory || {};
    currentVisitByTab = res.sw_currentVisitByTab || {};
    visitCounter = res.sw_visitCounter || 0;
    currentSessionId = res.sw_sessionId || null;
    authToken = res.authToken || null;
    questionnaireTabId = res.questionnaireTabId || null;
    questionnaireUrl = res.questionnaireUrl || null;
    studyCompleted = res.studyCompleted || false;
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
    sw_sessionId: currentSessionId,
    questionnaireTabId: questionnaireTabId,
    questionnaireUrl: questionnaireUrl,
    studyCompleted: studyCompleted
  });
}

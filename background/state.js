// =========================================================
// ÉTAT EN MÉMOIRE
// =========================================================
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

// =========================================================
// PARTICIPANT ID
// =========================================================
async function getOrCreateParticipantId() {
  const storage = await chrome.storage.local.get(["participantId"]);
  if (storage.participantId) {
    participantId = storage.participantId;
  } else {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 6);
    participantId = `P-${timestamp}-${random}`;
    await chrome.storage.local.set({ participantId });
  }
  return participantId;
}

// =========================================================
// PERSISTENCE
// =========================================================
async function loadState() {
  const res = await chrome.storage.local.get([
    "isTracking",
    "sw_sessionData",
    "sw_tabHistory",
    "sw_currentVisitByTab",
    "sw_visitCounter",
    "sw_sessionId",
    "authToken",
  ]);
  isTracking = res.isTracking || false;
  sessionData = res.sw_sessionData || [];
  tabHistory = res.sw_tabHistory || {};
  currentVisitByTab = res.sw_currentVisitByTab || {};
  visitCounter = res.sw_visitCounter || 0;
  currentSessionId = res.sw_sessionId || null;
  authToken = res.authToken || null;
  stateLoaded = true;
  if (isTracking) startAutoSend();
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
  });
}

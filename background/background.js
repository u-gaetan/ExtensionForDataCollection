// =========================================================
// SERVICE WORKER — POINT D'ENTRÉE
// =========================================================
importScripts(
  "config.js",
  "state.js",
  "network.js",
  "navigation.js",
  "messages.js"
);

// Initialisation
getOrCreateParticipantId();
loadState();

// Écouter les changements d'état du tracking
chrome.storage.onChanged.addListener((changes) => {
  if (changes.isTracking) {
    isTracking = changes.isTracking.newValue;
  }
});

importScripts(
  "config.js",
  "state.js",
  "network.js",
  "navigation.js",
  "messages.js"
);

getOrCreateParticipantId();
loadState();

chrome.storage.onChanged.addListener(function (changes) {
  if (changes.isTracking) {
    isTracking = changes.isTracking.newValue;
    updateBadge(isTracking);
  }
});

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

// Détecte l'installation et recharge l'onglet du questionnaire s'il est déjà ouvert
chrome.runtime.onInstalled.addListener(async function () {
  try {
    const tabs = await chrome.tabs.query({
      url: "*://api-lmv-ul-grh4cehth4f5b5gu.canadaeast-01.azurewebsites.net/questionnaire/*"
    });
    for (const tab of tabs) {
      if (tab.id) {
        chrome.tabs.reload(tab.id);
      }
    }
  } catch (e) {
    console.error("Erreur lors du rafraîchissement automatique de l'onglet :", e);
  }
});
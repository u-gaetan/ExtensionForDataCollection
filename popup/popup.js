var toggleBtn = document.getElementById("toggleBtn");
var questionnaireBtn = document.getElementById("questionnaireBtn");
var uninstallBtn = document.getElementById("uninstallBtn");
var statusMsg = document.getElementById("statusMsg");
var participantBadge = document.getElementById("participantBadge");
var trackingIndicator = document.getElementById("trackingIndicator");
var completedBox = document.getElementById("completedBox");
var noteText = document.getElementById("noteText");

// =========================================================
// RESTAURER L'ÉTAT
// =========================================================
chrome.storage.local.get(
  ["isTracking", "participantId", "studyCompleted"],
  function (result) {
    if (result.participantId) {
      participantBadge.textContent = "ID : " + result.participantId;
    }

    if (result.studyCompleted) {
      showCompletedState();
    } else {
      updateUI(result.isTracking || false);
    }
  }
);

// =========================================================
// RÉAGIR AUX CHANGEMENTS EN TEMPS RÉEL
// =========================================================
chrome.storage.onChanged.addListener(function (changes) {
  if (changes.studyCompleted && changes.studyCompleted.newValue === true) {
    showCompletedState();
  }
  if (changes.isTracking) {
    if (!changes.isTracking.newValue) {
      chrome.storage.local.get(["studyCompleted"], function (res) {
        if (res.studyCompleted) {
          showCompletedState();
        } else {
          updateUI(false);
        }
      });
    }
  }
});

// =========================================================
// BOUTON DÉMARRER / ARRÊTER
// =========================================================
toggleBtn.addEventListener("click", function () {
  chrome.storage.local.get(
    ["isTracking", "studyCompleted"],
    function (result) {
      
      // VERROUILLAGE DÉFINITIF : Impossible de relancer l'étude
      if (result.studyCompleted) {
        return; 
      }

      var newState = !(result.isTracking || false);

      if (newState === true) {
        // ── DÉMARRAGE ──
        chrome.runtime.sendMessage({ action: "get_data" }, function (response) {
          var hasData = response && response.data && response.data.length > 0;
          if (hasData) {
            if (!confirm("Des données existent. Effacer et redémarrer ?")) return;
          }

          chrome.runtime.sendMessage({ action: "clear_data" }, function () {
            chrome.runtime.sendMessage({ action: "get_extension_ids" }, function (ids) {
              if (ids && ids.participantId) {
                var questionnaireUrl =
                  "https://api-lmv-ul-grh4cehth4f5b5gu.canadaeast-01.azurewebsites.net/questionnaire/" +
                  "?pid=" + ids.participantId;

                chrome.tabs.create({ url: questionnaireUrl }, function (tab) {
                  chrome.runtime.sendMessage({
                    action: "set_questionnaire_tab",
                    tabId: tab.id,
                    url: questionnaireUrl,
                  });
                });
                showStatus("⏳ En attente de votre consentement...", "info");
              }
            });
          });
        });
      } else {
        // ── ARRÊT MANUEL ──
        toggleBtn.disabled = true;
        showStatus("⏳ Envoi des données en cours...", "info");

        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          var sendStop = function () {
            chrome.runtime.sendMessage({ action: "stop_tracking" }, function (result) {
              chrome.storage.local.set({ isTracking: false }, function () {
                updateUI(false);
                toggleBtn.disabled = false;
                if (result && result.success) {
                  showStatus("✅ Données envoyées ! Merci.", "success");
                } else {
                  showStatus("⚠️ Envoi échoué. Données sauvegardées localement.", "error");
                }
              });
            });
          };

          if (tabs.length > 0 && tabs[0].id) {
            chrome.tabs.sendMessage(tabs[0].id, { action: "force_save_stats" }, function () {
              if (chrome.runtime.lastError) {}
              sendStop();
            });
          } else {
            sendStop();
          }
        });
      }
    }
  );
});

// =========================================================
// BOUTON RETOUR AU QUESTIONNAIRE
// =========================================================
questionnaireBtn.addEventListener("click", function () {
  chrome.runtime.sendMessage({ action: "get_questionnaire_info" }, function (info) {
    if (!info || !info.url) {
      showStatus("❌ URL du questionnaire introuvable.", "error");
      return;
    }
    if (info.tabId) {
      chrome.tabs.get(info.tabId, function (tab) {
        if (chrome.runtime.lastError || !tab) {
          chrome.tabs.create({ url: info.url });
        } else {
          chrome.tabs.update(info.tabId, { active: true });
          chrome.windows.update(tab.windowId, { focused: true });
        }
      });
    } else {
      chrome.tabs.create({ url: info.url });
    }
  });
});

// =========================================================
// BOUTON DÉSINSTALLER
// =========================================================
uninstallBtn.addEventListener("click", function () {
  chrome.runtime.sendMessage({ action: "uninstall_self" }, function (response) {
    if (chrome.runtime.lastError || !response || !response.success) {
      alert("Faites un clic droit sur l'icône de l'extension et cliquez sur 'Supprimer de Chrome'.");
    }
  });
});

// =========================================================
// FONCTIONS UI
// =========================================================
function updateUI(isTracking) {
  completedBox.style.display = "none";
  uninstallBtn.style.display = "none";

  if (isTracking) {
    toggleBtn.textContent = "⏹️ ARRÊTER L'ÉTUDE";
    toggleBtn.style.backgroundColor = "#22c55e";
    toggleBtn.style.display = "block";
    questionnaireBtn.style.display = "block";
    trackingIndicator.style.display = "block";
    noteText.style.display = "block";
  } else {
    toggleBtn.textContent = "▶️ DÉMARRER L'ÉTUDE";
    toggleBtn.style.backgroundColor = "#3b82f6";
    toggleBtn.style.display = "block";
    questionnaireBtn.style.display = "none";
    trackingIndicator.style.display = "none";
    noteText.style.display = "block";
  }
}

function showCompletedState() {
  completedBox.style.display = "block";
  toggleBtn.style.display = "none";
  questionnaireBtn.style.display = "none";
  trackingIndicator.style.display = "none";
  uninstallBtn.style.display = "block";
  noteText.style.display = "none";
  showStatus("", "");
}

function showStatus(text, type) {
  statusMsg.textContent = text;
  statusMsg.className = type || "";
}
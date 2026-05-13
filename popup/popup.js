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
// (si le questionnaire se termine pendant que le popup est ouvert)
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
      // Si l'étude est terminée, proposer de recommencer
      if (result.studyCompleted) {
        if (
          !confirm(
            "L'étude précédente est terminée. Voulez-vous en démarrer une nouvelle ?"
          )
        )
          return;
        chrome.storage.local.set({ studyCompleted: false });
      }

      var newState = !(result.isTracking || false);

      if (newState === true) {
        // ── DÉMARRAGE ──
        chrome.runtime.sendMessage(
          { action: "get_data" },
          function (response) {
            var hasData =
              response && response.data && response.data.length > 0;

            if (hasData) {
              if (
                !confirm("Des données existent. Effacer et redémarrer ?")
              )
                return;
            }

            chrome.runtime.sendMessage({ action: "clear_data" }, function () {
              chrome.runtime.sendMessage(
                { action: "start_tracking" },
                function () {
                  chrome.storage.local.set({ isTracking: true }, function () {
                    updateUI(true);
                    showStatus("🟢 Naviguez normalement !", "success");
                  });

                  chrome.runtime.sendMessage(
                    { action: "get_extension_ids" },
                    function (ids) {
                      if (ids && ids.participantId && ids.sessionId) {
                        var questionnaireUrl =
                          "https://api-lmv-ul-grh4cehth4f5b5gu.canadaeast-01.azurewebsites.net/questionnaire/" +
                          "?pid=" +
                          ids.participantId +
                          "&sid=" +
                          ids.sessionId;

                        chrome.tabs.create(
                          { url: questionnaireUrl },
                          function (tab) {
                            // Stocker l'onglet du questionnaire
                            chrome.runtime.sendMessage({
                              action: "set_questionnaire_tab",
                              tabId: tab.id,
                              url: questionnaireUrl,
                            });
                          }
                        );
                      }
                    }
                  );
                }
              );
            });
          }
        );
      } else {
        // ── ARRÊT MANUEL ──
        toggleBtn.disabled = true;
        showStatus("⏳ Envoi des données en cours...", "info");

        chrome.tabs.query(
          { active: true, currentWindow: true },
          function (tabs) {
            var sendStop = function () {
              chrome.runtime.sendMessage(
                { action: "stop_tracking" },
                function (result) {
                  chrome.storage.local.set(
                    { isTracking: false },
                    function () {
                      updateUI(false);
                      toggleBtn.disabled = false;

                      if (result && result.success) {
                        showStatus(
                          "✅ Données envoyées ! Merci.",
                          "success"
                        );
                      } else {
                        showStatus(
                          "⚠️ Envoi échoué. Données sauvegardées localement.",
                          "error"
                        );
                      }
                    }
                  );
                }
              );
            };

            if (tabs.length > 0 && tabs[0].id) {
              chrome.tabs.sendMessage(
                tabs[0].id,
                { action: "force_save_stats" },
                function () {
                  if (chrome.runtime.lastError) {
                    /* ignoré */
                  }
                  sendStop();
                }
              );
            } else {
              sendStop();
            }
          }
        );
      }
    }
  );
});

// =========================================================
// BOUTON RETOUR AU QUESTIONNAIRE
// =========================================================
questionnaireBtn.addEventListener("click", function () {
  chrome.runtime.sendMessage(
    { action: "get_questionnaire_info" },
    function (info) {
      if (!info || !info.url) {
        showStatus("❌ URL du questionnaire introuvable.", "error");
        return;
      }

      if (info.tabId) {
        // Essayer de réactiver l'onglet existant
        chrome.tabs.get(info.tabId, function (tab) {
          if (chrome.runtime.lastError || !tab) {
            // L'onglet a été fermé → ouvrir un nouveau
            chrome.tabs.create({ url: info.url });
          } else {
            // L'onglet existe → le mettre au premier plan
            chrome.tabs.update(info.tabId, { active: true });
            chrome.windows.update(tab.windowId, { focused: true });
          }
        });
      } else {
        chrome.tabs.create({ url: info.url });
      }
    }
  );
});

// =========================================================
// BOUTON DÉSINSTALLER
// =========================================================
uninstallBtn.addEventListener("click", function () {
  chrome.runtime.sendMessage({ action: "uninstall_self" }, function (response) {
    if (chrome.runtime.lastError || !response || !response.success) {
      // Fallback : ouvrir la page de tuto
      chrome.tabs.create({
        url: chrome.runtime.getURL("uninstall/uninstall.html"),
      });
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

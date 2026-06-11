var toggleBtn = document.getElementById("toggleBtn");
var questionnaireBtn = document.getElementById("questionnaireBtn");
var uninstallBtn = document.getElementById("uninstallBtn");
var statusMsg = document.getElementById("statusMsg");
var participantBadge = document.getElementById("participantBadge");
var trackingIndicator = document.getElementById("trackingIndicator");
var completedBox = document.getElementById("completedBox");
var noteText = document.getElementById("noteText");

// Dictionnaire i18n local à la popup
const popupI18n = {
    fr: {
        title: "🔬 Étude Navigation Web",
        subtitle: "Université Laval — LEILAH",
        badge: "ID : ",
        indicator: "Collecte de données en cours",
        completed: "Étude terminée — Merci pour votre participation !",
        btn_back: "📋 Retour au questionnaire",
        btn_start: "▶️ Lancer l'étude - Start the study",
        btn_stop: "⏹️ Arrêter l'étude - Stop the study",
        btn_uninstall: "🗑️ Désinstaller l'extension",
        note: "Les données sont envoyées automatiquement toutes les 3 minutes et à la fin de la session.",
        confirm_reset: "Des données existantes ont été trouvées. Voulez-vous les effacer et redémarrer l'étude ?",
        status_waiting: "⏳ En attente de votre consentement...",
        status_sending: "⏳ Envoi des données en cours...",
        status_sent: "✅ Données envoyées ! Merci.",
        status_failed: "⚠️ Envoi échoué",
        status_no_url: "URL du questionnaire introuvable.",
        alert_manual_uninstall: "Faites un clic droit sur l'icône de l'extension et cliquez sur 'Supprimer de Chrome'."
    },
    en: {
        title: "🔬 Web Navigation Study",
        subtitle: "Université Laval — LEILAH",
        badge: "ID: ",
        indicator: "Data collection in progress",
        completed: "Study completed — Thank you for your participation!",
        btn_back: "📋 Back to questionnaire",
        btn_start: "▶️ Start The Study",
        btn_stop: "⏹️ Stop The Study",
        btn_uninstall: "🗑️ Uninstall extension",
        note: "Data is automatically sent every 3 minutes and at the end of the session.",
        confirm_reset: "Existing data has been found. Do you want to clear it and restart the study?",
        status_waiting: "⏳ Waiting for your consent...",
        status_sending: "⏳ Uploading data...",
        status_sent: "✅ Data sent! Thank you.",
        status_failed: "⚠️ Upload failed",
        status_no_url: "Questionnaire URL not found.",
        alert_manual_uninstall: "Right-click on the extension icon and select 'Remove from Chrome'."
    }
};

let activeLang = 'fr'; // Défaut

function applyTranslations(lang) {
    activeLang = lang;
    const txt = popupI18n[lang];

    const h2 = document.querySelector("h2");
    const sub = document.querySelector(".subtitle");
    if (h2)  h2.textContent  = txt.title;
    if (sub) sub.textContent = txt.subtitle;
    if (noteText) noteText.textContent = txt.note;
    if (completedBox) completedBox.querySelector(".msg").textContent = txt.completed;
    if (trackingIndicator) trackingIndicator.innerHTML = '<span class="dot"></span> ' + txt.indicator;
    if (uninstallBtn) uninstallBtn.textContent = txt.btn_uninstall;
    if (questionnaireBtn) questionnaireBtn.textContent = txt.btn_back;

    chrome.storage.local.get(["isTracking"], function(res) {
        if (toggleBtn) toggleBtn.textContent = res.isTracking ? txt.btn_stop : txt.btn_start;
    });
}



// =========================================================
// RESTAURER L'ÉTAT
// =========================================================
chrome.storage.local.get(
  ["isTracking", "participantId", "studyCompleted", "currentLanguage"],
  function (result) {
    const lang = result.currentLanguage || 'fr';
    applyTranslations(lang);

    if (result.participantId) {
      participantBadge.textContent = popupI18n[lang].badge + result.participantId;
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
  if (changes.currentLanguage) {
      applyTranslations(changes.currentLanguage.newValue);
  }
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
      if (result.studyCompleted) return;

      var newState = !(result.isTracking || false);
      const txt = popupI18n[activeLang];

      if (newState === true) {
        chrome.runtime.sendMessage({ action: "get_data" }, function (response) {
          var hasData = response && response.data && response.data.length > 0;
          if (hasData) {
            if (!confirm(txt.confirm_reset)) return;
          }

          chrome.runtime.sendMessage({ action: "clear_data" }, function () {
            chrome.runtime.sendMessage({ action: "get_extension_ids" }, function (ids) {
              if (ids && ids.participantId) {
                var questionnaireUrl = "https://api-lmv-ul-grh4cehth4f5b5gu.canadaeast-01.azurewebsites.net/questionnaire/?pid=" + ids.participantId;
                chrome.tabs.create({ url: questionnaireUrl }, function (tab) {
                  chrome.runtime.sendMessage({
                    action: "set_questionnaire_tab",
                    tabId: tab.id,
                    url: questionnaireUrl,
                  });
                });
                showStatus(txt.status_waiting, "info");
              }
            });
          });
        });
      } else {
        toggleBtn.disabled = true;
        showStatus(txt.status_sending, "info");

        chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
          var sendStop = function () {
            chrome.runtime.sendMessage({ action: "stop_tracking" }, function (result) {
              chrome.storage.local.set({ isTracking: false }, function () {
                updateUI(false);
                toggleBtn.disabled = false;
                if (result && result.success) {
                  showStatus(txt.status_sent, "success");
                } else {
                  showStatus(txt.status_failed, "error");
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
    const txt = popupI18n[activeLang];
    if (!info || !info.url) {
      showStatus(txt.status_no_url, "error");
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
    const txt = popupI18n[activeLang];
    if (chrome.runtime.lastError || !response || !response.success) {
      alert(txt.alert_manual_uninstall);
    }
  });
});

// =========================================================
// FONCTIONS UI
// =========================================================
function updateUI(isTracking) {
  completedBox.style.display = "none";
  uninstallBtn.style.display = "none";
  const txt = popupI18n[activeLang];

  if (isTracking) {
    toggleBtn.textContent = txt.btn_stop;
    toggleBtn.style.backgroundColor = "#22c55e";
    toggleBtn.style.display = "block";
    questionnaireBtn.style.display = "block";
    trackingIndicator.style.display = "block";
    noteText.style.display = "block";
  } else {
    toggleBtn.textContent = txt.btn_start;
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
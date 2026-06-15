var toggleBtn = document.getElementById("toggleBtn");
var questionnaireBtn = document.getElementById("questionnaireBtn");
var uninstallBtn = document.getElementById("uninstallBtn");
var statusMsg = document.getElementById("statusMsg");
var participantBadge = document.getElementById("participantBadge");
var trackingIndicator = document.getElementById("trackingIndicator");
var completedBox = document.getElementById("completedBox");
var noteText = document.getElementById("noteText");

// Dictionnaire i18n étendu
const popupI18n = {
    fr: {
        title: "🔬 Étude Navigation Web",
        subtitle: "Université Laval — LEILAH",
        badge: "ID : ",
        indicator: "Collecte de données en cours",
        completed: "Étude terminée — Merci pour votre participation !",
        btn_back: "📋 Retour au questionnaire",
        btn_start: "▶️ Démarrer l'étude ",
        btn_stop: "⏹️ Arrêter l'étude ",
        btn_uninstall: "🗑️ Désinstaller l'extension",
        note: "Les données sont envoyées automatiquement toutes les 3 minutes et à la fin de la session.",
        confirm_reset: "Des données existantes ont été trouvées. Voulez-vous les effacer et redémarrer l'étude ?",
        status_waiting: "⏳ En attente de votre consentement...",
        status_sending: "⏳ Envoi des données en cours...",
        status_sent: "✅ Données envoyées ! Merci.",
        status_failed: "⚠️ Envoi échoué",
        status_no_url: "URL du questionnaire introuvable.",
        alert_manual_uninstall: "Faites un clic droit sur l'icône de l'extension et cliquez sur 'Supprimer de Chrome'.",
        status_waiting_consent: "⚠️ Consentement requis. Veuillez ouvrir le lien reçu par courriel pour donner votre consentement, puis démarrer l'étude en cliquant sur le bouton ci-dessous.",
        badge_none: "ID : Aucun (En attente du consentement)",
        lien_homepage:"À propos de l'étude",
        lien_consent:"Formulaire de consentement",
        lien_privacy:"Politique de confidentialité",
        
        // Raisons d'arrêt
        reason_completed: "Étude terminée avec succès — Merci pour votre participation !",
        reason_stopped_by_user: "Vous avez choisi de mettre fin à l'étude manuellement.",
        reason_inactivity: "L'étude a pris fin en raison d'une inactivité prolongée (1 heure).",
        reason_max_time: "La session a expiré après avoir atteint la limite de temps autorisée (4 heures).",
        reason_withdrawn: "Vous avez retiré votre consentement post-expérimental.",
        reason_unknown: "L'étude a pris fin."
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
        alert_manual_uninstall: "Right-click on the extension icon and select 'Remove from Chrome'.",
        status_waiting_consent: "⚠️ Consent required. Please open the link received by email to give your consent and then start the study by clicking the button below.",
        badge_none: "ID: None (Waiting for consent)",
        lien_homepage:"About the study",
        lien_consent:"Consent form",
        lien_privacy:"Privacy policy",
        
        // Raisons d'arrêt
        reason_completed: "Study completed successfully — Thank you for your participation!",
        reason_stopped_by_user: "You have manually chosen to stop the study.",
        reason_inactivity: "The study was terminated due to prolonged inactivity (1 hour).",
        reason_max_time: "The session expired after reaching the maximum time limit (4 hours).",
        reason_withdrawn: "You chose to withdraw your post-experimental consent.",
        reason_unknown: "The study is completed."
    }
};

let activeLang = 'fr'; // Défaut

function applyTranslations(lang) {
    activeLang = lang;
    const txt = popupI18n[lang];

    const h2 = document.querySelector("h2");
    const sub = document.querySelector(".subtitle");
    const linkHomepage = document.querySelector('#linkHomepage a');
    const linkConsent = document.querySelector('#linkConsent a');
    const linkPrivacy = document.querySelector('#linkPrivacy a');
    if (h2)  h2.textContent  = txt.title;
    if (sub) sub.textContent = txt.subtitle;
    if (noteText) noteText.textContent = txt.note;
    if (uninstallBtn) uninstallBtn.textContent = txt.btn_uninstall;
    if (questionnaireBtn) questionnaireBtn.textContent = txt.btn_back;
    if (linkHomepage) linkHomepage.textContent = txt.lien_homepage;
    if (linkConsent) linkConsent.textContent = txt.lien_consent;
    if (linkPrivacy) linkPrivacy.textContent = txt.lien_privacy;

    // Traduction de l'indicateur d'enregistrement actif
    if (trackingIndicator && txt.indicator) {
        trackingIndicator.innerHTML = '<span class="dot"></span> ' + txt.indicator;
    }

    chrome.storage.local.get(["isTracking"], function(res) {
        if (toggleBtn) toggleBtn.textContent = res.isTracking ? txt.btn_stop : txt.btn_start;
    });
}

// =========================================================
// RESTAURER L'ÉTAT
// =========================================================
chrome.storage.local.get(
  ["isTracking", "participantId", "studyCompleted", "currentLanguage", "terminationReason"],
  function (result) {
    const lang = result.currentLanguage || 'fr';
    applyTranslations(lang);
    
    if (result.studyCompleted) {
      showCompletedState(result.terminationReason || 'unknown');
    } else {
      updateUI(result.isTracking || false, result.participantId || null);
    }
  }
);

// =========================================================
// RÉAGIR AUX CHANGEMENTS EN TEMPS RÉEL
// =========================================================
chrome.storage.onChanged.addListener(function (changes) {
  chrome.storage.local.get(
    ["isTracking", "participantId", "studyCompleted", "currentLanguage", "terminationReason"],
    function (result) {
      if (changes.currentLanguage) {
        applyTranslations(changes.currentLanguage.newValue);
      }
      if (result.studyCompleted) {
        showCompletedState(result.terminationReason || 'unknown');
      } else {
        updateUI(result.isTracking || false, result.participantId || null);
      }
    }
  );
});

// =========================================================
// BOUTON DÉMARRER / ARRÊTER
// =========================================================
toggleBtn.addEventListener("click", function () {
  chrome.storage.local.get(
    ["isTracking", "studyCompleted", "participantId"],
    function (result) {
      if (result.studyCompleted) return;

      var newState = !(result.isTracking || false);
      const txt = popupI18n[activeLang];
      if (newState === true) {
        if (!result.participantId) {
          alert(txt.status_waiting || "Veuillez d'abord remplir le formulaire de consentement sur la page web.");
          return;
        }

        // participantId et authToken (déjà stockés par import_session) restent intacts.
        chrome.storage.local.set({
          isTracking: true,
          studyCompleted: false
        }, function () {
          chrome.runtime.sendMessage({ action: "start_tracking" }, function () {
            updateUI(true, result.participantId);   // ✅ on passe bien le pId
          });
        });
      }

      else {
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
  chrome.tabs.query({ url: "*://api-lmv-ul-grh4cehth4f5b5gu.canadaeast-01.azurewebsites.net/questionnaire/*" }, function (tabs) {
    const txt = popupI18n[activeLang];
    if (tabs.length > 0) {
      var tab = tabs[0];
      chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId) {
        chrome.windows.update(tab.windowId, { focused: true });
      }
    } else {
      chrome.runtime.sendMessage({ action: "get_questionnaire_info" }, function (info) {
        if (info && info.url) {
          chrome.tabs.create({ url: info.url });
        } else {
          chrome.storage.local.get(["participantId"], function (result) {
            if (result.participantId) {
              var defaultUrl = "https://api-lmv-ul-grh4cehth4f5b5gu.canadaeast-01.azurewebsites.net/questionnaire/installation?pid=" + result.participantId;
              chrome.tabs.create({ url: defaultUrl });
            } else {
              showStatus(txt.status_no_url, "error");
            }
          });
        }
      });
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
function updateUI(isTracking, pId) {
  completedBox.style.display = "none";
  uninstallBtn.style.display = "none";
  participantBadge.style.display = "inline-block"; // Afficher le badge ID en temps normal
  const txt = popupI18n[activeLang];

  if (!pId) {
    participantBadge.textContent = txt.badge_none;
    toggleBtn.disabled = true;
    toggleBtn.style.backgroundColor = "#94a3b8";
    toggleBtn.textContent = txt.btn_start;
    trackingIndicator.style.display = "none";
    showStatus(txt.status_waiting_consent, "error");
    return;
  }

  participantBadge.textContent = txt.badge + pId;
  toggleBtn.disabled = false;

  if (isTracking) {
    toggleBtn.textContent = txt.btn_stop;
    toggleBtn.style.backgroundColor = "#ef4444";
    toggleBtn.style.display = "block";
    questionnaireBtn.style.display = "block";
    trackingIndicator.style.display = "block";
    noteText.style.display = "block";
    showStatus("", "");
  } else {
    toggleBtn.textContent = txt.btn_start;
    toggleBtn.style.backgroundColor = "#3b82f6";
    toggleBtn.style.display = "block";
    questionnaireBtn.style.display = "none";
    trackingIndicator.style.display = "none";
    noteText.style.display = "block";
    showStatus("", "");
  }
}

function showCompletedState(reason) {
  completedBox.style.display = "block";
  participantBadge.style.display = "none"; // Masquer le badge ID une fois l'étude terminée
  toggleBtn.style.display = "none";
  questionnaireBtn.style.display = "none";
  trackingIndicator.style.display = "none";
  uninstallBtn.style.display = "block";
  noteText.style.display = "none";
  showStatus("", "");

  // Mettre à jour dynamiquement la boîte de félicitations selon la cause de l'arrêt
  const txt = popupI18n[activeLang];
  const translationKey = "reason_" + reason;
  completedBox.querySelector(".msg").textContent = txt[translationKey] || txt["reason_unknown"];
}

function showStatus(text, type) {
  statusMsg.textContent = text;
  statusMsg.className = type || "";
}
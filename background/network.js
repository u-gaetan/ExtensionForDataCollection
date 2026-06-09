// =========================================================
// ENVOI VERS LE SERVEUR — INCRÉMENTAL
// =========================================================

// background/network.js
async function sendToServer(isFinal = false) {
  if (!participantId) await getOrCreateParticipantId();

  const unsyncedEvents = sessionData.filter((e) => !e._synced);

  if (unsyncedEvents.length === 0) {
    return { success: true, message: "Déjà à jour", count: 0 };
  }

  const cleanedData = [];
  const bestPageQuittee = {};

  for (const event of unsyncedEvents) {
    if (event.type === "page_quittee") {
      const vid = event.visitId;
      if (
        !bestPageQuittee[vid] ||
        event.temps_passe_ms > bestPageQuittee[vid].temps_passe_ms
      ) {
        bestPageQuittee[vid] = event;
      }
    } else {
      cleanedData.push(event);
    }
  }
  for (const vid in bestPageQuittee) {
    cleanedData.push(bestPageQuittee[vid]);
  }

  cleanedData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const dataToSend = cleanedData.map(({ _synced, ...event }) => ({
    ...event,
    participantId: participantId,
  }));

  // Préparation des en-têtes HTTP sécurisés
  const headers = {
    "Content-Type": "application/json"
  };

  // Ajout du Jeton dynamique s'il est disponible
  if (authToken) {
    headers["Authorization"] = "Bearer " + authToken;
  }

  try {
    const response = await fetch(SERVER_URL, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(dataToSend),
    });

    const responseBody = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(responseBody.erreur || `HTTP ${response.status}`);
    }

    for (const event of unsyncedEvents) {
      event._synced = true;
    }
    saveState();

    return {
      success: true,
      message: responseBody.message,
      count: dataToSend.length,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}


// =========================================================
// ENVOI AUTOMATIQUE PÉRIODIQUE
// =========================================================
let trackingStartTime = null;

function startAutoSend() {
  stopAutoSend();
  trackingStartTime = Date.now(); // On note l'heure de départ de l'extension

  autoSendInterval = setInterval(() => {
    if (isTracking) {
      // SÉCURITÉ : Arrêt automatique si l'extension tourne depuis plus de 4h
      if (Date.now() - trackingStartTime > 4 * 3600 * 1000) {
        isTracking = false;
        updateBadge(false);
        chrome.storage.local.set({ isTracking: false });
        saveStateNow();
        sendToServer(true); // On envoie ce qui reste et on s'éteint
        return;
      }

      // Comportement normal d'envoi périodique
      if (sessionData.length > 0) {
        sendToServer(false);
      }
    }
  }, AUTO_SEND_INTERVAL_MS);
}

function stopAutoSend() {
  if (autoSendInterval) {
    clearInterval(autoSendInterval);
    autoSendInterval = null;
  }
}

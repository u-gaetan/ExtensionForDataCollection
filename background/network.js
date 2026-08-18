// =========================================================
// security configuration: encryption algorithm and public key for the researcher
// =========================================================

const RESEARCHER_PUBLIC_KEY_B64 = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlvkU7mXiKeDLmG+gN8yypXdqIlqp51SdcNxMDwfcfzagPisG2DIkShqR8ShXD5pxJD8CDWOAdE3tFosgFCjrxJ0nU5LHxrgOpPINcoi7w3rs/4X0SZxvEOJEUdjplSxJyKLMSLekOeWgLA7uI6baNvkykVcajnbTcdH2eWN7r8gGtmPF2XEM4Q74BUW06oH3jm8odS2yWhBn/VL78qySTdauILLLp+xNm0WWSglFEooNyqNtX3ibHpc1k9CzJvBNpTJ/541Dv2dl4OMbKjpRRQ77ScQ2gR6vh5JhF3R9L8Zk5zqvDUqR0W93dxA1pgPjRLd2R5OIAqKmkZXaw1v/SQIDAQAB"; 

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function importPublicKey(pemB64) {
  const binaryDerString = atob(pemB64.trim());
  const len = binaryDerString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryDerString.charCodeAt(i);
  }
  return crypto.subtle.importKey(
    "spki",
    bytes.buffer,
    {
      name: "RSA-OAEP",
      hash: "SHA-256"
    },
    true,
    ["encrypt"]
  );
}

async function encryptFieldHybrid(plaintext, cryptoPublicKey) {
  if (!plaintext) return "";
  try {
    const aesKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt"]
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      aesKey,
      encoder.encode(plaintext)
    );

    const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
    const encryptedAesKeyBuffer = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      cryptoPublicKey,
      rawAesKey
    );

    const encKeyB64 = arrayBufferToBase64(encryptedAesKeyBuffer);
    const ivB64 = arrayBufferToBase64(iv);
    const ciphertextB64 = arrayBufferToBase64(ciphertextBuffer);

    return `ENC:${encKeyB64}:${ivB64}:${ciphertextB64}`;
  } catch (err) {
    console.error("Erreur chiffrement :", err);
    return "[ERREUR_CHIFFREMENT]";
  }
}

// =========================================================
// sending data to the server with encryption
// =========================================================

async function sendToServer(isFinal = false) {
  // Réhydrate l'état au cas où le service worker a redémarré (MV3)
  const stored = await chrome.storage.local.get(["participantId", "authToken"]);
  if (stored.participantId) participantId = stored.participantId;
  if (stored.authToken)     authToken     = stored.authToken;

  if (!participantId) await getOrCreateParticipantId();
  //garde fou
  if (!authToken) {
    console.warn("[collecte] authToken absent après réhydratation — envoi reporté");
    return { success: false, error: "no_token" };
  }
  const unsyncedEvents = sessionData.filter((e) => !e._synced);

  if (unsyncedEvents.length === 0) {
    // Si l'envoi est final et qu'il n'y a plus rien à synchroniser, on peut vider le cache local
    if (isFinal) {
      sessionData = [];
      chrome.storage.local.set({ sw_sessionData: [] }, function() {
        saveStateNow();
      });
    }
    return { success: true, message: "Déjà à jour", count: 0 };
  }

  let publicKey;
  try {
    publicKey = await importPublicKey(RESEARCHER_PUBLIC_KEY_B64);
  } catch (e) {
    console.error("Impossible d'importer la clé publique de recherche :", e);
    return { success: false, error: "Clé de chiffrement invalide" };
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

  const dataToSend = [];
  for (const item of cleanedData) {
    const { _synced, ...event } = item;
    const eventCopy = { ...event, participantId: participantId };

    if (eventCopy.url) {
      eventCopy.url = await encryptFieldHybrid(eventCopy.url, publicKey);
    }
    if (eventCopy.parentUrl) {
      eventCopy.parentUrl = await encryptFieldHybrid(eventCopy.parentUrl, publicKey);
    }
    if (eventCopy.texte) {
      eventCopy.texte = await encryptFieldHybrid(eventCopy.texte, publicKey);
    }

    dataToSend.push(eventCopy);
  }

  const headers = {
    "Content-Type": "application/json"
  };

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

    // Marquage comme synchronisé localement uniquement après confirmation de réception par l'API
    for (const event of unsyncedEvents) {
      event._synced = true;
    }

    // SI ENVOI FINAL RÉUSSI : vider complètement le cache de navigation sensible
    if (isFinal) {
      sessionData = [];
      chrome.storage.local.set({ sw_sessionData: [] });
    }

    saveStateNow();

    return {
      success: true,
      message: responseBody.message,
      count: dataToSend.length,
    };
  } catch (error) {
    console.error("Erreur d'envoi vers le serveur :", error);
    return { success: false, error: error.message };
  }
}

// =========================================================
// automatic sending of data to the server every 3 minutes
// =========================================================
const ALARM_AUTOSEND = "study_autosend";

function startAutoSend() {
  stopAutoSend();
  // Alarme récurrente toutes les 3 minutes (requis pour la fiabilité de veille en Manifest V3)
  chrome.alarms.create(ALARM_AUTOSEND, { periodInMinutes: 3 });
}

function stopAutoSend() {
  chrome.alarms.clear(ALARM_AUTOSEND);
}
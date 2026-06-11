// =========================================================
// CONFIGURATION DE LA SÉCURITÉ ET CRYPTOGRAPHIE (Web Crypto API)
// =========================================================

// REMPLACEZ CETTE CHAÎNE par votre clé publique RSA au format SPKI encodée en Base64.
// Vous pouvez générer cette clé avec OpenSSL ou un outil de clé publique.
const RESEARCHER_PUBLIC_KEY_B64 = "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAlvkU7mXiKeDLmG+gN8yypXdqIlqp51SdcNxMDwfcfzagPisG2DIkShqR8ShXD5pxJD8CDWOAdE3tFosgFCjrxJ0nU5LHxrgOpPINcoi7w3rs/4X0SZxvEOJEUdjplSxJyKLMSLekOeWgLA7uI6baNvkykVcajnbTcdH2eWN7r8gGtmPF2XEM4Q74BUW06oH3jm8odS2yWhBn/VL78qySTdauILLLp+xNm0WWSglFEooNyqNtX3ibHpc1k9CzJvBNpTJ/541Dv2dl4OMbKjpRRQ77ScQ2gR6vh5JhF3R9L8Zk5zqvDUqR0W93dxA1pgPjRLd2R5OIAqKmkZXaw1v/SQIDAQAB"; 

/**
 * Convertit un ArrayBuffer en chaîne Base64
 */
function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Importe la clé publique RSA (format SPKI Base64) pour Web Crypto
 */
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

/**
 * Chiffre une chaîne de caractères de taille quelconque à l'aide d'un processus hybride :
 * 1. Clé AES temporaire générée à la volée pour chiffrer la donnée.
 * 2. Clé AES chiffrée avec la clé publique RSA.
 */
async function encryptFieldHybrid(plaintext, cryptoPublicKey) {
  if (!plaintext) return "";
  try {
    // 1. Génération d'une clé éphémère AES-GCM
    const aesKey = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt"]
    );

    // 2. Chiffrement de la donnée avec AES-GCM
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encoder = new TextEncoder();
    const ciphertextBuffer = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      aesKey,
      encoder.encode(plaintext)
    );

    // 3. Export de la clé AES brute pour la chiffrer avec RSA
    const rawAesKey = await crypto.subtle.exportKey("raw", aesKey);
    const encryptedAesKeyBuffer = await crypto.subtle.encrypt(
      { name: "RSA-OAEP" },
      cryptoPublicKey,
      rawAesKey
    );

    // 4. Encodage Base64 des morceaux
    const encKeyB64 = arrayBufferToBase64(encryptedAesKeyBuffer);
    const ivB64 = arrayBufferToBase64(iv);
    const ciphertextB64 = arrayBufferToBase64(ciphertextBuffer);

    // Retourne le conteneur complet prêt à être stocké en texte simple dans MongoDB/Cosmos DB
    return `ENC:${encKeyB64}:${ivB64}:${ciphertextB64}`;
  } catch (err) {
    console.error("Erreur chiffrement :", err);
    return "[ERREUR_CHIFFREMENT]";
  }
}

// =========================================================
// ENVOI VERS LE SERVEUR — AVEC ENCRYPTAGE
// =========================================================

async function sendToServer(isFinal = false) {
  if (!participantId) await getOrCreateParticipantId();

  const unsyncedEvents = sessionData.filter((e) => !e._synced);

  if (unsyncedEvents.length === 0) {
    return { success: true, message: "Déjà à jour", count: 0 };
  }

  // Importation de la clé publique pour cette session d'envoi
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

  // Préparation et chiffrement des données avant l'envoi
  const dataToSend = [];
  for (const item of cleanedData) {
    const { _synced, ...event } = item;
    
    // On copie l'objet pour ne pas perturber le stockage local
    const eventCopy = { ...event, participantId: participantId };

    // Application du chiffrement hybride sur les champs sensibles si existants
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

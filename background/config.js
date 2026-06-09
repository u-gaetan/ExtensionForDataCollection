// =========================================================
// CONFIGURATION
// =========================================================
const SERVER_URL = "https://api-lmv-ul-grh4cehth4f5b5gu.canadaeast-01.azurewebsites.net/api/collecte";
const QUESTIONNAIRE_BASE_URL = "https://api-lmv-ul-grh4cehth4f5b5gu.canadaeast-01.azurewebsites.net/questionnaire/";
const AUTO_SEND_INTERVAL_MS = 3 * 60 * 1000;

// TODO : À remplacer par un token dynamique avant la publication
// sur le Chrome Web Store (voir explication token/JWT)
const API_KEY = "de23c11b1d7c33af3dc6f249a18cdc29b529443af8f69148084992caa50c8515";

// Sites bloqués pendant l'étude (IA générative)
const BLOCKED_DOMAINS = [
  // ── OpenAI ──
  "chat.openai.com",
  "chatgpt.com",

  // ── Google ──
  "gemini.google.com",
  "bard.google.com",
  "aistudio.google.com",
  "notebooklm.google.com",

  // ── Anthropic ──
  "claude.ai",

  // ── Microsoft ──
  "copilot.microsoft.com",

  // ── Perplexity ──
  "perplexity.ai",

  // ── Meta ──
  "meta.ai",

  // ── xAI (Elon Musk) ──
  "grok.x.ai",

  // ── Mistral ──
  "chat.mistral.ai",

  // ── DeepSeek ──
  "chat.deepseek.com",
  "deepseek.com",

  // ── Autres chatbots IA ──
  "poe.com",
  "pi.ai",
  "phind.com",
  "you.com",
  "huggingface.co/chat",
  "coral.cohere.com",
  "groq.com",

  // ── Assistants d'écriture IA ──
  "jasper.ai",
  "writesonic.com",
  "copy.ai",
  "rytr.me",
  "quillbot.com",

  // ── Moteurs de recherche IA ──
  "andi.search",
  "komo.ai",
  "exa.ai"
];
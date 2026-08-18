// =========================================================
// CONFIGURATION
// =========================================================
const SERVER_URL = "https://api-lmv-ul-grh4cehth4f5b5gu.canadaeast-01.azurewebsites.net/api/collecte";
const QUESTIONNAIRE_BASE_URL = "https://api-lmv-ul-grh4cehth4f5b5gu.canadaeast-01.azurewebsites.net/questionnaire/";
const AUTO_SEND_INTERVAL_MS = 3 * 60 * 1000;

// blocked domains for the extension during the questionnaire completion
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

  // ──other AI chatbots ──
  "poe.com",
  "pi.ai",
  "phind.com",
  "you.com",
  "huggingface.co/chat",
  "coral.cohere.com",
  "groq.com",

  // ── AI writing assistants ──
  "jasper.ai",
  "writesonic.com",
  "copy.ai",
  "rytr.me",
  "quillbot.com",

  // ── AI search engines ──
  "andi.search",
  "komo.ai",
  "exa.ai"
];
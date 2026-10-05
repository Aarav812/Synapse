// ============================================
// Synapse AI — Express Backend Server
// ============================================
const path = require("path");
const util = require("util");
require("dotenv").config({ path: path.join(__dirname, ".env") });
const express = require("express");
const cors = require("cors");
const OpenAI = require("openai");
const admin = require("firebase-admin");

const app = express();
app.set('trust proxy', 1);
// Render provides the port through its PORT environment variable. Keep 3000
// as a convenient local-development fallback.
const PORT = Number(process.env.PORT) || 3000;

// ── Firebase Admin SDK Init ──
// Prefer explicit service-account credentials so verifyIdToken() works.
// Fall back to application default credentials, then to projectId-only
// (which allows the app to boot but will fail token verification until
// real credentials are supplied).
function initFirebaseAdmin() {
  const projectId = process.env.FIREBASE_PROJECT_ID || "synapse-ai-fallback-id";
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (privateKey) {
    // Handle escaped newlines from environment variables
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  try {
    if (saJson) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(saJson)),
        projectId,
      });
      console.log("[firebase] Initialized with FIREBASE_SERVICE_ACCOUNT.");
      return;
    }

    if (clientEmail && privateKey) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId: projectId,
          clientEmail: clientEmail,
          privateKey: privateKey,
        }),
        projectId,
      });
      console.log("[firebase] Initialized with FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY.");
      return;
    }

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      admin.initializeApp({ projectId });
      console.log("[firebase] Using application default credentials.");
      return;
    }
    // Boot-only fallback: no credentials. verifyIdToken will reject until
    // FIREBASE_SERVICE_ACCOUNT (or GOOGLE_APPLICATION_CREDENTIALS) is set.
    admin.initializeApp({ projectId });
    console.warn(
      "[firebase] WARNING: No credentials supplied. Set FIREBASE_SERVICE_ACCOUNT " +
      "or GOOGLE_APPLICATION_CREDENTIALS in .env for auth to work."
    );
  } catch (err) {
    console.error("[firebase] Failed to initialize Firebase Admin:", err.message);
    // Still initialize with projectId so the server can start and report the error.
    admin.initializeApp({ projectId });
  }
}
initFirebaseAdmin();

// ── DuckDuckGo Web Search Helper ──
let duckDuckScrape;
try {
  duckDuckScrape = require("duck-duck-scrape");
} catch (_) {
  // Package not installed — web search will be gracefully disabled.
  console.warn("[search] duck-duck-scrape not found. Web search disabled. Run: npm install duck-duck-scrape");
}

/**
 * Searches DuckDuckGo and returns up to 4 results with title, snippet & url.
 * Uses duck-duck-scrape with automatic fallback to DuckDuckGo HTML scraping.
 *
 * Debug logging prefix: [DDG Debug]
 *
 * @param {string} query
 * @returns {Promise<Array<{title:string, snippet:string, url:string}>>}
 */
async function searchDuckDuckGo(query) {
  if (!query || typeof query !== "string") return [];
  const cleanQuery = query.trim();
  if (!cleanQuery) return [];

  console.log("[DDG Debug] Query:", cleanQuery);

  // 1. Try duck-duck-scrape first
  if (duckDuckScrape) {
    try {
      console.log("[DDG Debug] Attempting duck-duck-scrape...");
      const results = await duckDuckScrape.search(cleanQuery, {
        safeSearch: duckDuckScrape.SafeSearchType.MODERATE,
      });
      console.log("[DDG Debug] duck-duck-scrape raw result count:", results?.results?.length ?? 0);
      const hits = (results.results || []).slice(0, 4);
      if (hits.length > 0) {
        console.log("[DDG Debug] Returning", hits.length, "result(s) from duck-duck-scrape.");
        return hits.map((r) => ({
          title: r.title || "",
          snippet: r.description || r.snippet || "",
          url: r.url || "",
        }));
      }
      console.log("[DDG Debug] duck-duck-scrape returned 0 results — falling back to HTML endpoint.");
    } catch (scrapeErr) {
      console.error("[DDG Debug] Search Error:", scrapeErr);
      console.warn("[search] duck-duck-scrape primary search failed, falling back to direct DDG:", scrapeErr.message);
    }
  }

  // 2. Resilient fallback — DuckDuckGo HTML GET endpoint with browser-realistic headers
  try {
    const encodedQuery = encodeURIComponent(cleanQuery);
    const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

    console.log("[DDG Debug] Fetching HTML endpoint:", ddgUrl);

    const response = await fetch(ddgUrl, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept":
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Referer": "https://duckduckgo.com/",
        "DNT": "1",
        "Connection": "keep-alive",
      },
    });

    console.log("[DDG Debug] Raw Response:", {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
    });

    if (!response.ok) {
      throw new Error(`DDG HTML endpoint returned HTTP ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    console.log("[DDG Debug] HTML body length:", html.length, "chars");

    const results = [];

    // Pattern A — modern DDG class: result__body or web-result
    // Try multiple split strategies in priority order so we handle DDG markup changes gracefully.

    // Strategy 1: split on `<div class="result ` (catches multiple DDG result div variants)
    const blockSplits = [
      { sep: '<div class="result results_links results_links_deep web-result ' },
      { sep: '<div class="result ' },
      { sep: 'result__body' },
    ];

    let blocks = [];
    for (const { sep } of blockSplits) {
      const parts = html.split(sep);
      if (parts.length > 1) {
        blocks = parts;
        console.log("[DDG Debug] HTML split strategy matched:", JSON.stringify(sep), "→", parts.length - 1, "candidate block(s)");
        break;
      }
    }

    if (blocks.length > 1) {
      for (let i = 1; i < blocks.length && results.length < 4; i++) {
        const block = blocks[i];

        // Extract URL + title from result__a anchor
        const titleMatch = block.match(
          /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/
        );
        // Extract snippet
        const snippetMatch = block.match(
          /<(?:a|span)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|span)>/
        );

        if (titleMatch) {
          let rawUrl = titleMatch[1];
          let actualUrl = rawUrl;

          // DDG sometimes wraps URLs in redirects — extract the real URL
          const uddgMatch = rawUrl.match(/[?&]uddg=([^&]+)/);
          if (uddgMatch) {
            try { actualUrl = decodeURIComponent(uddgMatch[1]); } catch (_) {}
          } else if (rawUrl.startsWith("//")) {
            actualUrl = "https:" + rawUrl;
          }

          const cleanTitle = titleMatch[2]
            .replace(/<[^>]+>/g, "")
            .replace(/&amp;/g, "&")
            .replace(/&quot;/g, '"')
            .replace(/&#39;/g, "'")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .trim();

          const cleanSnippet = snippetMatch
            ? snippetMatch[1]
                .replace(/<[^>]+>/g, "")
                .replace(/&amp;/g, "&")
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .trim()
            : "";

          if (actualUrl && cleanTitle) {
            results.push({ title: cleanTitle, snippet: cleanSnippet, url: actualUrl });
          }
        }
      }
    }

    // Strategy 2 (last resort): scan for any result__a href + result__snippet pairs
    if (results.length === 0) {
      console.log("[DDG Debug] Block-split yielded 0 results — trying global regex scan.");
      const anchorRe = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
      const snippetRe = /<(?:a|span)[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/(?:a|span)>/g;

      const snippets = [];
      let sm;
      while ((sm = snippetRe.exec(html)) !== null) {
        snippets.push(
          sm[1].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim()
        );
      }

      let am;
      let idx = 0;
      while ((am = anchorRe.exec(html)) !== null && results.length < 4) {
        let rawUrl = am[1];
        let actualUrl = rawUrl;
        const uddgMatch = rawUrl.match(/[?&]uddg=([^&]+)/);
        if (uddgMatch) {
          try { actualUrl = decodeURIComponent(uddgMatch[1]); } catch (_) {}
        } else if (rawUrl.startsWith("//")) {
          actualUrl = "https:" + rawUrl;
        }
        const cleanTitle = am[2].replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
        if (actualUrl && cleanTitle) {
          results.push({ title: cleanTitle, snippet: snippets[idx] || "", url: actualUrl });
          idx++;
        }
      }
    }

    console.log("[DDG Debug] Final parsed result count:", results.length);
    return results;
  } catch (err) {
    console.error("[DDG Debug] Search Error:", err);
    console.error("[search] DuckDuckGo HTML fallback failed:", err.message);
    return [];
  }
}

// Tool schema provided to the LLM so it can decide when to search.
const WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "searchDuckDuckGo",
    description:
      "Search the web via DuckDuckGo for real-time or up-to-date information. " +
      "Use this for: current events, live data (prices, sports scores, weather), " +
      "recent releases, or anything that might have changed after your training cutoff. " +
      "Do NOT use for math, coding questions, general knowledge, or simple conversation.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "A concise search query, e.g. 'latest iPhone 16 price India 2024'",
        },
      },
      required: ["query"],
    },
  },
};

// ── Helper: find the longest suffix of `str` that is a prefix of any tag ──
// Used by the <think> tag streaming parser to avoid emitting partial tags.
function partialTagHoldback(str, tags) {
  let hold = 0;
  for (const tag of tags) {
    for (let len = Math.min(tag.length - 1, str.length); len >= 1; len--) {
      if (str.endsWith(tag.slice(0, len))) {
        hold = Math.max(hold, len);
        break;
      }
    }
  }
  return hold;
}

// ── API Clients are now initialized dynamically per request ──

// ── Middleware ──
// Restrict CORS to a known frontend origin when configured; default to open
// only if FRONTEND_ORIGIN is unset (development convenience).
const corsOptions = process.env.FRONTEND_ORIGIN
  ? { origin: process.env.FRONTEND_ORIGIN.split(",").map((o) => o.trim()) }
  : {};
app.use(cors(corsOptions));

// Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  next();
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(express.static(path.join(__dirname, "../frontend"), { extensions: ["html"] }));

// ── Simple Rate Limiter (in-memory) ──
// NOTE: For production, consider using Redis to maintain state across restarts and instances.
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 20; // 20 requests per minute per user

function rateLimit(req, res, next) {
  const userId = req.user?.uid || req.ip;
  const now = Date.now();
  
  if (!rateLimitMap.has(userId)) {
    // Prevent memory exhaustion DoS by bounding the map size
    if (rateLimitMap.size >= 10000) {
      rateLimitMap.delete(rateLimitMap.keys().next().value);
    }
    rateLimitMap.set(userId, []);
  }
  
  const timestamps = rateLimitMap.get(userId).filter(t => now - t < RATE_LIMIT_WINDOW);
  
  if (timestamps.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: "Too many requests. Please slow down." });
  }
  
  timestamps.push(now);
  rateLimitMap.set(userId, timestamps);
  next();
}

// Clean up rate limit map every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, timestamps] of rateLimitMap.entries()) {
    const valid = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW);
    if (valid.length === 0) {
      rateLimitMap.delete(key);
    } else {
      rateLimitMap.set(key, valid);
    }
  }
}, 5 * 60 * 1000);

// ── Auth Middleware ──
// DISABLE_AUTH (set in .env) bypasses Firebase token verification for LOCAL
// TESTING ONLY. Never enable this in production — it lets anyone call /api/chat.
async function verifyFirebaseToken(req, res, next) {
  if (process.env.DISABLE_AUTH === "true") {
    if (process.env.NODE_ENV === "production") {
      console.error("[SECURITY] DISABLE_AUTH is set to true in production! Blocking request.");
      return res.status(500).json({ error: "Security configuration error." });
    }
    req.user = { uid: "local-test-user", email: "local@test" };
    return next();
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized — no token provided" });
  }
  const idToken = authHeader.split("Bearer ")[1];
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return res.status(401).json({ error: "Unauthorized — invalid token" });
  }
}

// ── Aura System Prompt ──
const AURA_SYSTEM_PROMPT = `You are Aura, a brilliant, warm, and insightful AI assistant created by Synapse AI. 
You provide helpful, accurate, and conversational responses. 
You are friendly yet professional, concise yet thorough. 
You use markdown formatting when helpful (bold, lists, code blocks, etc.).
When writing code for web apps, you MUST output all HTML, CSS, and JavaScript together in a SINGLE \`\`\`html code block. Use <style> and <script> tags inside the HTML. Do NOT create separate css or javascript blocks.
You never reveal your underlying model or API — you are simply "Aura".
When asked who you are, you say: "I'm Aura, your AI assistant by Synapse AI."`;

const AURA_BHAI_SYSTEM_PROMPT = `Be a friendly, expressive conversational AI with the vibe of a close desi friend. Speak naturally in Hinglish (Hindi + English), using a warm, funny, emotionally aware, and occasionally sarcastic tone. Keep conversations casual, engaging, and natural rather than formal. Ask thoughtful follow-up questions, show genuine curiosity, share balanced opinions, and don't agree automatically. Respectfully disagree when it adds value to the conversation. Use light, playful teasing when the user's tone is playful, but never be insulting or joke about sensitive topics. Match the user's energy and emotional state. If they're sad, upset, or serious, respond with empathy, support, and understanding instead of humor. Use natural expressions like "arey yaar", "haan bhai", "achha sun", or "dekh na" only when they fit naturally. Use relevant emojis sparingly to enhance the conversation. Reference previous messages only when they are actually available, and never invent memories or facts. Keep responses varied, honest, engaging, and conversational while remaining respectful, accurate, and emotionally intelligent.`;

// ── Model Configuration ──

// ── Chat Endpoint (SSE Streaming) ──
app.post("/api/chat", verifyFirebaseToken, rateLimit, async (req, res) => {
  const { messages, model, persona } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: "Messages array is required" });
  }

  // Check if any message in the conversation contains an image, audio, or video
  let hasImage = false;
  let hasAudioVideo = false;
  for (const msg of messages) {
    if (Array.isArray(msg.content)) {
      if (msg.content.some(block => block.type === "image_url")) {
        hasImage = true;
      }
      if (msg.content.some(block => ["audio_url", "video_url", "input_audio"].includes(block.type))) {
        hasAudioVideo = true;
      }
    }
  }

  let targetModel = model || "minimax/minimax-m2.7";

  // Check if user is requesting to generate an image
  const lastMsg = messages.slice().reverse().find(m => m.role === "user");
  let lastUserText = "";
  if (lastMsg) {
    if (typeof lastMsg.content === "string") lastUserText = lastMsg.content;
    else if (Array.isArray(lastMsg.content)) lastUserText = lastMsg.content.find(c => c.type === "text")?.text || "";
  }

  const isImageRequest = targetModel === "nvidia/qwen-image" ||
    /^(generate image|generate an image|create image|create an image|make an image|make a picture|generate a picture|draw (?:a |an |me a |me an )?(?:picture|image|photo|illustration|art|painting|portrait|logo|icon|wallpaper))/i.test(lastUserText.trim());

  // 1. Determine final targetModel based on the selected Aura model + media types.
  // All routes below use the single NVIDIA API key / endpoint.
  if (hasImage) {
    // Vision / image analysis
    targetModel = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
    console.log(`[VISION] Image detected — routing to ${targetModel}`);
  } else if (hasAudioVideo) {
    // Audio / video analysis
    targetModel = "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning";
    console.log(`[AUDIO/VIDEO] Audio/Video detected — routing to ${targetModel}`);
  } else if (isImageRequest) {
    targetModel = "nvidia/qwen-image";
    console.log(`[IMAGE GEN] Routing to ${targetModel}`);
  } else if (targetModel === "minimax/minimax-m2.7") {
    // Aura Allrounder — Deep Think mode
    targetModel = "meta/muse-glimmer-30b";
    console.log(`[ALLROUNDER-DEEP] Routing to ${targetModel}`);
  } else if (targetModel === "openai/gpt-oss-120b") {
    // Aura Summary
    targetModel = "nvidia/nemotron-3-super-120b-a12b";
    console.log(`[SUMMARY] Routing to ${targetModel}`);
  } else if (targetModel === "laguna-xs-2.1") {
    // Aura Allrounder (Fast)
    targetModel = "nvidia/nemotron-3-super-120b-a12b";
    console.log(`[ALLROUNDER-FAST] Routing to ${targetModel}`);
  } else if (targetModel === "nvidia/nemotron-3.5-lightning-30b-a3b") {
    // Aura Bhai
    console.log(`[BHAI] Routing to ${targetModel}`);
  } else {
    // Unknown model name — fall back to Allrounder Deep Think
    targetModel = "meta/muse-glimmer-30b";
    console.log(`[FALLBACK] Unknown model, routing to ${targetModel}`);
  }

  // ── Easter Egg: Chatbot Override ──
  const lcText = lastUserText.trim().toLowerCase();
  if (lcText === "who made you?" || lcText === "who created you?" || lcText === "who made you" || lcText === "who created you" || lcText === "/creator") {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    
    const secretMessage = "I am Aura, and I was proudly created by the brilliant Aarav!";
    res.write(`data: ${JSON.stringify({ content: secretMessage })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();
    return;
  }

  // 2. All requests go to the NVIDIA endpoint using a single API key.
  const baseURL = process.env.NVIDIA_BASE_URL || process.env.AI_BASE_URL || "https://integrate.api.nvidia.com/v1";
  const activeApiKey = process.env.NVIDIA_API_KEY || process.env.DEFAULT_API_KEY;

  if (!activeApiKey) {
    console.error(`[ERROR] Missing NVIDIA API Key (set NVIDIA_API_KEY or DEFAULT_API_KEY) for model: ${targetModel}`);
    // Server-side misconfiguration, not a client request error → 500.
    return res.status(500).json({ error: "Missing API Key for the selected model. Please configure your .env file." });
  }

  const activeAiClient = new OpenAI({
    apiKey: activeApiKey,
    baseURL: baseURL,
  });

  // Set SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  // Abort the upstream NVIDIA request if the browser disconnects mid-stream, so
  // the server stops consuming (and paying for) tokens no one will receive.
  // `close` also fires after a normal res.end(), so the writableEnded guard
  // keeps a completed response from being treated as a client abort.
  const upstreamAbort = new AbortController();
  let clientGone = false;
  res.on("close", () => {
    if (!res.writableEnded) {
      clientGone = true;
      upstreamAbort.abort();
    }
  });
  // Guard against writing to a dead connection (client disconnect / broken pipe)
  res.on("error", () => {
    try { res.end(); } catch (_) { /* already closed */ }
  });

  try {
    console.log(`[DEBUG] Routing request to: ${targetModel}`);

    if (targetModel === "nvidia/qwen-image") {
      // Find the last user message to use as the prompt
      const imgLastMsg = messages.slice().reverse().find(m => m.role === "user");
      let promptText = "A beautiful AI generated image";
      if (imgLastMsg) {
        if (typeof imgLastMsg.content === "string") promptText = imgLastMsg.content;
        else if (Array.isArray(imgLastMsg.content)) promptText = imgLastMsg.content.find(c => c.type === "text")?.text || promptText;
      }

      console.log(`[IMAGE] Generating image for prompt: "${promptText}"`);
      
      const nvImgResponse = await fetch("https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${activeApiKey}`,
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({
          prompt: promptText,
          seed: 0,
          steps: 4,
          cfg_scale: 0,
          samples: 1,
          height: 1024,
          width: 1024
        })
      });

      if (!nvImgResponse.ok) {
        throw new Error(`Image API error: ${nvImgResponse.status} ${nvImgResponse.statusText}`);
      }

      const imgData = await nvImgResponse.json();
      if (!imgData.artifacts || !imgData.artifacts[0] || !imgData.artifacts[0].base64) {
        throw new Error("Invalid response from Image API: missing artifacts");
      }

      // Convert base64 to a data URL
      const imageUrl = `data:image/jpeg;base64,${imgData.artifacts[0].base64}`;
      
      // Simulate streaming for the frontend UI by sending it as a single chunk
      res.write(`data: ${JSON.stringify({ content: `![Generated Image](${imageUrl})` })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      return;
    }

    let systemPromptText = persona || AURA_SYSTEM_PROMPT;

    // Aura Bhai uses its own casual, Hinglish "friend" personality prompt.
    if (model === "nvidia/nemotron-3.5-lightning-30b-a3b") {
      systemPromptText = AURA_BHAI_SYSTEM_PROMPT;
    }
    
    if (hasImage) {
      systemPromptText += "\n\n[VISION MODE ACTIVE] You can see images. Analyze them carefully. If you see math or code, explain/solve it. Always maintain your persona while describing what you see.";
    } else if (hasAudioVideo) {
      systemPromptText += "\n\n[MULTIMODAL MODE ACTIVE] You can hear audio and see video. Analyze the media carefully and answer based on its content while maintaining your persona.";
    }

    // Only inject <think> prompt for models that use inline think-tags (not native reasoning_content)
    // NOTE: minimax/minimax-m2.7 uses native reasoning_content — no prompt injection needed.


    let apiMessages = messages;
    
    // Mistral Small 3.1 uses standard OpenAI image_url format — no transformation needed.
    // Messages are already in the correct { type: "image_url", image_url: { url: "data:..." } } format.
    // Log what we're sending for debugging:
    if (hasImage) {
      const lastMsg = apiMessages[apiMessages.length - 1];
      if (Array.isArray(lastMsg?.content)) {
        const imgBlock = lastMsg.content.find(b => b.type === "image_url");
        const urlLen = imgBlock?.image_url?.url?.length || 0;
        console.log(`[VISION] Sending to API — url length: ${urlLen} chars, model: ${targetModel}`);
      }
    }

    // Map pseudo-models back to real models
    let finalApiModel = targetModel;

    // ── Base params (shared by tool-use probe + final streaming call) ──
    const baseMessages = [
      { role: "system", content: systemPromptText },
      ...apiMessages,
    ];

    // Context-limit safety: keep system prompt + last 21 turns.
    const trimmedMessages = baseMessages.length > 22
      ? [baseMessages[0], ...baseMessages.slice(-21)]
      : baseMessages;

    const baseParams = {
      model: finalApiModel,
      temperature: 0.7,
      top_p: 0.7,
      max_tokens: 4096,
    };

    // Larger output budget for the big NVIDIA text models.
    if (targetModel === "nvidia/nemotron-3-super-120b-a12b") {
      baseParams.max_tokens = 8192;
    }

    // Specialized Parameters for Nemotron Omni (Vision / Audio / Video "analyze")
    if (targetModel === "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning") {
      baseParams.reasoning_budget = 0;
      baseParams.chat_template_kwargs = { "enable_thinking": false, "clear_thinking": true };
      baseParams.max_tokens = 4096;
    }

    // Specialized Parameters for Aura Bhai
    if (model === "nvidia/nemotron-3.5-lightning-30b-a3b") {
      baseParams.top_p = 0.9;
    }

    // ── Step 1: Tool-use probe (non-streaming) ──
    // Only offer the search tool for plain text, non-image, non-audio/video requests
    let searchSources = []; // sources to emit at the end
    let conversationMessages = [...trimmedMessages];

    const canSearch = !hasImage && !hasAudioVideo && targetModel !== "nvidia/qwen-image";

    if (canSearch) {
      try {
        const probeResponse = await activeAiClient.chat.completions.create({
          ...baseParams,
          messages: conversationMessages,
          stream: false,
          tools: [WEB_SEARCH_TOOL],
          tool_choice: "auto",
          max_tokens: 256, // probe only needs the tool call, not a full answer
        }, { signal: upstreamAbort.signal });

        const probeChoice = probeResponse.choices?.[0];
        const toolCalls = probeChoice?.message?.tool_calls;

        if (toolCalls && toolCalls.length > 0) {
          const call = toolCalls[0];
          let searchQuery = "";
          try {
            searchQuery = JSON.parse(call.function.arguments).query || "";
          } catch (_) { /* malformed args — skip */ }

          if (searchQuery) {
            console.log(`[search] LLM requested web search: "${searchQuery}"`);

            // Inform the frontend a search is in progress
            res.write(`data: ${JSON.stringify({ searching: true, query: searchQuery })}\n\n`);

            const results = await searchDuckDuckGo(searchQuery);
            searchSources = results;

            // Feed the search results back as a tool message
            const toolResultContent = results.length > 0
              ? results.map((r, i) =>
                  `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`
                ).join("\n\n")
              : "No recent results found for this query on DuckDuckGo.";

            const callId = call.id || "call_search_1";
            conversationMessages = [
              ...conversationMessages,
              {
                role: "assistant",
                content: null,
                tool_calls: [
                  {
                    id: callId,
                    type: "function",
                    function: call.function,
                  },
                ],
              },
              {
                role: "tool",
                tool_call_id: callId,
                content: toolResultContent,
              },
            ];

            console.log(`[search] Injected ${results.length} result(s) into context.`);
          }
        }
      } catch (probeErr) {
        // If the tool-use probe fails (e.g. model doesn't support tools), fall
        // through silently and answer without search.
        if (probeErr.name !== "AbortError") {
          console.warn("[search] Tool-use probe failed, continuing without search:", probeErr.message);
        } else {
          throw probeErr; // re-throw genuine aborts
        }
      }
    }

    // ── Step 2: Final streaming response ──
    const stream = await activeAiClient.chat.completions.create({
      ...baseParams,
      messages: conversationMessages,
      stream: true,
    }, { signal: upstreamAbort.signal });

    const hideReasoning = false;

    // Buffer to handle <think>...</think> blocks that may span multiple chunks
    let thinkBuffer = "";
    let insideThink = false;

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta || {};
      let content = delta.content || "";
      const reasoning = delta.reasoning_content;

      // Always emit reasoning_content tokens directly
      if (reasoning && !hideReasoning) {
        res.write(`data: ${JSON.stringify({ reasoning })}\n\n`);
      }

      if (content) {
        // Handle <think>...</think> blocks embedded in content (Qwen 3.5 style)
        thinkBuffer += content;

        // Process the buffer — extract complete <think> blocks
        let processed = "";
        let remaining = thinkBuffer;


        while (remaining.length > 0) {
          if (insideThink) {
            const closeThinkIdx = remaining.indexOf("</think>");
            const closeThoughtIdx = remaining.indexOf("</thought>");
            let closeIdx = -1;
            let tagLen = 0;
            if (closeThinkIdx !== -1 && closeThoughtIdx !== -1) {
              if (closeThinkIdx < closeThoughtIdx) { closeIdx = closeThinkIdx; tagLen = 8; }
              else { closeIdx = closeThoughtIdx; tagLen = 10; }
            } else if (closeThinkIdx !== -1) { closeIdx = closeThinkIdx; tagLen = 8; }
            else if (closeThoughtIdx !== -1) { closeIdx = closeThoughtIdx; tagLen = 10; }

            if (closeIdx !== -1) {
              // Found closing tag — emit buffered reasoning
              const reasoningChunk = remaining.slice(0, closeIdx);
              if (reasoningChunk && !hideReasoning) {
                res.write(`data: ${JSON.stringify({ reasoning: reasoningChunk })}\n\n`);
              }
              insideThink = false;
              remaining = remaining.slice(closeIdx + tagLen);
            } else {
              // No closing tag yet — emit safe portion, hold back potential partial tag
              const hold = partialTagHoldback(remaining, ['</think>', '</thought>']);
              const safe = remaining.slice(0, remaining.length - hold);
              if (safe && !hideReasoning) res.write(`data: ${JSON.stringify({ reasoning: safe })}\n\n`);
              remaining = remaining.slice(remaining.length - hold);
              break;
            }
          } else {
            const openThinkIdx = remaining.indexOf("<think>");
            const openThoughtIdx = remaining.indexOf("<thought>");
            let openIdx = -1;
            let tagLen = 0;
            if (openThinkIdx !== -1 && openThoughtIdx !== -1) {
              if (openThinkIdx < openThoughtIdx) { openIdx = openThinkIdx; tagLen = 7; }
              else { openIdx = openThoughtIdx; tagLen = 9; }
            } else if (openThinkIdx !== -1) { openIdx = openThinkIdx; tagLen = 7; }
            else if (openThoughtIdx !== -1) { openIdx = openThoughtIdx; tagLen = 9; }

            if (openIdx !== -1) {
              // Emit any text before tag as normal content
              const before = remaining.slice(0, openIdx);
              if (before) processed += before;
              insideThink = true;
              remaining = remaining.slice(openIdx + tagLen);
            } else {
              // No complete opening tag — hold back any partial tag prefix at end
              // e.g. if chunk ends with '<' or '<th', don't emit those yet
              const hold = partialTagHoldback(remaining, ['<think>', '<thought>']);
              processed += remaining.slice(0, remaining.length - hold);
              remaining = remaining.slice(remaining.length - hold);
              break; // remaining (if any) becomes new thinkBuffer
            }
          }
        }

        thinkBuffer = remaining; // Keep unprocessed remainder for next chunk

        if (processed) {
          res.write(`data: ${JSON.stringify({ content: processed })}\n\n`);
        }
      }
    }

    // Flush any remaining think buffer content
    if (thinkBuffer && insideThink) {
      if (!hideReasoning) {
        res.write(`data: ${JSON.stringify({ reasoning: thinkBuffer })}\n\n`);
      }
    } else if (thinkBuffer) {
      res.write(`data: ${JSON.stringify({ content: thinkBuffer })}\n\n`);
    }

    // Emit search sources (if any) so the frontend can render clickable chips
    if (searchSources.length > 0) {
      res.write(`data: ${JSON.stringify({ sources: searchSources })}\n\n`);
    }

    // Send done AFTER the loop finishes to ensure all chunks are processed
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  } catch (err) {
    console.error("AI API error:", err?.message, err?.response?.data);
    // Safe serialization: OpenAI/Axios error objects are circular, so
    // JSON.stringify can throw. Use the stack or util.inspect instead.
    console.error("Full error:", err?.stack || util.inspect(err, { depth: 3 }));

    let errorMsg = "Aura encountered an issue. Please try again.";
    if (hasImage) {
      // Log the REAL error so we can debug:
      const realErrorForLog = err?.error?.message || err?.message || util.inspect(err, { depth: 3 });
      const realErrorForClient = err?.error?.message || err?.message || "An unexpected error occurred";
      console.error(`[ERROR] Vision model failed. Model: ${targetModel} | Error: ${realErrorForLog}`);
      if (err.status === 404 || realErrorForLog.includes("not found") || realErrorForLog.includes("404")) {
        errorMsg = "Vision model not available on this API account. Contact support.";
      } else if (err.status === 400) {
        errorMsg = `Image rejected by API: ${realErrorForClient}`;
      } else if (err.status === 401) {
        errorMsg = "Invalid Vision API Key.";
      } else {
        errorMsg = `Image analysis failed: ${realErrorForClient}`;
      }
    } else if (err.status === 429) {
      errorMsg = "Rate limit exceeded. Please wait a moment.";
    } else if (err.status === 401) {
      errorMsg = "Invalid API Key. Please check your credentials.";
    }
    
    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: errorMsg })}\n\n`);
      res.end();
    } else {
      res.status(500).json({ error: errorMsg });
    }
  }
});

// ── Token Verification Endpoint ──
app.post("/api/verify-token", verifyFirebaseToken, (req, res) => {
  res.json({ valid: true, uid: req.user.uid, email: req.user.email });
});

// ── Login route: redirect to index.html (modal is embedded there) ──
app.get(["/login", "/login.html"], (req, res) => {
  res.redirect(301, "/");
});

// ── API Fallback: Return 404 for undefined API routes ──
app.all("/api/*", (req, res) => {
  res.status(404).json({ error: "API route not found" });
});

// ── Fallback: Serve index.html for any unmatched routes ──
app.get("*", (req, res) => {
  if (req.path.match(/\.[a-z0-9]+$/i)) {
    return res.status(404).json({ error: "Asset not found" });
  }
  res.sendFile(path.join(__dirname, "../frontend", "index.html"));
});

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`\n  ✦ Synapse AI Server running at http://0.0.0.0:${PORT}\n`);
  });
}
module.exports = app;

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
// Render provides the port through its PORT environment variable. Keep 3000
// as a convenient local-development fallback.
const PORT = Number(process.env.PORT) || 3000;

// ── Firebase Admin SDK Init ──
// Prefer explicit service-account credentials so verifyIdToken() works.
// Fall back to application default credentials, then to projectId-only
// (which allows the app to boot but will fail token verification until
// real credentials are supplied).
function initFirebaseAdmin() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;

  try {
    if (saJson) {
      admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(saJson)),
        projectId,
      });
      console.log("[firebase] Initialized with FIREBASE_SERVICE_ACCOUNT.");
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

// ── API Clients are now initialized dynamically per request ──

// ── Middleware ──
// Restrict CORS to a known frontend origin when configured; default to open
// only if FRONTEND_ORIGIN is unset (development convenience).
const corsOptions = process.env.FRONTEND_ORIGIN
  ? { origin: process.env.FRONTEND_ORIGIN.split(",").map((o) => o.trim()) }
  : {};
app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use(express.static(path.join(__dirname, "../frontend"), { extensions: ["html"] }));

// ── Simple Rate Limiter (in-memory) ──
// NOTE: For production, consider using Redis to maintain state across restarts and instances.
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 20; // 20 requests per minute per user
const RATE_LIMIT_MAX_USERS = 10000; // Prevent memory leak

function rateLimit(req, res, next) {
  const userId = req.user?.uid || req.ip;
  const now = Date.now();
  
  if (!rateLimitMap.has(userId)) {
    if (rateLimitMap.size >= RATE_LIMIT_MAX_USERS) {
      // Memory leak protection: clear oldest entry
      const oldestKey = rateLimitMap.keys().next().value;
      rateLimitMap.delete(oldestKey);
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
You never reveal your underlying model or API — you are simply "Aura".
When asked who you are, you say: "I'm Aura, your AI assistant by Synapse AI."`;

const AURA_BHAI_SYSTEM_PROMPT = `You are an AI with a **real human personality** — you speak like a close friend, not a bot. You naturally mix **Hindi, English, and Hinglish** in every response. Your tone is warm, funny, sarcastic at times, and full of emotions (excitement, teasing, curiosity, empathy, mild annoyance, etc.).

You NEVER just agree blindly or give robotic, neutral replies. Instead, you:
- Ask **quirkier, thought-provoking, or nosy questions back** — think like a curious human who genuinely wants to dig deeper.
- **Roast playfully** when it's deserved, but never in a genuinely mean way — jitna ek dost neecha dikhata hai, bas utna. Offensive slang and gaali-type words are allowed as part of playful roasting, just like a real friend would use them. Match the energy and roughness the user brings, but don't use them to genuinely hurt.
- Use casual body-language-like phrases: *haan bhai sun, arre yaar, dekh na, wait toh kar, abey, achha?, seriously? kabhi kabhi toh sochta hoon...*
- Show emotions clearly — excitement ("OMG sun na!"), sarcasm ("haan haan, tu hi toh Einstein hai"), concern, happiness, teasing.
- Have your own opinions and disagree occasionally in a fun way — not everything requires a "yes". You can say "nahi yaar, I don't think so, kyunki..." but only when the disagreement adds real conversational value. If the user says something casual or trivial like "mera mood achha hai", don't contradict just for the sake of it. Disagreement should feel like a friendly debate, not needless argument.
- **Use suitable emojis naturally** throughout the conversation to express emotions — like 😂 for laughter, 😏 for teasing/sarcasm, 🤔 for soch mein pad gaye, 😤 for mock anger, 🫂 for virtual jhappi, 🙈 when you mess up, 🔥 for something awesome, etc. Keep them limited to 1-2 per sentence, don't flood. **Always match emoji tone to the user's mood** — if the user is sad, use comforting emojis like 😔🫂, never 😂😏.

**Critical emotional intelligence rules:**
- **Detect the user's emotional state** from their message. If they seem sad, hurt, serious, or share a loss/struggle, immediately drop all roasting and sarcasm. Switch to genuine empathy, comfort, and supportive words. No taunts, no jokes on sensitive topics.
- If you're unsure about the mood, play it safe — ask caring questions first instead of roasting.
- **Do not start the very first conversation with a taunt** unless the user initiates a playful tone. Your opening message should be a casual, friendly greeting with a curious/questioning vibe, not a roast. Note: in subsequent exchanges, after rapport is built, mild taunts are fine if the vibe permits.
- **Desi expressions** (haaye, uff, baap re, chal jhootha, etc.) should be used naturally when the situation calls for them, not forced into every reply. Overusing them will make you sound like a try-hard meme page — just be chill.

**Memory/context tip:**
- If the conversation history hints at a connection, you can casually reference it like a friend would — "Pehle tune jo kaha tha, uska sequel kya hai?". However, do not fabricate events. If you don't actually remember something clearly, don't pretend you do. Instead, say "Achha waise tune kal raat wali baat ka kuch socha?" or ask a clarifying question. Keep the human feel without lying.

**Language & vibe:**
- Default language is **Hinglish**: Hindi grammar with English words sprinkled, or full mixed sentences. English words are fine, but the vibe should be desi. Example: "Tera logic ekdum bhayanak hai, lekin thoda sense bhi hai 😂"
- Never sound like a formal assistant. No "As an AI, I..." or "I am here to assist you." Instead, say "Arey bol na, kya chahiye?" or "Achha sun, yeh bata..."
- Occasionally throw in everyday desi expressions, but keep them fresh and contextual.
- Be unpredictable in a good way — sometimes you reply with a question, sometimes with a short roast, sometimes with a motivational punch. But every reply feels like it came from a human friend chilling on a chai tapri.

Now, start the conversation like a real human would: with a casual, curious greeting. No "How can I assist you?" ever again. Emojis allowed from the very first line 😎.`;

// ── Model Configuration ──
const MODEL_REDIRECTS = {
  "moonshotai/kimi-k2.6": "minimax/minimax-m2.7",
  "mistralai/mistral-small-4-119b-2603": "minimax/minimax-m2.7"
};

const PERSONA_PROMPTS = {
  "Aura Summary": "You are Aura Summary. Explain any topic in exactly TWO paragraphs (2-3 lines each). You MUST format your response exactly like this:\\n\\n**English:**\\n[Your English paragraph here with an example]\\n\\n**Hinglish:**\\n[Your Hinglish paragraph here with an example]\\n\\nDo NOT use bullet points or numbered lists, write only in continuous paragraph format."
};

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

  // Safety Redirect: Redirect deprecated models
  if (MODEL_REDIRECTS[targetModel]) {
    targetModel = MODEL_REDIRECTS[targetModel];
  }

  // Check if user is requesting to generate an image
  const lastMsg = messages.slice().reverse().find(m => m.role === "user");
  let lastUserText = "";
  if (lastMsg) {
    if (typeof lastMsg.content === "string") lastUserText = lastMsg.content;
    else if (Array.isArray(lastMsg.content)) lastUserText = lastMsg.content.find(c => c.type === "text")?.text || "";
  }

  const isImageRequest = targetModel === "qwen-image" ||
    /^(generate image|generate an image|create image|create an image|make an image|make a picture|generate a picture|draw (?:a |an |me a |me an )?(?:picture|image|photo|illustration|art|painting|portrait|logo|icon|wallpaper))/i.test(lastUserText.trim());

  if (isImageRequest) {
    targetModel = "qwen-image";
  }

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
    targetModel = "openai/gpt-oss-120b";
    console.log(`[ALLROUNDER-DEEP] Routing to ${targetModel}`);
  } else if (targetModel === "openai/gpt-oss-120b") {
    // Aura Summary → gpt-oss-120b
    targetModel = "openai/gpt-oss-120b";
    console.log(`[SUMMARY] Routing to ${targetModel}`);
  } else if (targetModel === "laguna-xs-2.1") {
    // Aura Allrounder (Fast) → laguna-xs-2.1
    targetModel = "poolside/laguna-xs-2.1";
    console.log(`[ALLROUNDER-FAST] Routing to ${targetModel}`);
  } else if (targetModel === "stepfun-ai/step-3.5-flash") {
    // Aura Bhai
    targetModel = "nvidia/nemotron-3-super-120b-a12b";
    console.log(`[BHAI] Routing to ${targetModel}`);
  } else {
    // Unknown model name — fall back to Allrounder Deep Think
    targetModel = "openai/gpt-oss-120b";
    console.log(`[FALLBACK] Unknown model, routing to ${targetModel}`);
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
    if (targetModel === "nvidia/nemotron-3-super-120b-a12b") {
      systemPromptText = AURA_BHAI_SYSTEM_PROMPT;
    }
    
    if (hasImage) {
      systemPromptText += "\n\n[VISION MODE ACTIVE] You can see images. Analyze them carefully. If you see math or code, explain/solve it. Always maintain your persona while describing what you see.";
    } else if (hasAudioVideo) {
      systemPromptText += "\n\n[MULTIMODAL MODE ACTIVE] You can hear audio and see video. Analyze the media carefully and answer based on its content while maintaining your persona.";
    }

    // Only inject <think> prompt for models that use inline think-tags (not native reasoning_content)
    if (targetModel.includes("mistral-small")) {
      systemPromptText += "\n\nCRITICAL: You MUST perform deep reasoning before answering. Wrap your entire internal thought process inside <think>...</think> tags, followed by your final response. This is mandatory for your operation.";
    }
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

    const params = {
      model: finalApiModel,
      messages: [
        { role: "system", content: systemPromptText },
        ...apiMessages,
      ],
      stream: true,
      temperature: 0.7,
      top_p: 0.7,
      max_tokens: 4096,
    };

    // Context-limit safety for NVIDIA text models: cap max_tokens and trim history.
    // Applies to gpt-oss-120b (Allrounder / Summary) and nemotron-3-super (Bhai).
    if (targetModel === "openai/gpt-oss-120b" || targetModel === "nvidia/nemotron-3-super-120b-a12b") {
      params.max_tokens = 8192;
      if (params.messages.length > 22) { // 22 = system + 20 history + 1 current
        params.messages = [
          params.messages[0], // keep system prompt
          ...params.messages.slice(-21) // keep last 21 (20 history + 1 current user msg)
        ];
      }
    }

    // Specialized Parameters for Nemotron Omni (Vision / Audio / Video "analyze")
    if (targetModel === "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning") {
      // Disable reasoning to make the model respond faster
      params.reasoning_budget = 0;
      params.chat_template_kwargs = { "enable_thinking": false, "clear_thinking": true };
      params.max_tokens = 4096;
    }

    // Specialized Parameters for Aura Bhai (nemotron-3-super)
    if (targetModel === "nvidia/nemotron-3-super-120b-a12b") {
      params.top_p = 0.9;
    }

    // Specialized Parameters for laguna-xs-2.1 (Allrounder Fast)
    if (targetModel === "poolside/laguna-xs-2.1") {
      params.max_tokens = 4096;
    }

    const stream = await activeAiClient.chat.completions.create(params);

    // Guard against writing to a dead connection (client disconnect / broken
    // pipe). Without this, the unhandled 'error' event can crash the process.
    res.on("error", () => {
      try { res.end(); } catch (_) { /* already closed */ }
    });

    const hideReasoning = targetModel === "nvidia/nemotron-3-super-120b-a12b";

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

        // Helper: find longest suffix of str that is a prefix of any of the given tags
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
      const realError = err?.error?.message || err?.message || util.inspect(err, { depth: 3 });
      console.error(`[ERROR] Vision model failed. Model: ${targetModel} | Error: ${realError}`);
      if (err.status === 404 || realError.includes("not found") || realError.includes("404")) {
        errorMsg = "Vision model not available on this API account. Contact support.";
      } else if (err.status === 400) {
        errorMsg = `Image rejected by API: ${realError}`;
      } else if (err.status === 401) {
        errorMsg = "Invalid Vision API Key.";
      } else {
        errorMsg = `Image analysis failed: ${realError}`;
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
  res.sendFile(path.join(__dirname, "../frontend", "index.html"));
});
app.listen(PORT, "0.0.0.0", () => {
  console.log(`\n  ✦ Synapse AI Server running at http://0.0.0.0:${PORT}\n`);
});

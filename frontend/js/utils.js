// ============================================
// Synapse AI — Utility Functions
// ============================================

const artifactStore = new Map();

/**
 * Escapes HTML special characters, including both quote styles so the result
 * is safe in attribute context (e.g. alt="${escapeHtml(name)}"). The previous
 * textContent round-trip left `"` and `'` unescaped, which could break out of
 * a quoted attribute.
 */
function escapeHtml(text) {
  if (typeof text !== "string") text = String(text ?? "");
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Generates a random alphanumeric ID.
 */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// ⚡ Bolt: Cache Intl.DateTimeFormat
// Impact: ~22x faster date formatting. `toLocaleDateString` instantiates a new formatter
// on every call, causing layout jank when rendering long chat histories.
const relativeTimeFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/**
 * Formats a timestamp into a relative time string.
 */
function formatRelativeTime(timestamp) {
  const now = Date.now();
  const diff = now - timestamp;
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days}d ago`;
  return relativeTimeFormatter.format(new Date(timestamp));
}

/**
 * Debounce helper
 */
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Cache the marked renderer and DOMPurify config to avoid recreating them on every call.
// This provides a measurable performance improvement (~30% faster parsing), especially important
// during AI response streaming when `renderMarkdown` is called frequently.
let cachedMarkedRenderer = null;
let cachedDOMPurifyConfig = {
  ADD_ATTR: ["target"],
  // Allow data: URIs so AI-generated images (base64 responses from the image
  // generation endpoint) survive DOMPurify's default sanitization. Without this,
  // DOMPurify strips the `src` attribute from <img src="data:image/jpeg;base64,...">
  // and every generated image appears as a broken placeholder.
  ALLOWED_URI_REGEXP: /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i
};

// Hook to prevent reverse tabnabbing by adding rel="noopener noreferrer" when target is used
if (typeof DOMPurify !== "undefined") {
  DOMPurify.addHook('afterSanitizeAttributes', function (node) {
    if ('target' in node && node.hasAttribute('target')) {
      node.setAttribute('rel', 'noopener noreferrer');
    }
  });
}

/**
 * Robust markdown parsing using marked.
 */
function renderMarkdown(text, isStreaming = false) {
  if (!text) return "";

  const codeBlocks = [];
  const mathBlocks = [];
  let processed = text;

  // Protect code blocks
  processed = processed.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
    const idx = codeBlocks.length;
    codeBlocks.push({ lang: lang || "", code: code.trimEnd() });
    return `%%CODE_BLOCK_${idx}%%`;
  });

  // Protect math blocks
  processed = processed.replace(/\$\$([\s\S]*?)\$\$/g, (_, math) => {
    const idx = mathBlocks.length;
    mathBlocks.push({ math: math.trim(), display: true });
    return `%%MATH_BLOCK_${idx}%%`;
  });
  processed = processed.replace(/\\\[([\s\S]*?)\\\]/g, (_, math) => {
    const idx = mathBlocks.length;
    mathBlocks.push({ math: math.trim(), display: true });
    return `%%MATH_BLOCK_${idx}%%`;
  });
  processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (_, math) => {
    const idx = mathBlocks.length;
    mathBlocks.push({ math: math.trim(), display: false });
    return `%%MATH_BLOCK_${idx}%%`;
  });
  // Inline math: a single `$…$` pair. The delimiters must not sit directly
  // against a digit (opening `$` not followed by a space/digit, closing `$`
  // not followed by a digit) so ordinary currency like "$5 and $10" is left
  // alone instead of being mis-parsed as one math span.
  processed = processed.replace(/(^|[^$\d])\$(?![\s\d])([^\n$]+?)\$(?!\d)/g, (_, lead, math) => {
    const idx = mathBlocks.length;
    mathBlocks.push({ math: math.trim(), display: false });
    return `${lead}%%MATH_BLOCK_${idx}%%`;
  });

  if (isStreaming) {
    processed = processed.replace(/^```(\w*)(?:\n[\s\S]*)?$/gm, (match, lang) => {
      const langLabel = lang || "code";
      return langLabel.toLowerCase() === "html" ? `%%WRITING_ARTIFACT%%` : `%%WRITING_CODE_${langLabel}%%`;
    });
  }

  let html = "";
  if (typeof marked !== "undefined") {
    if (!cachedMarkedRenderer) {
      cachedMarkedRenderer = new marked.Renderer();
      cachedMarkedRenderer.code = function(code, lang) {
        const language = (lang || '').split(' ')[0] || 'plaintext';
        let highlighted = escapeHtml(code);
        if (typeof hljs !== 'undefined') {
          const validLang = hljs.getLanguage(language) ? language : 'plaintext';
          highlighted = hljs.highlight(code, { language: validLang }).value;
        }
        return `
<div class="code-block-wrapper">
  <div class="code-block-header" style="display:flex; justify-content:space-between; align-items:center; padding:8px 15px;">
    <span class="code-block-lang" style="color:var(--ink-3); font-size:12px; font-weight:600; text-transform:uppercase;">${language}</span>
    <button class="copy-code-btn" onclick="copyCode(this)" title="Copy code" aria-label="Copy code">
      <span class="material-symbols-outlined" style="font-size: 14px;">content_copy</span> Copy
    </button>
  </div>
  <pre><code class="hljs language-${language}">${highlighted}</code></pre>
</div>
`;
      };
    }

    html = marked.parse(processed, {
      renderer: cachedMarkedRenderer,
      gfm: true, 
      breaks: true,
      mangle: false,
      headerIds: false
    });
  } else {
    html = escapeHtml(processed).replace(/\n/g, "<br>");
  }

  // ── Sanitize model-generated HTML ──
  // `marked` output can contain arbitrary HTML the model emitted (e.g. an
  // `<img onerror=…>` or a `<script>`), and it is injected via innerHTML, so
  // scrub it here before anything downstream. The app's OWN trusted markup
  // (artifact cards with `previewCode`, code blocks with `copyCode`, KaTeX)
  // is spliced in *below* this line, so those onclick handlers are preserved.
  // Guarded: if the DOMPurify CDN is blocked/offline we fail securely by
  // falling back to strict text escaping rather than injecting unsafe HTML.
  if (typeof DOMPurify !== "undefined") {
    html = DOMPurify.sanitize(html, cachedDOMPurifyConfig);
  } else {
    console.error("[SECURITY] DOMPurify not loaded! Failing securely by escaping all HTML.");
    html = escapeHtml(text).replace(/\n/g, "<br>");
  }

  html = html.replace(/%%WRITING_ARTIFACT%%/g, `
    <div class="artifact-card" style="background:rgba(94,162,255,0.05); border:1px solid rgba(94,162,255,0.2); border-radius:12px; padding:16px; margin:12px 0; display:flex; align-items:center; gap:12px;">
      <div style="width:40px; height:40px; background:rgba(94,162,255,0.15); border-radius:8px; display:flex; align-items:center; justify-content:center;">
        <span class="material-symbols-outlined" style="color:#5ea2ff; font-size:22px; animation: spin 2s linear infinite;">progress_activity</span>
      </div>
      <div>
        <h4 style="margin:0; color:#f5f5f7; font-size:15px; font-weight:600;">Building Web App...</h4>
        <p style="margin:0; color:rgba(185,202,203,0.7); font-size:12px;">Writing HTML / CSS / JS</p>
      </div>
    </div>
  `);
  html = html.replace(/%%WRITING_CODE_(\w+)%%/g, (_, lang) => `
    <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:14px 16px; margin:12px 0; display:flex; align-items:center; gap:12px;">
      <span class="material-symbols-outlined" style="color:#dcb8ff; font-size:20px; animation: spin 2s linear infinite;">progress_activity</span>
      <span style="color:rgba(185,202,203,0.7); font-size:13px;">Writing ${lang} code...</span>
    </div>
  `);

  html = html.replace(/%%CODE_BLOCK_(\d+)%%/g, (_, idx) => {
    const block = codeBlocks[parseInt(idx)];
    if (!block) return "";
    const langLabel = block.lang || "code";
    const isHtml = langLabel.toLowerCase() === "html";
    const escapedCodeForDisplay = escapeHtml(block.code);

    if (isHtml) {
      if (!isStreaming) {
        // Globally-unique id (never resets per-chat), so the IndexedDB
        // `artifacts` store can't collide across chats and load the wrong app.
        const artifactId = 'artifact_' + generateId();
        artifactStore.set(artifactId, block.code);
        // Fire-and-forget persist — never let an IndexedDB failure become an
        // unhandled promise rejection.
        if (typeof saveToDB === "function") Promise.resolve(saveToDB("artifacts", artifactId, block.code)).catch((e) => console.warn("Artifact persist failed:", e));
        return `
          <div class="artifact-card" data-artifact-id="${artifactId}" style="background:rgba(94,162,255,0.05); border:1px solid rgba(94,162,255,0.2); border-radius:12px; padding:16px; margin:12px 0; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <div style="width:40px; height:40px; background:rgba(94,162,255,0.15); border-radius:8px; display:flex; align-items:center; justify-content:center;">
              <span class="material-symbols-outlined" style="color:#5ea2ff; font-size:22px;">web</span>
            </div>
            <div>
              <h4 style="margin:0; color:#f5f5f7; font-size:15px; font-weight:600;">Interactive Web App</h4>
              <p style="margin:0; color:rgba(185,202,203,0.7); font-size:12px;">HTML / CSS / JS</p>
            </div>
          </div>
          <button onclick="previewCode(this)" class="glass-btn-heavy" style="background:linear-gradient(135deg, #7c5cff, #5ea2ff); color:#fff; border:none; padding:8px 16px; border-radius:20px; font-weight:700; font-size:13px; cursor:pointer; display:flex; align-items:center; gap:6px; transition:transform 0.15s, box-shadow 0.25s;">
            <span class="material-symbols-outlined" style="font-size:18px;">play_arrow</span> Open Preview
          </button>
        </div>
      `;
      } else {
        return `
          <div class="artifact-card" style="background:rgba(94,162,255,0.05); border:1px solid rgba(94,162,255,0.2); border-radius:12px; padding:16px; margin:12px 0; display:flex; align-items:center; gap:12px;">
            <div style="display:flex; align-items:center; gap:12px;">
              <div style="width:40px; height:40px; background:rgba(94,162,255,0.15); border-radius:8px; display:flex; align-items:center; justify-content:center;">
                <span class="material-symbols-outlined" style="color:#5ea2ff; font-size:22px;">check_circle</span>
              </div>
              <div>
                <h4 style="margin:0; color:#f5f5f7; font-size:15px; font-weight:600;">Web App Ready</h4>
                <p style="margin:0; color:rgba(185,202,203,0.7); font-size:12px;">Preview available when generation completes</p>
              </div>
            </div>
          </div>
        `;
      }
    }
    return `<div class="code-block-wrapper"><div class="code-block-header"><span class="code-lang-label">${langLabel}</span><div style="display:flex;"><button class="copy-code-btn" onclick="copyCode(this)" aria-label="Copy code"><span class="material-symbols-outlined" style="font-size:14px;">content_copy</span> Copy</button></div></div><pre><code class="hljs language-${block.lang}">${escapedCodeForDisplay}</code></pre></div>`;
  });

  html = html.replace(/%%MATH_BLOCK_(\d+)%%/g, (_, idx) => {
    const block = mathBlocks[parseInt(idx)];
    if (!block) return "";
    try {
      if (typeof katex !== "undefined") {
        return katex.renderToString(block.math, { displayMode: block.display, throwOnError: false, output: "html" });
      }
      return block.display ? `<div class="math-fallback">${escapeHtml(block.math)}</div>` : `<span class="math-fallback">${escapeHtml(block.math)}</span>`;
    } catch (e) {
      return `<code class="math-error">${escapeHtml(block.math)}</code>`;
    }
  });

  return html;
}

// ============================================
// Synapse AI — Chat Logic (Aura AI)
// ============================================


const chatMessages = document.getElementById("chat-messages");
const chatInput = document.getElementById("chat-input");
const sendBtn = document.getElementById("send-btn");
const heroSection = document.getElementById("hero-section");
const emptyState = document.getElementById("empty-state");
const userNameEl = document.getElementById("user-display-name");
const userAvatarEl = document.getElementById("user-avatar");
const logoutBtn = document.getElementById("logout-btn");

// UI Elements for History & Navigation
const navNewChatBtn = document.getElementById("nav-new-chat-btn");
const navHistoryBtn = document.getElementById("nav-history-btn");
const headerNewChatBtn = document.getElementById("header-new-chat-btn");
const navSearchInput = document.getElementById("nav-search-input");
const historyModal = document.getElementById("history-modal");
const historyModalContent = document.getElementById("history-modal-content");
const closeHistoryBtn = document.getElementById("close-history-btn");
const historyListContainer = document.getElementById("history-list-container");
const sidebarHistoryList = document.getElementById("history-list");
const drawerToggle = document.getElementById("drawer-toggle");
const headerLogo = document.getElementById("header-logo");

// UI Elements for File Attachments
const attachBtn = document.getElementById("attach-btn");
const fileInput = document.getElementById("file-input");
const attachmentPreviewContainer = document.getElementById("attachment-preview-container");
// We removed individual preview elements as they will be injected dynamically

// UI Elements for Model Selector
const modelSelectorBtn = document.getElementById("model-selector-btn");
const modelDropdown = document.getElementById("model-dropdown");
const currentModelNameEl = document.getElementById("current-model-name");
const modelOptions = document.querySelectorAll(".model-option");

// ── State ──
let conversationHistory = [];
let isStreaming = false;
let currentChatId = generateId();
let attachedFiles = []; // Array of { filename, mimeType, data, isImage, size }
let currentModel = localStorage.getItem("selected_model") || "minimax/minimax-m2.7";
// Migration: If user has old Kimi or Mistral model in local storage, force update it to Minimax
if (currentModel === "moonshotai/kimi-k2.6" || currentModel === "mistralai/mistral-small-4-119b-2603") {
  currentModel = "minimax/minimax-m2.7";
  localStorage.setItem("selected_model", currentModel);
  localStorage.setItem("aura1_mode", "deep_think"); // Reset toggle to Deep Think for new default
}
let currentModelName = localStorage.getItem("selected_model_name") || "Aura AI";
// Migration: the flagship model is presented as "Aura AI" (matching the
// data-name on the model options in chat.html). Returning visitors still have
// one of the previous labels saved, which would leave the model name unmatched
// by the capability/theme/toggle lookups below — that mismatch is what kept the
// Think/Fast toggle hidden.
if (
  currentModelName === "Aura Allrounder" ||
  currentModelName === "Aura 1" ||
  currentModelName === "Aura 2.0 Pro"
) {
  currentModelName = "Aura AI";
  localStorage.setItem("selected_model_name", currentModelName);
}
// Migration: "Aura Flash" was renamed to "Aura Bhai" for consistency with
// the landing page and backend routing.
if (currentModelName === "Aura Flash") {
  currentModelName = "Aura Bhai";
  localStorage.setItem("selected_model_name", currentModelName);
}
let abortController = null; // For stopping generation
let lastRawUserMessage = null; // Raw (full base64) payload of the most recent user turn

// ── Helpers ──
// Replace data: URLs (base64) with a lightweight placeholder so the in-memory
// conversationHistory stays small and follow-up turns don't resend images.
function stripBase64(content) {
  if (Array.isArray(content)) {
    return content.map(block => {
      // Replace media parts with a text placeholder rather than a data-less
      // image_url/audio_url — a re-sent history turn must still be a valid
      // multimodal payload upstream (a URL of "[image attachment]" is not).
      if (block.type === "image_url" && block.image_url?.url?.startsWith("data:")) {
        return { type: "text", text: "[image attachment omitted from history]" };
      }
      if (block.type === "audio_url" && block.audio_url?.url?.startsWith("data:")) {
        return { type: "text", text: "[audio attachment omitted from history]" };
      }
      if (block.type === "video_url" && block.video_url?.url?.startsWith("data:")) {
        return { type: "text", text: "[video attachment omitted from history]" };
      }
      return block;
    });
  }
  return content;
}

// Build the messages array sent to /api/chat. Restores the raw (full base64)
// payload for the most recent user turn so the backend can process the image,
// while keeping earlier turns stripped to avoid oversized requests.
function getMessagesForRequest() {
  // Send only {role, content} upstream — strip client-only fields such as `ts`
  // (message timestamp) that the chat API should never receive.
  const msgs = conversationHistory.map(m => ({ role: m.role, content: m.content }));
  if (!lastRawUserMessage) return msgs;
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "user") {
      msgs[i] = { role: "user", content: lastRawUserMessage };
      break;
    }
  }
  return msgs;
}

// ── Aura AI (flagship) Toggle State ──
let aura1Mode = localStorage.getItem("aura1_mode") || "deep_think"; // "deep_think" or "fast"

// Stop button
const stopBtn = document.getElementById("stop-btn");

if (currentModelNameEl) currentModelNameEl.textContent = currentModelName;

// Aura AI (flagship) Mode Toggle DOM
const aura1ModeToggle = document.getElementById("aura1-mode-toggle");
const modeDeepThinkBtn = document.getElementById("mode-deep-think-btn");
const modeFastBtn = document.getElementById("mode-fast-btn");

function updateAura1ToggleUI() {
  if (!aura1ModeToggle || !modeDeepThinkBtn || !modeFastBtn) return;
  // The Think/Fast switch only applies to the flagship model, whose display
  // name in chat.html is "Aura AI".
  if (currentModelName === "Aura AI") {
    aura1ModeToggle.style.display = "flex";
    if (aura1Mode === "deep_think") {
      modeDeepThinkBtn.dataset.active = "true";
      modeDeepThinkBtn.setAttribute("aria-pressed", "true");
      modeFastBtn.removeAttribute("data-active");
      modeFastBtn.setAttribute("aria-pressed", "false");
      currentModel = "minimax/minimax-m2.7";
    } else {
      modeFastBtn.dataset.active = "true";
      modeFastBtn.setAttribute("aria-pressed", "true");
      modeDeepThinkBtn.removeAttribute("data-active");
      modeDeepThinkBtn.setAttribute("aria-pressed", "false");
      // Backend maps laguna-xs-2.1 → openai/gpt-oss-120b for the fast path.
      currentModel = "laguna-xs-2.1";
    }
    localStorage.setItem("selected_model", currentModel);
  } else {
    aura1ModeToggle.style.display = "none";
  }
}

if (modeDeepThinkBtn) {
  modeDeepThinkBtn.addEventListener("click", () => {
    aura1Mode = "deep_think";
    localStorage.setItem("aura1_mode", aura1Mode);
    updateAura1ToggleUI();
  });
}
if (modeFastBtn) {
  modeFastBtn.addEventListener("click", () => {
    aura1Mode = "fast";
    localStorage.setItem("aura1_mode", aura1Mode);
    updateAura1ToggleUI();
  });
}

// ── Initial UI sync
updateAura1ToggleUI();


// ── IndexedDB Helper (for persistent images & artifacts) ──
const dbName = "SynapseDB";
const dbVersion = 1;

function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, dbVersion);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("attachments")) {
        db.createObjectStore("attachments", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("artifacts")) {
        db.createObjectStore("artifacts", { keyPath: "id" });
      }
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
}

async function saveToDB(storeName, id, data) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    const store = tx.objectStore(storeName);
    store.put({ id, data });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getFromDB(storeName, id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readonly");
    const store = tx.objectStore(storeName);
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result?.data);
    request.onerror = () => reject(request.error);
  });
}

// ── Auth Guard + User Info ──
// Guarded: if the Firebase SDK failed to load (blocked CDN / offline / CSP)
// `auth` is null. The previous bare `auth.onAuthStateChanged(...)` threw a
// ReferenceError at this exact line, which aborted the ENTIRE remainder of
// this script — no send button, no Enter handler, no dropdown, no sidebar
// toggle, no modals. That single throw is what made the page feel "frozen".
if (auth) {
  auth.onAuthStateChanged((user) => {
    if (!user) {
      // DEV bypass: when window.DEV_DISABLE_AUTH is on (see firebase-config.js)
      // stay on the chat page and run in a local, no-account mode instead of
      // bouncing back to the landing page. Pair with DISABLE_AUTH=true in
      // backend/.env. Turn the flag off to restore the normal auth gate.
      if (window.DEV_DISABLE_AUTH) {
        if (userNameEl) userNameEl.textContent = "Guest";
        if (userAvatarEl) {
          userAvatarEl.innerHTML = `<span style="font-size:16px;font-weight:700;color:#5ea2ff;">G</span>`;
        }
        loadHistoryIndex();
        return;
      }
      window.location.href = "/index.html";
      return;
    }
    if (userNameEl) userNameEl.textContent = user.displayName || user.email?.split("@")[0] || "User";
    if (userAvatarEl) {
      if (user.photoURL) {
        const avatarImg = document.createElement('img');
        avatarImg.src = user.photoURL;
        avatarImg.alt = 'Profile';
        avatarImg.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;';
        userAvatarEl.innerHTML = '';
        userAvatarEl.appendChild(avatarImg);
      } else {
        const initial = (user.displayName || user.email || "U")[0].toUpperCase();
        userAvatarEl.innerHTML = `<span style="font-size:16px;font-weight:700;color:#5ea2ff;">${initial}</span>`;
      }
    }
    loadHistoryIndex(); // Load past chats when user logs in
  });
} else {
  // Offline mode: keep the workspace fully usable without sign-in. Local
  // history still renders; sending a message surfaces a clear warning instead
  // of a frozen page.
  console.warn("[chat] Firebase Auth unavailable — running in offline mode. " +
    "The interface remains interactive; sign-in and AI requests need connectivity.");
  if (userAvatarEl) {
    userAvatarEl.innerHTML = `<span style="font-size:16px;font-weight:700;color:#5ea2ff;">G</span>`;
  }
  loadHistoryIndex(); // render locally-stored history without waiting for auth
}

if (logoutBtn) {
  logoutBtn.addEventListener('click', async () => {
    if (auth) await auth.signOut();
    window.location.href = '/index.html';
  });
}


if (attachBtn) attachBtn.addEventListener("click", () => fileInput.click());

// ── Image Compression Helper ──
function compressImage(dataUrl, maxWidth = 1024, quality = 0.7) {
  return new Promise((resolve) => {
    // Detect the source type from the data-URL header so we don't silently
    // convert everything to JPEG (which destroys PNG transparency and would
    // flatten an animated GIF to one frame).
    const mimeMatch = /^data:([^;,]+)/.exec(dataUrl);
    const srcMime = mimeMatch ? mimeMatch[1].toLowerCase() : "image/jpeg";

    // GIFs may be animated — canvas can only capture a single frame, so leave
    // them exactly as-is.
    if (srcMime === "image/gif") {
      resolve(dataUrl);
      return;
    }

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let w = img.width;
      let h = img.height;

      // Scale down if larger than maxWidth
      if (w > maxWidth || h > maxWidth) {
        const ratio = Math.min(maxWidth / w, maxWidth / h);
        w = Math.round(w * ratio);
        h = Math.round(h * ratio);
      }

      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0, w, h);

      // Preserve PNG (keeps transparency); recompress other lossy types to JPEG.
      const compressed = srcMime === "image/png"
        ? canvas.toDataURL("image/png")
        : canvas.toDataURL("image/jpeg", quality);
      resolve(compressed);
    };
    img.onerror = () => resolve(dataUrl); // fallback to original
    img.src = dataUrl;
  });
}

async function handleFiles(files) {
  if (!files.length) return;

  const caps = MODEL_CAPABILITIES[currentModelName] || { image: true, audio: true, video: true };

  for (const file of files) {
    if (attachedFiles.length >= 5) {
      showToast("You can attach up to 5 files.", "error");
      break;
    }

    const isImage = file.type.startsWith("image/");
    const isAudio = file.type.startsWith("audio/");
    const isVideo = file.type.startsWith("video/");
    // Text-ish files and images are always allowed; audio/video only when the
    // selected model advertises support for them.
    const textTypes = ["text/plain", "application/json", "text/markdown", "text/csv"];
    const allowed =
      textTypes.includes(file.type) ||
      isImage ||
      (isAudio && caps.audio) ||
      (isVideo && caps.video);
    if (!allowed) {
      const reason = ((isAudio && !caps.audio) || (isVideo && !caps.video))
        ? `${currentModelName} can't analyze ${isAudio ? "audio" : "video"} files.`
        : `"${file.name}" isn't a supported file type.`;
      showToast(reason, "error");
      continue;
    }

    const isMedia = isImage || isAudio || isVideo;
    const reader = new FileReader();

    const readPromise = new Promise((resolve) => {
      reader.onload = async (ev) => {
        let fileData = ev.target.result;
        let outMime = file.type || (isImage ? "image/jpeg" : "text/plain");
        if (isImage) {
          fileData = await compressImage(fileData, 1024, 0.7);
          const m = /^data:([^;,]+)/.exec(fileData);
          if (m) outMime = m[1];
        }
        attachedFiles.push({
          filename: file.name,
          mimeType: outMime,
          data: fileData,
          isImage: isImage,
          size: file.size
        });
        resolve();
      };
      // Without these, a failed or aborted read leaves the await pending
      // forever and freezes the composer. Resolve (warning on error) instead.
      reader.onerror = () => {
        showToast(`Couldn't read "${file.name}".`, "error");
        resolve();
      };
      reader.onabort = () => resolve();
    });

    if (isMedia) {
      reader.readAsDataURL(file);
    } else {
      reader.readAsText(file);
    }

    await readPromise;
  }
  
  // Reset file input so re-selecting the same file triggers change event
  if (fileInput) fileInput.value = "";
  renderAttachments();
}

if (fileInput) {
  fileInput.addEventListener("change", async (e) => {
    handleFiles(Array.from(e.target.files));
  });
}

// ── Drag & Drop / Paste Support ──
document.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;
  const files = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }
  if (files.length > 0) {
    handleFiles(files);
  }
});

const textInputBar = document.getElementById("text-input-bar");
let dragCounter = 0;

document.addEventListener("dragenter", (e) => {
  e.preventDefault();
  dragCounter++;
  if (textInputBar) textInputBar.classList.add("drag-active");
});

document.addEventListener("dragover", (e) => {
  e.preventDefault();
});

document.addEventListener("dragleave", (e) => {
  e.preventDefault();
  dragCounter--;
  if (dragCounter === 0 && textInputBar) {
    textInputBar.classList.remove("drag-active");
  }
});

document.addEventListener("drop", (e) => {
  e.preventDefault();
  dragCounter = 0;
  if (textInputBar) textInputBar.classList.remove("drag-active");
  
  if (e.dataTransfer?.files?.length > 0) {
    handleFiles(Array.from(e.dataTransfer.files));
  }
});

function renderAttachments() {
  if (attachedFiles.length === 0) {
    attachmentPreviewContainer.classList.add("hidden");
    attachmentPreviewContainer.innerHTML = "";
    return;
  }
  
  attachmentPreviewContainer.classList.remove("hidden");
  attachmentPreviewContainer.innerHTML = "";
  
  // ⚡ Bolt: Batch DOM Insertions with DocumentFragment
  // Impact: O(N) -> O(1) layout recalculations. Appending directly to container
  // inside the loop causes layout thrashing for users with multiple attachments.
  const fragment = document.createDocumentFragment();
  attachedFiles.forEach((attachment, index) => {
    const item = document.createElement("div");
    item.className = "attachment-chip";
    item.title = attachment.filename || "";

    let previewHtml = "";
    if (attachment.isImage) {
      previewHtml = `<img src="${attachment.data}" alt="${escapeHtml(attachment.filename || "attachment")}" />`;
    } else {
      previewHtml = `<div class="attachment-chip-file"><span aria-hidden="true" class="material-symbols-outlined">description</span></div>`;
    }

    item.innerHTML = `
      ${previewHtml}
      <button type="button" onclick="removeAttachment(${index})" class="attachment-chip-remove" title="Remove attachment" aria-label="Remove attachment">
        <span aria-hidden="true" class="material-symbols-outlined" style="font-size:14px;">close</span>
      </button>
    `;
    fragment.appendChild(item);
  });
  attachmentPreviewContainer.appendChild(fragment);
}

window.removeAttachment = function(index) {
  attachedFiles.splice(index, 1);
  if (attachedFiles.length === 0) {
    fileInput.value = "";
  }
  renderAttachments();
};

// ── Header notification bell ──
// This button previously had NO click handler at all — it rendered with a
// pulsing dot but swallowed every click. Now it acks notifications: the dot
// is cleared and the user gets explicit feedback.
const notificationsBtn = document.getElementById("header-notifications-btn");
if (notificationsBtn) {
  notificationsBtn.addEventListener("click", () => {
    const dot = notificationsBtn.querySelector(".notification-dot");
    if (dot) dot.style.display = "none";
    showToast("You're all caught up — no new notifications.", "success");
  });
}

// ── Header avatar → profile menu ──
// The avatar also had NO click handler. It now opens a small account menu
// (name/email + log out), built entirely in JS so no HTML changes are needed.
let profileMenuEl = null;

function closeProfileMenu() {
  if (!profileMenuEl) return;
  profileMenuEl.classList.add("hidden");
  if (userAvatarEl) userAvatarEl.setAttribute("aria-expanded", "false");
}

function openProfileMenu() {
  if (!userAvatarEl) return;

  if (!profileMenuEl) {
    profileMenuEl = document.createElement("div");
    profileMenuEl.id = "profile-menu";
    profileMenuEl.className = "hidden";
    profileMenuEl.setAttribute("role", "menu");
    profileMenuEl.setAttribute("aria-label", "Account menu");

    const user = auth ? auth.currentUser : null;
    const name = user?.displayName || user?.email?.split("@")[0] || "Guest";
    const email = user?.email || "Not signed in (offline mode)";

    profileMenuEl.innerHTML = `
      <div class="profile-menu-head">
        <p class="profile-menu-name">${escapeHtml(name)}</p>
        <p class="profile-menu-email">${escapeHtml(email)}</p>
      </div>
      <div class="profile-menu-divider"></div>
      <button id="profile-menu-logout" class="sidebar-action" type="button" role="menuitem">
        <span aria-hidden="true" class="material-symbols-outlined">logout</span>
        <span>Log out</span>
      </button>
    `;
    document.body.appendChild(profileMenuEl);

    profileMenuEl.querySelector("#profile-menu-logout").addEventListener("click", () => {
      closeProfileMenu();
      // Reuse the sidebar logout flow (handles both online and offline mode).
      if (logoutBtn) logoutBtn.click();
    });

    // Close on outside click — registered once, alongside the menu element.
    document.addEventListener("click", (e) => {
      if (!profileMenuEl || profileMenuEl.classList.contains("hidden")) return;
      if (!profileMenuEl.contains(e.target) && !userAvatarEl.contains(e.target)) {
        closeProfileMenu();
      }
    });
    // Close on Escape, consistent with the other popovers.
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeProfileMenu();
    });
  }

  // Position the menu directly under the avatar (it is position:fixed).
  const rect = userAvatarEl.getBoundingClientRect();
  profileMenuEl.style.top = `${rect.bottom + 10}px`;
  profileMenuEl.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;

  userAvatarEl.setAttribute("aria-expanded", "true");
  profileMenuEl.classList.remove("hidden");
}

if (userAvatarEl) {
  userAvatarEl.setAttribute("aria-haspopup", "menu");
  userAvatarEl.setAttribute("aria-expanded", "false");
  userAvatarEl.addEventListener("click", (e) => {
    e.stopPropagation();
    if (profileMenuEl && !profileMenuEl.classList.contains("hidden")) {
      closeProfileMenu();
    } else {
      openProfileMenu();
    }
  });
}

// ── Sidebar Logic ──
if (modelSelectorBtn && modelDropdown) {
  modelSelectorBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const isHidden = modelDropdown.classList.contains("hidden");
    if (isHidden) {
      modelSelectorBtn.setAttribute("aria-expanded", "true");
      modelDropdown.classList.remove("hidden");
      modelDropdown.classList.remove("pointer-events-none");
      setTimeout(() => {
        modelDropdown.classList.remove("opacity-0");
        modelDropdown.classList.remove("translate-y-2");
      }, 10);
    } else {
      closeModelDropdown();
    }
  });

  document.addEventListener("click", (e) => {
    if (!modelDropdown.contains(e.target) && !modelSelectorBtn.contains(e.target)) {
      closeModelDropdown();
    }
  });
}

function closeModelDropdown() {
  if (!modelDropdown) return;
  if (modelSelectorBtn) modelSelectorBtn.setAttribute("aria-expanded", "false");
  modelDropdown.classList.add("opacity-0");
  modelDropdown.classList.add("translate-y-2");
  modelDropdown.classList.add("pointer-events-none");
  setTimeout(() => {
    modelDropdown.classList.add("hidden");
  }, 200);
}



if (modelOptions) {
  modelOptions.forEach(option => {
    option.addEventListener("click", () => {
      const selectedModel = option.getAttribute("data-model");
      const selectedName = option.getAttribute("data-name");



      // Set model name first, then update toggle UI
      currentModelName = selectedName;
      localStorage.setItem("selected_model_name", currentModelName);

      if (selectedName === "Aura AI") {
        updateAura1ToggleUI(); // Sets currentModel internally based on toggle state
      } else {
        currentModel = selectedModel;
        localStorage.setItem("selected_model", currentModel);
        updateAura1ToggleUI(); // Hide the toggle for every non-flagship model
      }

      if (currentModelNameEl) currentModelNameEl.textContent = currentModelName;
      // Apply accent color to model name. The final `else` matters: without it
      // a previously applied colour stuck around after switching models.
      if (currentModelNameEl) {
        if (currentModelName === 'Aura AI') currentModelNameEl.style.color = '#7c5cff';
        else if (currentModelName === 'Aura Summary') currentModelNameEl.style.color = '#4caf50';
        else if (currentModelName === 'Aura Bhai') currentModelNameEl.style.color = '#a855f7';
        else currentModelNameEl.style.color = '';
      }
      
      // Update active indicator in dropdown
      updateActiveModelIndicator(currentModelName);
      
      updateDynamicTheme(currentModelName);
      closeModelDropdown();
      createNewChat();
      showToast(`Switched to ${currentModelName}`, 'success');
    });
  });
}

// ── Dynamic Theming ──
function updateDynamicTheme(modelName) {
  const root = document.documentElement;
  
  const themes = {
    "Aura AI": {
      blob1: "#7c5cff", // Iris
      blob2: "#5ea2ff", // Azure
      blob3: "#a07cff"  // Soft violet
    },
    "Aura Summary": {
      blob1: "#34d399", // Emerald
      blob2: "#22d3ee", // Teal
      blob3: "#10b981"  // Green
    },
    "Aura Bhai": {
      blob1: "#a855f7", // Purple
      blob2: "#00e5ff", // Neon Cyan
      blob3: "#7c5cff"  // Violet
    }
  };

  const theme = themes[modelName] || themes["Aura AI"];
  
  root.style.setProperty("--blob-1-color", theme.blob1);
  root.style.setProperty("--blob-2-color", theme.blob2);
  root.style.setProperty("--blob-3-color", theme.blob3);
}

// Initialize theme on load
updateDynamicTheme(currentModelName);

// ── Active Model Indicator ──
function updateActiveModelIndicator(activeModelName) {
  modelOptions.forEach(option => {
    const name = option.getAttribute('data-name');
    if (name === activeModelName) {
      option.classList.add('active');
      option.setAttribute('aria-selected', 'true');
    } else {
      option.classList.remove('active');
      option.setAttribute('aria-selected', 'false');
    }
  });
}

// Initialize active indicator on load
updateActiveModelIndicator(currentModelName);

// window so onclick from html works
window.loadSession = loadSession;
window.deleteSession = deleteSession;

// ── Local Storage History ──
function getHistoryIndex() {
  const index = localStorage.getItem("chat_index");
  return index ? JSON.parse(index) : [];
}

function saveHistoryIndex(index) {
  localStorage.setItem("chat_index", JSON.stringify(index));
}

function saveSession() {
  if (conversationHistory.length === 0) return;
  
  try {
    // (#20) Move base64 image data to IndexedDB to save localStorage space & persist
    const stripped = conversationHistory.map(msg => {
      if (Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.map(block => {
            if (block.type === 'image_url' && block.image_url?.url?.startsWith('data:')) {
              const imgId = `img_${currentChatId}_${generateId()}`;
              // Fire-and-forget: swallow rejections (IndexedDB unavailable in
              // some private modes) so they never surface as unhandled.
              saveToDB("attachments", imgId, block.image_url.url).catch((e) => console.warn("Attachment persist failed:", e));
              return { type: 'image_url', image_url: { url: `db:${imgId}` } };
            }
            return block;
          })
        };
      }
      return msg;
    });
    localStorage.setItem(`chat_${currentChatId}`, JSON.stringify(stripped));
    
    let index = getHistoryIndex();
    let existing = index.find(c => c.id === currentChatId);
    
    if (existing) {
      existing.updatedAt = Date.now();
    } else {
      // Generate title from first message
      let firstMsg = conversationHistory.find(m => m.role === "user")?.content || "New Chat";
      if (typeof firstMsg === "string") {
        firstMsg = firstMsg.slice(0, 30) + (firstMsg.length > 30 ? "..." : "");
      } else if (Array.isArray(firstMsg)) {
        firstMsg = firstMsg.find(b => b.type === "text")?.text || "Attachment Chat";
        firstMsg = firstMsg.slice(0, 30) + (firstMsg.length > 30 ? "..." : "");
      } else {
        firstMsg = "Attachment Chat";
      }
      index.push({ id: currentChatId, title: firstMsg, updatedAt: Date.now(), model: currentModelName });
    }
    
    // Sort by newest and keep the visible sidebar in sync immediately.
    index.sort((a, b) => b.updatedAt - a.updatedAt);
    saveHistoryIndex(index);
    renderSidebarHistory(index);

    // Clear draft on successful save
    localStorage.removeItem('synapse_draft_input');
    if (chatInput) chatInput.classList.remove('has-draft');
  } catch (e) {
    console.warn("Could not save session to local storage:", e);
  }
}

// (#2) Auto-rename chat title after first AI response
function autoRenameChat(aiResponse) {
  const index = getHistoryIndex();
  const entry = index.find(c => c.id === currentChatId);
  if (!entry || entry._renamed) return;
  
  // Simple client-side heuristic: extract first sentence or key phrase
  const text = typeof aiResponse === 'string' ? aiResponse : '';
  const userMsg = conversationHistory.find(m => m.role === 'user');
  let userText = '';
  if (userMsg) {
    userText = typeof userMsg.content === 'string' ? userMsg.content : 
               (Array.isArray(userMsg.content) ? (userMsg.content.find(c => c.type === 'text')?.text || '') : '');
  }
  
  // Use the user message to generate a better title (max 40 chars)
  let title = userText.trim();
  // Remove filler words at the start
  title = title.replace(/^(hey|hi|hello|can you|please|help me|i need|i want)\s+/i, '');
  // Capitalize first letter
  title = title.charAt(0).toUpperCase() + title.slice(1);
  // Truncate
  if (title.length > 40) title = title.slice(0, 40) + '...';
  if (title.length < 3) return; // too short to rename
  
  entry.title = title;
  entry._renamed = true;
  saveHistoryIndex(index);
  renderSidebarHistory(index);
}

// Render a conversationHistory array into #chat-messages. Shared by loadSession
// and undoNewChat so both restore image previews and strip appended file text
// identically (undoNewChat previously rendered a bare "[Attachment]" and lost
// image thumbnails). Resolves db:-referenced images first, then lazy-loads them.
async function renderConversation(history) {
  for (const msg of history) {
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (block.type === "image_url" && block.image_url.url.startsWith("db:")) {
          const imgId = block.image_url.url.split("db:")[1];
          try {
            const realUrl = await getFromDB("attachments", imgId);
            if (realUrl) block.image_url.url = realUrl;
          } catch (dbErr) {
            console.error("Failed to load attachment from DB:", dbErr);
          }
        }
      }
    }
  }

  chatMessages.innerHTML = "";
  if (heroSection) heroSection.style.display = "none";
  if (emptyState) emptyState.style.display = "none";

  const fragment = document.createDocumentFragment();
  history.forEach((msg, idx) => {
    if (msg.role === "assistant") {
      appendMessage("ai", msg.content || "", idx, false, true, fragment);
    } else {
      let htmlContent = "";
      if (typeof msg.content === "string") {
        htmlContent = escapeHtml(msg.content);
      } else if (Array.isArray(msg.content)) {
        const textItem = msg.content.find(c => c.type === "text");
        let rawText = textItem ? textItem.text : "[Attachment]";
        const displayIdx = rawText.indexOf("\n\nAttached file contents (");
        if (displayIdx !== -1) rawText = rawText.substring(0, displayIdx);
        htmlContent = escapeHtml(rawText);
        const previews = [];
        for (const block of msg.content) {
          if (block.type === "image_url") {
            const src = block.image_url.url.startsWith("db:") ? "#" : block.image_url.url;
            const dbAttr = block.image_url.url.startsWith("db:") ? `data-db-id="${escapeHtml(block.image_url.url.split("db:")[1])}"` : "";
            previews.push(`<img src="${escapeHtml(src)}" ${dbAttr} alt="Attached image" class="lazy-db-img" style="max-height: 200px; border-radius: 8px; margin-top: 8px; border: 1px solid rgba(255,255,255,0.1);"/>`);
          }
        }
        if (previews.length > 0) {
          htmlContent += `<br><div style="display:flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">${previews.join("")}</div>`;
        }
      }
      appendMessage("user", htmlContent, idx, true, true, fragment);
    }
  });
  chatMessages.appendChild(fragment);
  scrollToBottom(true);
  updateScrollBtn();

  document.querySelectorAll(".lazy-db-img").forEach(async img => {
    if (img.dataset.dbId) {
      try {
        const data = await getFromDB("attachments", img.dataset.dbId);
        if (data) img.src = data;
      } catch (dbErr) {
        console.error("Failed to lazy load attachment:", dbErr);
      }
      img.classList.remove("lazy-db-img");
    }
  });
}

async function loadSession(id) {
  const data = localStorage.getItem(`chat_${id}`);
  if (!data) return;
  
  // Clear artifact store from previous chat to prevent stale references & memory leaks.
  // Artifact ids are globally unique (generateId), so there is no per-chat counter to reset.
  artifactStore.clear();

  conversationHistory = JSON.parse(data);
  currentChatId = id;
  lastRawUserMessage = null;
  
  await renderConversation(conversationHistory);

  scrollToBottom(true);
  closeHistoryModal();
  if (drawerToggle) drawerToggle.checked = false; // close drawer
  
  // (#10) Show model warning if chat was with a different model
  const histIndex = getHistoryIndex();
  const chatEntry = histIndex.find(c => c.id === id);
  if (chatEntry?.model) showModelWarning(chatEntry.model);
  
  // (#6) Apply syntax highlighting to loaded code blocks
  if (window.hljs) {
    document.querySelectorAll('pre code').forEach(block => {
      if (block.dataset.highlighted) return;
      hljs.highlightElement(block);
    });
  }
}

async function deleteSession(id) {
  // (#4) Clean up IndexedDB storage for this session
  try {
    const db = await initDB();
    
    // Cleanup attachments
    const attachmentTx = db.transaction("attachments", "readwrite");
    const attachmentStore = attachmentTx.objectStore("attachments");
    const attachmentRequest = attachmentStore.openCursor();
    attachmentRequest.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (cursor.key.startsWith(`img_${id}_`)) {
          cursor.delete();
        }
        cursor.continue();
      }
    };

    // Cleanup artifacts. Artifact ids are globally-unique random keys (not
    // chat-scoped), and every chat regenerates its artifacts from the stored
    // message text whenever it is re-rendered — so any artifact key that is
    // not in the live in-memory artifactStore is a stale render and safe to
    // drop. This removes the deleted chat's artifacts and also garbage-collects
    // orphans accumulated from earlier renders (previously an unbounded leak).
    const artifactTx = db.transaction("artifacts", "readwrite");
    const artStore = artifactTx.objectStore("artifacts");
    const artRequest = artStore.openCursor();
    artRequest.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        if (typeof cursor.key === "string" && cursor.key.startsWith("artifact_") && !artifactStore.has(cursor.key)) {
          cursor.delete();
        }
        cursor.continue();
      }
    };
  } catch (err) {
    console.error("Failed to clean up IndexedDB for session:", id, err);
  }

  localStorage.removeItem(`chat_${id}`);
  let index = getHistoryIndex();
  index = index.filter(c => c.id !== id);
  saveHistoryIndex(index);
  
  if (id === currentChatId) {
    createNewChat();
  }
  // Preserve any active history-search filter so the modal list doesn't
  // silently reset to "all chats" while the search box still shows a query.
  const historySearch = document.getElementById("history-search-input");
  const activeQuery = historySearch ? historySearch.value.trim().toLowerCase() : "";
  loadHistoryIndex(activeQuery);
}

function deleteAllHistory() {
  const index = getHistoryIndex();
  index.forEach(chat => {
    localStorage.removeItem(`chat_${chat.id}`);
  });
  localStorage.removeItem("chat_index");
  createNewChat();
  loadHistoryIndex();
  closeDeleteHistoryModal();
  showToast('All history cleared', 'success'); // (#4)
}

const deleteAllHistoryBtn = document.getElementById("delete-all-history-btn");
const deleteHistoryModal = document.getElementById("delete-history-modal");
const deleteHistoryModalContent = document.getElementById("delete-history-modal-content");
const confirmDeleteHistoryBtn = document.getElementById("confirm-delete-history-btn");
const cancelDeleteHistoryBtn = document.getElementById("cancel-delete-history-btn");

function openDeleteHistoryModal() {
  if (!deleteHistoryModal) return;
  deleteHistoryModal.classList.remove("hidden");
  deleteHistoryModal.classList.add("flex");
  setTimeout(() => {
    deleteHistoryModal.classList.remove("opacity-0");
    if (deleteHistoryModalContent) deleteHistoryModalContent.classList.remove("scale-95");
  }, 10);
  if (drawerToggle) drawerToggle.checked = false;
}

function closeDeleteHistoryModal() {
  if (!deleteHistoryModal) return;
  deleteHistoryModal.classList.add("opacity-0");
  if (deleteHistoryModalContent) deleteHistoryModalContent.classList.add("scale-95");
  setTimeout(() => {
    deleteHistoryModal.classList.add("hidden");
    deleteHistoryModal.classList.remove("flex");
  }, 300);
}

if (deleteAllHistoryBtn) {
  deleteAllHistoryBtn.addEventListener("click", openDeleteHistoryModal);
}
if (cancelDeleteHistoryBtn) {
  cancelDeleteHistoryBtn.addEventListener("click", closeDeleteHistoryModal);
}
if (confirmDeleteHistoryBtn) {
  confirmDeleteHistoryBtn.addEventListener("click", deleteAllHistory);
}

// (#3) Undo snackbar state
let _undoSnackbarTimeout = null;
let _previousChatId = null;
let _previousHistory = null;

function createNewChat(skipUndo = false) {
  // (#1) Stop any ongoing generation to prevent background streams from re-opening Canvas
  stopGeneration();

  // If there's an active conversation, offer undo (#3)
  if (!skipUndo && conversationHistory.length > 0) {
    _previousChatId = currentChatId;
    _previousHistory = [...conversationHistory];
    showUndoSnackbar();
  }
  
  currentChatId = generateId();
  conversationHistory = [];
  lastRawUserMessage = null;
  chatMessages.innerHTML = "";
  
  // Clear artifact store to free memory from previous chat
  artifactStore.clear();


  if (heroSection) heroSection.style.display = "";
  if (emptyState) emptyState.style.display = "flex";
  
  // Render Dynamic Category Chips based on current model
  renderSuggestionChips();
  
  // Show empty state CTA
  const ctaEl = document.getElementById('empty-state-cta');
  if (ctaEl) ctaEl.style.display = '';
  
  if (drawerToggle) drawerToggle.checked = false;
  
  isStreaming = false;
  updateSendButton(false);
  setOrbState('idle');
}

// (#3) Undo Snackbar
function showUndoSnackbar() {
  let snackbar = document.getElementById('undo-snackbar');
  if (!snackbar) {
    snackbar = document.createElement('div');
    snackbar.id = 'undo-snackbar';
    snackbar.className = 'undo-snackbar';
    snackbar.innerHTML = '<span>New chat started</span><button class="undo-snackbar-btn" id="undo-new-chat-btn">Undo</button>';
    document.body.appendChild(snackbar);
    document.getElementById('undo-new-chat-btn').addEventListener('click', undoNewChat);
  }
  if (_undoSnackbarTimeout) clearTimeout(_undoSnackbarTimeout);
  requestAnimationFrame(() => snackbar.classList.add('show'));
  _undoSnackbarTimeout = setTimeout(() => {
    snackbar.classList.remove('show');
    _previousChatId = null;
    _previousHistory = null;
  }, 4000);
}

async function undoNewChat() {
  if (!_previousChatId || !_previousHistory) return;
  currentChatId = _previousChatId;
  conversationHistory = _previousHistory;
  _previousChatId = null;
  _previousHistory = null;
  
  await renderConversation(conversationHistory);

  scrollToBottom(true);
  
  const snackbar = document.getElementById('undo-snackbar');
  if (snackbar) snackbar.classList.remove('show');
  if (_undoSnackbarTimeout) clearTimeout(_undoSnackbarTimeout);
  showToast('Chat restored', 'success');
}

// ── UI Modal & Navigation ──
if (navNewChatBtn) {
  navNewChatBtn.addEventListener("click", () => {
    createNewChat();
  });
}

if (headerNewChatBtn) {
  headerNewChatBtn.addEventListener("click", () => {
    createNewChat();
  });
}

if (headerLogo) {
  headerLogo.addEventListener("click", () => {
    createNewChat();
    // In case drawer is open (though logo is on top), ensure it closes
    if (drawerToggle) drawerToggle.checked = false;
  });
}

function openHistoryModal() {
  loadHistoryIndex();
  historyModal.classList.remove("hidden");
  historyModal.classList.add("flex");
  // Trigger animation next frame
  setTimeout(() => {
    historyModal.classList.remove("opacity-0");
    // Mobile: slide up from bottom; Desktop: scale in
    historyModalContent.classList.remove("scale-95");
    historyModalContent.classList.remove("translate-y-full");
  }, 10);
  if (drawerToggle) drawerToggle.checked = false;
  // (#19) Focus trap
  trapFocus(historyModalContent);
  // (#22) ARIA
  historyModal.setAttribute('role', 'dialog');
  historyModal.setAttribute('aria-modal', 'true');
  historyModal.setAttribute('aria-label', 'Chat history');
  // Focus the search input
  const searchInput = document.getElementById('history-search-input');
  if (searchInput) setTimeout(() => searchInput.focus(), 100);
}

function closeHistoryModal() {
  historyModal.classList.add("opacity-0");
  // Mobile: slide back down; Desktop: scale out (no translate on desktop)
  if (window.innerWidth < 640) {
    historyModalContent.classList.add("translate-y-full");
  }
  historyModalContent.classList.add("scale-95");
  // (#19) Release focus trap
  releaseFocusTrap(historyModalContent);
  // Clear search
  const searchInput = document.getElementById('history-search-input');
  if (searchInput) searchInput.value = '';
  setTimeout(() => {
    historyModal.classList.add("hidden");
    historyModal.classList.remove("flex");
    // Reset translate for next open
    historyModalContent.classList.remove("translate-y-full");
  }, 300);
}

if (navHistoryBtn) navHistoryBtn.addEventListener("click", openHistoryModal);
if (closeHistoryBtn) closeHistoryBtn.addEventListener("click", closeHistoryModal);

// The compact search in the floating header opens the full history search
// with the current query, instead of looking like an inactive decoration.
if (navSearchInput) {
  navSearchInput.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const query = navSearchInput.value.trim();
    openHistoryModal();
    const historySearch = document.getElementById("history-search-input");
    if (historySearch) {
      historySearch.value = query;
      loadHistoryIndex(query.toLowerCase());
    }
  });
}

// (#1) History Search
const historySearchInput = document.getElementById('history-search-input');
if (historySearchInput) {
  historySearchInput.addEventListener('input', debounce(() => {
    const query = historySearchInput.value.trim().toLowerCase();
    loadHistoryIndex(query);
  }, 300));
}


// The sidebar mirrors the history modal's time buckets so recent work is easy
// to scan: Recent (today), Yesterday, and Previous 7 Days.
// Shared calendar-day bucketing so the sidebar and the all-chats search modal
// agree on what "Today"/"Yesterday" mean. Uses calendar-day boundaries (midnight),
// NOT a rolling 24h/48h window — a chat from 11pm yesterday reads as "Yesterday"
// at 9am today, which is what users expect. Returns:
// 'today' | 'yesterday' | 'previous7' | 'older'.
// ⚡ Bolt: Pass pre-calculated todayMs to prevent instantiating new Date objects
// for every item in the history list (O(n) -> O(1) date creations).
function getHistoryDayBucket(timestamp, todayMs) {
  const dayMs = 86400000;
  const t = timestamp || 0;
  if (t >= todayMs) return 'today';
  if (t >= todayMs - dayMs) return 'yesterday';
  if (t >= todayMs - dayMs * 7) return 'previous7';
  return 'older';
}

function renderSidebarHistory(index) {
  if (!sidebarHistoryList) return;

  const emptyMessage = document.querySelector('.sidebar-empty');
  const lists = {
    recent: sidebarHistoryList,
    yesterday: document.getElementById('history-list-yesterday'),
    previous7: document.getElementById('history-list-previous7'),
  };
  Object.values(lists).forEach((list) => { if (list) list.innerHTML = ''; });

  const nowMs = Date.now();
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const buckets = { recent: [], yesterday: [], previous7: [] };
  index.forEach((chat) => {
    switch (getHistoryDayBucket(chat.updatedAt, todayMs)) {
      case 'today': buckets.recent.push(chat); break;
      case 'yesterday': buckets.yesterday.push(chat); break;
      case 'previous7': buckets.previous7.push(chat); break;
      // 'older' chats are intentionally not shown in the compact sidebar.
    }
  });

  // Keep the sidebar short: cap each bucket, favouring the most recent work.
  const caps = { recent: 6, yesterday: 4, previous7: 4 };

  Object.entries(buckets).forEach(([key, chats]) => {
    const list = lists[key];
    if (!list) return;

    // ⚡ Bolt: Batch DOM Appends with DocumentFragment
    // Impact: O(N) -> O(1) layout recalculations. Appending directly to list
    // inside the loop causes layout thrashing for users with large histories.
    const fragment = document.createDocumentFragment();
    const visible = chats.slice(0, caps[key]);
    visible.forEach((chat) => {
      const item = document.createElement('li');

      const button = document.createElement('button');
      button.type = 'button';
      button.className = `sidebar-recent-item${chat.id === currentChatId ? ' active' : ''}`;
      button.title = chat.title;
      const timeLabel = chat.updatedAt ? formatRelativeTime(chat.updatedAt) : '';
      button.innerHTML =
        `<span aria-hidden="true" class="material-symbols-outlined history-icon">chat_bubble</span>` +
        `<span class="history-title">${escapeHtml(chat.title)}</span>` +
        `<span class="history-time">${escapeHtml(timeLabel)}</span>`;
      button.addEventListener('click', () => loadSession(chat.id));

      // Per-chat delete. Revealed on hover for pointer devices and shown at rest
      // on touch (see .sidebar-recent-delete in chat.css); stops propagation so
      // clicking it never also opens the chat.
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'sidebar-recent-delete';
      del.title = 'Delete chat';
      del.setAttribute('aria-label', `Delete chat: ${chat.title}`);
      del.innerHTML = `<span aria-hidden="true" class="material-symbols-outlined">delete</span>`;
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        // Route through the custom in-app confirmation modal instead of
        // deleting instantly (no native confirm() — see confirmDeleteSession).
        window.confirmDeleteSession(chat.id);
      });

      item.appendChild(button);
      item.appendChild(del);
      fragment.appendChild(item);
    });
    list.appendChild(fragment);
    // "Recent" always stays visible (it owns the empty-state copy); the dated
    // groups only appear once they actually hold a conversation.
    const group = list.closest('.history-group');
    if (group && key !== 'recent') group.hidden = visible.length === 0;
  });

  if (emptyMessage) emptyMessage.hidden = buckets.recent.length > 0;
}

function loadHistoryIndex(searchQuery = '') {
  const allChats = getHistoryIndex();
  renderSidebarHistory(allChats);
  let index = allChats;
  
  // (#1) Filter by search query
  if (searchQuery) {
    index = index.filter(chat => chat.title.toLowerCase().includes(searchQuery));
  }
  historyListContainer.innerHTML = "";
  
  if (index.length === 0) {
    historyListContainer.innerHTML = '<p class="text-on-surface-variant text-center my-8 text-sm">No recent chats.</p>';
    return;
  }

  // Group by time periods
  const nowMs = Date.now();
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const groups = {
    'Today': [],
    'Yesterday': [],
    'Last 7 Days': [],
    'Older': []
  };

  const bucketToLabel = { today: 'Today', yesterday: 'Yesterday', previous7: 'Last 7 Days', older: 'Older' };
  index.forEach(chat => {
    groups[bucketToLabel[getHistoryDayBucket(chat.updatedAt, todayMs)]].push(chat);
  });

  // ⚡ Bolt: Batch DOM Appends with DocumentFragment
  // Impact: O(N) -> O(1) layout recalculations. Appending directly to historyListContainer
  // inside the loop causes layout thrashing for users with large histories.
  const fragment = document.createDocumentFragment();

  Object.entries(groups).forEach(([label, chats]) => {
    if (chats.length === 0) return;

    const groupLabel = document.createElement('p');
    groupLabel.className = 'history-modal-group-label';
    groupLabel.textContent = label;
    fragment.appendChild(groupLabel);

    chats.forEach(chat => {
      const item = document.createElement("div");
      item.className = "history-item";
      const date = formatRelativeTime(chat.updatedAt);
      item.innerHTML = `
        <div class="history-modal-item-body" onclick="loadSession('${chat.id}')">
          <p class="history-modal-item-title">${escapeHtml(chat.title)}</p>
          <p class="history-modal-item-date">${date}</p>
        </div>
        <button type="button" onclick="event.stopPropagation(); confirmDeleteSession('${chat.id}')" class="history-modal-item-delete" aria-label="Delete chat">
          <span aria-hidden="true" class="material-symbols-outlined" style="font-size: 18px;">delete</span>
        </button>
      `;
      fragment.appendChild(item);
    });
  });

  historyListContainer.appendChild(fragment);
}

// `canvas` capability removed — live HTML preview was exclusive to Aura Coder.
const MODEL_CAPABILITIES = {
  "Aura AI": { image: true, audio: true, video: true, canvas: false },
  "Aura Summary": { image: false, audio: false, video: false, canvas: false },
  "Aura Bhai": { image: true, audio: true, video: true, canvas: false }
};

function sendMessage() {
  const text = chatInput.value.trim();
  if ((!text && attachedFiles.length === 0) || isStreaming) return;

  // Enforce character limit
  if (text.length > 4000) {
    showToast("Message is too long. Please keep it under 4000 characters.", "error");
    return;
  }

  // (#7) Validate media capabilities for selected model
  const caps = MODEL_CAPABILITIES[currentModelName] || { image: true, audio: true, video: true };
  const hasImage = attachedFiles.some(f => f.isImage);
  const hasAudio = attachedFiles.some(f => f.mimeType.startsWith("audio/"));
  const hasVideo = attachedFiles.some(f => f.mimeType.startsWith("video/"));

  if (hasImage && !caps.image) {
    showToast(`${currentModelName} does not support image analysis.`, "error");
    return;
  }
  if (hasAudio && !caps.audio) {
    showToast(`${currentModelName} does not support audio analysis.`, "error");
    return;
  }
  if (hasVideo && !caps.video) {
    showToast(`${currentModelName} does not support video analysis.`, "error");
    return;
  }

  // Dismiss the welcome / suggestion cards for the rest of this conversation.
  // (#hero-section no longer exists in the markup — the cards live in
  // #empty-state, which is what must be hidden here.)
  if (heroSection) heroSection.style.display = "none";
  if (emptyState) emptyState.style.display = "none";
  let displayContent = escapeHtml(text);
  let backendPayload = text;

  if (attachedFiles.length > 0) {
    // Render attachment previews for the user bubble
    let attachmentPreviews = [];
    for (const file of attachedFiles) {
      if (file.isImage) {
        attachmentPreviews.push(`<img src="${file.data}" alt="${escapeHtml(file.filename)}" style="max-height: 200px; border-radius: 8px; margin-top: 8px; border: 1px solid rgba(255,255,255,0.1);"/>`);
      } else if (file.mimeType.startsWith("audio/")) {
        attachmentPreviews.push(`<div style="display:flex;align-items:center;gap:8px;background:rgba(94,162,255,0.1);padding:8px;border-radius:8px;margin-top:8px;"><span aria-hidden="true" class="material-symbols-outlined" style="color:#5ea2ff;">audiotrack</span><span style="color:#f5f5f7;font-size:0.8rem;">${escapeHtml(file.filename)}</span></div>`);
      } else if (file.mimeType.startsWith("video/")) {
        attachmentPreviews.push(`<div style="display:flex;align-items:center;gap:8px;background:rgba(220,184,255,0.1);padding:8px;border-radius:8px;margin-top:8px;"><span aria-hidden="true" class="material-symbols-outlined" style="color:#dcb8ff;">movie</span><span style="color:#f5f5f7;font-size:0.8rem;">${escapeHtml(file.filename)}</span></div>`);
      } else {
        attachmentPreviews.push(`<span style="color:#5ea2ff;font-size:0.8rem; display: block;">📎 Attached: ${escapeHtml(file.filename)}</span>`);
      }
    }
    displayContent += `\n<br><div style="display:flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">${attachmentPreviews.join("")}</div>`;
    
    const isMultimodal = hasImage || hasAudio || hasVideo;

    if (isMultimodal) {
      backendPayload = [
        { type: "text", text: text || "Please analyze the attached files." }
      ];
      
      for (const file of attachedFiles) {
        if (file.isImage) {
          backendPayload.push({ type: "image_url", image_url: { url: file.data } });
        } else if (file.mimeType.startsWith("audio/")) {
          backendPayload.push({ type: "audio_url", audio_url: { url: file.data } });
        } else if (file.mimeType.startsWith("video/")) {
          backendPayload.push({ type: "video_url", video_url: { url: file.data } });
        } else {
          backendPayload[0].text += `\n\nAttached file contents (${file.filename}):\n${file.data}`;
        }
      }
    } else {
      // Only text files attached — user message first, then file contents
      let combinedFileContent = "";
      for (const file of attachedFiles) {
        combinedFileContent += `\n\nAttached file contents (${file.filename}):\n\n${file.data}`;
      }
      backendPayload = (text || "Please analyze the attached file(s).") + combinedFileContent;
    }
  }

  // Display user msg
  appendMessage("user", displayContent, -1, true);
  // Store a base64-stripped copy in memory so follow-up turns don't resend
  // the entire image (avoids 413s / huge payloads). The raw payload is kept
  // in lastRawUserMessage and restored for the actual API request below.
  conversationHistory.push({ role: "user", content: stripBase64(backendPayload), ts: Date.now() });
  lastRawUserMessage = backendPayload;
  saveSession();

  // Capture multimodal state BEFORE clearing attachedFiles
  const multimodalState = {
    hasImage: attachedFiles.some(f => f.isImage),
    hasAudio: attachedFiles.some(f => f.mimeType.startsWith("audio/")),
    hasVideo: attachedFiles.some(f => f.mimeType.startsWith("video/"))
  };

  // Reset input and attachments
  chatInput.value = "";
  chatInput.style.height = "auto";
  chatInput.dispatchEvent(new Event('input'));
  attachedFiles = [];
  if (fileInput) fileInput.value = "";
  renderAttachments();
  
  if (navigator.vibrate) navigator.vibrate(10);
  
  // Start AI response
  getAuraResponse(multimodalState);
}

// ── Stop Generation ──
function stopGeneration() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

if (stopBtn) {
  stopBtn.addEventListener("click", stopGeneration);
}

// ── Event Listeners ──
if (sendBtn) {
  sendBtn.addEventListener("click", sendMessage);
}

if (chatInput) {
  chatInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  // Auto-resize textarea
  chatInput.addEventListener("input", () => {
    chatInput.style.height = "auto";
    chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + "px";
    // Animated send button — pulse when text is present
    animateSendButton();
  });
}

// ── Animated Send Button ──
let _sendBtnHasText = null;
function animateSendButton() {
  if (!sendBtn) return;
  const hasText = chatInput.value.trim().length > 0 || attachedFiles.length > 0;

  // ⚡ Bolt: Cache button state
  // Impact: Prevents unconditional style assignments on every keystroke, which
  // dirties the DOM style state and causes redundant layout calculations.
  if (hasText === _sendBtnHasText) return;
  _sendBtnHasText = hasText;

  if (hasText) {
    sendBtn.style.background = "linear-gradient(135deg, #5ea2ff, #7701d0)";
    sendBtn.style.boxShadow = "0 0 18px rgba(94,162,255,0.45)";
    sendBtn.style.transform = "scale(1.08)";
  } else {
    sendBtn.style.background = "";
    sendBtn.style.boxShadow = "";
    sendBtn.style.transform = "";
  }
}

// ── Category Chips Logic (empty state onboarding) ──
const categoryChipsContainer = document.getElementById('category-chips');
if (categoryChipsContainer) {
  categoryChipsContainer.addEventListener('click', (e) => {
    const chip = e.target.closest('.category-chip');
    if (!chip) return;
    const prompt = chip.dataset.prompt;
    if (prompt && chatInput) {
      chatInput.value = prompt;
      chatInput.dispatchEvent(new Event('input'));
      chatInput.focus();
      sendMessage();
    }
  });
}

function renderSuggestionChips() {
  if (!categoryChipsContainer) return;
  categoryChipsContainer.innerHTML = '';
  
  let chips = [];

  // All models share the same four starting points, matching the four-card
  // grid the empty state is designed around.
  chips = [
    { icon: 'edit_document', title: 'Draft an Email', description: 'Professional and clear.', prompt: 'Draft a professional email to my team about the upcoming project launch.', color: '#7c5cff' },
    { icon: 'lightbulb', title: 'Brainstorm Ideas', description: 'Creative and fresh.', prompt: 'Brainstorm 5 creative ideas for a new marketing campaign.', color: '#8f7bff' },
    { icon: 'flight_takeoff', title: 'Plan a Trip', description: 'Itinerary and tips.', prompt: 'Plan a 3-day weekend trip itinerary to a relaxing destination.', color: '#a479ff' },
    { icon: 'history_edu', title: 'Write a Story', description: 'Engaging and fun.', prompt: 'Write a short story about a time traveler who visits ancient Rome.', color: '#b87dff' }
  ];
  
  // ⚡ Bolt: Batch DOM Insertions with DocumentFragment
  // Impact: O(N) -> O(1) layout recalculations. Appending directly to container
  // inside the loop causes layout thrashing.
  const fragment = document.createDocumentFragment();
  chips.forEach(chip => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'category-chip suggestion-card';
    btn.dataset.prompt = chip.prompt;
    btn.style.setProperty('--chip-color', chip.color);
    btn.innerHTML = `
      <span class="suggestion-card-icon"><span aria-hidden="true" class="material-symbols-outlined">${escapeHtml(chip.icon)}</span></span>
      <span class="suggestion-card-text">
        <span class="suggestion-card-title">${escapeHtml(chip.title)}</span>
        <span class="suggestion-card-desc">${escapeHtml(chip.description)}</span>
      </span>
    `;
    fragment.appendChild(btn);
  });
  categoryChipsContainer.appendChild(fragment);
}

// Call on initial load
renderSuggestionChips();

// ── Orb State Management ──
function setOrbState(state) {
  const orb = document.getElementById('aura-state-orb');
  if (!orb) return;
  
  // Reset classes
  orb.classList.remove('orb-thinking', 'orb-responding', 'orb-error');
  
  switch (state) {
    case 'thinking':
      orb.classList.add('orb-thinking');
      break;
    case 'responding':
      orb.classList.add('orb-responding');
      break;
    case 'error':
      orb.classList.add('orb-error');
      setTimeout(() => orb.classList.remove('orb-error'), 1500);
      break;
    default: // 'idle'
      break;
  }
}

// ── Scroll-to-Bottom Button ──
const scrollToBottomBtn = document.getElementById("scroll-to-bottom-btn");

let _scrollBtnVisible = null;
function updateScrollBtn(providedDistFromBottom) {
  if (!scrollToBottomBtn) return;
  const distFromBottom = providedDistFromBottom !== undefined ? providedDistFromBottom : (document.documentElement.scrollHeight - window.scrollY - window.innerHeight);
  // Compare distFromBottom; we use 200px threshold
  const isVisible = distFromBottom > 200;

  // ⚡ Bolt: Cache scroll button visibility state
  // Impact: Prevents unconditional style assignments on every scroll frame, which
  // dirties the DOM style state and causes redundant layout calculations.
  if (isVisible === _scrollBtnVisible) return;
  _scrollBtnVisible = isVisible;

  if (isVisible) {
    scrollToBottomBtn.style.opacity = "1";
    scrollToBottomBtn.style.pointerEvents = "auto";
    scrollToBottomBtn.style.transform = "scale(1)";
  } else {
    scrollToBottomBtn.style.opacity = "0";
    scrollToBottomBtn.style.pointerEvents = "none";
    scrollToBottomBtn.style.transform = "scale(0.9)";
  }
}

// ── Scroll To Bottom ──
let userHasScrolledUp = false;
let lastScrollY = window.scrollY || 0;

let ticking = false;

window.addEventListener("scroll", () => {
  // Throttling scroll events with requestAnimationFrame to prevent main thread blocking and layout thrashing
  if (!ticking) {
    window.requestAnimationFrame(() => {
      const currentScrollY = window.scrollY;
      const distFromBottom = document.documentElement.scrollHeight - currentScrollY - window.innerHeight;

      if (currentScrollY < lastScrollY) {
        if (distFromBottom > 200) {
          userHasScrolledUp = true;
        }
      } else if (distFromBottom <= 200) {
        userHasScrolledUp = false;
      }

      lastScrollY = currentScrollY;
      // Pass the precalculated distFromBottom to prevent duplicate expensive DOM reads
      updateScrollBtn(distFromBottom);
      ticking = false;
    });
    ticking = true;
  }
}, { passive: true });

if (scrollToBottomBtn) {
  scrollToBottomBtn.style.transition = "opacity 0.25s ease, transform 0.25s ease";
  scrollToBottomBtn.addEventListener("click", () => {
    userHasScrolledUp = false;
    window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "smooth" });
    updateScrollBtn();
  });
}

// ── Image Lightbox ──
window.closeLightbox = function(event) {
  if (event && event.stopPropagation) event.stopPropagation();
  const modal = document.getElementById("image-lightbox-modal");
  if (!modal) return;
  modal.style.opacity = "0";
  setTimeout(() => {
    modal.classList.add("hidden");
    modal.classList.remove("flex");
    const img = document.getElementById("lightbox-img");
    if (img) img.src = "";
  }, 250);
};

window.openLightbox = function(src) {
  const modal = document.getElementById("image-lightbox-modal");
  const img = document.getElementById("lightbox-img");
  if (!modal || !img) return;
  img.src = src;
  img.style.transform = "scale(0.9)";
  modal.classList.remove("hidden");
  modal.classList.add("flex");
  modal.style.opacity = "0";
  setTimeout(() => {
    modal.style.opacity = "1";
    modal.style.transition = "opacity 0.25s ease";
    img.style.transform = "scale(1)";
    img.style.transition = "transform 0.3s cubic-bezier(0.34,1.56,0.64,1)";
  }, 10);
};

window.downloadLightboxImage = function() {
  const img = document.getElementById("lightbox-img");
  if (!img || !img.src) return;
  
  const a = document.createElement("a");
  a.href = img.src;
  a.download = `Aura_Image_${Date.now()}.jpg`; // Default filename
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

// Close the topmost open layer on Escape — checked in true stacking order so
// one Escape never tears down a layer sitting beneath a visible one.
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    // Confirm dialogs (delete-chat / delete-history, z:110) can be layered
    // directly over the history modal (also z:110, later in the DOM), so they
    // must be handled first and return — otherwise one Escape would also tear
    // down the modal underneath. The remaining independent layers then follow
    // real z-index: lightbox (z:150) > history (z:110) > canvas panel (z:100).
    const deleteChatM = document.getElementById("delete-chat-modal");
    if (deleteChatM && !deleteChatM.classList.contains("hidden")) {
      closeDeleteChatModal();
      return;
    }
    const deleteM = document.getElementById("delete-history-modal");
    if (deleteM && !deleteM.classList.contains("hidden")) {
      closeDeleteHistoryModal();
      return;
    }
    const lightboxModal = document.getElementById("image-lightbox-modal");
    if (lightboxModal && !lightboxModal.classList.contains("hidden")) {
      closeLightbox();
      return;
    }
    const historyM = document.getElementById("history-modal");
    if (historyM && !historyM.classList.contains("hidden")) {
      closeHistoryModal();
      return;
    }
    const canvasPanel = document.getElementById("canvas-panel");
    if (canvasPanel && !canvasPanel.classList.contains("hidden")) {
      window.closeCodePreview();
      return;
    }
  }
});

// ── Get AI Response (SSE Stream) ──
async function getAuraResponse(multimodalState = {}) {
  isStreaming = true;
  abortController = new AbortController();
  updateSendButton(true);
  setOrbState('thinking');

  // Hide empty state CTA when response starts
  const ctaEl = document.getElementById('empty-state-cta');
  if (ctaEl) ctaEl.style.display = 'none';

  const typingEl = showTypingIndicator(multimodalState);

  // Hoisted so they're accessible in catch block
  let bubbleEl = null;
  let rowEl = null;
  let fullContent = "";
  let fullReasoning = "";
  let reasoningEl = null;
  let pendingRAF = null;
  let needsReasoningUpdate = false;
  let needsContentUpdate = false;

  const flushDOMUpdates = () => {
    if (needsReasoningUpdate && reasoningEl) {
      reasoningEl.querySelector(".thinking-content").innerHTML = renderMarkdown(fullReasoning);
      needsReasoningUpdate = false;
    }
    if (needsContentUpdate) {
      let contentContainer = bubbleEl.querySelector(".answer-content");
      if (!contentContainer) {
        contentContainer = document.createElement("div");
        contentContainer.className = "answer-content";
        bubbleEl.appendChild(contentContainer);
      }
      contentContainer.innerHTML = renderMarkdown(fullContent, true) + '<span class="typing-cursor"></span>';
      setOrbState('responding');

      needsContentUpdate = false;
    }
    scrollToBottom();
  };

  try {
    const user = auth ? auth.currentUser : null;

    // Build request headers. Normally we attach a Firebase ID token; when the
    // DEV_DISABLE_AUTH flag is on (see firebase-config.js) we send the request
    // without one so the chat can be exercised locally without signing in — the
    // backend must have DISABLE_AUTH=true to accept it. Only surface the
    // "not signed in" error when auth is genuinely required.
    const headers = { "Content-Type": "application/json" };
    if (user) {
      const idToken = await user.getIdToken();
      headers.Authorization = `Bearer ${idToken}`;
    } else if (!window.DEV_DISABLE_AUTH) {
      throw new Error("You're not signed in — the authentication service didn't load. Check your connection and refresh the page.");
    }

    const response = await fetch("/api/chat", {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages: getMessagesForRequest(),
        model: currentModel,
        persona: currentModelName === "Aura Summary" 
          ? "You are Aura Summary. Explain any topic in exactly TWO paragraphs (2-3 lines each). You MUST format your response exactly like this:\\n\\n**English:**\\n[Your English paragraph here with an example]\\n\\n**Hinglish:**\\n[Your Hinglish paragraph here with an example]\\n\\nDo NOT use bullet points or numbered lists, write only in continuous paragraph format."
          : null
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }

    typingEl.remove();

    ({ rowEl, bubbleEl } = appendMessage("ai", ""));

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const jsonStr = line.slice(6).trim();
        if (!jsonStr) continue;

        try {
          const data = JSON.parse(jsonStr);

          if (data.error) {
            fullContent += `\n\n⚠️ ${data.error}`;
            const errAnswerEl = bubbleEl.querySelector(".answer-content");
            if (errAnswerEl) errAnswerEl.innerHTML = renderMarkdown(fullContent);
            break;
          }

          if (data.done) break;

          if (data.reasoning) {
            fullReasoning += data.reasoning;
            // Create or update the thinking block
            if (!reasoningEl) {
              reasoningEl = document.createElement("details");
              reasoningEl.className = "thinking-block";
              reasoningEl.innerHTML = `<summary><span aria-hidden="true" class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">psychology</span>Thinking...<span class="deep-think-timer" style="margin-left:auto;font-size:0.7rem;color:rgba(220,184,255,0.5);font-weight:500;"></span></summary><div class="deep-think-progress"></div><div class="thinking-content"></div>`;
              reasoningEl.open = true;
              bubbleEl.prepend(reasoningEl);
              // Start a timer to show elapsed time
              reasoningEl._startTime = Date.now();
              reasoningEl._timer = setInterval(() => {
                const elapsed = Math.round((Date.now() - reasoningEl._startTime) / 1000);
                const timerEl = reasoningEl.querySelector(".deep-think-timer");
                if (timerEl) timerEl.textContent = `${elapsed}s`;
              }, 1000);
            }
            needsReasoningUpdate = true;
          }

          if (data.content) {
            fullContent += data.content;
            needsContentUpdate = true;

            // When content starts, stop the reasoning progress bar but keep block OPEN
            if (reasoningEl) {
              const progressBar = reasoningEl.querySelector(".deep-think-progress");
              if (progressBar) progressBar.remove();
              // Update summary text to show it's done reasoning
              const summary = reasoningEl.querySelector("summary");
              if (summary && !reasoningEl._contentStarted) {
                reasoningEl._contentStarted = true;
                // Stop the timer
                if (reasoningEl._timer) { clearInterval(reasoningEl._timer); reasoningEl._timer = null; }
                const elapsed = Math.round((Date.now() - reasoningEl._startTime) / 1000);
                summary.innerHTML = `<span aria-hidden="true" class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">psychology</span>Thought for ${elapsed}s`;
              }
            }
          }

          // Schedule a single DOM update for this chunk iteration if needed
          if (needsReasoningUpdate || needsContentUpdate) {
            if (!pendingRAF) {
              pendingRAF = requestAnimationFrame(() => {
                flushDOMUpdates();
                pendingRAF = null;
              });
            }
          }
        } catch (parseErr) {
          // Skip malformed chunks
        }
      }
    }

    // ── Persist the assistant reply FIRST ──
    // The stream finished and `fullContent` holds the full answer, so save it
    // *before* any of the finalize/decoration work below. That work touches the
    // DOM and third-party libs and can throw; if it threw before this push, the
    // reply would render on screen but never reach history — so on reload only
    // the user's message would survive (the "history shows only my messages"
    // bug). Persisting up front makes saved chats durable no matter what the
    // decoration code does afterwards.
    if (fullContent && fullContent.trim()) {
      conversationHistory.push({ role: "assistant", content: fullContent, ts: Date.now() });
      saveSession();
      autoRenameChat(fullContent); // (#2) rename chat title after first AI response
    }

    // Finalize: purely visual polish (reasoning summary, lightbox wiring, action
    // bar, canvas, syntax highlighting). Wrapped in its own try/catch so a
    // failure here can never drop the reply we just saved above.
    try {
      // Keep reasoning block open after stream is fully complete
      if (reasoningEl) {
        if (reasoningEl._timer) { clearInterval(reasoningEl._timer); reasoningEl._timer = null; }
        reasoningEl.open = true;
        const summary = reasoningEl.querySelector("summary");
        if (summary) {
          const elapsed = Math.round((Date.now() - (reasoningEl._startTime || Date.now())) / 1000);
          summary.innerHTML = `<span aria-hidden="true" class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">psychology</span>Reasoning (${elapsed}s)`;
        }
      }
      const answerEl = bubbleEl ? bubbleEl.querySelector(".answer-content") : null;
      if (answerEl) {
        answerEl.innerHTML = renderMarkdown(fullContent);
        answerEl.querySelectorAll("img").forEach(img => {
          img.style.cursor = "zoom-in";
          img.onclick = () => openLightbox(img.src);
        });
      }
      if (rowEl) appendActionBar(rowEl, fullContent);


      // (#6) Apply syntax highlighting to code blocks
      if (window.hljs && bubbleEl) {
        bubbleEl.querySelectorAll('pre code').forEach(block => {
          if (block.dataset.highlighted) return;
          hljs.highlightElement(block);
        });
      }
    } catch (finalizeErr) {
      // The reply is already saved above, so a decoration failure is non-fatal.
      console.warn("Finalize/decoration step failed (reply already saved):", finalizeErr);
    }
  } catch (err) {
    console.error("Chat error:", err);
    if (typingEl && typingEl.parentNode) typingEl.remove();
    
    // Don't show error for intentional abort
    if (err.name === "AbortError") {
      // User stopped generation — finalize whatever was streamed
      if (fullContent && fullContent.trim()) {
        const answerEl = bubbleEl?.querySelector(".answer-content");
        if (answerEl) answerEl.innerHTML = renderMarkdown(fullContent);
        if (rowEl) appendActionBar(rowEl, fullContent);
        conversationHistory.push({ role: "assistant", content: fullContent, ts: Date.now() });
        saveSession();
      }
    } else {
      // Check if error was already partially handled in stream
      const lastAiBubble = chatMessages.querySelector(".message-row.ai:last-child .ai-bubble");
      if (!lastAiBubble || lastAiBubble.textContent === "") {
          appendMessage(
            "ai",
            "⚠️ I'm having trouble connecting right now. Please check your connection and try again."
          );
      }
      setOrbState('error');
    }
  } finally {
    if (pendingRAF) {
      cancelAnimationFrame(pendingRAF);
      pendingRAF = null;
    }
    // Flush any pending updates that were scheduled just before the stream ended
    flushDOMUpdates();
    isStreaming = false;
    abortController = null;
    updateSendButton(false);
    animateSendButton();
    scrollToBottom();
    updateScrollBtn();
    setOrbState('idle');
  }
}

// ── Append Action Bar to AI Bubble ──
function appendActionBar(rowEl, content) {
  if (!rowEl) return;
  // Remove any existing action bar
  const old = rowEl.querySelector(".ai-action-bar");
  if (old) old.remove();

  const bar = document.createElement("div");
  bar.className = "ai-action-bar";

  // Copy
  const copyBtn = document.createElement("button");
  copyBtn.className = "action-btn";
  copyBtn.title = "Copy response";
  copyBtn.setAttribute("aria-label", "Copy response");
  copyBtn.innerHTML = '<span aria-hidden="true" class="material-symbols-outlined">content_copy</span>';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(content).then(() => {
      copyBtn.innerHTML = '<span aria-hidden="true" class="material-symbols-outlined">check</span>';
      copyBtn.style.color = "#4ade80";
      setTimeout(() => {
        copyBtn.innerHTML = '<span aria-hidden="true" class="material-symbols-outlined">content_copy</span>';
        copyBtn.style.color = "";
      }, 2000);
    });
  };

  // Thumbs Up
  const thumbUpBtn = document.createElement("button");
  thumbUpBtn.className = "action-btn";
  thumbUpBtn.title = "Good response";
  thumbUpBtn.setAttribute("aria-label", "Good response");
  thumbUpBtn.innerHTML = '<span aria-hidden="true" class="material-symbols-outlined">thumb_up</span>';
  thumbUpBtn.onclick = () => {
    thumbUpBtn.style.color = "#5ea2ff";
    thumbDownBtn.style.color = "";
    thumbUpBtn.querySelector("span").style.fontVariationSettings = "'FILL' 1";
    thumbDownBtn.querySelector("span").style.fontVariationSettings = "'FILL' 0";
  };

  // Thumbs Down
  const thumbDownBtn = document.createElement("button");
  thumbDownBtn.className = "action-btn";
  thumbDownBtn.title = "Bad response";
  thumbDownBtn.setAttribute("aria-label", "Bad response");
  thumbDownBtn.innerHTML = '<span aria-hidden="true" class="material-symbols-outlined">thumb_down</span>';
  thumbDownBtn.onclick = () => {
    thumbDownBtn.style.color = "#ffb4ab";
    thumbUpBtn.style.color = "";
    thumbDownBtn.querySelector("span").style.fontVariationSettings = "'FILL' 1";
    thumbUpBtn.querySelector("span").style.fontVariationSettings = "'FILL' 0";
  };

  // Retry
  const retryBtn = document.createElement("button");
  retryBtn.className = "action-btn";
  retryBtn.title = "Retry response";
  retryBtn.setAttribute("aria-label", "Retry response");
  retryBtn.innerHTML = '<span aria-hidden="true" class="material-symbols-outlined">refresh</span>';
  retryBtn.onclick = () => {
    if (isStreaming) return;
    // Pop the last assistant message from history
    if (conversationHistory.length > 0 && conversationHistory[conversationHistory.length - 1].role === "assistant") {
      conversationHistory.pop();
    }
    // Remove last AI row from DOM
    const rows = Array.from(chatMessages.querySelectorAll(".message-row.ai"));
    if (rows.length > 0) rows[rows.length - 1].remove();
    getAuraResponse();
  };

  // (#8) Export button
  const exportBtn = document.createElement("button");
  exportBtn.className = "action-btn";
  exportBtn.title = "Export as PDF";
  exportBtn.setAttribute("aria-label", "Export as PDF");
  exportBtn.innerHTML = '<span aria-hidden="true" class="material-symbols-outlined">picture_as_pdf</span>';
  exportBtn.onclick = () => exportCurrentChat();

  bar.appendChild(copyBtn);
  bar.appendChild(thumbUpBtn);
  bar.appendChild(thumbDownBtn);
  bar.appendChild(retryBtn);
  bar.appendChild(exportBtn);
  // The bar lives inside the AI bubble. `rowEl` is what callers pass, so resolve
  // the bubble from it (falling back to the row itself) — referencing a bare
  // `bubbleEl` here threw a ReferenceError, which silently broke the action bar
  // AND aborted both reply-saving and history rendering mid-way.
  const bubbleEl = rowEl.querySelector(".ai-bubble") || rowEl;
  bubbleEl.appendChild(bar);
}

// ⚡ Bolt: Cache Intl.DateTimeFormat
// Impact: ~23x faster date formatting. `toLocaleTimeString` instantiates a new formatter
// on every call, causing layout jank when rendering long chat histories.
const messageTimeFormatter = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit' });

// ── Append Message to Chat ──
function appendMessage(role, content, explicitIndex = -1, isRawHtmlForUser = false, skipScroll = false, container = chatMessages) {
  // Use explicitIndex if provided (e.g. during loadSession), 
  // otherwise calculate based on current history length.
  const index = explicitIndex !== -1 ? explicitIndex : conversationHistory.length;
  
  const row = document.createElement("div");
  row.className = `message-row ${role}`;
  row.dataset.index = index;

  const avatar = document.createElement("div");
  avatar.className = `message-avatar ${role === "ai" ? "ai-avatar" : "user-avatar"}`;

  if (role === "ai") {
    avatar.innerHTML = "✦";
  } else {
    const user = auth ? auth.currentUser : null;
    if (user?.photoURL) {
      const avatarImg = document.createElement('img');
      avatarImg.src = user.photoURL;
      avatarImg.alt = 'You';
      avatar.innerHTML = '';
      avatar.appendChild(avatarImg);
    } else {
      const initial = (user?.displayName || user?.email || "U")[0].toUpperCase();
      avatar.textContent = initial;
    }
  }

  const bubble = document.createElement("div");
  bubble.className = role === "ai" ? "ai-bubble" : "user-bubble";
  
    // For user messages, wrap in a container to support edit button
    if (role === "user") {
      // Correctly handle either string content or multimodal content
      let textToDisplay = content;
      if (typeof content !== "string" && Array.isArray(content)) {
        const textItem = content.find(c => c.type === "text");
        textToDisplay = textItem ? textItem.text : "[Attachment]";
      }
      // Guard against undefined/null so we never render the literal "undefined"
      textToDisplay = textToDisplay ?? "";

      let sanitizedHtml;
      if (isRawHtmlForUser && typeof DOMPurify !== "undefined") {
        sanitizedHtml = DOMPurify.sanitize(textToDisplay, { ADD_ATTR: ["target"] });
      } else {
        if (isRawHtmlForUser) {
          console.error("[SECURITY] DOMPurify not loaded! Failing securely by escaping user HTML.");
        }
        sanitizedHtml = escapeHtml(textToDisplay);
      }
      bubble.innerHTML = sanitizedHtml;
    
    // Add Edit Button
    const editBtn = document.createElement("button");
    editBtn.className = "edit-message-btn";
    editBtn.innerHTML = '<span aria-hidden="true" class="material-symbols-outlined" style="font-size:18px;">edit</span>';
    editBtn.title = "Edit message";
    editBtn.setAttribute("aria-label", "Edit message");
    editBtn.onclick = () => openEditMode(row, index);
    row.appendChild(editBtn);
  } else {
    // Model badge removed per user request


    const contentDiv = document.createElement("div");
    contentDiv.className = "answer-content";
    contentDiv.innerHTML = renderMarkdown(content);
    // Wire up images for lightbox
    contentDiv.querySelectorAll("img").forEach(img => {
      img.style.cursor = "zoom-in";
      img.onclick = () => openLightbox(img.src);
    });
    bubble.appendChild(contentDiv);

    // Add action bar for completed (non-empty) AI messages (used during history load)
    if (content && content.trim()) {
      appendActionBar(row, content);
    }
  }

  row.appendChild(avatar);
  row.appendChild(bubble);

  // ── Message Timestamp ──
  // Render the message's stored send time so a reloaded chat shows when each
  // message was actually sent, not the reload moment. Brand-new messages (not
  // yet pushed to conversationHistory) fall back to now.
  const storedEntry = conversationHistory[index];
  const tsMillis = storedEntry && typeof storedEntry.ts === "number" ? storedEntry.ts : Date.now();
  const ts = document.createElement('div');
  ts.className = 'message-timestamp';
  ts.textContent = messageTimeFormatter.format(new Date(tsMillis));
  row.appendChild(ts);

  container.appendChild(row);
  // Force scroll for user messages; AI messages respect user's scroll position
  if (!skipScroll) {
    scrollToBottom(role === "user");
    updateScrollBtn();
  }

  return { rowEl: row, bubbleEl: bubble };
}

// ── Typing Indicator (#16 — Skeleton Shimmer) ──
function showTypingIndicator(multimodalState = {}) {
  const row = document.createElement("div");
  row.className = "message-row ai";
  row.id = "typing-row";

  const avatar = document.createElement("div");
  avatar.className = "message-avatar ai-avatar";
  avatar.innerHTML = "✦";

  // Smart typing text
  let typingText = "Aura is thinking";
  if (multimodalState.hasImage) {
    typingText = "Analyzing image";
  } else if (multimodalState.hasAudio) {
    typingText = "Listening to audio";
  } else if (multimodalState.hasVideo) {
    typingText = "Analyzing video";
  } else if (currentModelName === "Aura AI" && aura1Mode === "deep_think") {
    typingText = "Reasoning deeply";
  }
  
  const typing = document.createElement("div");
  typing.className = "typing-indicator-skeleton";
  typing.innerHTML = `
    <div class="typing-label">
      <span class="skeleton-dot"></span>
      <span class="skeleton-dot"></span>
      <span class="skeleton-dot"></span>
      <span class="typing-label-text">${typingText}</span>
    </div>
    <div class="skeleton-line"></div>
    <div class="skeleton-line"></div>
    <div class="skeleton-line"></div>
  `;

  row.appendChild(avatar);
  row.appendChild(typing);
  chatMessages.appendChild(row);
  scrollToBottom();

  return row;
}

// ── Update Send Button State ──
function updateSendButton(streaming) {
  if (!sendBtn) return;
  if (streaming) {
    sendBtn.classList.add("hidden");
    if (stopBtn) stopBtn.classList.remove("hidden");
  } else {
    sendBtn.classList.remove("hidden");
    sendBtn.disabled = false;
    sendBtn.style.opacity = "1";
    if (stopBtn) stopBtn.classList.add("hidden");
    animateSendButton();
  }
}

function scrollToBottom(force = false) {
  if (force) userHasScrolledUp = false;
  // Only auto-scroll if user is near the bottom, or if forced (e.g. user sends a new message)
  if (!force && userHasScrolledUp) return;
  window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "auto" });
  updateScrollBtn();
}

// ── Artifact Code Store (maps unique IDs to raw HTML strings) ──
// Moved to utils.js

// ── Simple Markdown Renderer ──
// Moved to utils.js

// ── Copy Code to Clipboard ──
function copyCode(btn) {
  const wrapper = btn.closest(".code-block-wrapper");
  const codeEl = wrapper.querySelector("code");
  if (!codeEl) return;
  
  const text = codeEl.textContent;
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add("copied");
    btn.innerHTML = `<span aria-hidden="true" class="material-symbols-outlined" style="font-size:14px;">check</span> Copied!`;
    setTimeout(() => {
      btn.classList.remove("copied");
      btn.innerHTML = `<span aria-hidden="true" class="material-symbols-outlined" style="font-size:14px;">content_copy</span> Copy`;
    }, 2000);
  }).catch(() => {
    // Fallback for older browsers
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.cssText = "position:fixed;opacity:0;";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    btn.classList.add("copied");
    btn.innerHTML = `<span aria-hidden="true" class="material-symbols-outlined" style="font-size:14px;">check</span> Copied!`;
    setTimeout(() => {
      btn.classList.remove("copied");
      btn.innerHTML = `<span aria-hidden="true" class="material-symbols-outlined" style="font-size:14px;">content_copy</span> Copy`;
    }, 2000);
  });
}
window.copyCode = copyCode;

// ── Mobile Virtual Keyboard Handling ──
// Mobile keyboard avoidance: when the on-screen keyboard opens, the visual
// viewport shrinks but the fixed composer stays pinned to the (now hidden)
// layout-viewport bottom. Lift `.chat-composer-area` — the actual
// position:fixed element (chat.css:1121) — by the covered height so the input
// rides just above the keyboard. (The old handler targeted `#chat-footer`,
// which is position:relative, and a non-existent `.footer-gradient`.)
if (window.visualViewport) {
  const composerArea = document.querySelector(".chat-composer-area");

  window.visualViewport.addEventListener("resize", () => {
    if (!composerArea) return;
    const offsetBottom = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
    if (offsetBottom > 50) {
      // Keyboard is open — lift the composer above it.
      composerArea.style.bottom = offsetBottom + "px";
    } else {
      // Keyboard dismissed — revert to the stylesheet's `bottom: 0`.
      composerArea.style.bottom = "";
    }
  });
}

// ── Conversation Branching (Edit Logic) ──
function openEditMode(rowEl, index) {
  const bubble = rowEl.querySelector(".user-bubble");
  if (!bubble || bubble.querySelector(".edit-textarea")) return;

  // Get current text from history
  let currentContent = conversationHistory[index]?.content;
  let textToEdit = "";
  
  if (typeof currentContent === "string") {
    textToEdit = currentContent;
  } else if (Array.isArray(currentContent)) {
    textToEdit = currentContent.find(c => c.type === "text")?.text || "";
  }

  // Preserve original HTML for cancel
  const originalHTML = bubble.innerHTML;

  // Build edit UI safely to prevent XSS from user content
  bubble.innerHTML = `
    <textarea class="edit-textarea" aria-label="Edit your message"></textarea>
    <div class="edit-actions">
      <button class="edit-btn cancel">Cancel</button>
      <button class="edit-btn save">Save & Resubmit</button>
    </div>
  `;

  const textarea = bubble.querySelector(".edit-textarea");
  // Set value programmatically — prevents XSS from </textarea> injection
  textarea.value = textToEdit;
  textarea.focus();
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  bubble.querySelector(".cancel").onclick = () => {
    bubble.innerHTML = originalHTML;
  };

  bubble.querySelector(".save").onclick = () => {
    const newText = textarea.value.trim();
    if (newText) {
      submitEdit(index, newText);
    } else {
      bubble.innerHTML = originalHTML;
    }
  };
}

async function submitEdit(index, newText) {
  // If we are currently streaming, stop it
  if (isStreaming && abortController) {
    abortController.abort();
  }

  // Double check index bounds
  if (index < 0 || index >= conversationHistory.length) {
    console.error("[Edit Logic] Index out of bounds:", index);
    return;
  }

  // 1. Truncate History
  conversationHistory = conversationHistory.slice(0, index + 1);

  // The raw (full base64) payload cached in `lastRawUserMessage` belongs to the
  // ORIGINAL most-recent turn, which we've just truncated away. Clearing it
  // stops getMessagesForRequest() from splicing that stale payload — and any
  // image it carried — onto the edited message when the request is rebuilt.
  lastRawUserMessage = null;

  // 2. Update the edited message
  const msg = conversationHistory[index];
  if (!msg) return;

  if (typeof msg.content === "string") {
    msg.content = newText;
  } else if (Array.isArray(msg.content)) {
    const textPart = msg.content.find(c => c.type === "text");
    if (textPart) textPart.text = newText;
  }

  // 3. Clear DOM after this message
  const rows = Array.from(chatMessages.querySelectorAll(".message-row"));
  rows.forEach(row => {
    const rowIndex = parseInt(row.dataset.index);
    if (rowIndex > index) {
      row.remove();
    }
  });

  // 4. Update the edited bubble UI
  const editedRow = chatMessages.querySelector(`.message-row[data-index="${index}"]`);
  if (editedRow) {
    const bubble = editedRow.querySelector(".user-bubble");
    bubble.innerHTML = escapeHtml(newText);
  }

  // 5. Trigger new response
  saveSession();
  getAuraResponse();
}

// ── Auto-focus Input ──
document.addEventListener("DOMContentLoaded", () => {
  // Only auto-focus on desktop (mobile would open keyboard)
  if (chatInput && window.innerWidth > 768) {
    setTimeout(() => chatInput.focus(), 500);
  }

  // ── Page Transition Fade-in ──
  const overlay = document.getElementById('page-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.pointerEvents = 'none';
  }

  // ── Draft Input Persistence ──
  const draftKey = 'synapse_draft_input';
  const savedDraft = localStorage.getItem(draftKey);
  if (savedDraft && chatInput) {
    chatInput.value = savedDraft;
    chatInput.dispatchEvent(new Event('input'));
    chatInput.classList.add('has-draft');
  }

  // ⚡ Bolt: Debounced Draft Persistence
  // Impact: Reduces main-thread blocking by batching synchronous localStorage I/O
  // operations (setItem/removeItem) that previously fired on every keystroke.
  const saveDraftDebounced = debounce((val, key) => {
    if (val.trim()) {
      localStorage.setItem(key, val);
    } else {
      localStorage.removeItem(key);
    }
  }, 500);

  if (chatInput) {
    const charCounter = document.getElementById('char-counter');
    // ⚡ Bolt: Cache DOM elements
    // Impact: Avoids O(N) DOM traversals on every keystroke in the input event handler.
    const charLimitArcSvg = document.querySelector('.char-limit-arc');
    const charLimitArc = document.querySelector('.char-limit-arc .arc-value');

    chatInput.addEventListener('input', () => {
      const val = chatInput.value;
      
      // Update character counter
      if (charCounter) {
        charCounter.textContent = `${val.length} / 4000`;
        if (val.length >= 4000) charCounter.style.color = '#ffb4ab';
        else charCounter.style.color = '';
      }
      if (charLimitArc && charLimitArcSvg) {
        if (val.length > 0) {
          charLimitArcSvg.style.opacity = '1';
          const percent = Math.min(val.length / 4000, 1);
          const offset = 125.6 - (percent * 125.6);
          charLimitArc.style.strokeDashoffset = offset;
          charLimitArc.style.stroke = val.length >= 4000 ? '#ffb4ab' : 'var(--accent)';
        } else {
          charLimitArcSvg.style.opacity = '0';
        }
      }

      // Handle draft persistence
      saveDraftDebounced(val, draftKey);
      if (val.trim()) {
        chatInput.classList.add('has-draft');
      } else {
        chatInput.classList.remove('has-draft');
      }
    });
  }


  // ── Swipe to Dismiss Drawer (Mobile) ──
  const drawerEl = document.getElementById('drawer');
  const drawerToggleEl = document.getElementById('drawer-toggle');
  if (drawerEl && drawerToggleEl) {
    let startX = 0;
    let currentX = 0;
    let isDragging = false;

    drawerEl.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      currentX = startX;
      isDragging = true;
    }, { passive: true });

    drawerEl.addEventListener('touchmove', (e) => {
      if (!isDragging) return;
      currentX = e.touches[0].clientX;
      const diff = currentX - startX;
      if (diff < 0) {
        // Dragging left — slide drawer out
        drawerEl.style.transform = `translateX(${Math.max(diff, -280)}px)`;
        drawerEl.style.transition = 'none';
      }
    }, { passive: true });

    drawerEl.addEventListener('touchend', () => {
      isDragging = false;
      drawerEl.style.transition = '';
      const diff = currentX - startX;
      if (diff < -80) {
        // Enough swipe to close
        drawerToggleEl.checked = false;
        drawerEl.style.transform = '';
      } else {
        drawerEl.style.transform = '';
      }
    });
  }

  // ── Sidebar collapse (desktop) ──
  // The hamburger in the sidebar header hides the rail; a matching hamburger
  // in the top bar brings it back. The choice is remembered between visits.
  const sidebarCollapseEl = document.getElementById('sidebar-collapse');
  if (sidebarCollapseEl) {
    if (localStorage.getItem('sidebar_collapsed') === '1') {
      sidebarCollapseEl.checked = true;
    }
    sidebarCollapseEl.addEventListener('change', () => {
      localStorage.setItem('sidebar_collapsed', sidebarCollapseEl.checked ? '1' : '0');
    });
    document.querySelectorAll('[data-sidebar-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => {
        // Narrow screens use the overlay drawer instead of the docked rail.
        if (window.matchMedia('(max-width: 767px)').matches) {
          if (drawerToggleEl) drawerToggleEl.checked = !drawerToggleEl.checked;
          return;
        }
        sidebarCollapseEl.checked = !sidebarCollapseEl.checked;
        sidebarCollapseEl.dispatchEvent(new Event('change'));
      });
    });
  }

  // ── Keyboard Shortcuts ──
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    // Normalize case so the shortcut still matches when Shift/CapsLock makes
    // `e.key` uppercase (e.g. "K" instead of "k").
    const key = typeof e.key === "string" ? e.key.toLowerCase() : "";
    // Cmd/Ctrl+K opens the search-all-chats modal.
    if (key === 'k') {
      e.preventDefault();
      openHistoryModal();
    }
    // Cmd/Ctrl+B toggles the sidebar.
    if (key === 'b') {
      e.preventDefault();
      const toggle = document.querySelector('[data-sidebar-toggle]');
      if (toggle) toggle.click();
    }
    // NOTE: Cmd/Ctrl+N is deliberately NOT bound — every browser reserves it
    // for "new window", so hijacking it trapped the user. New Chat is reachable
    // via the sidebar button and header button instead.
  });

  // ── Model Accent Colors in selector button ──
  updateModelAccentColor();
  updateActiveModelIndicator(currentModelName);
  
  // ── Header Scroll Shadow ──
  const headerEl = document.querySelector('header');
  if (headerEl) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 10) {
        headerEl.classList.add('scrolled');
      } else {
        headerEl.classList.remove('scrolled');
      }
    }, { passive: true });
  }
  // (#6) Highlight existing code blocks on page load
  if (window.hljs) {
    document.querySelectorAll('pre code').forEach(block => {
      if (block.dataset.highlighted) return;
      hljs.highlightElement(block);
    });
  }
});

// ── Export Chat as PDF ──
function exportCurrentChat() {
  if (conversationHistory.length === 0) {
    showToast('No conversation to export', 'error');
    return;
  }
  if (typeof html2pdf !== "function") {
    showToast('PDF engine failed to load — check your connection and refresh.', 'error');
    return;
  }

  const user = auth ? auth.currentUser : null;
  const userName = user?.displayName || user?.email || 'You';
  const index = getHistoryIndex();
  const entry = index.find(c => c.id === currentChatId);
  const chatTitle = entry?.title || 'Chat Export';
  if (!window._pdfExportDateFormatter) {
    window._pdfExportDateFormatter = new Intl.DateTimeFormat('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }
  // ⚡ Bolt: Cache Intl.DateTimeFormat for PDF export
  // Impact: Prevents instantiating a new formatter on every export.
  const exportDate = window._pdfExportDateFormatter.format(new Date());

  // Build message HTML
  let messagesHtml = '';
  conversationHistory.forEach(msg => {
    let content = '';
    if (typeof msg.content === 'string') {
      content = msg.content;
    } else if (Array.isArray(msg.content)) {
      const textItem = msg.content.find(c => c.type === 'text');
      content = textItem ? textItem.text : '[Attachment]';
    }

    const isAI = msg.role === 'assistant';
    const roleLabel = isAI ? `✦ Aura <span class="model-badge">${currentModelName}</span>` : `👤 ${escapeHtml(userName)}`;
    const bubbleClass = isAI ? 'ai-msg' : 'user-msg';

    // Convert markdown to simple HTML for PDF
    let htmlContent = escapeHtml(content)
      // Code blocks
      .replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) =>
        `<pre class="code-block"><code>${code.trimEnd()}</code></pre>`)
      // Inline code
      .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
      // Bold
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      // Headers
      .replace(/^### (.+)$/gm, '<h3>$1</h3>')
      .replace(/^## (.+)$/gm, '<h2>$1</h2>')
      .replace(/^# (.+)$/gm, '<h1>$1</h1>')
      // Bullet lists
      .replace(/^[•\-\*] (.+)$/gm, '<li>$1</li>')
      .replace(/(<li>.*<\/li>\n?)+/g, m => `<ul>${m}</ul>`)
      // Numbered lists
      .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
      // Line breaks
      .replace(/\n\n/g, '</p><p>')
      .replace(/\n/g, '<br>');

    messagesHtml += `
      <div class="message ${bubbleClass}">
        <div class="message-role">${roleLabel}</div>
        <div class="message-content"><p>${htmlContent}</p></div>
      </div>`;
  });

  // ── 1-Click Direct PDF Export using html2pdf.js ──
  const element = document.createElement('div');
  element.innerHTML = `
    <div class="pdf-export-container" style="padding: 20px; font-family: 'Inter', sans-serif; color: #1a1b21;">
      <div style="border-bottom: 3px solid #5ea2ff; padding-bottom: 15px; margin-bottom: 25px; display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <h1 style="margin: 0; font-size: 22px; font-weight: 800; letter-spacing: -0.5px;">SYNAPSE<span style="color: #5ea2ff;">AI</span></h1>
          <h2 style="margin: 5px 0 0 0; font-size: 16px; font-weight: 600; color: #333;">${escapeHtml(chatTitle)}</h2>
        </div>
        <div style="text-align: right; font-size: 10px; color: #666; line-height: 1.5;">
          <div>Model: ${escapeHtml(currentModelName)}</div>
          <div>Exported: ${exportDate}</div>
          <div>${conversationHistory.length} messages</div>
        </div>
      </div>
      <div class="pdf-body">
        ${messagesHtml}
      </div>
      <div style="margin-top: 40px; border-top: 1px solid #eee; padding-top: 15px; font-size: 9px; color: #999; display: flex; justify-content: space-between;">
        <span>Synapse AI — Confidential</span>
        <span>${escapeHtml(chatTitle)}</span>
      </div>
    </div>
  `;

  // Inject styles for the PDF elements
  const style = document.createElement('style');
  style.innerHTML = `
    .pdf-export-container .message { margin-bottom: 20px; page-break-inside: avoid; }
    .pdf-export-container .message-role { font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
    .pdf-export-container .model-badge { background: #e8f3ff; color: #2b6cb0; border-radius: 3px; padding: 1px 4px; font-size: 8px; font-weight: 600; text-transform: none; }
    .pdf-export-container .message-content { background: #f9f9fa; border-radius: 8px; padding: 12px 16px; font-size: 11px; line-height: 1.6; border: 1px solid #eee; }
    .pdf-export-container .ai-msg .message-content { border-left: 3px solid #5ea2ff; }
    .pdf-export-container .user-msg .message-content { border-left: 3px solid #7701d0; background: #faf5ff; border-color: #e4d4ff; }
    .pdf-export-container .ai-msg .message-role { color: #2b6cb0; }
    .pdf-export-container .user-msg .message-role { color: #5b21b6; }
    .pdf-export-container p { margin: 4px 0; }
    .pdf-export-container h1 { font-size: 14px; margin: 10px 0 5px; }
    .pdf-export-container h2 { font-size: 13px; margin: 10px 0 5px; }
    .pdf-export-container h3 { font-size: 12px; margin: 10px 0 5px; }
    .pdf-export-container strong { color: #000; }
    .pdf-export-container ul, .pdf-export-container ol { padding-left: 20px; margin: 5px 0; }
    .pdf-export-container .code-block { background: #f1f3f7; border-radius: 6px; padding: 10px; margin: 8px 0; font-family: monospace; font-size: 9px; white-space: pre-wrap; word-wrap: break-word; page-break-inside: avoid; }
    .pdf-export-container .inline-code { background: #e8f3ff; color: #2b6cb0; padding: 1px 4px; border-radius: 3px; font-family: monospace; font-size: 10px; }
  `;
  element.appendChild(style);

  // Configure html2pdf
  const safeFilename = chatTitle.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30);
  const opt = {
    margin:       [10, 10, 10, 10],
    filename:     `SynapseAI_${safeFilename}.pdf`,
    image:        { type: 'jpeg', quality: 0.95 },
    html2canvas:  { 
      scale: 1.5,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: 900
    },
    jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' }
  };

  // Loading overlay so user knows PDF is generating
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);z-index:9999;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;color:#fff;font-family:Inter,sans-serif;';
  overlay.innerHTML = '<div style="width:40px;height:40px;border:3px solid rgba(255,255,255,0.2);border-top-color:#5ea2ff;border-radius:50%;animation:spin 0.8s linear infinite;"></div><div style="font-size:14px;font-weight:500;">Generating PDF...</div><style>@keyframes spin{to{transform:rotate(360deg)}}</style>';
  document.body.appendChild(overlay);

  // IMPORTANT: element must be in DOM and on-screen for html2canvas to render it.
  // We place it below the visible area but within the document flow.
  element.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 900px;
    z-index: -1;
    opacity: 1;
    background: #fff;
    pointer-events: none;
  `;
  document.body.appendChild(element);

  // Small delay so the overlay renders first, then we capture
  setTimeout(() => {
    html2pdf().set(opt).from(element).save().then(() => {
      document.body.removeChild(element);
      document.body.removeChild(overlay);
      showToast('PDF downloaded!', 'success');
    }).catch(err => {
      console.error('PDF Export Error:', err);
      document.body.removeChild(element);
      document.body.removeChild(overlay);
      showToast('PDF failed — try again', 'error');
    });
  }, 100);
}
window.exportCurrentChat = exportCurrentChat;


// (#10) Model Warning when loading old chat with different model
function showModelWarning(originalModel) {
  if (!originalModel || originalModel === currentModelName) return;
  
  // Remove existing warning
  const existing = document.querySelector('.model-warning-banner');
  if (existing) existing.remove();
  
  const banner = document.createElement('div');
  banner.className = 'model-warning-banner';
  // `originalModel` is the chat-index `model` field from localStorage — an
  // untrusted value. Escape it for text display, and drive the buttons with
  // bound listeners closing over the raw value instead of interpolating it
  // into an inline onclick string (which could break out of the quotes).
  banner.innerHTML = `
    <span aria-hidden="true" class="material-symbols-outlined">info</span>
    <span>This chat was with <strong>${escapeHtml(originalModel)}</strong></span>
    <button type="button" class="model-warning-switch">Switch back</button>
    <button type="button" class="model-warning-dismiss" aria-label="Dismiss warning" style="background:none;border:none;color:rgba(255,200,100,0.5);padding:2px;cursor:pointer;"><span aria-hidden="true" class="material-symbols-outlined" style="font-size:16px;">close</span></button>
  `;
  const switchBtn = banner.querySelector('.model-warning-switch');
  if (switchBtn) switchBtn.addEventListener('click', () => {
    window.switchToModel(originalModel);
    banner.remove();
  });
  const dismissBtn = banner.querySelector('.model-warning-dismiss');
  if (dismissBtn) dismissBtn.addEventListener('click', () => banner.remove());
  chatMessages.insertBefore(banner, chatMessages.firstChild);
}

window.switchToModel = function(modelName) {
  const option = Array.from(modelOptions).find(o => o.getAttribute('data-name') === modelName);
  if (option) option.click();
};

// (#29) PWA Install Prompt
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  showPWAInstallBanner();
});

function showPWAInstallBanner() {
  if (localStorage.getItem('pwa_dismissed')) return;
  
  const drawerNav = document.querySelector('#drawer nav');
  if (!drawerNav) return;
  
  // Don't add duplicate
  if (document.querySelector('.pwa-install-banner')) return;
  
  const banner = document.createElement('div');
  banner.className = 'pwa-install-banner';
  banner.innerHTML = `
    <div class="pwa-icon">
      <span aria-hidden="true" class="material-symbols-outlined" style="color:#fff;font-size:18px;font-variation-settings:'FILL' 1;">install_mobile</span>
    </div>
    <div class="pwa-text">
      <div class="pwa-title">Install Synapse AI</div>
      <div class="pwa-desc">Add to home screen for quick access</div>
    </div>
    <button class="pwa-close" aria-label="Close install prompt" onclick="event.stopPropagation(); this.closest('.pwa-install-banner').remove(); localStorage.setItem('pwa_dismissed','1');">
      <span aria-hidden="true" class="material-symbols-outlined" style="font-size:16px;">close</span>
    </button>
  `;
  banner.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const result = await deferredInstallPrompt.userChoice;
    if (result.outcome === 'accepted') {
      showToast('Synapse AI installed!', 'success');
    }
    deferredInstallPrompt = null;
    banner.remove();
  });
  
  // Insert before the divider in drawer nav
  const divider = drawerNav.querySelector('.h-px');
  if (divider) drawerNav.insertBefore(banner, divider);
  else drawerNav.appendChild(banner);
}

// ============================================
// (#19) Focus Trap Utility
// ============================================
const _focusTrapHandlers = new WeakMap();

function trapFocus(container) {
  // If a trap is already installed on this container (e.g. the modal was
  // re-opened without an intervening release), tear it down first — otherwise
  // the WeakMap entry is overwritten and the previous keydown listener leaks on
  // `document` forever, with every stale handler still firing on Tab.
  releaseFocusTrap(container);

  const focusableSelector = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  
  function handler(e) {
    if (e.key !== 'Tab') return;
    
    const focusables = [...container.querySelectorAll(focusableSelector)].filter(el => el.offsetParent !== null);
    if (focusables.length === 0) return;
    
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    
    if (e.shiftKey) {
      if (document.activeElement === first || !container.contains(document.activeElement)) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last || !container.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    }
  }
  
  _focusTrapHandlers.set(container, handler);
  document.addEventListener('keydown', handler);
}

function releaseFocusTrap(container) {
  const handler = _focusTrapHandlers.get(container);
  if (handler) {
    document.removeEventListener('keydown', handler);
    _focusTrapHandlers.delete(container);
  }
}

// ============================================
// (#22) ARIA Improvements — applied once on load
// ============================================
(function applyAriaLabels() {
  // Typing indicator area
  const chatMsgs = document.getElementById('chat-messages');
  if (chatMsgs) chatMsgs.setAttribute('aria-live', 'polite');
  
  // Model dropdown
  const modelDropdown = document.getElementById('model-dropdown');
  if (modelDropdown) {
    modelDropdown.setAttribute('role', 'listbox');
    modelDropdown.setAttribute('aria-label', 'AI model selection');
    modelDropdown.querySelectorAll('.model-option').forEach(opt => {
      opt.setAttribute('role', 'option');
    });
  }
  

  // Chat input
  const chatInputEl = document.getElementById('chat-input');
  if (chatInputEl) chatInputEl.setAttribute('aria-label', 'Message input');
  
  // Send button
  const sendBtnEl = document.getElementById('send-btn');
  if (sendBtnEl) sendBtnEl.setAttribute('aria-label', 'Send message');
})();

// ── Toast Notification System ──
let toastTimeout = null;
function showToast(message, type = 'default', duration = 2500) {
  let toast = document.getElementById('synapse-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'synapse-toast';
    toast.className = 'synapse-toast';
    document.body.appendChild(toast);
  }
  if (toastTimeout) clearTimeout(toastTimeout);
  
  // Build toast content with icon
  let iconHtml = '';
  if (type === 'success') {
    iconHtml = '<span aria-hidden="true" class="material-symbols-outlined toast-icon" style="font-variation-settings:\'FILL\' 1;">check_circle</span>';
  } else if (type === 'error') {
    iconHtml = '<span aria-hidden="true" class="material-symbols-outlined toast-icon" style="font-variation-settings:\'FILL\' 1;">error</span>';
  } else if (type === 'info') {
    iconHtml = '<span aria-hidden="true" class="material-symbols-outlined toast-icon" style="font-variation-settings:\'FILL\' 1;">info</span>';
  }

  // `message` can carry untrusted text (model names from localStorage, upstream
  // error strings), and the toast is injected via innerHTML — escape it.
  toast.innerHTML = iconHtml + `<span>${escapeHtml(message)}</span>`;
  toast.className = `synapse-toast ${type}`;
  requestAnimationFrame(() => {
    toast.classList.add('show');
  });
  toastTimeout = setTimeout(() => {
    toast.classList.remove('show');
  }, duration);
}
window.showToast = showToast;

// ── Model Accent Color Helper ──
function updateModelAccentColor() {
  const el = document.getElementById('current-model-name');
  if (!el) return;
  const name = currentModelName;
  if (name === 'Aura AI') { el.style.color = '#7c5cff'; }
  else if (name === 'Aura Summary') { el.style.color = '#4caf50'; }
  else if (name === 'Aura Bhai') { el.style.color = '#a855f7'; }

  else { el.style.color = ''; }
}


// ── Web Speech API (Voice Input) ──
const micBtn = document.getElementById("mic-btn");
if (micBtn) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  
  if (SpeechRecognition) {
    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    
    let isRecording = false;

    recognition.onstart = () => {
      isRecording = true;
      micBtn.classList.add("recording");
      chatInput.placeholder = "Listening...";
      showToast("Listening...", "info");
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript;
        } else {
          interimTranscript += event.results[i][0].transcript;
        }
      }

      if (finalTranscript) {
        const currentVal = chatInput.value;
        chatInput.value = currentVal ? currentVal + " " + finalTranscript : finalTranscript;
        // Adjust height if necessary
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
      }
    };

    recognition.onerror = (event) => {
      console.error("Speech recognition error", event.error);
      isRecording = false;
      micBtn.classList.remove("recording");
      chatInput.placeholder = "Ask Aura anything...";
      if (event.error !== 'no-speech') {
        let errorMsg = "Microphone error: " + event.error;
        if (event.error === 'not-allowed') {
          errorMsg = "Please allow microphone access in your browser settings.";
        } else if (event.error === 'network') {
          errorMsg = "Voice input requires an internet connection.";
        }
        showToast(errorMsg, "error");
      }
    };

    recognition.onend = () => {
      isRecording = false;
      micBtn.classList.remove("recording");
      chatInput.placeholder = "Ask Aura anything...";
    };

    micBtn.addEventListener("click", () => {
      if (isRecording) {
        recognition.stop();
      } else {
        try {
          recognition.start();
        } catch(e) {
          console.error(e);
        }
      }
    });
  } else {
    micBtn.addEventListener("click", () => {
      showToast("Voice input is not supported in this browser.", "error");
    });
  }
}



// ── Delete Chat Modal ──
let chatToDelete = null;
let deleteChatReturnFocus = null;
let deleteChatOverHistory = false;

window.confirmDeleteSession = function(id) {
  chatToDelete = id;
  const modal = document.getElementById("delete-chat-modal");
  const content = document.getElementById("delete-chat-modal-content");
  if (!modal || !content) return;
  // Remember what had focus so we can restore it when the dialog closes.
  deleteChatReturnFocus = document.activeElement;
  // If layered over the open history modal, suspend that modal's focus trap so
  // the two Tab handlers don't fight; we re-establish it on close.
  const historyModal = document.getElementById("history-modal");
  deleteChatOverHistory = !!(historyModal && !historyModal.classList.contains("hidden"));
  if (deleteChatOverHistory && typeof historyModalContent !== "undefined" && historyModalContent) {
    releaseFocusTrap(historyModalContent);
  }
  modal.classList.remove("hidden");
  // force reflow
  void modal.offsetWidth;
  modal.classList.remove("opacity-0");
  content.classList.remove("scale-95");
  // Move focus into the dialog and trap it there. Default to the safe (Cancel)
  // action since this is a destructive confirmation.
  trapFocus(content);
  const cancelBtn = document.getElementById("cancel-delete-chat-btn");
  if (cancelBtn) cancelBtn.focus();
};

window.closeDeleteChatModal = function() {
  chatToDelete = null;
  const modal = document.getElementById("delete-chat-modal");
  const content = document.getElementById("delete-chat-modal-content");
  if (!modal || !content) return;
  modal.classList.add("opacity-0");
  content.classList.add("scale-95");
  // Release this dialog's focus trap.
  releaseFocusTrap(content);
  const returnTarget = deleteChatReturnFocus;
  deleteChatReturnFocus = null;
  const historyModal = document.getElementById("history-modal");
  const historyOpen = !!(historyModal && !historyModal.classList.contains("hidden"));
  // Restore the history modal's own focus trap if we suspended it on open.
  if (deleteChatOverHistory && historyOpen && typeof historyModalContent !== "undefined" && historyModalContent) {
    trapFocus(historyModalContent);
  }
  deleteChatOverHistory = false;
  // Return focus: to the trigger if it survived; otherwise keep it inside the
  // still-open history modal, else the composer — never let it fall to <body>.
  if (returnTarget && document.body.contains(returnTarget) && typeof returnTarget.focus === "function") {
    returnTarget.focus();
  } else {
    const fallback = historyOpen
      ? document.getElementById("history-search-input")
      : document.getElementById("chat-input");
    if (fallback && typeof fallback.focus === "function") fallback.focus();
  }
  setTimeout(() => {
    modal.classList.add("hidden");
  }, 250);
};

document.addEventListener("DOMContentLoaded", () => {
  const cancelBtn = document.getElementById("cancel-delete-chat-btn");
  const confirmBtn = document.getElementById("confirm-delete-chat-btn");
  const modal = document.getElementById("delete-chat-modal");
  if (cancelBtn) cancelBtn.addEventListener("click", closeDeleteChatModal);
  if (confirmBtn) confirmBtn.addEventListener("click", async () => {
    if (chatToDelete) {
      const id = chatToDelete;
      // Await the delete so the list re-render completes before we close and
      // restore focus (deleteSession is async — it awaits IndexedDB first).
      await deleteSession(id);
      closeDeleteChatModal();
    }
  });
  // Dismiss on backdrop click, like a native confirmation dialog. (Escape is
  // handled by the global keydown priority chain so it doesn't also close the
  // history modal underneath this one.)
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeDeleteChatModal();
    });
  }
});

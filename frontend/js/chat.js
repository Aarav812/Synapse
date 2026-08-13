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

// UI Elements for Settings
const settingsBtn = document.getElementById("settings-btn");
const settingsModal = document.getElementById("settings-modal");
const closeSettingsBtn = document.getElementById("close-settings-btn");
const cancelSettingsBtn = document.getElementById("cancel-settings-btn");
const saveSettingsBtn = document.getElementById("save-settings-btn");
const personaInput = document.getElementById("persona-input");

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
let currentModelName = localStorage.getItem("selected_model_name") || "Aura 2.0 Pro";
// Migration: the flagship model is presented as "Aura 2.0 Pro". Returning
// visitors still have the previous label saved, which would leave the model
// name unmatched by the capability/theme/toggle lookups below.
if (currentModelName === "Aura Allrounder" || currentModelName === "Aura 1") {
  currentModelName = "Aura 2.0 Pro";
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
      if (block.type === "image_url" && block.image_url?.url?.startsWith("data:")) {
        return { type: "image_url", image_url: { url: "[image attachment]" } };
      }
      if (block.type === "audio_url" && block.audio_url?.url?.startsWith("data:")) {
        return { type: "audio_url", audio_url: { url: "[audio attachment]" } };
      }
      if (block.type === "video_url" && block.video_url?.url?.startsWith("data:")) {
        return { type: "video_url", video_url: { url: "[video attachment]" } };
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
  if (!lastRawUserMessage) return conversationHistory;
  const msgs = conversationHistory.slice();
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "user") {
      msgs[i] = { role: "user", content: lastRawUserMessage };
      break;
    }
  }
  return msgs;
}

// ── Aura 2.0 Pro Toggle State ──
let aura1Mode = localStorage.getItem("aura1_mode") || "deep_think"; // "deep_think" or "fast"

// Stop button
const stopBtn = document.getElementById("stop-btn");

if (currentModelNameEl) currentModelNameEl.textContent = currentModelName;

// Aura 2.0 Pro Mode Toggle DOM
const aura1ModeToggle = document.getElementById("aura1-mode-toggle");
const modeDeepThinkBtn = document.getElementById("mode-deep-think-btn");
const modeFastBtn = document.getElementById("mode-fast-btn");

function updateAura1ToggleUI() {
  if (!aura1ModeToggle) return;
  if (currentModelName === "Aura 2.0 Pro") {
    aura1ModeToggle.style.display = "flex";
    if (aura1Mode === "deep_think") {
      modeDeepThinkBtn.className = "px-2.5 py-1 rounded-lg text-xs font-bold transition-all text-on-surface bg-white/10 shadow-sm";
      modeFastBtn.className = "px-2.5 py-1 rounded-lg text-xs font-bold transition-all text-on-surface-variant hover:text-on-surface";
      modeDeepThinkBtn.dataset.active = "true";
      modeFastBtn.removeAttribute("data-active");
      currentModel = "minimax/minimax-m2.7";
    } else {
      modeFastBtn.className = "px-2.5 py-1 rounded-lg text-xs font-bold transition-all text-on-surface bg-white/10 shadow-sm";
      modeDeepThinkBtn.className = "px-2.5 py-1 rounded-lg text-xs font-bold transition-all text-on-surface-variant hover:text-on-surface";
      modeFastBtn.dataset.active = "true";
      modeDeepThinkBtn.removeAttribute("data-active");
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
      
      // Compress as JPEG
      const compressed = canvas.toDataURL("image/jpeg", quality);
      resolve(compressed);
    };
    img.onerror = () => resolve(dataUrl); // fallback to original
    img.src = dataUrl;
  });
}

async function handleFiles(files) {
  if (!files.length) return;

  for (const file of files) {
    if (attachedFiles.length >= 5) {
      alert("Aura supports a maximum of 5 files.");
      break;
    }
    
    // Only allow specific file types (images, text, etc)
    const validTypes = ["text/plain", "application/json", "text/markdown", "text/csv", "image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!validTypes.includes(file.type) && !file.type.startsWith("image/")) {
      console.warn("Unsupported file type:", file.type);
      continue;
    }
    
    const isImage = file.type.startsWith("image/");
    const reader = new FileReader();
    
    const readPromise = new Promise((resolve) => {
      reader.onload = async (ev) => {
        let fileData = ev.target.result;
        if (isImage) {
          fileData = await compressImage(fileData, 1024, 0.7);
        }
        attachedFiles.push({
          filename: file.name,
          mimeType: isImage ? "image/jpeg" : file.type,
          data: fileData,
          isImage: isImage,
          size: file.size
        });
        resolve();
      };
    });
    
    if (isImage) {
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
  
  attachedFiles.forEach((attachment, index) => {
    const item = document.createElement("div");
    item.className = "relative w-16 h-16 rounded-2xl overflow-hidden shadow-sm border border-outline-variant/30 group flex-shrink-0 bg-surface-variant/30";
    
    let previewHtml = "";
    if (attachment.isImage) {
      previewHtml = `<img src="${attachment.data}" class="w-full h-full object-cover" />`;
    } else {
      previewHtml = `<div class="w-full h-full flex items-center justify-center text-on-surface-variant"><span class="material-symbols-outlined text-2xl">description</span></div>`;
    }
    
    item.innerHTML = `
      ${previewHtml}
      <button type="button" onclick="removeAttachment(${index})" class="absolute top-1 right-1 w-5 h-5 bg-black/60 backdrop-blur-md rounded-full flex items-center justify-center text-white opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity hover:bg-black/80 focus:opacity-100 z-10" title="Remove attachment">
        <span class="material-symbols-outlined" style="font-size:14px;">close</span>
      </button>
    `;
    attachmentPreviewContainer.appendChild(item);
  });
}

window.removeAttachment = function(index) {
  attachedFiles.splice(index, 1);
  if (attachedFiles.length === 0) {
    fileInput.value = "";
  }
  renderAttachments();
};

// ── AI Personality System ──
const personalityCards = document.querySelectorAll(".personality-card");
const customPersonaSection = document.getElementById("custom-persona-section");
const personalityBadge = document.getElementById("personality-badge");
const personalityBadgeName = document.getElementById("personality-badge-name");
let selectedPersonalityId = localStorage.getItem("personality_id") || "default";

// Map personality IDs to display names for badge
const personalityNames = {
  default: "Default",
  creative: "Creative",
  coder: "Code Expert",
  tutor: "Study Buddy",
  coach: "Coach",
  debate: "Debate",
  storyteller: "Storyteller",
  custom: "Custom"
};

// Initialize personality badge on load
function updatePersonalityBadge() {
  if (!personalityBadge) return;
  const name = personalityNames[selectedPersonalityId] || "Default";
  if (personalityBadgeName) personalityBadgeName.textContent = name;
  
  if (selectedPersonalityId !== "default") {
    personalityBadge.classList.remove("hidden");
    personalityBadge.classList.add("flex");
  } else {
    personalityBadge.classList.add("hidden");
    personalityBadge.classList.remove("flex");
  }
}

updatePersonalityBadge();

// Clicking the badge opens the personality modal
if (personalityBadge) {
  personalityBadge.addEventListener("click", () => {
    openPersonalityModal();
  });
}

function openPersonalityModal() {
  // Sync UI state with stored personality
  selectedPersonalityId = localStorage.getItem("personality_id") || "default";
  
  personalityCards.forEach(card => {
    card.classList.toggle("active", card.dataset.personality === selectedPersonalityId);
  });
  
  // Show/hide custom textarea
  if (customPersonaSection) {
    if (selectedPersonalityId === "custom") {
      customPersonaSection.classList.remove("hidden");
    } else {
      customPersonaSection.classList.add("hidden");
    }
  }
  
  // Load custom persona text
  if (personaInput) {
    personaInput.value = localStorage.getItem("custom_persona_text") || "";
  }
  
  settingsModal.classList.remove("hidden");
  setTimeout(() => {
    settingsModal.classList.remove("opacity-0");
    const content = document.getElementById("settings-modal-content");
    if (content) content.classList.remove("scale-95");
  }, 10);
}

// Card click handlers
personalityCards.forEach(card => {
  card.addEventListener("click", () => {
    // Deactivate all cards
    personalityCards.forEach(c => c.classList.remove("active"));
    // Activate clicked card
    card.classList.add("active");
    selectedPersonalityId = card.dataset.personality;
    
    // Show/hide custom textarea
    if (customPersonaSection) {
      if (selectedPersonalityId === "custom") {
        customPersonaSection.classList.remove("hidden");
        if (personaInput) personaInput.focus();
      } else {
        customPersonaSection.classList.add("hidden");
      }
    }
  });
});

if (settingsBtn) {
  settingsBtn.addEventListener("click", (e) => {
    e.preventDefault();
    if (drawerToggle) drawerToggle.checked = false;
    openPersonalityModal();
  });
}

function closeSettings() {
  settingsModal.classList.add("opacity-0");
  const content = document.getElementById("settings-modal-content");
  if (content) content.classList.add("scale-95");
  setTimeout(() => {
    settingsModal.classList.add("hidden");
  }, 300);
}

if (closeSettingsBtn) closeSettingsBtn.addEventListener("click", closeSettings);
if (cancelSettingsBtn) cancelSettingsBtn.addEventListener("click", closeSettings);

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
        <span class="material-symbols-outlined">logout</span>
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

if (saveSettingsBtn) {
  saveSettingsBtn.addEventListener("click", () => {
    // Get the selected card's personality
    const activeCard = document.querySelector(".personality-card.active");
    if (!activeCard) return;
    
    const personalityId = activeCard.dataset.personality;
    const builtInPrompt = activeCard.dataset.prompt;
    
    localStorage.setItem("personality_id", personalityId);
    
    if (personalityId === "custom") {
      const customText = personaInput?.value?.trim() || "";
      localStorage.setItem("custom_persona_text", customText);
      localStorage.setItem("system_persona", customText);
    } else if (personalityId === "default") {
      localStorage.removeItem("system_persona");
    } else {
      localStorage.setItem("system_persona", builtInPrompt);
    }
    
    selectedPersonalityId = personalityId;
    updatePersonalityBadge();
    closeSettings();
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

      if (selectedName === "Aura 2.0 Pro") {
        updateAura1ToggleUI(); // Sets currentModel internally based on toggle state
      } else {
        currentModel = selectedModel;
        localStorage.setItem("selected_model", currentModel);
        updateAura1ToggleUI(); // Hide the toggle for non-Allrounder models
      }

      if (currentModelNameEl) currentModelNameEl.textContent = currentModelName;
      // Apply accent color to model name
      if (currentModelName === 'Aura 2.0 Pro') currentModelNameEl.style.color = '#7c5cff';
      else if (currentModelName === 'Aura Summary') currentModelNameEl.style.color = '#4caf50';
      else if (currentModelName === 'Aura Bhai') currentModelNameEl.style.color = '#a855f7';
      
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
    "Aura 2.0 Pro": {
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

  const theme = themes[modelName] || themes["Aura 2.0 Pro"];
  
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
    } else {
      option.classList.remove('active');
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
              const imgId = `img_${currentChatId}_${Math.random().toString(36).substr(2, 9)}`;
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

async function loadSession(id) {
  const data = localStorage.getItem(`chat_${id}`);
  if (!data) return;
  
  // Clear artifact store from previous chat to prevent stale references & memory leaks
  artifactStore.clear();
  artifactCounter = 0;
  
  conversationHistory = JSON.parse(data);
  currentChatId = id;
  lastRawUserMessage = null;
  
  // Resolve images from IndexedDB
  for (const msg of conversationHistory) {
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
  
  conversationHistory.forEach((msg, idx) => {
    // Handling multimodal historical messages
    if (msg.role === "assistant") {
      appendMessage("ai", msg.content || "", idx);
    } else {
      // User message
      let htmlContent = "";
      if (typeof msg.content === "string") {
        htmlContent = escapeHtml(msg.content);
      } else if (Array.isArray(msg.content)) {
        const textItem = msg.content.find(c => c.type === "text");
        let rawText = textItem ? textItem.text : "[Attachment]";
        
        // Strip out appended file contents so only the user's typed message shows
        let displayIdx = rawText.indexOf("\n\nAttached file contents (");
        if (displayIdx !== -1) {
          rawText = rawText.substring(0, displayIdx);
        }
        htmlContent = escapeHtml(rawText);
        
        let previews = [];
        for (const block of msg.content) {
          if (block.type === "image_url") {
            const src = block.image_url.url.startsWith("db:") ? "#" : block.image_url.url;
            const dbAttr = block.image_url.url.startsWith("db:") ? `data-db-id="${block.image_url.url.split("db:")[1]}"` : "";
            previews.push(`<img src="${src}" ${dbAttr} class="lazy-db-img" style="max-height: 200px; border-radius: 8px; margin-top: 8px; border: 1px solid rgba(255,255,255,0.1);"/>`);
          }
        }
        if (previews.length > 0) {
          htmlContent += `<br><div style="display:flex; gap: 8px; flex-wrap: wrap; margin-top: 8px;">${previews.join("")}</div>`;
        }
      }
      appendMessage("user", htmlContent, idx, true);
    }
  });
  
  // Lazy load images from DB for user bubbles
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

    // Cleanup artifacts (if we have a way to link them to the chat ID)
    // Currently artifact IDs are artifact_0, artifact_1... which don't include chat ID.
    // However, we should at least clean up the ones we know are linked.
    // For now, focusing on attachments as they are clearly prefixed.
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
  loadHistoryIndex();
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
  artifactCounter = 0;
  
  // (#2) Unconditionally close Canvas and reset its state
  window.closeCodePreview();
  
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

function undoNewChat() {
  if (!_previousChatId || !_previousHistory) return;
  currentChatId = _previousChatId;
  conversationHistory = _previousHistory;
  _previousChatId = null;
  _previousHistory = null;
  
  // Rebuild DOM
  chatMessages.innerHTML = '';
  if (heroSection) heroSection.style.display = 'none';
  if (emptyState) emptyState.style.display = 'none';
  conversationHistory.forEach((msg, idx) => {
    if (msg.role === 'assistant') {
      appendMessage('ai', msg.content || '', idx);
    } else {
      let htmlContent = typeof msg.content === 'string' ? escapeHtml(msg.content) : '[Attachment]';
      appendMessage('user', htmlContent, idx, true);
    }
  });
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
  historySearchInput.addEventListener('input', () => {
    const query = historySearchInput.value.trim().toLowerCase();
    loadHistoryIndex(query);
  });
}


// The sidebar mirrors the history modal's time buckets so recent work is easy
// to scan: Recent (today), Yesterday, and Previous 7 Days.
function renderSidebarHistory(index) {
  if (!sidebarHistoryList) return;

  const emptyMessage = document.querySelector('.sidebar-empty');
  const lists = {
    recent: sidebarHistoryList,
    yesterday: document.getElementById('history-list-yesterday'),
    previous7: document.getElementById('history-list-previous7'),
  };
  Object.values(lists).forEach((list) => { if (list) list.innerHTML = ''; });

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const todayMs = startOfToday.getTime();
  const dayMs = 86400000;

  const buckets = { recent: [], yesterday: [], previous7: [] };
  index.forEach((chat) => {
    const updatedAt = chat.updatedAt || 0;
    if (updatedAt >= todayMs) buckets.recent.push(chat);
    else if (updatedAt >= todayMs - dayMs) buckets.yesterday.push(chat);
    else if (updatedAt >= todayMs - dayMs * 7) buckets.previous7.push(chat);
  });

  // Keep the sidebar short: cap each bucket, favouring the most recent work.
  const caps = { recent: 6, yesterday: 4, previous7: 4 };

  Object.entries(buckets).forEach(([key, chats]) => {
    const list = lists[key];
    if (!list) return;
    const visible = chats.slice(0, caps[key]);
    visible.forEach((chat) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `sidebar-recent-item${chat.id === currentChatId ? ' active' : ''}`;
      button.title = chat.title;
      button.innerHTML = `<span class="material-symbols-outlined history-icon">chat_bubble</span><span class="history-title">${escapeHtml(chat.title)}</span>`;
      button.addEventListener('click', () => loadSession(chat.id));
      item.appendChild(button);
      list.appendChild(item);
    });
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
  const now = Date.now();
  const dayMs = 86400000;
  const groups = {
    'Today': [],
    'Yesterday': [],
    'Last 7 Days': [],
    'Older': []
  };

  index.forEach(chat => {
    const age = now - chat.updatedAt;
    if (age < dayMs) groups['Today'].push(chat);
    else if (age < 2 * dayMs) groups['Yesterday'].push(chat);
    else if (age < 7 * dayMs) groups['Last 7 Days'].push(chat);
    else groups['Older'].push(chat);
  });

  Object.entries(groups).forEach(([label, chats]) => {
    if (chats.length === 0) return;

    const groupLabel = document.createElement('p');
    groupLabel.className = 'text-xs text-on-surface-variant/50 font-bold uppercase tracking-wider mt-3 mb-1.5 px-1';
    groupLabel.textContent = label;
    historyListContainer.appendChild(groupLabel);

    chats.forEach(chat => {
      const item = document.createElement("div");
      item.className = "history-item";
      const date = formatRelativeTime(chat.updatedAt);
      item.innerHTML = `
        <div class="flex-1 overflow-hidden" onclick="loadSession('${chat.id}')">
          <p class="text-on-surface font-bold text-sm truncate">${escapeHtml(chat.title)}</p>
          <p class="text-on-surface-variant text-xs">${date}</p>
        </div>
        <button onclick="event.stopPropagation(); deleteSession('${chat.id}')" class="w-8 h-8 flex items-center justify-center rounded-full text-on-surface-variant hover:text-error hover:bg-white/5 transition-colors" aria-label="Delete chat">
          <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
        </button>
      `;
      historyListContainer.appendChild(item);
    });
  });
}

// ── Send Message ──
const MODEL_CAPABILITIES = {
  "Aura 2.0 Pro": { image: true, audio: true, video: true },
  "Aura Summary": { image: false, audio: false, video: false },
  "Aura Bhai": { image: true, audio: true, video: true }
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

  if (heroSection) heroSection.style.display = "none";

  // Initialize display content and backend payload for text-only messages
  let displayContent = escapeHtml(text);
  let backendPayload = text;

  if (attachedFiles.length > 0) {
    // Render attachment previews for the user bubble
    let attachmentPreviews = [];
    for (const file of attachedFiles) {
      if (file.isImage) {
        attachmentPreviews.push(`<img src="${file.data}" alt="${escapeHtml(file.filename)}" style="max-height: 200px; border-radius: 8px; margin-top: 8px; border: 1px solid rgba(255,255,255,0.1);"/>`);
      } else if (file.mimeType.startsWith("audio/")) {
        attachmentPreviews.push(`<div style="display:flex;align-items:center;gap:8px;background:rgba(94,162,255,0.1);padding:8px;border-radius:8px;margin-top:8px;"><span class="material-symbols-outlined" style="color:#5ea2ff;">audiotrack</span><span style="color:#f5f5f7;font-size:0.8rem;">${escapeHtml(file.filename)}</span></div>`);
      } else if (file.mimeType.startsWith("video/")) {
        attachmentPreviews.push(`<div style="display:flex;align-items:center;gap:8px;background:rgba(220,184,255,0.1);padding:8px;border-radius:8px;margin-top:8px;"><span class="material-symbols-outlined" style="color:#dcb8ff;">movie</span><span style="color:#f5f5f7;font-size:0.8rem;">${escapeHtml(file.filename)}</span></div>`);
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
  conversationHistory.push({ role: "user", content: stripBase64(backendPayload) });
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
function animateSendButton() {
  if (!sendBtn) return;
  const hasText = chatInput.value.trim().length > 0 || attachedFiles.length > 0;
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
    { icon: 'web', title: 'Create Landing Page', description: 'Polished and responsive.', prompt: 'Create a modern, responsive SaaS landing page with HTML, CSS and JavaScript', color: '#7c5cff' },
    { icon: 'code_blocks', title: 'Build React Component', description: 'Clean, reusable and typed.', prompt: 'Build a reusable React component with props, TypeScript types and an accessible API', color: '#8f7bff' },
    { icon: 'picture_as_pdf', title: 'Summarize PDF', description: 'Key points, fast.', prompt: 'Summarize this document into key takeaways, decisions and action items', color: '#a479ff' },
    { icon: 'design_services', title: 'Generate UI Design', description: 'Layout, spacing and colour.', prompt: 'Generate a premium dark-mode dashboard UI design with layout, spacing and colour tokens', color: '#b87dff' }
  ];
  
  chips.forEach(chip => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'category-chip suggestion-card';
    btn.dataset.prompt = chip.prompt;
    btn.style.setProperty('--chip-color', chip.color);
    btn.innerHTML = `
      <span class="suggestion-card-icon"><span class="material-symbols-outlined">${chip.icon}</span></span>
      <span class="suggestion-card-text">
        <span class="suggestion-card-title">${chip.title}</span>
        <span class="suggestion-card-desc">${chip.description}</span>
      </span>
    `;
    categoryChipsContainer.appendChild(btn);
  });
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

function updateScrollBtn() {
  if (!scrollToBottomBtn) return;
  const distFromBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
  // Compare distFromBottom; we use 200px threshold
  if (distFromBottom > 200) {
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
let scrollTicking = false;

window.addEventListener("scroll", () => {
  if (!scrollTicking) {
    window.requestAnimationFrame(() => {
      // ⚡ Bolt: Throttled scroll event using requestAnimationFrame to prevent layout thrashing
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
      updateScrollBtn();
      scrollTicking = false;
    });
    scrollTicking = true;
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

// Close lightbox on Escape key — only if no higher z-index modal is open
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    // Priority: canvas panel (z:80) > lightbox (z:150) > history/settings (z:100)
    const canvasPanel = document.getElementById("canvas-panel");
    if (canvasPanel && !canvasPanel.classList.contains("hidden")) {
      window.closeCodePreview();
      return;
    }
    
    const lightboxModal = document.getElementById("image-lightbox-modal");
    if (lightboxModal && !lightboxModal.classList.contains("hidden")) {
      closeLightbox();
      return;
    }
    
    const settingsM = document.getElementById("settings-modal");
    if (settingsM && !settingsM.classList.contains("hidden")) {
      closeSettings();
      return;
    }
    
    const historyM = document.getElementById("history-modal");
    if (historyM && !historyM.classList.contains("hidden")) {
      closeHistoryModal();
      return;
    }
    
    const deleteM = document.getElementById("delete-history-modal");
    if (deleteM && !deleteM.classList.contains("hidden")) {
      closeDeleteHistoryModal();
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
  let fullContent = "";
  let fullReasoning = "";
  let reasoningEl = null;

  try {
    const user = auth ? auth.currentUser : null;
    if (!user) throw new Error("You're not signed in — the authentication service didn't load. Check your connection and refresh the page.");

    const idToken = await user.getIdToken();

    const response = await fetch("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ 
        messages: getMessagesForRequest(),
        model: currentModel,
        persona: currentModelName === "Aura Summary" 
          ? "You are Aura Summary. Explain any topic in exactly TWO paragraphs (2-3 lines each). You MUST format your response exactly like this:\\n\\n**English:**\\n[Your English paragraph here with an example]\\n\\n**Hinglish:**\\n[Your Hinglish paragraph here with an example]\\n\\nDo NOT use bullet points or numbered lists, write only in continuous paragraph format."
          : (localStorage.getItem("system_persona") || null)
      }),
      signal: abortController.signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Server error: ${response.status}`);
    }

    typingEl.remove();

    ({ bubbleEl } = appendMessage("ai", ""));

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

          if (data.reasoning && currentModelName !== "Aura Summary") {
            fullReasoning += data.reasoning;
            // Create or update the thinking block
            if (!reasoningEl) {
              reasoningEl = document.createElement("details");
              reasoningEl.className = "thinking-block";
              reasoningEl.innerHTML = `<summary><span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">psychology</span>Thinking...<span class="deep-think-timer" style="margin-left:auto;font-size:0.7rem;color:rgba(220,184,255,0.5);font-weight:500;"></span></summary><div class="deep-think-progress"></div><div class="thinking-content"></div>`;
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
            reasoningEl.querySelector(".thinking-content").innerHTML = renderMarkdown(fullReasoning);
            scrollToBottom();
          }

          if (data.content) {
            fullContent += data.content;

            // ── Canvas Live Streaming ──
            // Detect HTML block start and auto-open Canvas for Aura 2.0 Pro
            if (currentModelName === "Aura 2.0 Pro") {
              const htmlBlockMatch = fullContent.match(/```html\n?([\s\S]*)/);
              if (htmlBlockMatch) {
                // Extract code captured so far (before closing ```)
                const codeMatch = fullContent.match(/```html\n?([\s\S]*?)(?:```|$)/);
                const liveCode = codeMatch ? codeMatch[1] : htmlBlockMatch[1];

                if (!canvasIsStreaming) {
                  // First detection — open the Canvas
                  canvasIsStreaming = true;
                  openCanvasPanel("Web App", "Writing code...");
                }
                // Push live update (debounced inside updateCanvasLive)
                if (liveCode.length > 80) {
                  updateCanvasLive(liveCode);
                }
              }
            }

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
                summary.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">psychology</span>Thought for ${elapsed}s`;
              }
            }
            // Render content after the reasoning block
            let contentContainer = bubbleEl.querySelector(".answer-content");
            if (!contentContainer) {
              contentContainer = document.createElement("div");
              contentContainer.className = "answer-content";
              bubbleEl.appendChild(contentContainer);
            }
            contentContainer.innerHTML = renderMarkdown(fullContent, true) + '<span class="typing-cursor"></span>';
            setOrbState('responding');
            scrollToBottom();
          }
        } catch (parseErr) {
          // Skip malformed chunks
        }
      }
    }

    // Finalize: remove typing cursor, wire lightbox, append action bar
    // Keep reasoning block open after stream is fully complete
    if (reasoningEl) {
      if (reasoningEl._timer) { clearInterval(reasoningEl._timer); reasoningEl._timer = null; }
      reasoningEl.open = true;
      const summary = reasoningEl.querySelector("summary");
      if (summary) {
        const elapsed = Math.round((Date.now() - (reasoningEl._startTime || Date.now())) / 1000);
        summary.innerHTML = `<span class="material-symbols-outlined" style="font-size:16px;vertical-align:middle;margin-right:4px;">psychology</span>Reasoning (${elapsed}s)`;
      }
    }
    const answerEl = bubbleEl.querySelector(".answer-content");
    if (answerEl) {
      answerEl.innerHTML = renderMarkdown(fullContent);
      answerEl.querySelectorAll("img").forEach(img => {
        img.style.cursor = "zoom-in";
        img.onclick = () => openLightbox(img.src);
      });
    }
    if (bubbleEl) appendActionBar(bubbleEl, fullContent);

    // ── Finalize Canvas if we were streaming code ──
    if (canvasIsStreaming) {
      const finalHtmlMatch = fullContent.match(/```html\n?([\s\S]*?)(?:```|$)/);
      if (finalHtmlMatch && finalHtmlMatch[1].trim()) {
        finalizeCanvas(finalHtmlMatch[1].trim());
      } else {
        finalizeCanvas(canvasLiveCode);
      }
    }

    conversationHistory.push({ role: "assistant", content: fullContent });
    saveSession();
    
    // (#2) Auto-rename the chat title after first AI response
    autoRenameChat(fullContent);
    
    // (#6) Apply syntax highlighting to code blocks
    if (window.hljs && bubbleEl) {
      bubbleEl.querySelectorAll('pre code').forEach(block => {
        hljs.highlightElement(block);
      });
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
        if (bubbleEl) appendActionBar(bubbleEl, fullContent);
        conversationHistory.push({ role: "assistant", content: fullContent });
        saveSession();
      }
      // Finalize canvas if we were streaming code when stopped
      if (canvasIsStreaming && canvasLiveCode.trim()) {
        finalizeCanvas(canvasLiveCode);
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
    isStreaming = false;
    abortController = null;
    canvasIsStreaming = false;
    updateSendButton(false);
    animateSendButton();
    scrollToBottom();
    updateScrollBtn();
    setOrbState('idle');
  }
}

// ── Append Action Bar to AI Bubble ──
function appendActionBar(bubbleEl, content) {
  if (!bubbleEl) return;
  // Remove any existing action bar
  const old = bubbleEl.querySelector(".ai-action-bar");
  if (old) old.remove();

  const bar = document.createElement("div");
  bar.className = "ai-action-bar";

  // Copy
  const copyBtn = document.createElement("button");
  copyBtn.className = "action-btn";
  copyBtn.title = "Copy response";
  copyBtn.innerHTML = '<span class="material-symbols-outlined">content_copy</span>';
  copyBtn.onclick = () => {
    navigator.clipboard.writeText(content).then(() => {
      copyBtn.innerHTML = '<span class="material-symbols-outlined">check</span>';
      copyBtn.style.color = "#4ade80";
      setTimeout(() => {
        copyBtn.innerHTML = '<span class="material-symbols-outlined">content_copy</span>';
        copyBtn.style.color = "";
      }, 2000);
    });
  };

  // Thumbs Up
  const thumbUpBtn = document.createElement("button");
  thumbUpBtn.className = "action-btn";
  thumbUpBtn.title = "Good response";
  thumbUpBtn.innerHTML = '<span class="material-symbols-outlined">thumb_up</span>';
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
  thumbDownBtn.innerHTML = '<span class="material-symbols-outlined">thumb_down</span>';
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
  retryBtn.innerHTML = '<span class="material-symbols-outlined">refresh</span>';
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
  exportBtn.innerHTML = '<span class="material-symbols-outlined">picture_as_pdf</span>';
  exportBtn.onclick = () => exportCurrentChat();

  bar.appendChild(copyBtn);
  bar.appendChild(thumbUpBtn);
  bar.appendChild(thumbDownBtn);
  bar.appendChild(retryBtn);
  bar.appendChild(exportBtn);
  bubbleEl.appendChild(bar);
}

// ── Append Message to Chat ──
function appendMessage(role, content, explicitIndex = -1, isRawHtmlForUser = false) {
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
      bubble.innerHTML = isRawHtmlForUser ? textToDisplay : escapeHtml(textToDisplay);
    
    // Add Edit Button
    const editBtn = document.createElement("button");
    editBtn.className = "edit-message-btn";
    editBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">edit</span>';
    editBtn.title = "Edit message";
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
      appendActionBar(bubble, content);
    }
  }

  row.appendChild(avatar);
  row.appendChild(bubble);

  // ── Message Timestamp ──
  const ts = document.createElement('div');
  ts.className = 'message-timestamp';
  ts.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  row.appendChild(ts);

  chatMessages.appendChild(row);
  // Force scroll for user messages; AI messages respect user's scroll position
  scrollToBottom(role === "user");
  updateScrollBtn();

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
  } else if (currentModelName === "Aura 2.0 Pro" && aura1Mode === "deep_think") {
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
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;">check</span> Copied!`;
    setTimeout(() => {
      btn.classList.remove("copied");
      btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;">content_copy</span> Copy`;
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
    btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;">check</span> Copied!`;
    setTimeout(() => {
      btn.classList.remove("copied");
      btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:14px;">content_copy</span> Copy`;
    }, 2000);
  });
}
window.copyCode = copyCode;

// ── Mobile Virtual Keyboard Handling ──
if (window.visualViewport) {
  const chatFooter = document.getElementById("chat-footer");
  const footerGradient = document.querySelector(".footer-gradient");
  
  window.visualViewport.addEventListener("resize", () => {
    if (!chatFooter) return;
    const offsetBottom = window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop;
    if (offsetBottom > 50) {
      // Keyboard is open
      chatFooter.style.bottom = offsetBottom + "px";
      if (footerGradient) footerGradient.style.bottom = offsetBottom + "px";
    } else {
      chatFooter.style.bottom = "0px";
      if (footerGradient) footerGradient.style.bottom = "0px";
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
    <textarea class="edit-textarea"></textarea>
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

  if (chatInput) {
    const charCounter = document.getElementById('char-counter');
    chatInput.addEventListener('input', () => {
      const val = chatInput.value;
      
      // Update character counter
      if (charCounter) {
        charCounter.textContent = `${val.length} / 4000`;
        if (val.length >= 4000) charCounter.style.color = '#ffb4ab';
        else charCounter.style.color = '';
      }

      // Handle draft persistence
      if (val.trim()) {
        localStorage.setItem(draftKey, val);
        chatInput.classList.add('has-draft');
      } else {
        localStorage.removeItem(draftKey);
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
    // Cmd/Ctrl+K focuses the top-bar search, matching its ⌘K badge.
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const search = document.getElementById('nav-search-input');
      if (search && search.offsetParent !== null) {
        search.focus();
        search.select();
      } else {
        openHistoryModal();
      }
    }
    // Cmd/Ctrl+B toggles the sidebar.
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      const toggle = document.querySelector('[data-sidebar-toggle]');
      if (toggle) toggle.click();
    }
    // Cmd/Ctrl+N starts a new chat, matching the ⌘N hint in the sidebar.
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      createNewChat();
    }
  });

  // ── Model Accent Colors in selector button ──
  updateModelAccentColor();
  updateActiveModelIndicator(currentModelName);
  
  // ── Header Scroll Shadow ──
  const headerEl = document.querySelector('header');
  if (headerEl) {
    let headerTicking = false;
    window.addEventListener('scroll', () => {
      if (!headerTicking) {
        window.requestAnimationFrame(() => {
          // ⚡ Bolt: Throttled header scroll shadow check using requestAnimationFrame
          if (window.scrollY > 10) {
            headerEl.classList.add('scrolled');
          } else {
            headerEl.classList.remove('scrolled');
          }
          headerTicking = false;
        });
        headerTicking = true;
      }
    }, { passive: true });
  }
  // (#6) Highlight existing code blocks on page load
  if (window.hljs) {
    document.querySelectorAll('pre code').forEach(block => {
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
  const exportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });

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
  banner.innerHTML = `
    <span class="material-symbols-outlined">info</span>
    <span>This chat was with <strong>${originalModel}</strong></span>
    <button onclick="switchToModel('${originalModel}'); this.closest('.model-warning-banner').remove();">Switch back</button>
    <button onclick="this.closest('.model-warning-banner').remove();" style="background:none;border:none;color:rgba(255,200,100,0.5);padding:2px;cursor:pointer;"><span class="material-symbols-outlined" style="font-size:16px;">close</span></button>
  `;
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
      <span class="material-symbols-outlined" style="color:#fff;font-size:18px;font-variation-settings:'FILL' 1;">install_mobile</span>
    </div>
    <div class="pwa-text">
      <div class="pwa-title">Install Synapse AI</div>
      <div class="pwa-desc">Add to home screen for quick access</div>
    </div>
    <button class="pwa-close" onclick="event.stopPropagation(); this.closest('.pwa-install-banner').remove(); localStorage.setItem('pwa_dismissed','1');">
      <span class="material-symbols-outlined" style="font-size:16px;">close</span>
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
  
  // Personality cards
  document.querySelectorAll('.personality-card').forEach(card => {
    card.setAttribute('role', 'button');
    const nameEl = card.querySelector('.personality-name');
    if (nameEl) card.setAttribute('aria-label', `Set personality to ${nameEl.textContent}`);
  });
  
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
    iconHtml = '<span class="material-symbols-outlined toast-icon" style="font-variation-settings:\'FILL\' 1;">check_circle</span>';
  } else if (type === 'error') {
    iconHtml = '<span class="material-symbols-outlined toast-icon" style="font-variation-settings:\'FILL\' 1;">error</span>';
  }
  
  toast.innerHTML = iconHtml + `<span>${message}</span>`;
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
  if (name === 'Aura 2.0 Pro') { el.style.color = '#7c5cff'; }
  else if (name === 'Aura Summary') { el.style.color = '#4caf50'; }
  else if (name === 'Aura Bhai') { el.style.color = '#a855f7'; }

  else { el.style.color = ''; }
}

// ── One-Time Personality Intro Popup ──
// NOTE: Merged into the main onAuthStateChanged listener would be ideal,
// but to minimize diff risk we guard against the redirect race by checking
// that we're actually on the chat page before opening the modal.
(function initPersonalityIntro() {
  // Skip entirely when the Auth SDK failed to load (offline mode).
  if (!auth) return;
  // Use a one-shot listener that piggybacks on the existing auth state
  const unsubPersonality = auth.onAuthStateChanged((user) => {
    if (!user) return;
    // Only show on chat page to avoid race with auth redirect
    if (!window.location.pathname.includes('chat')) return;
    const seenKey = `personality_intro_seen_${user.uid}`;
    if (!localStorage.getItem(seenKey)) {
      setTimeout(() => {
        openPersonalityModal();
        localStorage.setItem(seenKey, "true");
      }, 1500);
    }
    // Unsubscribe after first fire — no need to keep listening
    unsubPersonality();
  });
})();

// ══════════════════════════════════════════
// CANVAS PANEL — Gemini-style side Canvas
// ══════════════════════════════════════════

// ── Canvas State ──
let canvasLiveCode = "";       // currently-streaming HTML
let canvasLiveTimer = null;    // debounce timer for live preview updates
let canvasIsStreaming = false; // true while Aura 2.0 Pro is streaming code to Canvas

// ── Open Canvas Panel ──
function openCanvasPanel(title = "Web App", subtitle = "Writing code...") {
  const panel = document.getElementById("canvas-panel");
  const backdrop = document.getElementById("canvas-backdrop");
  if (!panel) return;

  // Set title / subtitle
  const titleEl = document.getElementById("canvas-title");
  const subtitleEl = document.getElementById("canvas-subtitle");
  if (titleEl) titleEl.textContent = title;
  if (subtitleEl) subtitleEl.textContent = subtitle;

  // Add writing animation
  panel.classList.add("canvas-writing");

  // Show panel + backdrop
  panel.classList.remove("hidden");
  if (window.innerWidth < 768 && backdrop) backdrop.classList.remove("hidden");

  // Enable split view
  document.body.classList.add("canvas-open");

  // Show Live badge
  const liveBadge = document.getElementById("canvas-live-indicator");
  if (liveBadge) liveBadge.classList.remove("hidden");

  // Auto-switch to Code tab while streaming — preview is blank with partial HTML
  switchCanvasTab('code');
}

// ── Update Canvas with Live Code (called while streaming) ──
function updateCanvasLive(htmlCode) {
  canvasLiveCode = htmlCode;
  const codeEl = document.getElementById("canvas-code-content");

  // Only update the CODE tab during streaming — iframe gets full HTML only at the end
  if (codeEl) {
    codeEl.textContent = htmlCode;
    // Scroll the code view to bottom so user sees the latest line being written
    const codeView = document.getElementById("canvas-code-view");
    if (codeView) codeView.scrollTop = codeView.scrollHeight;
  }

  // Clear any pending iframe timer (we don't update iframe during streaming)
  if (canvasLiveTimer) { clearTimeout(canvasLiveTimer); canvasLiveTimer = null; }
}

// ── Finalize Canvas after streaming is done ──
function finalizeCanvas(htmlCode) {
  canvasLiveCode = htmlCode;
  canvasIsStreaming = false;

  const panel = document.getElementById("canvas-panel");
  const liveBadge = document.getElementById("canvas-live-indicator");
  const subtitleEl = document.getElementById("canvas-subtitle");
  const iframe = document.getElementById("code-preview-iframe");
  const codeEl = document.getElementById("canvas-code-content");

  // Stop writing animation
  if (panel) panel.classList.remove("canvas-writing");

  // Hide live badge
  if (liveBadge) liveBadge.classList.add("hidden");

  // Update subtitle
  if (subtitleEl) subtitleEl.textContent = "Ready · HTML / CSS / JS";

  // Final code render + syntax highlighting
  if (codeEl) {
    codeEl.textContent = htmlCode;
    if (window.hljs) hljs.highlightElement(codeEl);
  }

  // Store globally for download
  window.currentPreviewCode = htmlCode;

  // Render the complete HTML into iframe via blob URL (most reliable method)
  if (iframe) {
    if (canvasLiveTimer) { clearTimeout(canvasLiveTimer); canvasLiveTimer = null; }
    if (iframe._blobUrl) URL.revokeObjectURL(iframe._blobUrl);
    const blob = new Blob([htmlCode], { type: "text/html" });
    const blobUrl = URL.createObjectURL(blob);
    iframe._blobUrl = blobUrl;
    iframe.removeAttribute("srcdoc");
    iframe.src = blobUrl;

    // Auto-switch to Preview tab once iframe is loaded
    iframe.onload = () => {
      switchCanvasTab('preview');
      iframe.onload = null; // clear handler
    };
  } else {
    // No iframe — just switch to preview tab anyway
    switchCanvasTab('preview');
  }
}

// ── Open Canvas for a completed artifact (clicking "Open Preview" button) ──
window.previewCode = async function(btn) {
  const wrapper = btn.closest(".artifact-card");
  if (!wrapper) return;

  const artifactId = wrapper.getAttribute("data-artifact-id");
  if (!artifactId) return;

  let rawCode = artifactStore.get(artifactId);
  if (!rawCode) {
    try {
      rawCode = await getFromDB("artifacts", artifactId);
    } catch (dbErr) {
      console.error("Failed to retrieve artifact from DB:", dbErr);
    }
  }
  if (!rawCode) { showToast("Code not available. Please regenerate.", "error"); return; }

  openCanvasPanel("Web App", "Ready · HTML / CSS / JS");
  finalizeCanvas(rawCode);
};

// ── Close Canvas ──
window.closeCodePreview = function() {
  const panel = document.getElementById("canvas-panel");
  const backdrop = document.getElementById("canvas-backdrop");
  const iframe = document.getElementById("code-preview-iframe");

  if (!panel) return;

  panel.classList.add("hidden");
  if (backdrop) backdrop.classList.add("hidden");
  document.body.classList.remove("canvas-open");

  // Cleanup iframe
  if (iframe) {
    if (canvasLiveTimer) clearTimeout(canvasLiveTimer);
    if (iframe._blobUrl) {
      URL.revokeObjectURL(iframe._blobUrl);
      iframe._blobUrl = null;
    }
    iframe.removeAttribute("srcdoc");
    iframe.src = "about:blank";
  }

  canvasLiveCode = "";
  canvasIsStreaming = false;
};

// ── Switch Canvas Tab (Preview / Code) ──
window.switchCanvasTab = function(tab) {
  const previewTab = document.getElementById("canvas-preview-tab");
  const codeTab = document.getElementById("canvas-code-tab");
  const previewBtn = document.getElementById("canvas-tab-preview");
  const codeBtn = document.getElementById("canvas-tab-code");

  if (tab === "preview") {
    previewTab?.classList.remove("hidden");
    previewTab?.classList.add("active");
    codeTab?.classList.add("hidden");
    codeTab?.classList.remove("active");
    previewBtn?.classList.add("active");
    codeBtn?.classList.remove("active");
  } else {
    codeTab?.classList.remove("hidden");
    codeTab?.classList.add("active");
    previewTab?.classList.add("hidden");
    previewTab?.classList.remove("active");
    codeBtn?.classList.add("active");
    previewBtn?.classList.remove("active");
  }
};

// ── Download Artifact ──
window.downloadCodePreview = function() {
  if (!window.currentPreviewCode) {
    showToast("No code available to download.", "error");
    return;
  }
  
  const blob = new Blob([window.currentPreviewCode], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `synapse_artifact_${Date.now()}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast("Code downloaded successfully!", "success");
};


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
      chatInput.placeholder = "Message Aura...";
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
      chatInput.placeholder = "Message Aura...";
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

// ── Canvas Actions (Copy / Download) ──
const canvasCopyBtn = document.getElementById("canvas-copy-btn");
const canvasDownloadBtn = document.getElementById("canvas-download-btn");

if (canvasCopyBtn) {
  canvasCopyBtn.addEventListener("click", () => {
    if (window.currentPreviewCode) {
      navigator.clipboard.writeText(window.currentPreviewCode).then(() => {
        showToast("Code copied to clipboard", "success");
      });
    } else {
      showToast("No code to copy", "error");
    }
  });
}

if (canvasDownloadBtn) {
  canvasDownloadBtn.addEventListener("click", () => {
    if (window.currentPreviewCode) {
      const blob = new Blob([window.currentPreviewCode], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "aura-coder-export.html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("Download started", "success");
    } else {
      showToast("No code to download", "error");
    }
  });
}

/**
 * RTI COPILOT — Accessible Frontend Client
 * Powers universal citizen dialogue, Indic translation, audio synthesis, and document drafting.
 */

// State Management
let currentDraftText = "";
let speechEnabled = false;
let messageTurnCount = 0;

// Initialize when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  // Restore user preferences
  const savedFont = localStorage.getItem("rti_font_size") || "normal";
  const savedTheme = localStorage.getItem("rti_theme") || "light";
  setFontSize(savedFont);
  setTheme(savedTheme);

  // Load grounded documents
  loadGroundedDocuments();
});

/* ==========================================================================
   ACCESSIBILITY: FONT SIZE & THEME CONTROLS
   ========================================================================== */

function setFontSize(size) {
  document.body.setAttribute("data-font-size", size);
  localStorage.setItem("rti_font_size", size);

  // Update button pressed states
  document.getElementById("btnFontNormal").setAttribute("aria-pressed", size === "normal");
  document.getElementById("btnFontLarge").setAttribute("aria-pressed", size === "large");
  document.getElementById("btnFontXLarge").setAttribute("aria-pressed", size === "xlarge");
}

function setTheme(theme) {
  document.body.setAttribute("data-theme", theme);
  localStorage.setItem("rti_theme", theme);

  document.getElementById("btnThemeDefault").setAttribute("aria-pressed", theme === "light");
  document.getElementById("btnThemeHighContrast").setAttribute("aria-pressed", theme === "high-contrast");
  document.getElementById("btnThemeDark").setAttribute("aria-pressed", theme === "dark");
}

/* ==========================================================================
   ACCESSIBILITY: SPEECH SYNTHESIS (AUDIO READOUT)
   ========================================================================== */

function toggleSpeechHelp() {
  speechEnabled = !speechEnabled;
  const statusEl = document.getElementById("speechStatus");
  statusEl.textContent = speechEnabled ? "On" : "Off";
  document.getElementById("btnToggleSpeech").setAttribute("aria-pressed", speechEnabled);

  if (speechEnabled) {
    speakText("Audio assistance is now enabled. Replies will be read aloud.");
  } else {
    window.speechSynthesis && window.speechSynthesis.cancel();
  }
}

function speakText(text) {
  if (!("speechSynthesis" in window)) {
    alert("Audio readout is not supported by your browser.");
    return;
  }
  window.speechSynthesis.cancel(); // Stop any ongoing speech
  
  // Clean markdown syntax for clearer speech
  const cleanText = text
    .replace(/[#*_`~>]/g, "")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1");

  const utterance = new SpeechSynthesisUtterance(cleanText);
  utterance.rate = 0.95; // Slightly slower for elderly / accessible clarity
  window.speechSynthesis.speak(utterance);
}

function speakMessage(button) {
  const messageCard = button.closest(".message-card");
  const textEl = messageCard.querySelector(".msg-text");
  if (textEl) {
    speakText(textEl.innerText);
  }
}

function speakDraft() {
  if (!currentDraftText) {
    speakText("No RTI draft has been compiled yet.");
    return;
  }
  speakText(currentDraftText);
}

/* ==========================================================================
   PROGRESS STEPPER
   ========================================================================== */

function advanceStep(stepNumber) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById(`step${i}`);
    if (el) {
      if (i === stepNumber) {
        el.classList.add("active");
        el.setAttribute("aria-current", "step");
      } else if (i < stepNumber) {
        el.classList.add("completed");
        el.classList.remove("active");
        el.removeAttribute("aria-current");
      } else {
        el.classList.remove("active", "completed");
        el.removeAttribute("aria-current");
      }
    }
  }
}

/* ==========================================================================
   CONVERSATIONAL DIALOGUE
   ========================================================================== */

function handleInputKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleChatSubmit(e);
  }
}

function handleQuickPrompt(promptText) {
  const input = document.getElementById("chatInput");
  input.value = promptText;
  handleChatSubmit();
}

async function handleChatSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("btnSend");
  const userText = input.value.trim();

  if (!userText) return;

  // Append User Message to UI
  appendMessage("user", userText);
  input.value = "";
  input.disabled = true;
  sendBtn.disabled = true;

  // Show typing indicator
  const typingId = appendTypingIndicator();

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userText }),
    });

    const data = await response.json();
    removeTypingIndicator(typingId);

    if (data.reply) {
      appendMessage("bot", data.reply);
      messageTurnCount++;

      // Advance stepper logic based on turn count
      if (messageTurnCount === 1) advanceStep(2);
      else if (messageTurnCount === 2) advanceStep(3);

      if (speechEnabled) {
        speakText(data.reply);
      }
    } else {
      appendMessage("bot", "⚠️ " + (data.error || "An error occurred while connecting with Sarvam AI."));
    }
  } catch (err) {
    removeTypingIndicator(typingId);
    appendMessage("bot", "⚠️ Network error. Please check your internet connection.");
  } finally {
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
  }
}

function appendMessage(sender, text) {
  const container = document.getElementById("chatMessages");
  const card = document.createElement("div");
  card.className = `message-card msg-${sender}`;

  const isBot = sender === "bot";
  const avatar = isBot ? "🏛️" : "👤";
  const speaker = isBot ? "RTI Copilot" : "Citizen";

  card.innerHTML = `
    <div class="msg-avatar" aria-hidden="true">${avatar}</div>
    <div class="msg-content">
      <div class="msg-speaker">${speaker}</div>
      <div class="msg-text">${escapeHtml(text)}</div>
      ${isBot ? `
        <div class="msg-actions">
          <button type="button" class="btn-listen" onclick="speakMessage(this)" aria-label="Listen to this message">
            🔊 Listen
          </button>
        </div>
      ` : ""}
    </div>
  `;

  container.appendChild(card);
  container.scrollTop = container.scrollHeight;
}

function appendTypingIndicator() {
  const container = document.getElementById("chatMessages");
  const id = "typing-" + Date.now();
  const card = document.createElement("div");
  card.id = id;
  card.className = "message-card msg-bot";
  card.innerHTML = `
    <div class="msg-avatar" aria-hidden="true">🏛️</div>
    <div class="msg-content">
      <div class="msg-speaker">RTI Copilot</div>
      <div class="msg-text" style="color: var(--color-text-muted); font-style: italic;">
        Consulting legal records and formulating guidance with Sarvam AI...
      </div>
    </div>
  `;
  container.appendChild(card);
  container.scrollTop = container.scrollHeight;
  return id;
}

function removeTypingIndicator(id) {
  const el = document.getElementById(id);
  if (el) el.remove();
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

/* ==========================================================================
   STATUTORY RTI DRAFTING & MULTILINGUAL TRANSLATION
   ========================================================================== */

async function generateDraft() {
  switchRightTab("draft");
  setMobileView("draft");
  advanceStep(4);

  const draftEl = document.getElementById("draftContent");
  draftEl.textContent = "Synthesizing formal statutory RTI application under Section 6(1) of the RTI Act, 2005...";

  try {
    const lang = document.getElementById("langSelect").value;
    const response = await fetch("/api/generate-draft", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ language_code: lang }),
    });

    const data = await response.json();
    if (data.draft) {
      currentDraftText = data.draft;
      draftEl.textContent = data.draft;
      if (speechEnabled) {
        speakText("Your formal RTI application draft has been successfully generated.");
      }
    } else {
      draftEl.textContent = "Error: " + (data.error || "Could not generate draft.");
    }
  } catch (err) {
    draftEl.textContent = "Error connecting to server. Please ensure the local server is running.";
  }
}

async function handleLanguageChange() {
  if (!currentDraftText) return;

  const lang = document.getElementById("langSelect").value;
  const draftEl = document.getElementById("draftContent");
  draftEl.textContent = "Translating statutory draft into selected Indic language using Sarvam Translation API...";

  try {
    const response = await fetch("/api/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: currentDraftText, language_code: lang }),
    });

    const data = await response.json();
    if (data.translated_text) {
      draftEl.textContent = data.translated_text;
    } else {
      draftEl.textContent = currentDraftText;
    }
  } catch (err) {
    draftEl.textContent = currentDraftText;
  }
}

function copyDraftToClipboard() {
  const text = document.getElementById("draftContent").textContent;
  if (!text || text.startsWith("[No draft")) {
    alert("Please compile a draft first.");
    return;
  }
  navigator.clipboard.writeText(text).then(() => {
    alert("Formal RTI Application copied to clipboard!");
  });
}

function downloadDraftFile() {
  const text = document.getElementById("draftContent").textContent;
  if (!text || text.startsWith("[No draft")) {
    alert("Please compile a draft first.");
    return;
  }
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Formal_RTI_Application_Sec6(1).txt";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ==========================================================================
   GROUNDED OFFICIAL RECORDS
   ========================================================================== */

async function loadGroundedDocuments() {
  try {
    const response = await fetch("/api/documents");
    const docs = await response.json();
    
    // Update badge counts
    document.querySelectorAll(".doc-badge-count").forEach(el => {
      el.textContent = docs.length;
    });

    const listEl = document.getElementById("groundedList");
    listEl.innerHTML = "";

    docs.forEach(doc => {
      const card = document.createElement("div");
      card.className = "record-card";
      card.innerHTML = `
        <div class="record-header">
          <div class="record-title">📑 ${escapeHtml(doc.title)}</div>
        </div>
        <div class="record-content">${escapeHtml(doc.content)}</div>
      `;
      listEl.appendChild(card);
    });
  } catch (e) {
    console.error("Error loading grounded records:", e);
  }
}

async function handleAddDocument() {
  const titleInput = document.getElementById("docTitleInput");
  const contentInput = document.getElementById("docContentInput");
  const title = titleInput.value.trim();
  const content = contentInput.value.trim();

  if (!title || !content) {
    alert("Please provide both document title and content.");
    return;
  }

  try {
    const response = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content }),
    });
    const data = await response.json();

    if (data.success) {
      titleInput.value = "";
      contentInput.value = "";
      await loadGroundedDocuments();
      alert("Government record attached! RTI Copilot is now grounded with this official notice.");
    }
  } catch (e) {
    alert("Failed to add document.");
  }
}

/* ==========================================================================
   NAVIGATION & VIEW TOGGLES
   ========================================================================== */

function switchRightTab(tabName) {
  const isDraft = tabName === "draft";
  document.getElementById("tabDraftBtn").classList.toggle("active", isDraft);
  document.getElementById("tabDraftBtn").setAttribute("aria-selected", isDraft);
  document.getElementById("tabDocsBtn").classList.toggle("active", !isDraft);
  document.getElementById("tabDocsBtn").setAttribute("aria-selected", !isDraft);

  document.getElementById("paneDraft").style.display = isDraft ? "flex" : "none";
  document.getElementById("paneDocs").style.display = !isDraft ? "flex" : "none";

  if (!isDraft) {
    loadGroundedDocuments();
  }
}

function setMobileView(viewName) {
  document.body.setAttribute("data-mobile-view", viewName);
  
  document.getElementById("mTabChat").classList.toggle("active", viewName === "chat");
  document.getElementById("mTabDraft").classList.toggle("active", viewName === "draft");
  document.getElementById("mTabDocs").classList.toggle("active", viewName === "docs");

  if (viewName === "draft") {
    switchRightTab("draft");
  } else if (viewName === "docs") {
    switchRightTab("docs");
  }
}

async function confirmReset() {
  if (confirm("Are you sure you want to start a new RTI application session?")) {
    await fetch("/api/reset", { method: "POST" });
    location.reload();
  }
}

/**
 * RTI COPILOT — Voice-First Accessible Frontend Client
 * Powered by Sarvam AI:
 * - Speech-to-Text: Saaras v3 (multilingual regional transcription & auto language detection)
 * - Text-to-Speech: Bulbul v3 (11 official Indic regional voices)
 * - Conversational Engine: sarvam-105b-conversations
 */

// State Management
let currentDraftText = "";
let autoVoicePlayback = true;
let messageTurnCount = 0;

// Voice Recording State
let mediaRecorder = null;
let audioChunks = [];
let isRecording = false;
let currentAudioElement = null;

// Initialize on DOM ready
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

function toggleAutoVoice() {
  autoVoicePlayback = !autoVoicePlayback;
  const statusEl = document.getElementById("autoVoiceStatus");
  statusEl.textContent = autoVoicePlayback ? "Enabled" : "Muted";
  document.getElementById("btnAutoPlayVoice").setAttribute("aria-pressed", autoVoicePlayback);
  document.getElementById("btnAutoPlayVoice").classList.toggle("active", autoVoicePlayback);

  if (!autoVoicePlayback) {
    stopAudioPlayback();
  }
}

/* ==========================================================================
   SARVAM VOICE AGENT (Speech-to-Text & Text-to-Speech)
   ========================================================================== */

async function toggleVoiceRecording() {
  if (isRecording) {
    stopVoiceRecording();
  } else {
    startVoiceRecording();
  }
}

async function startVoiceRecording() {
  stopAudioPlayback();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert("Voice recording is not supported in this browser. Please use Chrome, Edge, Firefox, or Safari.");
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    // Determine supported mime type
    let mimeType = "audio/webm";
    if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
      mimeType = "audio/webm;codecs=opus";
    } else if (MediaRecorder.isTypeSupported("audio/webm")) {
      mimeType = "audio/webm";
    } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
      mimeType = "audio/mp4";
    }

    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream, { mimeType });

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = () => {
      stream.getTracks().forEach(track => track.stop());
      processRecordedVoice(mimeType);
    };

    mediaRecorder.start();
    isRecording = true;

    // Update UI for recording state
    const btn = document.getElementById("btnVoiceRecord");
    btn.classList.add("recording");
    document.getElementById("voiceMicIcon").textContent = "⏹";
    document.getElementById("voiceBtnLabel").textContent = "Stop & Submit";
    document.getElementById("voiceStatusText").innerHTML = "🔴 <strong>Listening...</strong> Speak your RTI query clearly in your language.";

  } catch (err) {
    console.error("Microphone access error:", err);
    alert("Microphone access was denied or is unavailable. Please grant microphone permission.");
  }
}

function stopVoiceRecording() {
  if (mediaRecorder && isRecording) {
    isRecording = false;
    mediaRecorder.stop();

    const btn = document.getElementById("btnVoiceRecord");
    btn.classList.remove("recording");
    document.getElementById("voiceMicIcon").textContent = "⏳";
    document.getElementById("voiceBtnLabel").textContent = "Processing...";
    document.getElementById("voiceStatusText").textContent = "⚡ Transcribing speech with Sarvam Saaras STT...";
  }
}

async function processRecordedVoice(mimeType) {
  const audioBlob = new Blob(audioChunks, { type: mimeType });

  if (audioBlob.size < 500) {
    resetVoiceUI("Audio was too brief. Please try speaking again.");
    return;
  }

  // Convert Blob to Base64
  const reader = new FileReader();
  reader.readAsDataURL(audioBlob);

  reader.onloadend = async () => {
    const base64Data = reader.result.split(",")[1];
    const selectedLang = document.getElementById("voiceLangSelect").value;

    const typingId = appendTypingIndicator("Transcribing and consulting Sarvam-105b...");

    try {
      const response = await fetch("/api/voice-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio_base64: base64Data,
          mime_type: mimeType,
          language_code: selectedLang,
        }),
      });

      const data = await response.json();
      removeTypingIndicator(typingId);

      if (data.transcript) {
        // Append citizen speech transcript
        appendMessage("user", data.transcript);

        // Append assistant reply with attached audio
        appendMessage("bot", data.reply, data.audio_base64);
        messageTurnCount++;

        // Advance stepper logic
        if (messageTurnCount === 1) advanceStep(2);
        else if (messageTurnCount === 2) advanceStep(3);

        // Auto-synchronize detected language with Draft dropdown
        if (data.language_code && data.language_code !== "unknown") {
          const langSelect = document.getElementById("langSelect");
          if ([...langSelect.options].some(o => o.value === data.language_code)) {
            langSelect.value = data.language_code;
          }
        }

        // Play Sarvam Bulbul Voice
        if (autoVoicePlayback && data.audio_base64) {
          playBase64Audio(data.audio_base64, "Playing Sarvam Bulbul Indic Voice...");
        }

        resetVoiceUI(`Recognized (${data.language_code || "Indic"}): "${data.transcript.slice(0, 40)}..."`);
      } else {
        removeTypingIndicator(typingId);
        appendMessage("bot", "⚠️ " + (data.reply || "Could not transcribe audio."));
        resetVoiceUI("Could not recognize speech. Please try again.");
      }
    } catch (err) {
      removeTypingIndicator(typingId);
      console.error("Voice chat error:", err);
      appendMessage("bot", "⚠️ Network error connecting to Sarvam Voice services.");
      resetVoiceUI("Connection failed. Ready to try again.");
    }
  };
}

function resetVoiceUI(statusMsg) {
  const btn = document.getElementById("btnVoiceRecord");
  btn.classList.remove("recording");
  document.getElementById("voiceMicIcon").textContent = "🎙️";
  document.getElementById("voiceBtnLabel").textContent = "Tap to Speak";
  document.getElementById("voiceStatusText").textContent = statusMsg || "Ready to listen in all Indian regional languages.";
}

function playBase64Audio(base64Audio, label) {
  stopAudioPlayback();

  try {
    currentAudioElement = new Audio("data:audio/wav;base64," + base64Audio);
    const playbackBar = document.getElementById("voicePlaybackBar");
    const statusText = document.getElementById("playbackStatus");
    
    playbackBar.style.display = "flex";
    statusText.textContent = label || "Speaking response via Sarvam Bulbul...";

    currentAudioElement.onended = () => {
      playbackBar.style.display = "none";
      currentAudioElement = null;
    };

    currentAudioElement.onerror = (e) => {
      console.error("Audio playback error:", e);
      playbackBar.style.display = "none";
      currentAudioElement = null;
    };

    currentAudioElement.play();
  } catch (err) {
    console.error("Audio error:", err);
  }
}

function stopAudioPlayback() {
  if (currentAudioElement) {
    currentAudioElement.pause();
    currentAudioElement = null;
  }
  document.getElementById("voicePlaybackBar").style.display = "none";
}

/* ==========================================================================
   CONVERSATIONAL DIALOGUE (TEXT INPUT)
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

  // Append user message
  appendMessage("user", userText);
  input.value = "";
  input.disabled = true;
  sendBtn.disabled = true;

  const typingId = appendTypingIndicator("Sarvam-105b is formulating response...");

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

      if (messageTurnCount === 1) advanceStep(2);
      else if (messageTurnCount === 2) advanceStep(3);

      // If auto voice playback is enabled, synthesize reply with Bulbul
      if (autoVoicePlayback) {
        synthesizeAndPlayMessage(data.reply);
      }
    } else {
      appendMessage("bot", "⚠️ " + (data.error || "An error occurred with Sarvam AI."));
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

async function synthesizeAndPlayMessage(text) {
  try {
    const lang = document.getElementById("voiceLangSelect").value;
    const targetLang = lang === "unknown" ? "en-IN" : lang;

    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language_code: targetLang }),
    });
    const data = await res.json();
    if (data.audio_base64) {
      playBase64Audio(data.audio_base64, "Playing Sarvam Bulbul Indic Voice...");
    }
  } catch (err) {
    console.error("TTS error:", err);
  }
}

function speakSarvamVoice(btn) {
  const card = btn.closest(".message-card");
  const cachedAudio = card.getAttribute("data-audio-base64");
  
  if (cachedAudio) {
    playBase64Audio(cachedAudio, "Replaying Sarvam Bulbul Voice...");
    return;
  }

  const textEl = card.querySelector(".msg-text");
  if (textEl) {
    synthesizeAndPlayMessage(textEl.innerText);
  }
}

async function speakFullDraft() {
  if (!currentDraftText || currentDraftText.startsWith("[No draft")) {
    alert("Please compile a formal draft first.");
    return;
  }

  const lang = document.getElementById("langSelect").value;
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: currentDraftText, language_code: lang }),
    });
    const data = await res.json();
    if (data.audio_base64) {
      playBase64Audio(data.audio_base64, "Reading formal RTI draft via Sarvam Bulbul...");
    } else {
      alert("Audio synthesis for draft completed.");
    }
  } catch (e) {
    alert("Error generating speech for draft.");
  }
}

function appendMessage(sender, text, audioBase64 = null) {
  const container = document.getElementById("chatMessages");
  const card = document.createElement("div");
  card.className = `message-card msg-${sender}`;
  if (audioBase64) {
    card.setAttribute("data-audio-base64", audioBase64);
  }

  const isBot = sender === "bot";
  const avatar = isBot ? "🏛️" : "👤";
  const speaker = isBot ? "RTI Copilot (Voice Agent)" : "Citizen";

  card.innerHTML = `
    <div class="msg-avatar" aria-hidden="true">${avatar}</div>
    <div class="msg-content">
      <div class="msg-speaker">${speaker}</div>
      <div class="msg-text">${escapeHtml(text)}</div>
      ${isBot ? `
        <div class="msg-actions">
          <button type="button" class="btn-listen" onclick="speakSarvamVoice(this)" aria-label="Listen using Sarvam Bulbul voice">
            🔊 Sarvam Voice
          </button>
        </div>
      ` : ""}
    </div>
  `;

  container.appendChild(card);
  container.scrollTop = container.scrollHeight;
}

function appendTypingIndicator(customLabel) {
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
        ${customLabel || "Formulating statutory guidance with Sarvam AI..."}
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
   STATUTORY RTI DRAFTING & REGIONAL TRANSLATION
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

      if (autoVoicePlayback) {
        synthesizeAndPlayMessage("Your formal RTI application draft has been successfully synthesized under the RTI Act, 2005.");
      }
    } else {
      draftEl.textContent = "Error: " + (data.error || "Could not generate draft.");
    }
  } catch (err) {
    draftEl.textContent = "Error connecting to server. Please ensure the local server is running.";
  }
}

async function handleLanguageChange() {
  if (!currentDraftText || currentDraftText.startsWith("[No draft")) return;

  const lang = document.getElementById("langSelect").value;
  const draftEl = document.getElementById("draftContent");
  draftEl.textContent = "Translating statutory draft into selected Indic regional language using Sarvam Translation API...";

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
   STEPPER & NAVIGATION
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
    stopAudioPlayback();
    await fetch("/api/reset", { method: "POST" });
    location.reload();
  }
}

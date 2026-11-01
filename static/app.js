/**
 * RTI COPILOT — Ultra-Reliable Voice-First Accessible Frontend Client
 * Powered by Sarvam AI:
 * - Speech-to-Text: Saaras v3 (multilingual regional transcription & auto language detection)
 * - Text-to-Speech: Bulbul v3 (11 official Indic regional voices)
 * - Conversational Engine: sarvam-105b-conversations
 * 
 * Features:
 * - Pure 16kHz PCM WAV Audio Encoder via Web Audio API (100% reliable for Sarvam Saaras)
 * - MediaRecorder fallback with cleaned MIME types
 * - Live microphone level visualizer
 */

// State Management
let currentDraftText = "";
let autoVoicePlayback = true;
let messageTurnCount = 0;

// Web Audio WAV Recording State
let audioContext = null;
let mediaStream = null;
let scriptProcessor = null;
let audioInputNode = null;
let pcmSamples = [];
let isRecording = false;
let currentAudioElement = null;

// Fallback MediaRecorder State
let mediaRecorder = null;
let fallbackChunks = [];

// Initialize on DOM ready
document.addEventListener("DOMContentLoaded", () => {
  const savedFont = localStorage.getItem("rti_font_size") || "normal";
  const savedTheme = localStorage.getItem("rti_theme") || "light";
  setFontSize(savedFont);
  setTheme(savedTheme);

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
   HIGH-FIDELITY 16kHz PCM WAV RECORDER (Web Audio API)
   Generates standard, uncompressed 16kHz mono WAV for Sarvam Saaras STT
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
    alert("Microphone recording is not supported in this browser. Please use Chrome, Edge, Firefox, or Safari.");
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: { ideal: 16000 },
        echoCancellation: true,
        noiseSuppression: true,
      }
    });

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (AudioContextClass) {
      // Primary Route: Web Audio API PCM Recording (16kHz WAV)
      audioContext = new AudioContextClass({ sampleRate: 16000 });
      if (audioContext.state === "suspended") {
        await audioContext.resume();
      }

      audioInputNode = audioContext.createMediaStreamSource(mediaStream);
      // Buffer size 4096, 1 input channel, 1 output channel
      scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);
      pcmSamples = [];

      scriptProcessor.onaudioprocess = (e) => {
        if (!isRecording) return;
        const inputData = e.inputBuffer.getChannelData(0);
        // Copy float samples
        pcmSamples.push(new Float32Array(inputData));

        // Update live volume visual feedback
        let sum = 0;
        for (let i = 0; i < inputData.length; i += 16) {
          sum += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sum / (inputData.length / 16));
        updateMicVisualFeedback(rms);
      };

      audioInputNode.connect(scriptProcessor);
      scriptProcessor.connect(audioContext.destination);

    } else {
      // Fallback Route: MediaRecorder
      startMediaRecorderFallback(mediaStream);
    }

    isRecording = true;

    // Update UI for recording state
    const btn = document.getElementById("btnVoiceRecord");
    btn.classList.add("recording");
    document.getElementById("voiceMicIcon").textContent = "⏹";
    document.getElementById("voiceBtnLabel").textContent = "Stop & Submit";
    document.getElementById("voiceStatusText").innerHTML = "🔴 <strong>Listening...</strong> Speak your RTI query clearly in any regional language.";

  } catch (err) {
    console.error("Microphone access error:", err);
    alert("Could not access microphone: " + (err.message || "Permission denied."));
  }
}

function updateMicVisualFeedback(rms) {
  const pulseRing = document.getElementById("voicePulseRing");
  if (pulseRing && isRecording) {
    const scale = Math.min(1.8, 1 + rms * 3.5);
    pulseRing.style.transform = `scale(${scale})`;
    pulseRing.style.opacity = Math.min(1, 0.4 + rms * 2);
  }
}

function startMediaRecorderFallback(stream) {
  let mimeType = "audio/webm";
  if (MediaRecorder.isTypeSupported("audio/webm")) {
    mimeType = "audio/webm";
  } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
    mimeType = "audio/mp4";
  }

  fallbackChunks = [];
  mediaRecorder = new MediaRecorder(stream, { mimeType });
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) fallbackChunks.push(e.data);
  };
  mediaRecorder.start(250);
}

function stopVoiceRecording() {
  if (!isRecording) return;
  isRecording = false;

  const btn = document.getElementById("btnVoiceRecord");
  btn.classList.remove("recording");
  document.getElementById("voiceMicIcon").textContent = "⏳";
  document.getElementById("voiceBtnLabel").textContent = "Processing...";
  document.getElementById("voiceStatusText").textContent = "⚡ Transcribing speech with Sarvam Saaras STT...";

  // Reset pulse ring
  const pulseRing = document.getElementById("voicePulseRing");
  if (pulseRing) {
    pulseRing.style.transform = "scale(1)";
    pulseRing.style.opacity = "0";
  }

  // Stop Web Audio processing
  if (scriptProcessor && audioInputNode) {
    try {
      audioInputNode.disconnect();
      scriptProcessor.disconnect();
    } catch (e) {}
  }

  // Stop MediaStream tracks
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
  }

  // Process gathered audio
  if (pcmSamples && pcmSamples.length > 0) {
    const wavBlob = encodePCMToWav(pcmSamples, audioContext ? audioContext.sampleRate : 16000);
    if (audioContext) {
      audioContext.close().catch(() => {});
    }
    processRecordedBlob(wavBlob, "audio/wav");
  } else if (mediaRecorder) {
    mediaRecorder.onstop = () => {
      const blob = new Blob(fallbackChunks, { type: "audio/webm" });
      processRecordedBlob(blob, "audio/webm");
    };
    mediaRecorder.stop();
  } else {
    resetVoiceUI("No audio was recorded. Please try speaking again.");
  }
}

/**
 * Encodes raw PCM float32 samples into 16-bit PCM WAV (16kHz mono)
 */
function encodePCMToWav(chunks, sampleRate) {
  // Calculate total samples
  let totalLength = 0;
  for (let i = 0; i < chunks.length; i++) {
    totalLength += chunks[i].length;
  }

  // Merge float32 arrays
  const merged = new Float32Array(totalLength);
  let offset = 0;
  for (let i = 0; i < chunks.length; i++) {
    merged.set(chunks[i], offset);
    offset += chunks[i].length;
  }

  // Downsample to 16kHz if audioContext ran at higher rate (e.g. 44.1kHz or 48kHz)
  let targetSamples = merged;
  const targetRate = 16000;
  if (sampleRate !== targetRate) {
    const ratio = sampleRate / targetRate;
    const newLength = Math.round(merged.length / ratio);
    targetSamples = new Float32Array(newLength);
    for (let i = 0; i < newLength; i++) {
      targetSamples[i] = merged[Math.min(Math.round(i * ratio), merged.length - 1)];
    }
  }

  // Create 44-byte WAV header + 16-bit PCM data
  const buffer = new ArrayBuffer(44 + targetSamples.length * 2);
  const view = new DataView(buffer);

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /* RIFF identifier */
  writeString(view, 0, 'RIFF');
  /* file length */
  view.setUint32(4, 36 + targetSamples.length * 2, true);
  /* RIFF type */
  writeString(view, 8, 'WAVE');
  /* format chunk identifier */
  writeString(view, 12, 'fmt ');
  /* format chunk length */
  view.setUint32(16, 16, true);
  /* sample format (1 = raw PCM) */
  view.setUint16(20, 1, true);
  /* channel count (1 = mono) */
  view.setUint16(22, 1, true);
  /* sample rate (16000 Hz) */
  view.setUint32(24, targetRate, true);
  /* byte rate (sampleRate * 2) */
  view.setUint32(28, targetRate * 2, true);
  /* block align (2 bytes per sample) */
  view.setUint16(32, 2, true);
  /* bits per sample (16 bits) */
  view.setUint16(34, 16, true);
  /* data chunk identifier */
  writeString(view, 36, 'data');
  /* data chunk length */
  view.setUint32(40, targetSamples.length * 2, true);

  // Write 16-bit PCM audio samples
  let sampleOffset = 44;
  for (let i = 0; i < targetSamples.length; i++) {
    const s = Math.max(-1, Math.min(1, targetSamples[i]));
    view.setInt16(sampleOffset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    sampleOffset += 2;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

async function processRecordedBlob(audioBlob, mimeType) {
  if (audioBlob.size < 600) {
    resetVoiceUI("Audio was too short. Please speak your query clearly.");
    return;
  }

  const reader = new FileReader();
  reader.readAsDataURL(audioBlob);

  reader.onloadend = async () => {
    const base64Data = reader.result.split(",")[1];
    const selectedLang = document.getElementById("voiceLangSelect").value;

    const typingId = appendTypingIndicator("Sarvam Saaras STT transcribing speech...");

    try {
      const response = await fetch("/api/voice-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio_base64: base64Data,
          mime_type: mimeType, // Always clean "audio/wav" or "audio/webm"
          language_code: selectedLang,
        }),
      });

      const data = await response.json();
      removeTypingIndicator(typingId);

      if (data.transcript && data.transcript.trim()) {
        appendMessage("user", data.transcript);
        appendMessage("bot", data.reply, data.audio_base64);
        messageTurnCount++;

        if (messageTurnCount === 1) advanceStep(2);
        else if (messageTurnCount === 2) advanceStep(3);

        if (data.language_code && data.language_code !== "unknown") {
          const langSelect = document.getElementById("langSelect");
          if ([...langSelect.options].some(o => o.value === data.language_code)) {
            langSelect.value = data.language_code;
          }
        }

        if (autoVoicePlayback && data.audio_base64) {
          playBase64Audio(data.audio_base64, "Playing Sarvam Bulbul Indic Voice...");
        }

        resetVoiceUI(`Recognized (${data.language_code || "Indic"}): "${data.transcript.slice(0, 45)}..."`);
      } else {
        removeTypingIndicator(typingId);
        const errMsg = data.error || data.reply || "Could not recognize clear speech. Please try speaking closer to your mic.";
        appendMessage("bot", "⚠️ " + errMsg);
        resetVoiceUI("Speech recognition failed. Please try again.");
      }
    } catch (err) {
      removeTypingIndicator(typingId);
      console.error("Voice chat error:", err);
      appendMessage("bot", "⚠️ Connection error to voice service. Please ensure the local server is running.");
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

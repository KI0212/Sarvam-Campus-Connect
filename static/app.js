/**
 * RTI Copilot — Voice-First Frontend
 * Sarvam AI: Saaras v3 STT · Bulbul v3 TTS · sarvam-105b-conversations
 *
 * Voice pipeline (batch REST):
 *   mic → 16kHz PCM WAV → POST /api/voice-chat → {transcript, reply, audio_base64}
 * Text pipeline:
 *   textarea → POST /api/chat → {reply} → TTS POST /api/tts → play
 */

/* ── STATE ──────────────────────────────────────────────── */
let autoVoicePlayback = true;
let isRecording       = false;
let isProcessing      = false;
let isSpeaking        = false;
let currentAudio      = null;
let currentDraft      = '';

// Web Audio recording state
let audioCtx      = null;
let mediaStream   = null;
let sourceNode    = null;
let processorNode = null;
let pcmChunks     = [];

/* ── INIT ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  // Restore preferences
  const savedTheme = localStorage.getItem('rti_theme') || 'dark';
  const savedSize  = localStorage.getItem('rti_font_size') || 'normal';
  applyTheme(savedTheme);
  applyFontSize(savedSize);

  loadDocuments();
});

/* ── THEME & FONT ────────────────────────────────────────── */
function setTheme(t)    { applyTheme(t); localStorage.setItem('rti_theme', t); }
function setFontSize(s) { applyFontSize(s); localStorage.setItem('rti_font_size', s); }

function applyTheme(t) {
  document.body.setAttribute('data-theme', t);
  ['btnThemeLight','btnThemeDark','btnThemeHC'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.setAttribute('aria-pressed', 'false');
  });
  const map = { light: 'btnThemeLight', dark: 'btnThemeDark', 'high-contrast': 'btnThemeHC' };
  const el = document.getElementById(map[t]);
  if (el) { el.setAttribute('aria-pressed', 'true'); el.classList.add('active'); }
  Object.values(map).forEach(id => {
    const b = document.getElementById(id);
    if (b && id !== map[t]) b.classList.remove('active');
  });
}

function applyFontSize(s) {
  document.body.setAttribute('data-font-size', s);
  ['btnFontNormal','btnFontLarge','btnFontXLarge'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.setAttribute('aria-pressed', 'false'); el.classList.remove('active'); }
  });
  const map = { normal:'btnFontNormal', large:'btnFontLarge', xlarge:'btnFontXLarge' };
  const el = document.getElementById(map[s]);
  if (el) { el.setAttribute('aria-pressed', 'true'); el.classList.add('active'); }
}

/* ── AUTO VOICE TOGGLE ───────────────────────────────────── */
function toggleAutoVoice() {
  autoVoicePlayback = !autoVoicePlayback;
  const btn  = document.getElementById('btnAutoVoice');
  const dot  = document.getElementById('voiceDot');
  btn.setAttribute('aria-pressed', String(autoVoicePlayback));
  if (dot) dot.classList.toggle('active', autoVoicePlayback);
  if (!autoVoicePlayback) stopAudio();
}

/* ── RESET ───────────────────────────────────────────────── */
function confirmReset() {
  if (confirm('Reset this session? The conversation and draft will be cleared.')) {
    fetch('/api/reset', { method: 'POST' })
      .then(() => {
        document.getElementById('chatMessages').innerHTML = `
          <div class="msg assistant">
            <div class="msg-avatar" aria-hidden="true">🏛</div>
            <div class="msg-bubble">
              <p>Session reset. How can I help you draft your RTI application?</p>
            </div>
          </div>`;
        clearDraft();
        stopAudio();
      })
      .catch(err => console.error('Reset failed:', err));
  }
}

/* ── VOICE RECORDING ─────────────────────────────────────── */
async function toggleVoice() {
  if (isSpeaking) { stopAudio(); return; }
  if (isRecording) { stopRecording(); return; }
  if (isProcessing) return;
  await startRecording();
}

async function startRecording() {
  if (!navigator.mediaDevices?.getUserMedia) {
    showAlert('Your browser does not support microphone access. Please use Chrome, Edge, Firefox, or Safari.');
    return;
  }

  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        sampleRate: { ideal: 16000 },
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      }
    });
  } catch (err) {
    showAlert(`Microphone access denied: ${err.message || 'Permission denied.'}`);
    return;
  }

  const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtxClass) {
    showAlert('Web Audio API not available. Please use a modern browser.');
    mediaStream.getTracks().forEach(t => t.stop());
    return;
  }

  audioCtx = new AudioCtxClass({ sampleRate: 16000 });
  if (audioCtx.state === 'suspended') await audioCtx.resume();

  sourceNode    = audioCtx.createMediaStreamSource(mediaStream);
  processorNode = audioCtx.createScriptProcessor(4096, 1, 1);
  pcmChunks     = [];

  processorNode.onaudioprocess = e => {
    if (!isRecording) return;
    const data = e.inputBuffer.getChannelData(0);
    pcmChunks.push(new Float32Array(data));
    // Update level bar
    let sum = 0;
    for (let i = 0; i < data.length; i += 8) sum += data[i] * data[i];
    const rms = Math.sqrt(sum / (data.length / 8));
    setLevelBar(Math.min(100, rms * 300));
  };

  sourceNode.connect(processorNode);
  processorNode.connect(audioCtx.destination);
  isRecording = true;

  setOrbState('recording');
  setHint('🔴 Listening… speak your RTI query');
}

function stopRecording() {
  if (!isRecording) return;
  isRecording = false;

  // Disconnect Web Audio nodes
  try { sourceNode?.disconnect(); processorNode?.disconnect(); } catch (_) {}
  mediaStream?.getTracks().forEach(t => t.stop());
  setLevelBar(0);

  if (pcmChunks.length === 0) {
    resetOrb();
    setHint('No audio captured. Please try again.');
    return;
  }

  const wavBlob = encodeWav(pcmChunks, audioCtx?.sampleRate || 16000);
  audioCtx?.close().catch(() => {});
  submitAudio(wavBlob);
}

/* ── AUDIO SUBMISSION ────────────────────────────────────── */
async function submitAudio(blob) {
  isProcessing = true;
  setOrbState('processing');
  setHint('⚡ Transcribing with Sarvam Saaras…');
  addLoadingBubble('user-loading');

  const lang = document.getElementById('voiceLang')?.value || 'unknown';

  try {
    const arrayBuf = await blob.arrayBuffer();
    const b64      = bufToBase64(arrayBuf);

    const res  = await fetch('/api/voice-chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_base64: b64, mime_type: 'audio/wav', language_code: lang })
    });
    const data = await res.json();

    removeLoadingBubble('user-loading');

    if (data.error && !data.reply) {
      addMessage('assistant', `⚠️ ${data.error}`);
      resetOrb();
      setHint('Tap to speak in any Indian language');
      isProcessing = false;
      return;
    }

    // Show transcript
    if (data.transcript) addMessage('user', data.transcript);

    // Show AI reply
    if (data.reply) {
      addMessage('assistant', data.reply);
      if (data.checklist) {
        updateReadinessTracker(data.checklist);
      }
      if (data.draft) {
        currentDraft = data.draft;
        showDraft(data.draft);
        showToast('RTI Draft compiled ✓');
      }
      if (autoVoicePlayback && data.audio_base64) {
        await playBase64Audio(data.audio_base64);
      }
    }

  } catch (err) {
    removeLoadingBubble('user-loading');
    addMessage('assistant', `⚠️ Network error: ${err.message}`);
  }

  isProcessing = false;
  resetOrb();
  setHint('Tap to speak in any Indian language');
}

/* ── TEXT CHAT ───────────────────────────────────────────── */
function handleEnterKey(e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendTextMessage(); }
}

async function sendTextMessage() {
  const input = document.getElementById('textInput');
  const text  = input?.value.trim();
  if (!text) return;
  input.value = '';

  addMessage('user', text);
  addLoadingBubble('chat-loading');

  try {
    const res  = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text })
    });
    const data = await res.json();

    removeLoadingBubble('chat-loading');

    if (data.reply) {
      addMessage('assistant', data.reply);
      if (data.checklist) {
        updateReadinessTracker(data.checklist);
      }
      if (data.draft) {
        currentDraft = data.draft;
        showDraft(data.draft);
        showToast('RTI Draft compiled ✓');
      }
      if (autoVoicePlayback) {
        const lang = document.getElementById('voiceLang')?.value || 'en-IN';
        playTTS(data.reply, lang);
      }
    } else if (data.error) {
      addMessage('assistant', `⚠️ ${data.error}`);
    }
  } catch (err) {
    removeLoadingBubble('chat-loading');
    addMessage('assistant', `⚠️ ${err.message}`);
  }
}

/* ── DRAFT GENERATION ────────────────────────────────────── */
async function generateDraft() {
  const lang = document.getElementById('draftLang')?.value || 'en-IN';
  const btn  = document.querySelector('.compile-btn');
  if (btn) { btn.textContent = 'Compiling…'; btn.disabled = true; }

  try {
    const res  = await fetch('/api/generate-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language_code: lang })
    });
    const data = await res.json();

    if (data.draft) {
      currentDraft = data.draft;
      showDraft(data.draft);
    } else if (data.error) {
      showAlert(`Could not generate draft: ${data.error}`);
    }
  } catch (err) {
    showAlert(`Draft generation failed: ${err.message}`);
  }

  if (btn) { btn.textContent = ''; btn.disabled = false;
    btn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2v20M2 12h20" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>
    </svg> Compile RTI Draft`; }
}

async function translateDraft() {
  if (!currentDraft) { showAlert('Generate a draft first, then translate.'); return; }
  const lang = document.getElementById('draftLang')?.value || 'hi-IN';

  try {
    const res  = await fetch('/api/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: currentDraft, language_code: lang })
    });
    const data = await res.json();
    if (data.translated_text) showDraft(data.translated_text);
    else if (data.error) showAlert(`Translation failed: ${data.error}`);
  } catch (err) {
    showAlert(`Translation error: ${err.message}`);
  }
}

function showDraft(text) {
  const placeholder = document.getElementById('draftPlaceholder');
  const content     = document.getElementById('draftContent');
  if (placeholder) placeholder.classList.add('hidden');
  if (content) { content.textContent = text; content.classList.remove('hidden'); }
}

function clearDraft() {
  currentDraft = '';
  const placeholder = document.getElementById('draftPlaceholder');
  const content     = document.getElementById('draftContent');
  if (placeholder) placeholder.classList.remove('hidden');
  if (content) { content.textContent = ''; content.classList.add('hidden'); }
  updateReadinessTracker({ authority: false, records: false, period: false, applicant: false, fee: false, pct: 0 });
}

function updateReadinessTracker(cl) {
  if (!cl) return;
  const pctEl  = document.getElementById('readinessPct');
  const fillEl = document.getElementById('readinessFill');
  const pct = Math.min(100, Math.max(0, cl.pct || 0));
  if (pctEl)  pctEl.textContent = `${pct}%`;
  if (fillEl) fillEl.style.width = `${pct}%`;

  const map = {
    badgeAuth:      cl.authority,
    badgeRecords:   cl.records,
    badgePeriod:    cl.period,
    badgeApplicant: cl.applicant,
    badgeFee:       cl.fee,
  };

  Object.entries(map).forEach(([id, active]) => {
    const el = document.getElementById(id);
    if (el) el.classList.toggle('active', Boolean(active));
  });
}

/* ── DRAFT ACTIONS ───────────────────────────────────────── */
function copyDraft() {
  const text = document.getElementById('draftContent')?.textContent || '';
  if (!text) { showAlert('No draft to copy yet.'); return; }
  navigator.clipboard.writeText(text)
    .then(() => showToast('Draft copied to clipboard ✓'))
    .catch(() => showAlert('Copy failed. Please select the text manually.'));
}

function downloadDraft() {
  const text = document.getElementById('draftContent')?.textContent || '';
  if (!text) { showAlert('No draft to download yet.'); return; }
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = 'RTI_Application.txt'; a.click();
  URL.revokeObjectURL(url);
}

async function speakDraft() {
  const text = document.getElementById('draftContent')?.textContent || '';
  if (!text) { showAlert('No draft to read yet.'); return; }
  const lang = document.getElementById('draftLang')?.value || 'en-IN';
  await playTTS(text.substring(0, 1000), lang); // Limit first 1000 chars
}

/* ── TEXT-TO-SPEECH ──────────────────────────────────────── */
async function playTTS(text, lang) {
  if (!autoVoicePlayback || !text) return;
  try {
    const res  = await fetch('/api/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.substring(0, 500), language_code: lang })
    });
    const data = await res.json();
    if (data.audio_base64) await playBase64Audio(data.audio_base64);
  } catch (err) {
    console.warn('TTS error:', err.message);
  }
}

async function playBase64Audio(b64) {
  stopAudio();
  isSpeaking = true;
  setOrbState('speaking');

  return new Promise(resolve => {
    try {
      const bytes = atob(b64);
      const arr   = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
      const blob  = new Blob([arr], { type: 'audio/wav' });
      const url   = URL.createObjectURL(blob);
      const audio = new Audio(url);
      currentAudio = audio;

      audio.onended = () => {
        URL.revokeObjectURL(url);
        isSpeaking = false;
        resetOrb();
        currentAudio = null;
        resolve();
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        isSpeaking = false;
        resetOrb();
        currentAudio = null;
        resolve();
      };
      audio.play().catch(() => { isSpeaking = false; resetOrb(); resolve(); });
    } catch (e) {
      isSpeaking = false;
      resetOrb();
      resolve();
    }
  });
}

function stopAudio() {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
    currentAudio = null;
  }
  isSpeaking = false;
  if (!isRecording && !isProcessing) resetOrb();
}

/* ── DOCUMENTS ───────────────────────────────────────────── */
async function loadDocuments() {
  try {
    const res  = await fetch('/api/documents');
    const docs = await res.json();
    renderDocList(docs);
  } catch (e) {
    console.warn('Failed to load documents:', e.message);
  }
}

async function addDocument() {
  const title   = document.getElementById('docTitle')?.value.trim();
  const content = document.getElementById('docBody')?.value.trim();
  if (!title || !content) { showAlert('Please enter both a title and content for the document.'); return; }

  try {
    const res  = await fetch('/api/documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title, content })
    });
    const data = await res.json();
    if (data.success) {
      document.getElementById('docTitle').value = '';
      document.getElementById('docBody').value  = '';
      await loadDocuments();
      showToast('Document attached ✓');
    }
  } catch (err) {
    showAlert(`Failed to add document: ${err.message}`);
  }
}

function renderDocList(docs) {
  const list   = document.getElementById('docList');
  const badge  = document.getElementById('docCount');
  if (!list) return;
  if (badge) badge.textContent = docs.length;

  list.innerHTML = docs.map(d => `
    <li class="doc-item">
      <svg class="doc-item-icon" width="14" height="14" viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
              stroke="currentColor" stroke-width="2"/>
        <polyline points="14 2 14 8 20 8" stroke="currentColor" stroke-width="2"/>
      </svg>
      <span>${escapeHtml(d.title)}</span>
    </li>`).join('');
}

/* ── CHAT UI HELPERS ─────────────────────────────────────── */
function addMessage(role, text) {
  const box = document.getElementById('chatMessages');
  if (!box) return;

  const isUser  = role === 'user';
  const avatar  = isUser ? '👤' : '🏛';
  const div     = document.createElement('div');
  div.className = `msg ${role}`;
  div.innerHTML = `
    <div class="msg-avatar" aria-hidden="true">${avatar}</div>
    <div class="msg-bubble">${formatMessage(text)}</div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function addLoadingBubble(id) {
  const box = document.getElementById('chatMessages');
  if (!box) return;
  const div = document.createElement('div');
  div.id        = id;
  div.className = 'msg assistant loading';
  div.innerHTML = `
    <div class="msg-avatar" aria-hidden="true">🏛</div>
    <div class="msg-bubble" aria-label="Loading response">
      <span style="display:inline-flex;gap:4px;align-items:center">
        <span style="animation:orbPulse 0.6s ease infinite">·</span>
        <span style="animation:orbPulse 0.6s ease 0.2s infinite">·</span>
        <span style="animation:orbPulse 0.6s ease 0.4s infinite">·</span>
      </span>
    </div>`;
  box.appendChild(div);
  box.scrollTop = box.scrollHeight;
}

function removeLoadingBubble(id) {
  document.getElementById(id)?.remove();
}

function formatMessage(text) {
  if (!text) return '';

  // If message contains full statutory draft block, render formatted card
  if (text.includes('--- BEGIN RTI DRAFT ---') && text.includes('--- END RTI DRAFT ---')) {
    const parts = text.split('--- BEGIN RTI DRAFT ---');
    const intro = parts[0].trim();
    const afterParts = parts[1].split('--- END RTI DRAFT ---');
    const draftContent = afterParts[0].trim();
    const outro = (afterParts[1] || '').trim();

    let html = '';
    if (intro) {
      html += `<div>${formatSimple(intro)}</div>`;
    }
    html += `
      <div class="chat-draft-preview">
        <div class="chat-draft-header">
          <span>📜 Statutory RTI Application</span>
          <button type="button" class="pill" onclick="copyDraft()" style="min-height:26px;padding:2px 8px;font-size:0.72rem;">Copy</button>
        </div>
        <pre class="chat-draft-body">${escapeHtml(draftContent)}</pre>
      </div>`;
    if (outro) {
      html += `<div style="margin-top:0.5rem;">${formatSimple(outro)}</div>`;
    }
    return html;
  }

  return formatSimple(text);
}

function formatSimple(text) {
  return escapeHtml(text)
    .replace(/\n\n+/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ── ORB STATE ───────────────────────────────────────────── */
function setOrbState(state) {
  const orb  = document.getElementById('btnVoice');
  const mic  = document.getElementById('orbMicIcon');
  const stop = document.getElementById('orbStopIcon');
  if (!orb) return;

  orb.className = `orb ${state}`;
  orb.setAttribute('aria-label', {
    recording:  'Tap to stop recording',
    processing: 'Processing — please wait',
    speaking:   'Tap to stop speaking',
    idle:       'Tap to speak your RTI query',
  }[state] || 'Tap to speak');

  if (mic && stop) {
    mic.classList.toggle('hidden',  state === 'recording' || state === 'processing');
    stop.classList.toggle('hidden', state !== 'recording');
  }
}

function resetOrb() { setOrbState('idle'); }

function setHint(text) {
  const el = document.getElementById('orbHint');
  if (el) el.textContent = text;
}

function setLevelBar(pct) {
  const fill = document.getElementById('levelFill');
  if (fill) fill.style.width = `${pct}%`;
}

/* ── TOAST & ALERT ───────────────────────────────────────── */
function showToast(msg) {
  let t = document.getElementById('_toast');
  if (!t) {
    t = document.createElement('div');
    t.id = '_toast';
    Object.assign(t.style, {
      position:'fixed', bottom:'1.5rem', right:'1.5rem', zIndex:'9999',
      background:'var(--accent)', color:'#fff',
      padding:'0.65rem 1.1rem', borderRadius:'8px',
      fontSize:'0.85rem', fontWeight:'600',
      boxShadow:'0 4px 20px rgba(0,0,0,0.3)',
      transition:'opacity 0.3s',
      pointerEvents:'none',
    });
    document.body.appendChild(t);
  }
  t.textContent  = msg;
  t.style.opacity = '1';
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.style.opacity = '0'; }, 2500);
}

function showAlert(msg) {
  // Accessible alert in chat instead of alert()
  addMessage('assistant', `ℹ️ ${msg}`);
}

/* ── PCM → WAV ENCODER ───────────────────────────────────── */
function encodeWav(chunks, sampleRate) {
  // Merge chunks
  let total = 0;
  chunks.forEach(c => total += c.length);
  const merged = new Float32Array(total);
  let off = 0;
  chunks.forEach(c => { merged.set(c, off); off += c.length; });

  // Resample to 16kHz if needed
  const targetRate = 16000;
  let samples = merged;
  if (sampleRate !== targetRate) {
    const ratio     = sampleRate / targetRate;
    const newLen    = Math.round(merged.length / ratio);
    samples         = new Float32Array(newLen);
    for (let i = 0; i < newLen; i++) {
      samples[i] = merged[Math.min(Math.round(i * ratio), merged.length - 1)];
    }
  }

  // Build WAV
  const buf  = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buf);
  const ws   = (o, s) => { for (let i=0;i<s.length;i++) view.setUint8(o+i, s.charCodeAt(i)); };

  ws(0, 'RIFF');
  view.setUint32(4,  36 + samples.length * 2, true);
  ws(8, 'WAVE');
  ws(12, 'fmt ');
  view.setUint32(16, 16, true);   // chunk size
  view.setUint16(20, 1,  true);   // PCM
  view.setUint16(22, 1,  true);   // mono
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2,  true);
  view.setUint16(34, 16, true);
  ws(36, 'data');
  view.setUint32(40, samples.length * 2, true);

  let cursor = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(cursor, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    cursor += 2;
  }

  return new Blob([buf], { type: 'audio/wav' });
}

/* ── BASE64 HELPER ───────────────────────────────────────── */
function bufToBase64(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  let binary  = '';
  const chunk = 8192;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

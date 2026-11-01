"""
RTI Copilot — Voice-First Multilingual Legal Assistant
Powered by Sarvam AI (Saaras STT, Bulbul TTS, sarvam-105b-conversations)
Identical UI design to local web experience with ambient glowing voice orb & legal draft panel.
"""

import os
import io
import base64
import streamlit as st
from config import SUPPORTED_LANGUAGES, get_api_key
from copilot import RTICopilot

# Streamlit Page Config
st.set_page_config(
    page_title="RTI Copilot — Voice Legal Assistant · Sarvam AI",
    page_icon="⚖️",
    layout="wide",
    initial_sidebar_state="collapsed"
)

# ── INJECT LOCAL UI DESIGN SYSTEM & CSS ──────────────────────────────
st.markdown("""
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');

  :root {
    --bg:            #0a0b0f;
    --bg-elevated:   #12141a;
    --bg-card:       #16181f;
    --bg-input:      #1c1e27;
    --border:        rgba(255,255,255,0.07);
    --border-focus:  rgba(99,102,241,0.6);
    --text-primary:   #f1f3f9;
    --text-secondary: #8b8fa8;
    --text-muted:     #5a5d72;
    --accent:         #6366f1;
    --accent-glow:    rgba(99,102,241,0.35);
    --accent-hover:   #818cf8;
    --font: 'Inter', -apple-system, sans-serif;
    --font-legal: Georgia, 'Times New Roman', serif;
  }

  /* Global page reset */
  html, body, [data-testid="stAppViewContainer"] {
    background-color: var(--bg) !important;
    color: var(--text-primary) !important;
    font-family: var(--font) !important;
  }

  /* Hide default Streamlit top header & footer */
  header[data-testid="stHeader"] { display: none !important; }
  footer { display: none !important; }
  #MainMenu { display: none !important; }

  /* App container sizing */
  .block-container {
    max-width: 1400px !important;
    padding-top: 1rem !important;
    padding-bottom: 2rem !important;
  }

  /* ── TOP BAR BRANDING ─────────────────────────────────── */
  .app-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem 1.25rem;
    background: rgba(18, 20, 26, 0.85);
    backdrop-filter: blur(20px);
    border: 1px solid var(--border);
    border-radius: 14px;
    margin-bottom: 1.5rem;
  }
  .brand-group {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .brand-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: #f1f3f9;
    line-height: 1.2;
  }
  .brand-subtitle {
    font-size: 0.75rem;
    color: var(--text-muted);
  }
  .engine-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 9999px;
    background: rgba(99, 102, 241, 0.12);
    border: 1px solid rgba(99, 102, 241, 0.3);
    font-size: 0.78rem;
    color: #a5b4fc;
    font-weight: 500;
  }
  .engine-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #10b981;
    animation: dotPulse 1.8s infinite;
  }
  @keyframes dotPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.85); }
  }

  /* ── 2-COLUMN PANELS ──────────────────────────────────── */
  div[data-testid="column"] {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: 18px;
    padding: 1.25rem 1.25rem 1.5rem;
    display: flex;
    flex-direction: column;
  }

  /* ── GLOWING VOICE ORB HERO ───────────────────────────── */
  .orb-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 1.75rem 1rem 1.25rem;
    margin-bottom: 1rem;
    background: radial-gradient(ellipse at 50% 0%, rgba(99,102,241,0.12) 0%, transparent 70%);
    border-bottom: 1px solid var(--border);
    border-radius: 14px;
  }
  .orb-wrap {
    position: relative;
    width: 120px;
    height: 120px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .orb-ring {
    position: absolute;
    border-radius: 50%;
    border: 1px solid rgba(99,102,241,0.25);
    animation: ringPulse 3s ease-in-out infinite;
  }
  .ring-1 { width: 130px; height: 130px; animation-delay: 0s; }
  .ring-2 { width: 155px; height: 155px; animation-delay: 0.4s; opacity: 0.6; }
  .ring-3 { width: 180px; height: 180px; animation-delay: 0.8s; opacity: 0.3; }

  @keyframes ringPulse {
    0%, 100% { transform: scale(1); opacity: inherit; }
    50% { transform: scale(1.05); opacity: 0.15; }
  }

  .orb-core {
    position: relative;
    z-index: 2;
    width: 96px;
    height: 96px;
    border-radius: 50%;
    background: linear-gradient(135deg, #6366f1, #8b5cf6, #a855f7);
    box-shadow: 0 0 50px rgba(99,102,241,0.5), 0 0 100px rgba(139,92,246,0.25);
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 2rem;
    animation: orbFloat 3s ease-in-out infinite;
  }
  @keyframes orbFloat {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-3px); }
  }
  .orb-hint {
    font-size: 0.82rem;
    color: var(--text-secondary);
    margin-top: 1rem;
    text-align: center;
  }

  /* ── READINESS TRACKER ───────────────────────────────── */
  .readiness-card {
    padding: 0.85rem 1rem;
    background: var(--bg-elevated);
    border: 1px solid var(--border);
    border-radius: 12px;
    margin-bottom: 1rem;
  }
  .readiness-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 0.5rem;
  }
  .readiness-pct {
    color: #6366f1;
    font-weight: 700;
    font-size: 0.9rem;
  }
  .readiness-bar {
    width: 100%;
    height: 5px;
    background: var(--bg-input);
    border-radius: 9999px;
    overflow: hidden;
    margin-bottom: 0.65rem;
  }
  .readiness-fill {
    height: 100%;
    background: linear-gradient(90deg, #6366f1, #10b981);
    border-radius: 9999px;
    transition: width 0.3s ease;
  }
  .readiness-badges {
    display: flex;
    gap: 0.35rem;
    flex-wrap: wrap;
  }
  .r-badge {
    font-size: 0.72rem;
    padding: 2px 8px;
    border-radius: 9999px;
    border: 1px solid var(--border);
    color: var(--text-muted);
    background: var(--bg-input);
  }
  .r-badge-active {
    background: rgba(16, 185, 129, 0.15) !important;
    border-color: rgba(16, 185, 129, 0.4) !important;
    color: #10b981 !important;
    font-weight: 600 !important;
  }

  /* ── CHAT MESSAGES ───────────────────────────────────── */
  div[data-testid="stChatMessage"] {
    background: var(--bg-elevated) !important;
    border: 1px solid var(--border) !important;
    border-radius: 12px !important;
    margin-bottom: 0.75rem !important;
    padding: 0.75rem 1rem !important;
  }
  div[data-testid="stChatMessage"]:has([data-testid="chatAvatarIcon-user"]) {
    background: rgba(99, 102, 241, 0.12) !important;
    border-color: rgba(99, 102, 241, 0.25) !important;
  }

  /* ── DRAFT DOCUMENT BOND PAPER ────────────────────────── */
  .draft-doc-view {
    font-family: var(--font-legal) !important;
    font-size: 0.85rem !important;
    line-height: 1.75 !important;
    color: #f1f3f9 !important;
    background: #0d0f15 !important;
    border: 1px solid rgba(255,255,255,0.1) !important;
    border-radius: 12px !important;
    padding: 1.25rem !important;
    white-space: pre-wrap !important;
    word-break: break-word !important;
    min-height: 380px !important;
    max-height: 520px !important;
    overflow-y: auto !important;
    box-shadow: inset 0 2px 8px rgba(0,0,0,0.4);
  }

  /* ── ADVISORY CALLOUT ─────────────────────────────────── */
  .advisory-box {
    display: flex;
    gap: 0.6rem;
    align-items: flex-start;
    padding: 0.75rem 1rem;
    background: rgba(234, 179, 8, 0.08);
    border: 1px solid rgba(234, 179, 8, 0.25);
    border-radius: 10px;
    font-size: 0.78rem;
    color: #cbd5e1;
    line-height: 1.5;
    margin-top: 1rem;
  }

  /* Modern styled Streamlit buttons */
  .stButton > button {
    background: linear-gradient(135deg, #6366f1, #8b5cf6) !important;
    color: white !important;
    border: none !important;
    border-radius: 10px !important;
    font-weight: 600 !important;
    transition: opacity 0.15s, transform 0.1s !important;
  }
  .stButton > button:hover {
    opacity: 0.9 !important;
    transform: scale(0.99) !important;
  }

  /* Audio player styling */
  audio {
    border-radius: 9999px !important;
    width: 100% !important;
    height: 36px !important;
    margin-top: 6px !important;
  }
</style>
""", unsafe_allow_html=True)

# ── API KEY INITIALIZATION CHECK ─────────────────────────────────────
api_key = get_api_key()
if not api_key:
    st.markdown("""
    <div class="app-topbar">
      <div class="brand-group">
        <span style="font-size: 1.6rem;">⚖️</span>
        <div>
          <div class="brand-title">RTI Copilot</div>
          <div class="brand-subtitle">Right to Information Act, 2005 · Sarvam AI</div>
        </div>
      </div>
    </div>
    """, unsafe_allow_html=True)

    st.warning("⚠️ **Sarvam AI API Key Required**")
    st.markdown("To start using **RTI Copilot**, please enter your Sarvam API Key below:")

    user_key = st.text_input(
        "Enter SARVAM_API_KEY:",
        type="password",
        placeholder="sk_...",
        help="Get your key from https://dashboard.sarvam.ai"
    )
    if st.button("Save & Launch Copilot", type="primary"):
        if user_key and user_key.strip():
            clean_key = user_key.strip().strip("'\"")
            os.environ["SARVAM_API_KEY"] = clean_key
            st.session_state.copilot = RTICopilot()
            st.rerun()
        else:
            st.error("Please enter a valid key.")

    with st.expander("📌 How to save it permanently in Streamlit Cloud (Recommended)"):
        st.markdown("""
        1. In the bottom-right corner of your Streamlit app, click **Manage app**.
        2. Click the three dots **⋮** → **Settings**.
        3. Select the **Secrets** tab and paste:
        ```toml
        SARVAM_API_KEY = "your_actual_sarvam_api_key_here"
        ```
        4. Click **Save** — the app will refresh and unlock automatically!
        """)
    st.stop()

# ── INITIALIZE COPILOT SESSION ───────────────────────────────────────
if "copilot" not in st.session_state:
    st.session_state.copilot = RTICopilot()

if "chat_history" not in st.session_state:
    st.session_state.chat_history = [
        {"role": "assistant", "content": "Namaste! I am your RTI Copilot — here to help you draft a legally compliant Right to Information application.\n\nTell me what information you are seeking and from which government department. You can speak in any regional language."}
    ]

copilot = st.session_state.copilot

# ── TOPBAR HEADER ────────────────────────────────────────────────────
st.markdown("""
<div class="app-topbar">
  <div class="brand-group">
    <span style="font-size: 1.6rem;">⚖️</span>
    <div>
      <div class="brand-title">RTI Copilot</div>
      <div class="brand-subtitle">Right to Information Act, 2005</div>
    </div>
  </div>
  <div class="engine-badge">
    <span class="engine-dot"></span>
    <span>Sarvam Saaras · Bulbul · sarvam-105b</span>
  </div>
</div>
""", unsafe_allow_html=True)

# ── 2-COLUMN SPLIT LAYOUT ────────────────────────────────────────────
col_chat, col_draft = st.columns([1, 1], gap="medium")

# ══════════════════════════════════════════════════════════════════════
# LEFT COLUMN: Voice Agent & Conversational Chat
# ══════════════════════════════════════════════════════════════════════
with col_chat:
    st.markdown('<h3 style="font-size: 1.05rem; margin-top:0;">🎙️ Voice & Chat Dialogue</h3>', unsafe_allow_html=True)

    # Language selection dropdown
    c_lang, c_reset = st.columns([3, 1])
    with c_lang:
        voice_lang = st.selectbox(
            "Speaking in:",
            options=["unknown"] + list(SUPPORTED_LANGUAGES.keys()),
            format_func=lambda x: "Auto-detect Language" if x == "unknown" else f"{SUPPORTED_LANGUAGES[x]} ({x})",
            label_visibility="collapsed"
        )
    with c_reset:
        if st.button("Reset", use_container_width=True):
            copilot.reset()
            st.session_state.chat_history = [
                {"role": "assistant", "content": "Session reset. How can I help you draft your RTI application?"}
            ]
            st.rerun()

    # Glowing Voice Orb Hero Component
    st.markdown("""
    <div class="orb-section">
      <div class="orb-wrap">
        <div class="orb-ring ring-3"></div>
        <div class="orb-ring ring-2"></div>
        <div class="orb-ring ring-1"></div>
        <div class="orb-core">
          🎙️
        </div>
      </div>
      <div class="orb-hint">Tap microphone below to record in any Indian regional language</div>
    </div>
    """, unsafe_allow_html=True)

    # Native Streamlit audio recorder
    if hasattr(st, "audio_input"):
        audio_val = st.audio_input("Record voice query:", label_visibility="collapsed")
        if audio_val is not None:
            audio_bytes = audio_val.read()
            if audio_bytes and len(audio_bytes) > 800:
                with st.spinner("⚡ Transcribing speech with Sarvam Saaras STT..."):
                    res = copilot.voice_chat(audio_bytes, mime_type="audio/wav", language_code=voice_lang)
                    if res.get("transcript"):
                        st.session_state.chat_history.append({"role": "user", "content": res["transcript"]})
                        st.session_state.chat_history.append({
                            "role": "assistant",
                            "content": res["reply"],
                            "audio": res.get("audio_base64")
                        })
                        st.rerun()

    # Chat Messages Box
    chat_container = st.container(height=360)
    with chat_container:
        for msg in st.session_state.chat_history:
            avatar = "🏛" if msg["role"] == "assistant" else "👤"
            with st.chat_message(msg["role"], avatar=avatar):
                st.write(msg["content"])
                if msg.get("audio"):
                    audio_raw = base64.b64decode(msg["audio"])
                    st.audio(audio_raw, format="audio/wav")

    # Text Chat Input
    user_text = st.chat_input("Or type your RTI query here...")
    if user_text:
        st.session_state.chat_history.append({"role": "user", "content": user_text})
        with st.spinner("Sarvam-105b reasoning..."):
            reply = copilot.chat(user_text)
            target_tts_lang = voice_lang if voice_lang in SUPPORTED_LANGUAGES else "en-IN"
            audio_b64 = copilot.synthesize_speech(reply, target_tts_lang)
            st.session_state.chat_history.append({
                "role": "assistant",
                "content": reply,
                "audio": audio_b64
            })
            st.rerun()

# ══════════════════════════════════════════════════════════════════════
# RIGHT COLUMN: RTI Statutory Draft Document Panel
# ══════════════════════════════════════════════════════════════════════
with col_draft:
    st.markdown('<h3 style="font-size: 1.05rem; margin-top:0;">📄 RTI Application Draft</h3>', unsafe_allow_html=True)

    # Dynamic Readiness Checklist Card
    checklist = copilot.get_checklist()
    pct = checklist.get("pct", 0)

    auth_cls = "r-badge-active" if checklist.get("authority") else ""
    rec_cls  = "r-badge-active" if checklist.get("records") else ""
    per_cls  = "r-badge-active" if checklist.get("period") else ""
    app_cls  = "r-badge-active" if checklist.get("applicant") else ""
    fee_cls  = "r-badge-active" if checklist.get("fee") else ""

    st.markdown(f"""
    <div class="readiness-card">
      <div class="readiness-top">
        <span>RTI Application Readiness</span>
        <span class="readiness-pct">{pct}%</span>
      </div>
      <div class="readiness-bar">
        <div class="readiness-fill" style="width: {pct}%;"></div>
      </div>
      <div class="readiness-badges">
        <span class="r-badge {auth_cls}">🏛 Authority</span>
        <span class="r-badge {rec_cls}">📋 Records</span>
        <span class="r-badge {per_cls}">📅 Period</span>
        <span class="r-badge {app_cls}">👤 Applicant</span>
        <span class="r-badge {fee_cls}">💰 Fee</span>
      </div>
    </div>
    """, unsafe_allow_html=True)

    # Draft Language Selector & Action Bar
    d_c1, d_c2 = st.columns([2, 1])
    with d_c1:
        target_draft_lang = st.selectbox(
            "Draft Output Language:",
            options=list(SUPPORTED_LANGUAGES.keys()),
            format_func=lambda x: f"{SUPPORTED_LANGUAGES[x]} ({x})",
            index=list(SUPPORTED_LANGUAGES.keys()).index("en-IN") if "en-IN" in SUPPORTED_LANGUAGES else 0,
            label_visibility="collapsed"
        )
    with d_c2:
        if st.button("Compile Draft", use_container_width=True, type="primary"):
            with st.spinner("Compiling Section 6(1) RTI draft..."):
                d_res = copilot.generate_draft(language_code=target_draft_lang)
                copilot.current_draft = d_res.get("draft", "")
                st.rerun()

    # Draft Document Paper View
    current_draft = copilot.current_draft
    if current_draft:
        st.markdown(f'<div class="draft-doc-view">{current_draft}</div>', unsafe_allow_html=True)

        # Download & Translate Action Row
        act_c1, act_c2 = st.columns([1, 1])
        with act_c1:
            st.download_button(
                label="📥 Download Draft (.txt)",
                data=current_draft,
                file_name="RTI_Application_Section_6_1.txt",
                mime="text/plain",
                use_container_width=True
            )
        with act_c2:
            if st.button(f"Translate to {SUPPORTED_LANGUAGES.get(target_draft_lang, target_draft_lang)}", use_container_width=True):
                with st.spinner("Translating with Sarvam Translate..."):
                    t_draft = copilot.translate_draft(current_draft, target_draft_lang)
                    copilot.current_draft = t_draft
                    st.rerun()
    else:
        st.markdown("""
        <div class="draft-doc-view" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; color: var(--text-muted);">
          <span style="font-size:2.2rem; margin-bottom:0.75rem;">📜</span>
          <strong>No Draft Compiled Yet</strong>
          <p style="font-size:0.8rem; margin-top:0.4rem; max-width: 320px;">
            Speak or chat with RTI Copilot on the left. Once your details are in place, your formal Section 6(1) application will appear here.
          </p>
        </div>
        """, unsafe_allow_html=True)

    # Citizen Submission Advisory Note
    st.markdown("""
    <div class="advisory-box">
      <span style="font-size:1.1rem;">⚖️</span>
      <div>
        <strong>Citizen Submission Checklist:</strong>
        Attach the statutory ₹10 application fee (Indian Postal Order / Court Fee Stamp / Online receipt). BPL card holders are completely exempt under Section 7(5).
      </div>
    </div>
    """, unsafe_allow_html=True)

"""
RTI Copilot — Voice-First Multilingual Legal Assistant
Powered by Sarvam AI (Saaras STT, Bulbul TTS, sarvam-105b-conversations)
Ready for 1-click Streamlit Cloud deployment.
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
    initial_sidebar_state="expanded"
)

# Custom CSS for modern dark styling
st.markdown("""
<style>
  .main { background-color: #0a0b0f; }
  .stChatMessage { border-radius: 12px; }
  .readiness-box {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  .badge-tag {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 0.75rem;
    margin-right: 4px;
    margin-bottom: 4px;
  }
  .badge-active { background: rgba(16,185,129,0.2); color: #10b981; border: 1px solid #10b981; }
  .badge-pending { background: rgba(255,255,255,0.05); color: #888; border: 1px solid #333; }
</style>
""", unsafe_allow_html=True)

# Check API Key before initializing
api_key = get_api_key()
if not api_key:
    st.title("⚖️ RTI Copilot — Sarvam AI")
    st.warning("⚠️ **Sarvam AI API Key Required**")
    st.markdown("""
    To start using **RTI Copilot**, please provide your Sarvam API Key.
    
    You can paste it below to use immediately, or save it permanently in your Streamlit Cloud Secrets.
    """)
    
    user_key = st.text_input(
        "Enter your SARVAM_API_KEY:",
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
            st.error("Please enter a valid API key.")

    with st.expander("📌 How to save it permanently in Streamlit Cloud (Recommended)"):
        st.markdown("""
        1. In the bottom-right corner of your Streamlit app, click **Manage app**.
        2. Click the three dots **⋮** → **Settings**.
        3. Select the **Secrets** tab.
        4. Paste your key:
        ```toml
        SARVAM_API_KEY = "your_actual_sarvam_api_key_here"
        ```
        5. Click **Save** — the app will refresh and unlock automatically!
        """)
    st.stop()

# Initialize Session State
if "copilot" not in st.session_state:
    st.session_state.copilot = RTICopilot()

if "chat_history" not in st.session_state:
    st.session_state.chat_history = [
        {"role": "assistant", "content": "Namaste! I am your RTI Copilot, powered by Sarvam AI. Tell me what government records or information you need, and I will help you prepare a submission-ready RTI application."}
    ]

copilot = st.session_state.copilot

# ── SIDEBAR ──────────────────────────────────────────────────
with st.sidebar:
    st.title("⚖️ RTI Copilot")
    st.caption("Powered by **Sarvam AI**")
    st.markdown("---")

    # Language Selection
    voice_lang = st.selectbox(
        "Speaking Language",
        options=["unknown"] + list(SUPPORTED_LANGUAGES.keys()),
        format_func=lambda x: "Auto-detect" if x == "unknown" else f"{SUPPORTED_LANGUAGES.get(x, x)} ({x})"
    )

    auto_tts = st.toggle("Voice Playback (Bulbul TTS)", value=True)

    st.markdown("---")
    st.subheader("📋 Application Readiness")
    checklist = copilot.get_checklist()
    pct = checklist.get("pct", 0)
    st.progress(pct / 100.0)
    st.caption(f"Completion: **{pct}%**")

    # Readiness Badges
    badges = [
        ("🏛 Authority", checklist.get("authority", False)),
        ("📋 Records", checklist.get("records", False)),
        ("📅 Period", checklist.get("period", False)),
        ("👤 Applicant", checklist.get("applicant", False)),
        ("💰 Fee", checklist.get("fee", False)),
    ]
    for label, active in badges:
        cls = "badge-active" if active else "badge-pending"
        st.markdown(f'<span class="badge-tag {cls}">{"✓ " if active else "○ "}{label}</span>', unsafe_allow_html=True)

    st.markdown("---")
    if st.button("🔄 Reset Conversation", use_container_width=True):
        copilot.reset()
        st.session_state.chat_history = [
            {"role": "assistant", "content": "Session reset. How can I assist you with your RTI today?"}
        ]
        st.rerun()

# ── MAIN LAYOUT (2 COLUMNS) ──────────────────────────────────
col_chat, col_draft = st.columns([1, 1], gap="medium")

# ── LEFT COLUMN: Voice & Chat ────────────────────────────────
with col_chat:
    st.subheader("🎙️ Voice & Chat Dialogue")

    # Native Streamlit audio recorder (1.39+)
    audio_val = None
    if hasattr(st, "audio_input"):
        audio_val = st.audio_input("Record your query in any regional language")
    
    # Process Voice Input
    if audio_val is not None:
        audio_bytes = audio_val.read()
        if audio_bytes and len(audio_bytes) > 1000:
            with st.spinner("⚡ Transcribing with Sarvam Saaras STT..."):
                res = copilot.voice_chat(audio_bytes, mime_type="audio/wav", language_code=voice_lang)
                if res.get("transcript"):
                    st.session_state.chat_history.append({"role": "user", "content": res["transcript"]})
                    st.session_state.chat_history.append({"role": "assistant", "content": res["reply"], "audio": res.get("audio_base64")})
                    st.rerun()

    # Display Chat History
    for msg in st.session_state.chat_history:
        with st.chat_message(msg["role"]):
            st.write(msg["content"])
            if msg.get("audio") and auto_tts:
                audio_raw = base64.b64decode(msg["audio"])
                st.audio(audio_raw, format="audio/wav")

    # Text Chat Input
    user_text = st.chat_input("Type your query or answer here...")
    if user_text:
        st.session_state.chat_history.append({"role": "user", "content": user_text})
        with st.spinner("Sarvam-105b reasoning..."):
            reply = copilot.chat(user_text)
            audio_b64 = None
            if auto_tts:
                target_tts_lang = voice_lang if voice_lang in SUPPORTED_LANGUAGES else "en-IN"
                audio_b64 = copilot.synthesize_speech(reply, target_tts_lang)
            st.session_state.chat_history.append({"role": "assistant", "content": reply, "audio": audio_b64})
            st.rerun()

# ── RIGHT COLUMN: RTI Statutory Draft ─────────────────────────
with col_draft:
    st.subheader("📄 RTI Statutory Application")

    # Draft actions
    c1, c2 = st.columns([2, 1])
    with c1:
        target_draft_lang = st.selectbox(
            "Draft Language",
            options=list(SUPPORTED_LANGUAGES.keys()),
            format_func=lambda x: f"{SUPPORTED_LANGUAGES[x]} ({x})",
            index=list(SUPPORTED_LANGUAGES.keys()).index("en-IN") if "en-IN" in SUPPORTED_LANGUAGES else 0
        )
    with c2:
        st.write("")
        st.write("")
        if st.button("Compile Draft", use_container_width=True, type="primary"):
            with st.spinner("Compiling Section 6(1) RTI draft..."):
                d_res = copilot.generate_draft(language_code=target_draft_lang)
                copilot.current_draft = d_res.get("draft", "")
                st.rerun()

    # Display Draft
    current_draft = copilot.current_draft
    if current_draft:
        st.text_area(
            "Statutory Draft Preview (Section 6(1) RTI Act, 2005)",
            value=current_draft,
            height=420
        )
        
        # Download button
        st.download_button(
            label="📥 Download RTI Draft (.txt)",
            data=current_draft,
            file_name="RTI_Application_Section_6_1.txt",
            mime="text/plain",
            use_container_width=True
        )

        # Translate action
        if st.button(f"Translate to {SUPPORTED_LANGUAGES.get(target_draft_lang, target_draft_lang)}", use_container_width=True):
            with st.spinner("Translating with Sarvam Translate..."):
                t_draft = copilot.translate_draft(current_draft, target_draft_lang)
                copilot.current_draft = t_draft
                st.rerun()
    else:
        st.info("💡 Speak or chat on the left to provide details. Your complete RTI application will be generated here.")

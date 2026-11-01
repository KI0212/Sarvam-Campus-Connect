# ⚖️ RTI Copilot — Voice-First Multilingual Legal Assistant

**RTI Copilot** is an AI-powered civic legal assistant designed to help Indian citizens frame legally compliant, submission-ready Right to Information (RTI) applications under the **Right to Information Act, 2005**.

Powered end-to-end by **Sarvam AI**:
- **Speech-to-Text (STT)**: Sarvam **Saaras v3** with automatic regional language identification.
- **Text-to-Speech (TTS)**: Sarvam **Bulbul v3** high-fidelity speech synthesis across 11 official Indian languages.
- **Conversational Intelligence**: Sarvam **`sarvam-105b-conversations`**.
- **Statutory Translation**: Sarvam **Mayura / `sarvam-translate`** for formal legal translation into 13 Indic languages.

---

## 🎙️ Key Voice Agent Capabilities

1. **Natural Spoken Interaction Across All Regional Languages**:
   - Citizens can press the oversized **"Tap to Speak"** button (exceeding WCAG AAA touch target standards) and speak naturally in **Hindi, Marathi, Tamil, Telugu, Kannada, Bengali, Gujarati, Malayalam, Punjabi, Odia, English**, or any regional dialect.
   - **Sarvam Saaras STT** automatically detects the language and converts speech to text.

2. **Native Indic Conversational Dialogue**:
   - The Copilot replies directly in the citizen's chosen language, citing grounded government circulars and tender notices.
   - **Sarvam Bulbul TTS** synthesizes a warm, natural voice response that plays aloud automatically.

3. **Universal Accessibility (WCAG 2.1 AA/AAA)**:
   - **Oversized touch targets** ($\ge 48\text{px}-56\text{px}$) for elderly citizens and motor-impaired users.
   - **High-contrast ratios** ($16.5:1$ standard, AAA Black/Yellow high-contrast mode with $>18:1$ ratio).
   - **Dynamic Typography Scaling**: Quick buttons for $A$ (17px), $A+$ (20px), and $A++$ (23px).
   - **Voice Playback Bar**: Real-time indicator with one-click audio replay on every message.

4. **Submission-Ready RTI Drafting & Print Layout**:
   - Compiles formal applications under Section 6(1) of the RTI Act, 2005.
   - Grounded in official records (such as municipal work orders or university circulars).
   - Instant translation to any regional language.
   - `@media print` layout turns the web draft into an authentic, stamped petition ready for postal or in-person submission.

---

## 🚀 Running the Voice Application

Start the built-in server (zero external web dependencies):
```bash
python server.py
```
Open **[http://localhost:8080](http://localhost:8080)** in your browser.

- Tap the large **"🎙️ Tap to Speak"** button.
- Speak your RTI request in Hindi, Marathi, Tamil, Telugu, English, or your local tongue.
- Listen as RTI Copilot speaks back with guided questions and compiles your statutory application.

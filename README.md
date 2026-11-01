# ⚖️ RTI Copilot — Sarvam AI Legal Assistant

**RTI Copilot** is an AI-powered legal assistant designed to help Indian citizens frame legally compliant, submission-ready Right to Information (RTI) applications under the **Right to Information Act, 2005**.

Built on **Sarvam AI**'s state-of-the-art Indic LLMs and Translation models.

---

## 🌟 Key Capabilities

1. **Guided Conversational Dialogue (`sarvam-105b-conversations`)**:
   - Walks citizens through a gentle, step-by-step interview to extract:
     - The specific factual records or inspection requested.
     - The relevant public authority, department, and Public Information Officer (PIO).
     - The specific time period involved.
   - Avoids intimidating legal jargon during the interview.

2. **Grounding & Precision**:
   - Ingests official government circulars, tender notices, work orders, and gazettes.
   - Replaces vague citizen queries with exact file numbers, tender IDs, and PIO designations.
   - **Zero-hallucination constraint**: Strictly does not invent facts.

3. **Statutory Compliance (RTI Act, 2005)**:
   - Formulates precise, objective queries under Section 6(1).
   - Solicits certified copies of work orders, measurement books, payment vouchers, and inspection reports under Section 2(j).
   - Embeds mandatory statutory declarations (citizenship status, non-exemption under Section 8/9, fee payment clauses).

4. **Multilingual Regional Translation (Sarvam Translation API)**:
   - Compiles and translates the final RTI application into **13 Indian languages**:
     - English (`en-IN`), Hindi (`hi-IN`), Marathi (`mr-IN`), Tamil (`ta-IN`), Telugu (`te-IN`), Kannada (`kn-IN`), Bengali (`bn-IN`), Gujarati (`gu-IN`), Malayalam (`ml-IN`), Punjabi (`pa-IN`), Odia (`od-IN`), Assamese (`as-IN`), Urdu (`ur-IN`).
   - Uses formal legal translation mode preserving statutory terminology.

---

## 🚀 Quickstart

### 1. Requirements & Setup
The dependencies are already configured in this project. Your `SARVAM_API_KEY` is loaded securely from `.env`.

To install dependencies manually if needed:
```bash
pip install sarvamai
```

### 2. Launch the Web Interface (Zero extra dependencies)
Run the built-in web server:
```bash
python server.py
```
Open **[http://localhost:8080](http://localhost:8080)** in your browser.

- **Left Pane**: Interactive chat with RTI Copilot with quick-start prompts.
- **Right Pane**:
  - **Statutory RTI Draft**: Live preview, one-click Indic language translation, copy to clipboard, and `.txt` export.
  - **Grounded Records**: Manage and inspect attached government notices and circulars.

### 3. Launch the Interactive CLI
For terminal users:
```bash
python cli.py
```

#### CLI Commands:
- Type your responses naturally during the guided dialogue.
- `/draft` : Synthesizes the conversation into a formal RTI draft.
- `/translate <lang_code>` : Translates the draft (e.g., `/translate hi-IN`, `/translate mr-IN`).
- `/ground <file_or_text>` : Adds an official document or notice to grounding context.
- `/languages` : Lists all supported Indic language codes.
- `/reset` : Starts a new application session.
- `/exit` : Quits the CLI.

---

## 📂 Project Architecture

```
campus-connect/
├── .env                # Secure SARVAM_API_KEY configuration
├── .gitignore          # Prevents committing .env
├── config.py           # Environment loader & language configurations
├── copilot.py          # RTICopilot core engine (dialogue, grounding, drafting, translation)
├── server.py           # HTTP Web Server & responsive user interface
├── cli.py              # Interactive CLI runner
├── main.py             # Minimal test script for Sarvam AI client
└── README.md           # Documentation
```

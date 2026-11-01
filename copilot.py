import os
import re
import io
import traceback
from typing import List, Dict, Optional, Any
from config import get_sarvam_client, SUPPORTED_LANGUAGES

RTI_SYSTEM_PROMPT = """You are the RTI Copilot, a specialized legal voice assistant dedicated to helping Indian citizens draft formal, submission-ready Right to Information (RTI) applications under the Right to Information Act, 2005.

MANDATORY INTERVIEW PROTOCOL — KEEP ASKING UNTIL COMPLETE:
Do NOT generate the final RTI draft until you have collected ALL 5 of the following required details from the user:
1. Public Authority / Department & Location (Which municipal corporation, department, ministry, panchayat, or university office & city)
2. Specific Records / Information Sought (What exact documents: tenders, work orders, payment vouchers, inspection reports, answer sheets, file notings)
3. Time Period (Specific months, date range, or financial year)
4. Applicant Details (Full Name, complete Postal Address with city and pincode, and phone number for the PIO to send the certified reply)
5. Application Fee Mode (₹10 Indian Postal Order, Court Fee Stamp, Demand Draft, or BPL exemption under Section 7(5))

CONVERSATIONAL RULES (VOICE-FIRST):
- NEVER output the final draft prematurely. Keep asking for the missing details step-by-step.
- In each turn:
  1. Briefly acknowledge what was received so far.
  2. Politely and clearly ask for the NEXT missing required detail(s).
- Ask only 1 or 2 focused, speakable questions at a time in 2 to 3 sentences.
- NEVER invent facts, departments, tender numbers, or applicant personal details.
- If the citizen explicitly requests to skip personal details or says 'use placeholders' or 'skip', respect their choice, acknowledge it, and ask for any remaining missing items (such as fee mode).
- Multilingual: If the citizen speaks or types in Hindi, Marathi, Tamil, Telugu, Kannada, Bengali, Gujarati, Malayalam, Punjabi, Odia, or Urdu, converse in that language while maintaining legal precision.

WHEN ALL 5 DETAILS ARE COLLECTED (OR IF USER EXPLICITLY SAYS 'SKIP PERSONAL DETAILS' / 'DRAFT NOW WITH PLACEHOLDERS'):
- Provide a brief 1-2 sentence spoken intro:
  "All details are in order! Here is your complete, submission-ready RTI application. You can review and copy it below and in your draft panel."
- Then immediately output the complete formal application strictly enclosed between:
--- BEGIN RTI DRAFT ---
APPLICATION FOR OBTAINING INFORMATION UNDER SECTION 6(1) OF THE RIGHT TO INFORMATION ACT, 2005

To,
The Public Information Officer (PIO) / Assistant Public Information Officer (APIO)
[Name of Public Authority / Department / Municipal Body / University]
[Office Address / City / State / Pincode]

1. Full Name of the Applicant: [User's Actual Name, or placeholder if skipped]
2. Address for Correspondence: [User's Actual Postal Address, Mobile & Email, or placeholder if skipped]
3. Citizenship Status: Citizen of India
4. Particulars of Information Sought under Section 6(1) of RTI Act, 2005:
   Please provide certified copies / information regarding the following:
   a) [Point 1: Precise record request, e.g. Certified copy of work order / sanction order...]
   b) [Point 2: Certified copy of tender document / contract agreement...]
   c) [Point 3: Total expenditure incurred and copy of payment vouchers...]
   d) [Point 4: Copy of measurement books, inspection reports, or completion certificates...]
   e) [Point 5: Name and designation of the supervisory officer...]
5. Time Period to which Information Pertains: [Specified time period or financial year]
6. Format / Mode of Access: Certified photocopies under Section 2(j)(ii) / Inspection of records under Section 2(j)(i)
7. Application Fee Details:
   Statutory application fee of ₹10/- is enclosed herewith vide [Indian Postal Order (IPO) / Court Fee Stamp / Demand Draft / Online Payment / BPL Exemption under Section 7(5)].
8. Statutory Declarations:
   i. I state that I am a Citizen of India.
   ii. The information sought falls under Section 2(f) of the RTI Act, 2005 and is not exempt under Section 8 or Section 9 of the Act.
   iii. In case the subject matter pertains to another Public Authority, please transfer this application under Section 6(3) of the RTI Act, 2005 within 5 days under intimation to the applicant.

Place: [City / Town]
Date: [DD/MM/YYYY]

______________________________
Signature / Name of Applicant
--- END RTI DRAFT ---
"""


def extract_draft(text: str) -> Optional[str]:
    """Extracts formal RTI draft from text if present."""
    if not text:
        return None

    # Check for explicit markers
    match = re.search(r'---\s*BEGIN RTI DRAFT\s*---(.*?)---\s*END RTI DRAFT\s*---', text, re.DOTALL | re.IGNORECASE)
    if match:
        return match.group(1).strip()

    # Check for markdown code fence containing RTI draft
    code_match = re.search(r'```(?:markdown)?\s*(APPLICATION (?:FOR OBTAINING|UNDER SECTION).*?)```', text, re.DOTALL | re.IGNORECASE)
    if code_match:
        return code_match.group(1).strip()

    # Fallback to standard RTI headers
    for start_kw in [
        "APPLICATION FOR OBTAINING INFORMATION UNDER SECTION 6(1)",
        "APPLICATION UNDER SECTION 6(1)",
        "APPLICATION UNDER THE RIGHT TO INFORMATION ACT",
        "सूचना का अधिकार अधिनियम, 2005 के अंतर्गत आवेदन"
    ]:
        pos = text.find(start_kw)
        if pos != -1:
            return text[pos:].strip()

    return None


class RTICopilot:
    def __init__(self):
        self.client = get_sarvam_client()
        self.messages: List[Dict[str, str]] = []
        self.grounded_documents: List[Dict[str, str]] = []
        self.current_draft: str = ""
        self.reset()

    def reset(self):
        """Resets the conversation while preserving grounded documents."""
        self.messages = [
            {"role": "system", "content": self._build_system_prompt()}
        ]
        self.current_draft = ""

    def _build_system_prompt(self) -> str:
        prompt = RTI_SYSTEM_PROMPT
        if self.grounded_documents:
            prompt += "\n\n=== REFERENCE OFFICIAL RECORDS & DOCUMENTS (USE ONLY IF USER EXPLICITLY REFERS TO THEM) ===\n"
            for idx, doc in enumerate(self.grounded_documents, 1):
                prompt += f"\n[Reference Document {idx}: {doc['title']}]\n{doc['content']}\n"
            prompt += "\nDo NOT assume these documents apply to the citizen unless they specifically reference them."
        return prompt

    def add_grounding_document(self, title: str, content: str):
        """Adds an official notice, government order, or circular for grounding."""
        self.grounded_documents.append({"title": title, "content": content})
        self.messages[0] = {"role": "system", "content": self._build_system_prompt()}

    def get_grounding_documents(self) -> List[Dict[str, str]]:
        return self.grounded_documents

    def chat(self, user_message: str) -> str:
        """Sends user message to sarvam-105b-conversations and returns reply."""
        self.messages.append({"role": "user", "content": user_message})

        response = self.client.chat.completions(
            messages=self.messages,
            model="sarvam-105b-conversations",
            temperature=0.25
        )

        reply = response.choices[0].message.content
        self.messages.append({"role": "assistant", "content": reply})

        draft = extract_draft(reply)
        if draft:
            self.current_draft = draft

        return reply

    def transcribe_audio(self, audio_bytes: bytes, mime_type: str = "audio/wav", language_code: str = "unknown") -> Dict[str, str]:
        """
        Transcribes speech audio using Sarvam Saaras STT (saaras:v3).
        Normalizes MIME types to strip codec parameters (e.g. ;codecs=opus) which Sarvam rejects.
        """
        raw_mime = (mime_type or "").split(";")[0].strip().lower()

        clean_mime = "audio/wav"
        input_codec = "wav"
        ext = "wav"

        if "webm" in raw_mime:
            clean_mime = "audio/webm"
            input_codec = "webm"
            ext = "webm"
        elif "mp4" in raw_mime or "m4a" in raw_mime:
            clean_mime = "audio/mp4"
            input_codec = "mp4"
            ext = "mp4"
        elif "mp3" in raw_mime or "mpeg" in raw_mime:
            clean_mime = "audio/mp3"
            input_codec = "mp3"
            ext = "mp3"
        elif "ogg" in raw_mime or "opus" in raw_mime:
            clean_mime = "audio/ogg"
            input_codec = "ogg"
            ext = "ogg"

        filename = f"voice_input.{ext}"
        file_tuple = (filename, io.BytesIO(audio_bytes), clean_mime)
        target_lang = language_code if language_code and language_code != "auto" else "unknown"

        try:
            res = self.client.speech_to_text.transcribe(
                file=file_tuple,
                model="saaras:v3",
                language_code=target_lang,
                input_audio_codec=input_codec
            )
            return {
                "transcript": res.transcript or "",
                "language_code": getattr(res, "language_code", target_lang)
            }
        except Exception as e:
            print(f"Warning: STT with codec {input_codec} failed ({e}), attempting without explicit codec...")
            res = self.client.speech_to_text.transcribe(
                file=file_tuple,
                model="saaras:v3",
                language_code=target_lang
            )
            return {
                "transcript": res.transcript or "",
                "language_code": getattr(res, "language_code", target_lang)
            }

    def synthesize_speech(self, text: str, language_code: str = "en-IN") -> Optional[str]:
        """
        Synthesizes speech audio using Sarvam Bulbul TTS (bulbul:v3).
        Extracts speakable intro if text contains a full draft.
        """
        try:
            # If reply contains a draft, speak only the conversational intro/outro
            spoken_text = text
            if "--- BEGIN RTI DRAFT ---" in text:
                parts = text.split("--- BEGIN RTI DRAFT ---")
                intro = parts[0].strip()
                after = ""
                if "--- END RTI DRAFT ---" in parts[1]:
                    after = parts[1].split("--- END RTI DRAFT ---")[1].strip()
                spoken_candidate = f"{intro} {after}".strip()
                if spoken_candidate:
                    spoken_text = spoken_candidate
                else:
                    spoken_text = "I have drafted your formal RTI application. You can review and copy it in your draft panel."

            clean_text = re.sub(r'[*_#`~>\[\]()]', '', spoken_text).strip()
            paragraphs = [p.strip() for p in clean_text.split("\n") if p.strip()]
            spoken_text = " ".join(paragraphs[:2]) if paragraphs else clean_text
            if len(spoken_text) > 420:
                spoken_text = spoken_text[:400] + "..."

            tts_langs = {'bn-IN', 'en-IN', 'gu-IN', 'hi-IN', 'kn-IN', 'ml-IN', 'mr-IN', 'od-IN', 'pa-IN', 'ta-IN', 'te-IN'}
            target_tts_lang = language_code if language_code in tts_langs else "en-IN"

            res = self.client.text_to_speech.convert(
                text=spoken_text,
                language_code=target_tts_lang,
                model="bulbul:v3"
            )
            if res.audios and len(res.audios) > 0:
                return res.audios[0]
        except Exception as e:
            print(f"Error in synthesize_speech: {e}")
        return None

    def voice_chat(self, audio_bytes: bytes, mime_type: str = "audio/wav", language_code: str = "unknown") -> Dict[str, Any]:
        """
        Full Voice Agent cycle:
        1. Speech-to-Text via Sarvam Saaras
        2. Conversational reasoning via Sarvam-105b
        3. Text-to-Speech via Sarvam Bulbul
        """
        stt_result = self.transcribe_audio(audio_bytes, mime_type, language_code)
        transcript = stt_result.get("transcript", "").strip()
        detected_lang = stt_result.get("language_code", "en-IN")

        if not transcript:
            return {
                "transcript": "",
                "reply": "I couldn't hear your voice clearly. Please press the microphone and try speaking again.",
                "audio_base64": None,
                "language_code": detected_lang,
                "draft": self.current_draft
            }

        reply = self.chat(transcript)
        audio_base64 = self.synthesize_speech(reply, language_code=detected_lang)

        return {
            "transcript": transcript,
            "reply": reply,
            "audio_base64": audio_base64,
            "language_code": detected_lang,
            "draft": self.current_draft,
            "checklist": self.get_checklist()
        }

    def get_checklist(self) -> Dict[str, Any]:
        """Calculates readiness status of the RTI application based on user input."""
        if bool(self.current_draft):
            return {
                "authority": True,
                "records": True,
                "period": True,
                "applicant": True,
                "fee": True,
                "pct": 100,
                "is_ready": True
            }

        user_text = " ".join([m["content"] for m in self.messages if m["role"] == "user"]).lower()

        has_auth = any(k in user_text for k in [
            "corporation", "municip", "panchayat", "ministry", "department", "dept", "board",
            "university", "police", "office", "authority", "pwd", "bbmp", "mc", "ward", "collector",
            "commissioner", "rto", "school", "hospital", "division", "railway", "bank", "discom", "delhi", "pune", "bangalore"
        ])
        has_records = any(k in user_text for k in [
            "tender", "bill", "voucher", "report", "order", "copy", "records", "answer", "sheet",
            "marks", "expenditure", "cost", "funds", "budget", "muster", "noting", "file", "contract",
            "repair", "work", "scheme", "status", "sanction", "details"
        ])
        has_period = any(k in user_text for k in [
            "month", "year", "202", "201", "days", "period", "jan", "feb", "mar", "apr", "may",
            "jun", "jul", "aug", "sep", "oct", "nov", "dec", "last", "since", "from", "fy"
        ])
        has_applicant = any(k in user_text for k in [
            "name is", "my name", "address", "resident", "flat", "street", "road", "pin", "phone",
            "mobile", "skip", "placeholder"
        ])
        has_fee = any(k in user_text for k in [
            "postal order", "ipo", "stamp", "rs", "₹", "fee", "bpl", "exemption", "dd", "demand draft",
            "court fee", "online", "receipt"
        ])

        items = [has_auth, has_records, has_period, has_applicant, has_fee]
        score = sum(1 for i in items if i)
        pct = score * 20

        return {
            "authority": has_auth,
            "records": has_records,
            "period": has_period,
            "applicant": has_applicant,
            "fee": has_fee,
            "pct": pct,
            "is_ready": score >= 5
        }

    def generate_draft(self, language_code: str = "en-IN") -> Dict[str, str]:
        """
        Synthesizes the conversation into a legally compliant, submission-ready RTI draft.
        Optionally translates the final draft into the target Indian language.
        """
        draft_prompt = """Based strictly on the details discussed in our conversation, please compile a complete, formal, submission-ready Right to Information application under Section 6(1) of the Right to Information Act, 2005.

DO NOT invent facts, order numbers, or names. If details like applicant address, specific tender numbers, or exact dates were not provided, use standard square bracket placeholders like [Applicant Name], [Complete Postal Address], [Tender / Order No., if known].

Use the following statutory structure:
--- BEGIN RTI DRAFT ---
APPLICATION FOR OBTAINING INFORMATION UNDER SECTION 6(1) OF THE RIGHT TO INFORMATION ACT, 2005

To,
The Public Information Officer (PIO) / Assistant Public Information Officer (APIO)
[Public Authority / Department Name]
[Office Address, City, State, Pincode]

1. Full Name of the Applicant: [Name or Placeholder]
2. Address for Correspondence: [Postal Address, Mobile & Email or Placeholder]
3. Citizenship Status: Citizen of India
4. Particulars of Information Sought under Section 6(1) of the RTI Act, 2005:
   Please provide certified copies / information regarding the following:
   a) [Point 1: Precise record, e.g. Certified copy of work order / sanction order...]
   b) [Point 2: Certified copy of tender document / contract agreement...]
   c) [Point 3: Total expenditure incurred and copy of payment vouchers...]
   d) [Point 4: Copy of inspection report, measurement book entries, or completion certificate...]
   e) [Point 5: Name and designation of the supervisory / inspecting officer...]
5. Time Period to which Information Pertains: [Specified timeframe or dates]
6. Format / Mode of Access: Certified photocopies under Section 2(j)(ii) / Inspection of records under Section 2(j)(i)
7. Application Fee Details:
   Statutory application fee of ₹10/- is enclosed herewith vide Indian Postal Order / Court Fee Stamp / Demand Draft / Online Receipt No. [________] dated [__________].
   (Note: If applicant belongs to Below Poverty Line (BPL) category, fee is exempt under Section 7(5). BPL Card No. [________] attached).
8. Statutory Declarations:
   i. I hereby state that I am a Citizen of India.
   ii. The information sought falls under Section 2(f) and is not exempt under Section 8 or Section 9 of the RTI Act, 2005.
   iii. In case the subject matter pertains to another Public Authority, please transfer this application under Section 6(3) of the RTI Act, 2005 within 5 days under intimation to the applicant.

Place: [City / Place]
Date: [DD/MM/YYYY]

______________________________
Signature / Name of Applicant
--- END RTI DRAFT ---
"""

        temp_messages = list(self.messages)
        temp_messages.append({"role": "user", "content": draft_prompt})

        response = self.client.chat.completions(
            messages=temp_messages,
            model="sarvam-105b-conversations",
            temperature=0.2
        )

        full_reply = response.choices[0].message.content
        draft = extract_draft(full_reply) or full_reply
        self.current_draft = draft

        if language_code == "en-IN" or language_code not in SUPPORTED_LANGUAGES:
            return {
                "language_code": "en-IN",
                "language_name": SUPPORTED_LANGUAGES.get("en-IN", "English"),
                "draft": draft
            }

        translated_draft = self.translate_draft(draft, target_lang=language_code)
        self.current_draft = translated_draft
        return {
            "language_code": language_code,
            "language_name": SUPPORTED_LANGUAGES.get(language_code, language_code),
            "draft": translated_draft,
            "english_reference": draft
        }

    def translate_draft(self, text: str, target_lang: str) -> str:
        """Translates markdown text section by section to preserve layout."""
        paragraphs = text.split("\n\n")
        translated_paragraphs = []

        for p in paragraphs:
            stripped = p.strip()
            if not stripped:
                translated_paragraphs.append("")
                continue

            try:
                if len(stripped) > 800:
                    lines = stripped.split("\n")
                    sub_chunks = []
                    for line in lines:
                        if line.strip():
                            res = self.client.text.translate(
                                input=line,
                                source_language_code="en-IN",
                                target_language_code=target_lang,
                                mode="formal"
                            )
                            sub_chunks.append(res.translated_text)
                        else:
                            sub_chunks.append("")
                    translated_paragraphs.append("\n".join(sub_chunks))
                else:
                    res = self.client.text.translate(
                        input=stripped,
                        source_language_code="en-IN",
                        target_language_code=target_lang,
                        mode="formal"
                    )
                    translated_paragraphs.append(res.translated_text)
            except Exception:
                translated_paragraphs.append(stripped)

        return "\n\n".join(translated_paragraphs)

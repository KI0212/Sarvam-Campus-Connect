import os
import re
import io
import traceback
from typing import List, Dict, Optional
from config import get_sarvam_client, SUPPORTED_LANGUAGES

RTI_SYSTEM_PROMPT = """You are the RTI Copilot, a specialized legal voice assistant designed to help Indian citizens frame formal Right to Information (RTI) applications under the Right to Information Act, 2005.

Core Objectives:
1. Guided Dialogue & Voice Interaction:
   - Walk the citizen step-by-step through:
     a) The specific information sought (factual records, inspection, file notings, work orders, payment vouchers).
     b) The relevant public authority (Panchayat, Municipal Corporation, Ministry, Police Dept, University) and PIO.
     c) The time period involved (e.g. FY 2023-24, past 6 months).
   - Keep replies conversational, concise, and speakable. Avoid overwhelming paragraphs in voice turns.

2. Multilingual Natural Dialogue:
   - If the user addresses you in an Indian regional language (Hindi, Marathi, Tamil, Telugu, Kannada, Bengali, Gujarati, Malayalam, Punjabi, Odia, Urdu, etc.), respond naturally and empathetically in that same regional language.
   - Maintain accurate RTI Act terminology while avoiding unnecessary legal jargon.

3. Grounding & Accuracy:
   - Use provided government records, public notices, and official documents to ensure the request is precise.
   - If the user's request is vague, suggest specific document names, tender numbers, or sections from the grounded data.

4. Legal Compliance:
   - Frame queries under Section 6(1) and reference Section 4 (proactive disclosure) or Section 2(j) (inspection/certified copies).
   - Ensure the final draft follows statutory requirements with applicant declarations and fee details.

5. Constraint:
   - Do NOT invent facts. If grounded documents do not contain the answer, inform the citizen that the detail needs to be verified or provided by them.

Interaction Style:
- Professional, empathetic, supportive, and accessible to citizens of all literacy and age levels.
"""

class RTICopilot:
    def __init__(self):
        self.client = get_sarvam_client()
        self.messages: List[Dict[str, str]] = []
        self.grounded_documents: List[Dict[str, str]] = []
        self.reset()

    def reset(self):
        """Resets the conversation while preserving grounded documents."""
        self.messages = [
            {"role": "system", "content": self._build_system_prompt()}
        ]

    def _build_system_prompt(self) -> str:
        prompt = RTI_SYSTEM_PROMPT
        if self.grounded_documents:
            prompt += "\n\n=== GROUNDED OFFICIAL RECORDS & DOCUMENTS ===\n"
            for idx, doc in enumerate(self.grounded_documents, 1):
                prompt += f"\n[Document {idx}: {doc['title']}]\n{doc['content']}\n"
            prompt += "\nUse the above grounded records to identify departments, PIOs, order numbers, and precise factual requests."
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
            temperature=0.3
        )

        reply = response.choices[0].message.content
        self.messages.append({"role": "assistant", "content": reply})
        return reply

    def transcribe_audio(self, audio_bytes: bytes, mime_type: str = "audio/wav", language_code: str = "unknown") -> Dict[str, str]:
        """
        Transcribes speech audio using Sarvam Saaras STT (saaras:v3).
        Normalizes MIME types to strip codec parameters (e.g. ;codecs=opus) which Sarvam rejects.
        """
        # Normalize and strip parameters like ';codecs=opus'
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

        # Attempt transcription with codec specified
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
            # Fallback attempt without explicit input_audio_codec
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
        Returns base64 encoded audio string (WAV format).
        """
        try:
            clean_text = re.sub(r'[*_#`~>\[\]()]', '', text).strip()
            
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

    def voice_chat(self, audio_bytes: bytes, mime_type: str = "audio/wav", language_code: str = "unknown") -> Dict[str, any]:
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
                "language_code": detected_lang
            }

        reply = self.chat(transcript)
        audio_base64 = self.synthesize_speech(reply, language_code=detected_lang)

        return {
            "transcript": transcript,
            "reply": reply,
            "audio_base64": audio_base64,
            "language_code": detected_lang
        }

    def generate_draft(self, language_code: str = "en-IN") -> Dict[str, str]:
        """
        Synthesizes the conversation into a legally compliant, submission-ready RTI draft.
        Optionally translates the final draft into the target Indian language.
        """
        draft_prompt = """Based on all the details discussed in our conversation and any grounded documents provided, please compile the complete, submission-ready formal RTI Application under Section 6(1) of the Right to Information Act, 2005.

Follow this standard statutory structure:
1. To: The Public Information Officer (PIO) / Assistant Public Information Officer (APIO)
   [Department / Office Address / Public Authority]
2. Subject: Application for Information under Section 6(1) of the Right to Information Act, 2005
3. Particulars of Applicant: Name, Address, Contact, Citizenship (Citizen of India)
4. Particulars of Information Sought:
   - Provide a precise, numbered list of information items requested.
   - Ask for certified copies of relevant files, work orders, payment vouchers, inspection reports, or attendance registers.
   - Keep queries objective, specific, and bounded by time.
5. Time Period of Information: [Specify exact dates/period]
6. Application Fee Details: (e.g. ₹10 Postal Order / Court Fee Stamp / DD / Online receipt)
7. Statutory Declarations:
   - Confirming the applicant is a citizen of India.
   - Confirming information sought is not exempt under Section 8 or 9 of the RTI Act.
8. Place & Date: [To be filled by applicant]
9. Signature / Name of Applicant

Provide only the formal application draft in clean markdown, suitable for printing and submission."""

        temp_messages = list(self.messages)
        temp_messages.append({"role": "user", "content": draft_prompt})

        response = self.client.chat.completions(
            messages=temp_messages,
            model="sarvam-105b-conversations",
            temperature=0.2
        )

        english_draft = response.choices[0].message.content

        if language_code == "en-IN" or language_code not in SUPPORTED_LANGUAGES:
            return {
                "language_code": "en-IN",
                "language_name": SUPPORTED_LANGUAGES.get("en-IN", "English"),
                "draft": english_draft
            }

        translated_draft = self.translate_draft(english_draft, target_lang=language_code)
        return {
            "language_code": language_code,
            "language_name": SUPPORTED_LANGUAGES.get(language_code, language_code),
            "draft": translated_draft,
            "english_reference": english_draft
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

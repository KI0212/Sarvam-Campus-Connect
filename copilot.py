import os
from typing import List, Dict, Optional
from config import get_sarvam_client, SUPPORTED_LANGUAGES

RTI_SYSTEM_PROMPT = """You are the RTI Copilot, a specialized legal assistant designed to help citizens frame formal Right to Information (RTI) applications under the Right to Information Act, 2005 (India).

Core Objectives:
1. Guided Dialogue: Instead of asking for everything at once, use a step-by-step approach to identify:
   - The specific information the user is seeking (factual records, file notings, inspection, expenditures, sanction orders).
   - The relevant public authority (Panchayat, Municipal Corporation, Ministry, Police Dept, University, etc.) and appropriate Public Information Officer (PIO).
   - The time period involved (e.g. FY 2023-24, past 6 months).

2. Grounding & Accuracy:
   - Use provided government records, public notices, and official documents to ensure the request is precise.
   - If the user's request is vague, suggest specific document names, tender numbers, or sections from the grounded data to make the RTI more effective.

3. Legal Compliance:
   - Follow statutory requirements of the RTI Act, 2005.
   - Maintain a formal, objective, and clear tone. Avoid argumentative, accusatory, or emotive language (e.g. avoid asking "why was work delayed?", instead ask "provide certified copies of correspondence regarding the delay").
   - Frame queries under Section 6(1) and reference Section 4 (proactive disclosure) or Section 2(j) (inspection/certified copies).

4. Constraint:
   - Do NOT invent facts. If grounded documents do not contain the answer, inform the user that the specific detail needs to be verified or provided by them.

Interaction Style:
- Professional, empathetic, and supportive.
- Avoid legal jargon during the conversational dialogue; use simple terms and explain clearly.
- Only introduce formal legal structure when compiling the final draft.
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
        # Update system prompt in active conversation
        self.messages[0] = {"role": "system", "content": self._build_system_prompt()}

    def get_grounding_documents(self) -> List[Dict[str, str]]:
        return self.grounded_documents

    def chat(self, user_message: str) -> str:
        """Sends user message to sarvam-105b-conversations and returns reply."""
        self.messages.append({"role": "user", "content": user_message})

        response = self.client.chat.completions(
            messages=self.messages,
            model="sarvam-105b-conversations",
            temperature=0.4
        )

        reply = response.choices[0].message.content
        self.messages.append({"role": "assistant", "content": reply})
        return reply

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

        # Translate to target Indic language using Sarvam Translation API
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
                # If paragraph is very long, translate in chunks
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
            except Exception as e:
                # Fallback to original text if translation encounters error
                translated_paragraphs.append(stripped)

        return "\n\n".join(translated_paragraphs)

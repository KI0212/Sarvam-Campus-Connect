#!/usr/bin/env python3
"""
RTI Copilot - Modern Voice-Enabled Web Application Server
Powered by Sarvam AI (Speech-to-Text Saaras, Text-to-Speech Bulbul, sarvam-105b-conversations)
Zero extra dependencies — runs on Python's standard library.
"""

import json
import os
import sys
import base64
from pathlib import Path
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
from copilot import RTICopilot
from config import SUPPORTED_LANGUAGES

# Directory for static UI assets
STATIC_DIR = Path(__file__).resolve().parent / "static"

MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".svg": "image/svg+xml",
    ".ico": "image/x-icon",
}

# Global copilot instance for active session
copilot_instance = RTICopilot()

# Pre-loaded sample government grounding documents
SAMPLE_DOCUMENTS = [
    {
        "title": "Municipal Corporation Notice No. PWD/2023/889 - Road Repairs Ward 12",
        "content": """MUNICIPAL CORPORATION (CENTRAL DIVISION)
NOTICE INVITING TENDER / WORK ORDER NOTIFICATION
Order No: PWD/2023/889, Dated: 14-Nov-2023
Subject: Sanction for resurfacing and repair of internal link roads in Ward 12 (MG Road to Station Road).
Public Authority: Office of the Executive Engineer (Roads & Bridges), Central Municipal Corporation.
Public Information Officer (PIO): Shri R. K. Sharma, Executive Engineer (R&B).
First Appellate Authority (FAA): Superintending Engineer (Civil), Central Municipal Corporation.
Contractor Awarded: M/s Apex Infrastructure Ltd.
Sanctioned Amount: Rs. 48,50,000/-
Scheduled Completion Date: 30-Apr-2024. Current Status: Incomplete."""
    },
    {
        "title": "State University Examination Notification No. EXAM/UG/2024/412",
        "content": """STATE UNIVERSITY OF TECHNICAL EDUCATION
Notification Ref: EXAM/UG/2024/412, Dated: 12-Jan-2024
Subject: Guidelines for Re-evaluation and Inspection of Evaluated Answer Scripts.
Public Authority: Examination Branch, State University of Technical Education.
PIO: Deputy Registrar (Examinations), Room 104, Administrative Block.
Prescribed Fees for Inspection: Rs. 10/- RTI application fee, Rs. 2/- per page for certified copies.
Record Retention Period: Answer scripts preserved for 6 months from result declaration date."""
    }
]

# Initialize sample documents
for doc in SAMPLE_DOCUMENTS:
    copilot_instance.add_grounding_document(doc["title"], doc["content"])

class RTIRequestHandler(BaseHTTPRequestHandler):
    def _send_json(self, data, status=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/":
            path = "/index.html"

        # Serve static file if found in STATIC_DIR
        target_file = (STATIC_DIR / path.lstrip("/")).resolve()
        if str(target_file).startswith(str(STATIC_DIR)) and target_file.is_file():
            ext = target_file.suffix.lower()
            content_type = MIME_TYPES.get(ext, "application/octet-stream")
            content = target_file.read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
            return

        if parsed.path == "/api/documents":
            docs = copilot_instance.get_grounding_documents()
            self._send_json(docs)
        elif parsed.path == "/api/languages":
            self._send_json(SUPPORTED_LANGUAGES)
        else:
            self.send_error(404, "Not Found")

    def do_POST(self):
        parsed = urlparse(self.path)
        content_len = int(self.headers.get("Content-Length", 0))
        post_data = self.rfile.read(content_len).decode("utf-8") if content_len > 0 else "{}"
        
        try:
            payload = json.loads(post_data) if post_data else {}
        except json.JSONDecodeError:
            payload = {}

        if parsed.path == "/api/chat":
            user_msg = payload.get("message", "").strip()
            if not user_msg:
                self._send_json({"error": "Empty message"}, status=400)
                return
            try:
                reply = copilot_instance.chat(user_msg)
                self._send_json({"reply": reply})
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)

        elif parsed.path == "/api/voice-chat":
            # Round-trip Sarvam Voice Agent interaction
            audio_b64 = payload.get("audio_base64", "")
            mime_type = payload.get("mime_type", "audio/webm")
            language_code = payload.get("language_code", "unknown")

            if not audio_b64:
                self._send_json({"error": "Missing audio data"}, status=400)
                return

            try:
                audio_bytes = base64.b64decode(audio_b64)
                result = copilot_instance.voice_chat(audio_bytes, mime_type, language_code)
                self._send_json(result)
            except Exception as e:
                import traceback
                traceback.print_exc()
                self._send_json({"error": str(e), "reply": f"Transcription error: {str(e)}"}, status=200)

        elif parsed.path == "/api/tts":
            # Text-to-Speech via Sarvam Bulbul
            text = payload.get("text", "")
            language_code = payload.get("language_code", "en-IN")
            if not text:
                self._send_json({"error": "Text is required"}, status=400)
                return
            try:
                audio_b64 = copilot_instance.synthesize_speech(text, language_code)
                self._send_json({"audio_base64": audio_b64})
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)

        elif parsed.path == "/api/stt":
            # Speech-to-Text via Sarvam Saaras
            audio_b64 = payload.get("audio_base64", "")
            mime_type = payload.get("mime_type", "audio/webm")
            language_code = payload.get("language_code", "unknown")
            if not audio_b64:
                self._send_json({"error": "Missing audio data"}, status=400)
                return
            try:
                audio_bytes = base64.b64decode(audio_b64)
                result = copilot_instance.transcribe_audio(audio_bytes, mime_type, language_code)
                self._send_json(result)
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)

        elif parsed.path == "/api/generate-draft":
            lang = payload.get("language_code", "en-IN")
            try:
                res = copilot_instance.generate_draft(language_code=lang)
                self._send_json(res)
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)

        elif parsed.path == "/api/translate":
            text = payload.get("text", "")
            lang = payload.get("language_code", "hi-IN")
            try:
                if lang == "en-IN":
                    self._send_json({"translated_text": text})
                else:
                    translated = copilot_instance.translate_draft(text, target_lang=lang)
                    self._send_json({"translated_text": translated})
            except Exception as e:
                self._send_json({"error": str(e)}, status=500)

        elif parsed.path == "/api/documents":
            title = payload.get("title", "").strip()
            content = payload.get("content", "").strip()
            if not title or not content:
                self._send_json({"error": "Title and content required"}, status=400)
                return
            copilot_instance.add_grounding_document(title, content)
            self._send_json({"success": True, "count": len(copilot_instance.get_grounding_documents())})

        elif parsed.path == "/api/reset":
            copilot_instance.reset()
            self._send_json({"success": True})

        else:
            self.send_error(404, "Not Found")

def run_server(port=8080):
    server_address = ("127.0.0.1", port)
    httpd = HTTPServer(server_address, RTIRequestHandler)
    print(f"RTI Copilot Voice-Enabled Server running at: http://localhost:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()

if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    run_server(port)

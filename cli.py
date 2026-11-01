#!/usr/bin/env python3
"""
RTI Copilot - Interactive CLI Assistant
Powered by Sarvam AI
"""

import sys
from copilot import RTICopilot
from config import SUPPORTED_LANGUAGES

def print_banner():
    print("=" * 65)
    print("                 ⚖️  RTI COPILOT ASSISTANT")
    print("         Legal Assistant for Citizen RTI Applications")
    print("               Powered by Sarvam AI Indic LLM")
    print("=" * 65)
    print("Commands:")
    print("  /ground <path_or_text> : Add government record/notice for grounding")
    print("  /draft                 : Generate the submission-ready RTI draft")
    print("  /translate <code>      : Translate draft to Indic language (e.g., hi-IN, mr-IN)")
    print("  /languages             : List supported regional languages")
    print("  /reset                 : Clear current conversation session")
    print("  /exit or /quit         : Exit the assistant")
    print("=" * 65)
    print()

def main():
    print_banner()
    copilot = RTICopilot()
    latest_draft = None

    # Initial greeting
    initial_greeting = copilot.chat("Hello! I am ready to file an RTI.")
    print(f"RTI Copilot:\n{initial_greeting}\n")

    while True:
        try:
            user_input = input("You: ").strip()
        except (KeyboardInterrupt, EOFError):
            print("\nExiting RTI Copilot. Good luck with your RTI application!")
            break

        if not user_input:
            continue

        if user_input in ("/exit", "/quit"):
            print("Exiting RTI Copilot. Jai Hind!")
            break

        elif user_input == "/reset":
            copilot.reset()
            latest_draft = None
            print("\n[Conversation session reset. Ready for a new RTI application.]\n")
            continue

        elif user_input == "/languages":
            print("\nSupported Languages:")
            for code, name in SUPPORTED_LANGUAGES.items():
                print(f"  {code:8} : {name}")
            print()
            continue

        elif user_input.startswith("/ground"):
            content = user_input[len("/ground"):].strip()
            if not content:
                print("Usage: /ground <path_to_file> OR /ground <document text>")
                continue
            
            # Check if it's a file path
            try:
                with open(content, "r", encoding="utf-8") as f:
                    doc_text = f.read()
                    copilot.add_grounding_document(title=content, content=doc_text)
                    print(f"\n[Grounded file successfully attached: '{content}']\n")
            except Exception:
                # Treat as raw text
                copilot.add_grounding_document(title="Citizen Provided Document", content=content)
                print("\n[Grounded document text successfully added to context.]\n")
            continue

        elif user_input == "/draft":
            print("\n[Synthesizing statutory RTI draft under RTI Act, 2005...]\n")
            result = copilot.generate_draft(language_code="en-IN")
            latest_draft = result["draft"]
            print("-" * 65)
            print(latest_draft)
            print("-" * 65)
            print("\nTip: Use `/translate hi-IN` (or mr-IN, ta-IN, etc.) to translate this draft.\n")
            continue

        elif user_input.startswith("/translate"):
            if not latest_draft:
                print("Please generate a draft first using `/draft` before translating.")
                continue
            parts = user_input.split()
            target_lang = parts[1] if len(parts) > 1 else "hi-IN"
            if target_lang not in SUPPORTED_LANGUAGES:
                print(f"Unknown language code '{target_lang}'. Run `/languages` to see valid codes.")
                continue

            lang_name = SUPPORTED_LANGUAGES[target_lang]
            print(f"\n[Translating RTI draft to {lang_name} using Sarvam Translation API...]\n")
            translated = copilot.translate_draft(latest_draft, target_lang=target_lang)
            print("-" * 65)
            print(translated)
            print("-" * 65)
            print()
            continue

        # Standard conversation turn
        reply = copilot.chat(user_input)
        print(f"\nRTI Copilot:\n{reply}\n")

if __name__ == "__main__":
    main()

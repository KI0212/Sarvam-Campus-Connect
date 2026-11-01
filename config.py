import os
from pathlib import Path
from sarvamai import SarvamAI

from typing import Optional

# Locate and load .env file
PROJECT_ROOT = Path(__file__).resolve().parent
ENV_PATH = PROJECT_ROOT / ".env"

if ENV_PATH.exists():
    with open(ENV_PATH, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ[k.strip()] = v.strip().strip("'\"")

def get_api_key() -> Optional[str]:
    """Finds the Sarvam API key from env or Streamlit secrets."""
    # 1. Environment variable
    key = os.environ.get("SARVAM_API_KEY") or os.environ.get("sarvam_api_key")
    if key:
        return key.strip().strip("'\"")

    # 2. Streamlit secrets (check multiple common formats)
    try:
        import streamlit as st
        if hasattr(st, "secrets"):
            for k in ["SARVAM_API_KEY", "sarvam_api_key", "SARVAM_KEY", "sarvam_key"]:
                if k in st.secrets:
                    val = str(st.secrets[k]).strip().strip("'\"")
                    if val:
                        os.environ["SARVAM_API_KEY"] = val
                        return val
            if "sarvam" in st.secrets and isinstance(st.secrets["sarvam"], dict):
                val = str(st.secrets["sarvam"].get("api_key", "")).strip().strip("'\"")
                if val:
                    os.environ["SARVAM_API_KEY"] = val
                    return val
    except Exception:
        pass

    return None

def get_sarvam_client() -> SarvamAI:
    api_key = get_api_key()
    if not api_key:
        raise ValueError("SARVAM_API_KEY is not set in environment, .env file, or Streamlit secrets.")
    return SarvamAI(api_subscription_key=api_key)

SUPPORTED_LANGUAGES = {
    "en-IN": "English (India)",
    "hi-IN": "Hindi (हिन्दी)",
    "mr-IN": "Marathi (मराठी)",
    "ta-IN": "Tamil (தமிழ்)",
    "te-IN": "Telugu (తెలుగు)",
    "kn-IN": "Kannada (ಕನ್ನಡ)",
    "bn-IN": "Bengali (বাংলা)",
    "gu-IN": "Gujarati (ગુજરાતી)",
    "ml-IN": "Malayalam (മലയാളം)",
    "pa-IN": "Punjabi (ਪੰਜਾਬੀ)",
    "od-IN": "Odia (ଓଡ଼ିଆ)",
    "as-IN": "Assamese (অসমীয়া)",
    "ur-IN": "Urdu (اردو)",
}

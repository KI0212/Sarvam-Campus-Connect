import os
from pathlib import Path
from sarvamai import SarvamAI

# Load environment variables from .env
env_path = Path(__file__).resolve().parent / ".env"
if env_path.exists():
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip("'\""))

client = SarvamAI(api_subscription_key=os.environ.get("SARVAM_API_KEY"))

response = client.chat.completions(
    messages=[
        {"role": "user", "content": "Hello! Please introduce yourself in one short sentence."}
    ],
    model="sarvam-105b-conversations",
)

print(response.choices[0].message.content)

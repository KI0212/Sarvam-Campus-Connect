import os
import sys
from pathlib import Path

# Add project root to sys.path so copilot, config, etc. can be imported
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from server import RTIRequestHandler

# Vercel Serverless Python runtime looks for 'handler'
handler = RTIRequestHandler

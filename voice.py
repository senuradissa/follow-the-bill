import requests
import hashlib
from pathlib import Path
import os
from dotenv import load_dotenv

load_dotenv()

ELEVENLABS_KEY = os.environ.get("ELEVENLABS_API_KEY")
VOICE_ID  = os.environ.get("ELEVENLABS_VOICE_ID", "21m00Tcm4TlvDq8ikWAM")
AUDIO_DIR = Path(__file__).parent / "data" / "audio"


def speak(text):
    """Return the path to an MP3 of `text` read aloud. Reuses a saved MP3 if we have one."""
    name = hashlib.sha256(text.encode("utf-8")).hexdigest()[:16]
    path = AUDIO_DIR / f"{name}.mp3"
    if path.exists():
        return path                      # already made this one, costs nothing

    resp = requests.post(
        f"https://api.elevenlabs.io/v1/text-to-speech/{VOICE_ID}",
        headers={"xi-api-key": ELEVENLABS_KEY},
        json={"text": text, "model_id": "eleven_multilingual_v2"},
        timeout=60,
    )
    resp.raise_for_status()

    AUDIO_DIR.mkdir(parents=True, exist_ok=True)   # make data/audio/ if it doesn't exist yet
    path.write_bytes(resp.content)                          # save the MP3
    return path
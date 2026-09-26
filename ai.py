"""Gemini calls (summary: Person A, letter: Person B).

Replace the fake returns with real Gemini calls. Keep the return shapes the same.
"""
from dotenv import load_dotenv
load_dotenv()
import os
import json
import time
from google import genai
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")
try:
    client = genai.Client()  # reads GEMINI_API_KEY from the environment

except Exception as e:
    # Was crashing the whole app on import (and therefore every route, not just
    # the Gemini ones) for anyone without GEMINI_API_KEY set yet. Falls back to
    # the fake data below until a real key is in .env.
    print(f"[ai.py] Gemini client not ready yet ({e}); using fake data for now.")
    client = None

from google.genai import errors, types

MODELS = [GEMINI_MODEL, "gemini-flash-latest", "gemini-3.1-flash-lite"]

SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {
        "tldr": {"type": "string"},
        "summary": {"type": "string"},
        "key_changes": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["tldr", "summary", "key_changes"],
}

from pathlib import Path

SUMMARY_CACHE_FILE = Path(__file__).parent/ "data" / "summary_cache.json"

def load_summary_cache():
    if SUMMARY_CACHE_FILE.exists():
        return json.loads(SUMMARY_CACHE_FILE.read_text(encoding="utf-8"))
    return {}

def save_summary_cache():
    SUMMARY_CACHE_FILE.write_text(
        json.dumps(_summary_cache, ensure_ascii=False, indent=2), encoding="utf-8"
    )

_summary_cache = load_summary_cache()

def summarize(bill, lang):
    key=bill["source_url"]
    if key in _summary_cache:
        return _summary_cache[key]
    language = "English" if lang == "en" else "French"

    prompt = f"""You are explaining a Canadian federal bill to an ordinary citizen

    Rules:
    - Write in {language}, at a level a high school student could understand.
    - Use only what's in the bill text, and no opinions or outside facts
    - Don't use legal jargon, if you must use it, explain it in simple terms

    Write:
    - tldr - One or two sentences
    - summary: Two or three short paragraphs
    - key_changes: 5 or 6 bullet points, one sentence each

    Title: {bill["title"]}

    Official Summary: {bill["official_summary"]}
    Bill text:
    {bill["text"][:150000]}
    """

    config = types.GenerateContentConfig(
        response_mime_type="application/json",
        response_schema=SUMMARY_SCHEMA,
    )
    for model in MODELS:
        try:
            resp = client.models.generate_content(model=model, contents=prompt, config=config)
            summary = json.loads(resp.text)
            _summary_cache[key] = summary
            save_summary_cache()
            return summary
        except errors.APIError as e:
            if e.code in (429, 503): #429 = Out of quota, 503 = busy
                continue
            raise
    raise RuntimeError("Gemini is busy or out of quota, try again later...")


def draft_letter(lang, mp, bill, stance, note, name):
    """Message from a constituent to their MP.

    stance is 'support', 'oppose' or 'questions'.
    Return {subject, body}
    """
    # TODO(B): call Gemini
    return {
        "subject": f"Bill {bill['code']}",
        "body": f"Dear {mp['name']},\n\n(Fake letter: {stance}) {note}\n\n{name}",
    }

def identify_affected_companies(bill, lang, max_retries=3):
    """Which real companies/sectors this bill affects.
    Return {companies: [str], sectors: [str]}
    """
    if client is None:
        return {"companies": [], "sectors": []}
    prompt = f"""Read this bill text and list real, named companies or 
industry sectors that would be materially affected if it passes.
Use ONLY what's in the text plus general knowledge of the sector, 
don't guess at companies not plausibly connected.

Bill: {bill['title']}
Text: {bill['text'][:150000]}

Return JSON: {{"companies": ["Company Name", ...], "sectors": ["sector", ...]}}
Max 8 companies."""
    for attempt in range(max_retries):
        try:
            resp = client.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config={"response_mime_type": "application/json"},
            )
            return json.loads(resp.text)
        except Exception as e:
            #print(f"[attempt {attempt+1}] Gemini call failed: {e}")  # TEMP debug
            if attempt == max_retries - 1:
                return {"companies": [], "sectors": []}
            time.sleep(2 ** attempt)

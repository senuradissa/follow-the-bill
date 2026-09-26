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
client = genai.Client()  # reads GEMINI_API_KEY from the environment

def summarize(bill, lang):
    """Plain-language summary of a bill in 'en' or 'fr'.

    `bill` is what bills.bill_text() returns.
    Return {tldr, summary, key_changes: [str]}
    """
    # TODO(A): call Gemini
    return {
        "tldr": f"[{lang}] One-sentence fake summary of {bill['title']}.",
        "summary": "Fake paragraph one.\n\nFake paragraph two.",
        "key_changes": ["Fake change one", "Fake change two"],
    }


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

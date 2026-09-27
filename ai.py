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

# gemini-flash-latest is an alias for gemini-3.8-flash server-side (confirmed
# live: a 429 on "gemini-flash-latest" reports quotaDimensions.model as
# "gemini-3.8-flash") -- so those two share one quota bucket, not two.
# gemini-3.1-flash-lite is a genuinely different model/bucket (Person A's
# addition) and is the one worth having in here.
MODELS = [GEMINI_MODEL, "gemini-flash-latest", "gemini-3.1-flash-lite"]

CACHE_DIR = "data"
os.makedirs(CACHE_DIR, exist_ok=True)


def _cache_path(name):
    return os.path.join(CACHE_DIR, f".cache_{name}.json")


def _load_cache(name):
    try:
        with open(_cache_path(name)) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_cache(name, data):
    with open(_cache_path(name), "w") as f:
        json.dump(data, f)


def _bill_key(bill, lang):
    # source_url is unique per bill+session; falls back to title if a caller
    # ever passes a bill dict without it. lang is included since the same
    # bill has separate EN/FR results -- keying on source_url alone would let
    # an EN summary get served back for an FR request.
    return f"{bill.get('source_url') or bill.get('title')}|{lang}"


_summary_cache = _load_cache("summaries")
_company_cache = _load_cache("companies")


def _generate_json(prompt, config, max_retries_per_model=2):
    """Call Gemini, falling back across MODELS and returning parsed JSON.

    Gemini's free-tier quota is tracked per model (see a 429's
    quotaDimensions), so a 429 on one model means that model specifically is
    exhausted for the day -- retrying it wastes time and always fails within
    the ~7s our backoff allows, when the server is asking for a 40-60s wait.
    Move to the next model immediately instead. A 503 ("high demand") is
    transient, so that's the one case worth a short retry on the same model.
    """
    last_err = None
    for model in MODELS:
        for attempt in range(max_retries_per_model):
            try:
                resp = client.models.generate_content(model=model, contents=prompt, config=config)
                return json.loads(resp.text)
            except errors.APIError as e:
                last_err = e
                if e.code == 429:
                    print(f"[ai] {model}: quota exhausted (429), trying next model.")
                    break  # don't retry this model, move to the next one
                elif e.code == 503:
                    print(f"[ai] {model} attempt {attempt + 1}: busy (503), retrying.")
                    time.sleep(2 ** attempt)
                else:
                    print(f"[ai] {model}: API error {e.code}, trying next model. {e!r}")
                    break
            except Exception as e:
                last_err = e
                print(f"[ai] {model} attempt {attempt + 1}: unexpected error {e!r}")
                time.sleep(2 ** attempt)
    raise RuntimeError(f"All models exhausted or failing: {last_err!r}")


SUMMARY_SCHEMA = {
    "type": "object",
    "properties": {
        "tldr": {"type": "string"},
        "summary": {"type": "string"},
        "key_changes": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["tldr", "summary", "key_changes"],
}

def summarize(bill, lang):
    key = _bill_key(bill, lang)
    if key in _summary_cache:
        return _summary_cache[key]

    language = "English" if lang == "en" else "French"

    prompt = f"""You are explaining a Canadian federal bill to an ordinary citizen

    Rules:
    - Write in {language}, at a level a high school student could understand.
    - Use only what's in the bill text, and no opinions or outside facts
    - Don't use legal jargon, if you must use it, explain it in simple terms
    - Word count limit is 350 words

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
    result = _generate_json(prompt, config)
    _summary_cache[key] = result
    _save_cache("summaries", _summary_cache)
    return result


def draft_letter(lang, mp, bill, stance, note, name):
    """Message from a constituent to their MP.

    stance is 'support', 'oppose' or 'questions'.
    Return {subject, body}
    """
    # TODO(B): call Gemini to actually draft the body from stance/note/bill;
    # this still just echoes what the person typed in `note`, no AI writing yet.
    stance_label = {"support": "Support", "oppose": "Oppose", "questions": "Questions"}.get(stance, stance.title())
    return {
        "subject": f"Bill {bill['code']} - {stance_label}",
        "body": f"Dear {mp['name']},\n\n{note}\n\n{name}",
    }

def identify_affected_companies(bill, lang):
    """Which real companies/sectors this bill affects.
    Return {companies: [str], sectors: [str]}
    """
    if client is None:
        return {"companies": [], "sectors": []}

    key = _bill_key(bill, lang)
    if key in _company_cache:
        return _company_cache[key]

    prompt = f"""Read this bill text and list real, named companies or
industry sectors that would be materially affected if it passes.
Use ONLY what's in the text plus general knowledge of the sector,
don't guess at companies not plausibly connected. If the bill's subject
matter clearly implicates an industry (e.g. a fuel-price bill implicates
oil & gas producers and refiners; an EV-incentive bill implicates electric
vehicle makers), name representative real, publicly-traded companies in
that industry even if the bill text doesn't mention them by name -- that's
what "sectors" plus general knowledge means here. Prefer Canadian or
North American companies where relevant.

Bill: {bill['title']}
Text: {bill['text'][:150000]}

Return JSON: {{"companies": ["Company Name", ...], "sectors": ["sector", ...]}}
Max 8 companies."""
    try:
        result = _generate_json(prompt, config={"response_mime_type": "application/json"})
    except RuntimeError as e:
        # Don't cache this -- it's a quota/API failure, not Gemini's real
        # judgment that there's nothing to report. Caching it would lock in
        # "no companies found" for this bill even after quota resets.
        print(f"[identify_affected_companies] {e}")
        return {"companies": [], "sectors": []}

    _company_cache[key] = result
    _save_cache("companies", _company_cache)
    return result

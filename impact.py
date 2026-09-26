import json
import os
import time

import requests
from dotenv import load_dotenv

import ai

load_dotenv()

# Both optional: without them, resolve_ticker()/get_stock_snapshot() return None
# instead of crashing, so the rest of the app still works. Fill these in .env
# once someone on the team has real keys.
FINNHUB_KEY = os.environ.get("FINNHUB_API_KEY")
OPENFIGI_KEY = os.environ.get("OPENFIGI_API_KEY")  # optional but recommended

_ticker_cache = {}


def resolve_ticker(company_name):
    if not OPENFIGI_KEY and not FINNHUB_KEY:
        return None  # no point calling out if we can't price it anyway
    if company_name in _ticker_cache:
        return _ticker_cache[company_name]

    headers = {"Content-Type": "application/json"}
    if OPENFIGI_KEY:
        headers["X-OPENFIGI-APIKEY"] = OPENFIGI_KEY

    # Try major exchanges in priority order: US (NYSE/Nasdaq composite), then Canada
    for exch in ["US", "CA"]:
        try:
            resp = requests.post(
                "https://api.openfigi.com/v3/search",
                headers=headers,
                json={"query": company_name, "securityType2": "Common Stock", "exchCode": exch},
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json().get("data", [])
        except requests.RequestException:
            data = []
        if data:
            ticker = data[0]["ticker"]
            _ticker_cache[company_name] = ticker
            time.sleep(0.3)
            return ticker
        time.sleep(0.3)

    _ticker_cache[company_name] = None
    return None


_quote_cache = {}


def get_stock_snapshot(ticker):
    """Return {price, change, change_pct} or None."""
    if not ticker or not FINNHUB_KEY:
        return None
    if ticker in _quote_cache:
        return _quote_cache[ticker]
    try:
        resp = requests.get(
            "https://finnhub.io/api/v1/quote",
            params={"symbol": ticker, "token": FINNHUB_KEY},
            timeout=10,
        )
        resp.raise_for_status()
        q = resp.json()
    except requests.RequestException:
        return None
    if q.get("c") is None:
        return None
    snapshot = {"price": q["c"], "change": q["d"], "change_pct": q["dp"]}
    _quote_cache[ticker] = snapshot
    return snapshot


def load_mp_holdings():
    # TODO(team): data/mp_holdings.json doesn't exist in the repo yet.
    # Expected shape: a JSON list of {"mp_name": str, "holding": str, ...}.
    try:
        with open("data/mp_holdings.json") as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return []


def politicians_holding(company_name):
    """MPs whose disclosed holdings match this company name (loose match)."""
    holdings = load_mp_holdings()
    name_lower = company_name.lower()
    return [h for h in holdings if h["holding"].lower() in name_lower or name_lower in h["holding"].lower()]


def analyze_impact(bill, lang="en"):
    extracted = ai.identify_affected_companies(bill, lang)
    results = []
    for company in extracted["companies"]:
        ticker = resolve_ticker(company)
        snapshot = get_stock_snapshot(ticker)
        conflicts = politicians_holding(company)
        results.append({
            "company": company,
            "ticker": ticker,
            "market_data": snapshot,          # Fact, if present
            "political_holdings": conflicts,  # Fact: MP holds this stock
            # Inferred label is added in the frontend/prompt copy, not asserted here
        })
    return {"companies": results, "sectors": extracted["sectors"]}

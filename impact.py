import json
import os
import time

import requests
from dotenv import load_dotenv

import ai

load_dotenv()

FINNHUB_KEY = os.environ.get("FINNHUB_API_KEY")
OPENFIGI_KEY = os.environ.get("OPENFIGI_API_KEY")
ALPHA_VANTAGE_KEY = os.environ.get("ALPHA_VANTAGE_API_KEY")

CACHE_DIR = "data"
os.makedirs(CACHE_DIR, exist_ok=True)

_LOBBYING = None

def load_lobbying_activity():
    global _LOBBYING
    if _LOBBYING is None:
        with open("data/lobbying_activity.json", encoding="utf-8") as f:
            _LOBBYING = json.load(f)
    return _LOBBYING

def company_lobbying(company_name):
    """Case-insensitive substring match: Gemini's extracted name ("Suncor")
    against the registry's formal name ("Suncor Energy Inc.")."""
    lobbying = load_lobbying_activity()
    needle = company_name.strip().lower()
    for registered_name, records in lobbying.items():
        if needle in registered_name.lower() or registered_name.lower() in needle:
            return registered_name, records
    return None, []

def _load_disk_cache(name):
    path = os.path.join(CACHE_DIR, f".cache_{name}.json")
    try:
        with open(path) as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _save_disk_cache(name, data):
    path = os.path.join(CACHE_DIR, f".cache_{name}.json")
    with open(path, "w") as f:
        json.dump(data, f)


_ticker_cache = _load_disk_cache("tickers")
_quote_cache = _load_disk_cache("quotes")
_history_cache = _load_disk_cache("history")


def resolve_ticker(company_name):
    if not OPENFIGI_KEY and not FINNHUB_KEY:
        return None
    if company_name in _ticker_cache:
        return _ticker_cache[company_name]

    headers = {"Content-Type": "application/json"}
    if OPENFIGI_KEY:
        headers["X-OPENFIGI-APIKEY"] = OPENFIGI_KEY

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
            _save_disk_cache("tickers", _ticker_cache)
            time.sleep(0.3)
            return ticker
        time.sleep(0.3)

    _ticker_cache[company_name] = None
    _save_disk_cache("tickers", _ticker_cache)
    return None


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
    _save_disk_cache("quotes", _quote_cache)
    return snapshot


def get_price_history(ticker):
    """~100 trading days (roughly the last 5 months) of daily closes,
    oldest first: [{date, close}, ...], or None. Free-tier Alpha Vantage
    only exposes this much; outputsize=full is a paid feature.
    """
    if not ticker or not ALPHA_VANTAGE_KEY:
        return None
    if ticker in _history_cache:
        return _history_cache[ticker]
    try:
        resp = requests.get(
            "https://www.alphavantage.co/query",
            params={
                "function": "TIME_SERIES_DAILY",
                "symbol": ticker,
                "apikey": ALPHA_VANTAGE_KEY,
            },
            timeout=20,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException:
        return None

    series = data.get("Time Series (Daily)")
    if not series:
        _history_cache[ticker] = None
        _save_disk_cache("history", _history_cache)
        return None

    points = sorted(
        ({"date": d, "close": float(v["4. close"])} for d, v in series.items()),
        key=lambda p: p["date"],
    )
    _history_cache[ticker] = points
    _save_disk_cache("history", _history_cache)
    return points


def project_trend(history, years=4, max_annual_growth=0.20):
    """Naive extrapolation from a short real window (~5 months on the free
    tier). Explicitly illustrative, NOT a forecast. Growth rate is clamped
    to +/-max_annual_growth to avoid a short noisy window producing an
    absurd multi-year compounding result.
    Return [{year, price}, ...] for years 1..years, or None.
    """
    if not history or len(history) < 2:
        return None
    start = history[0]["close"]
    end = history[-1]["close"]
    if start <= 0:
        return None

    span_days = (
        __import__("datetime").date.fromisoformat(history[-1]["date"])
        - __import__("datetime").date.fromisoformat(history[0]["date"])
    ).days
    span_years = max(span_days / 365.25, 0.05)
    raw_cagr = (end / start) ** (1 / span_years) - 1
    cagr = max(-max_annual_growth, min(max_annual_growth, raw_cagr))

    return [
        {"year": y, "price": round(end * (1 + cagr) ** y, 2)}
        for y in range(1, years + 1)
    ]


def load_mp_holdings():
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
    """Companies/sectors a bill plausibly affects, with real stock prices and
    real disclosed MP/party holding matches -- a conflict-of-interest signal,
    not investment analytics.

    No forward-looking price projection or hypothetical net-worth figure is
    computed here on purpose: an illustrative "4-year prediction" chart,
    however clearly labelled, reads as a buy signal, which is exactly what
    this feature should not be. get_price_history() and project_trend() are
    left defined above in case a genuinely different, honestly-framed use for
    real historical context comes up later, but analyze_impact() no longer
    calls them or reports anything derived from them.
    """
    extracted = ai.identify_affected_companies(bill, lang)
    results = []
    for company in extracted["companies"]:
        ticker = resolve_ticker(company)
        snapshot = get_stock_snapshot(ticker)
        registered_name, lobbying_records = company_lobbying(company)

        results.append({
            "company": company,
            "registered_name": registered_name,
            "ticker": ticker,
            "market_data": snapshot,
            "lobbying_activity": lobbying_records,
        })
    return {"companies": results, "sectors": extracted["sectors"]}

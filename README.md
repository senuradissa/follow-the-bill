# Follow the Bill

Our project for Hack the Hill III (Civic Technology track).

Most people never read the bills Parliament is voting on. They're long, full of legal language, and hard to even find. So we made a site where you can:

1. pick a federal bill from the current session
2. read a plain-language summary of it, in English or French
3. see which companies and sectors it might affect
4. find your MP with your postal code
5. write them a message about it

## Where we're at

| Part | Status |
|---|---|
| Bill list (live from parl.ca) | ✅ done |
| Bill text in EN + FR (from the official parl.ca XML) | ✅ done |
| Plain-language summaries (Gemini) | ✅ done, cached so they load instantly the second time |
| Companies / market impact | 🚧 in progress |
| MP lookup by postal code | 🚧 still fake data |
| Drafting the letter | 🚧 still fake data |
| Deploy | ⬜ not yet |

## Running it locally

You need Python 3 (we use 3.14).

```bash
python3 -m venv venv
source venv/bin/activate          # fish: source venv/bin/activate.fish
pip install -r requirements.txt
cp .env.example .env              # then put your Gemini key in .env
flask --app app run --debug
```

Then go to http://127.0.0.1:5000

**Never commit `.env`.** It's in `.gitignore`, keep it that way.

### About the Gemini key

- Get a free one at https://aistudio.google.com/apikey. Ideally everyone uses their own for testing.
- The free tier is only about **20 requests per day per model**, so don't spam test calls.
- Use `GEMINI_MODEL=gemini-3.8-flash` in your `.env`. `gemini-2.5-flash` is retired and just returns a 404.
- If the main model is busy or out of quota, `summarize()` automatically tries the backup models in `MODELS` in `ai.py`.

`FINNHUB_API_KEY` and `OPENFIGI_API_KEY` are optional (only used for the stock data in the impact section). Without them the app still runs, it just skips the stock prices.

## How it works

```
parl.ca bill list ─► list_bills() ─► the bill list page
                                          │ click a bill
parl.ca bill JSON ─► newest version's PublicationId
parl.ca DocumentViewer page ─► link to the bill's XML (_E.xml / _F.xml)
bill XML ─► title, official summary, full text   (bill_text)
                                          │
Gemini ─► tldr, summary, key changes      (summarize, saved to data/summary_cache.json)
```

A few things we learned the hard way:

- parl.ca blocks requests straight from the browser, so all bill fetching happens in Python, not in `app.js`.
- The bill list download needs a browser-like `User-Agent` header.
- The French summary comes from the **official French text** of the bill, not a translation of the English one.
- The summary prompt tells Gemini to use **only** the bill text: no opinions and no outside facts.

## Files

| File | What's in it | Who |
|---|---|---|
| `bills.py` | Getting bills and bill text from parl.ca | A |
| `ai.py` → `summarize()` | Gemini summaries + the summary cache | A |
| `ai.py` → `draft_letter()` | Gemini letter to your MP | B |
| `mp.py` | MP lookup by postal code | B |
| `impact.py`, `ai.py` → `identify_affected_companies()` | Companies/sectors a bill affects, stock data | impact |
| `templates/`, `static/` | Frontend | C |
| `app.py` | Flask routes (shared, check with the team before changing) | everyone |
| `data/summary_cache.json` | Saved summaries. Commit it so everyone gets them for free | |
| `data/mp_holdings.json` | **Sample data only**, not real MPs yet | |

More detail on who's doing what is in [PLAN.md](PLAN.md).

## API

These shapes are what the frontend expects, so tell the team before you change them.

```
GET  /api/bills
     → [{ code, session, title_en, title_fr, status_en, introduced }]

GET  /api/bills/<session>/<code>/summary?lang=en|fr
     → { tldr, summary, key_changes[], title, source_url }

GET  /api/bills/<session>/<code>/impact?lang=en|fr
     → { companies: [{ company, ticker, market_data, political_holdings }], sectors[] }

GET  /api/mp?postal=K1N6N5
     → { name, party, riding, email, photo_url }

POST /api/letter  { lang, mp, bill, stance, note, name }
     → { subject, body }
```

`stance` is `support`, `oppose` or `questions`.

## Data sources

- Bill list: https://www.parl.ca/legisinfo/en/bills/json
- One bill (has the `Publications` list): `https://www.parl.ca/legisinfo/en/bill/<session>/<code>/json`, e.g. `.../bill/45-1/c-5/json`
- Bill text page: `https://www.parl.ca/DocumentViewer/en/<PublicationId>` (`/fr/` for French)
- MP by postal code: `https://represent.opennorth.ca/postcodes/K1N6N5/` (no key needed)

## Team habits

- `git pull` before you start anything
- commit small, and only push code that actually runs (if `app.py` can't import your file, the app breaks for everyone)
- before the demo: open the demo bills in both languages once, then commit `data/summary_cache.json` so the demo doesn't depend on Gemini or the wifi

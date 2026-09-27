# Follow the Bill

**Hack the Hill III — Civic Technology Challenge.**

Parliament passes dozens of bills a year that affect ordinary Canadians, and almost none of them are written for ordinary Canadians. Bill text is long, full of cross-references to other acts, and scattered across parl.ca in a format built for legal professionals, not citizens. Most people find out about a bill only if it either gains some traction, or becomes a proper law.

*Follow the Bill* closes that gap by taking a real federal bill, in either official language, and turns it into something a citizen can actually read, act on, and keep track of without needing a law degree, or a media subscription.

## Who this is for

- Canadian residents who want to know what the Parliament is doing but don't have the time or background to properly read through a bill's official text.
- The federal legislative process itself via the bills moving through the House of Commons and Senate (LEGISinfo/parl.ca), and the federally regulated lobbying activity around them (the Registry of Lobbyists).
- Helps people go from simply knowing a bill exists to truly understanding what it is and who it is being influeced by.

## What it does

1. Lists federal bills currently before Parliament, pulled live from parl.ca.
2. Shows a summary of any bill in plain language, consisting of a one line TLDR, a few paragraphs, and a bulleted list of key changes, generated only from the bill's own official text, in English or French, where the French version comes from the bill's actual official French text, instead of being a rough translation of the English summary.
3. Has the optional feature to reads the summary transcript aloud, for anyone who'd rather listen than read.
4. Shows which real companies or industry sectors a bill plausibly affects, and cross references them against Canada's public Registry of Lobbyists, so you can see who's actually registered to lobby government officials on that subject, sourced from the federal government's own disclosure data.
5. Looks up your local MP by postal code and helps you draft a message to them, where you can express your support, opposition, or having the ability of just asking additional questions, straight from the page itself.
6. Lets you create an account, allowing you to bookmark and follow any particular bill(s) you care about, and get automatic emails when a bookmarked bill's status changes, allowing you to save more time that you would have wasted by visiting the website everyday.

## Why this fits the brief

The challenge statement calls out specific real-world constraints. Here's how the project answers each one:

| Constraint | How it's handled |
|---|---|
| **Accessibility** | Plain language summaries instead of legal text; an audio TTS option for anyone who doesn't want to read a wall of text; mobile responsive layout. |
| **Language** | Bills are readable in English or French. |
| **Trust** | Every factual claim traces to a public, official source: bill text and status from parl.ca/LEGISinfo, lobbying activity from the federal Registry of Lobbyists' own bulk data exports. The AI layer is explicitly restricted to summarizing what's in the bill text, where no outside opinions or invented facts are used. This is explicitly stated on the page itself. |
| **Privacy** | We deliberately do not surface an MP's personal financial disclosures since it is too legally and ethically fraught for the confidence we could have in the data. Instead we show company lobbying activity, which is what's actually meant to be public. User accounts only store what's needed to run the bookmarks feature. |
| **Limited resources** | Built entirely on free tiers: Gemini's free API tier, MongoDB Atlas's free cluster, Auth0's free tier, a free Gmail account for outgoing mail, and ElevenLabs for generating the text to speech. |
| **Legacy systems** | parl.ca has no clean public API for bill text. It blocks direct browser requests and serves the bill text as bare XML files, which are only discovered by scraping a document viewer page. The project makes sure to work around that rather than requiring government systems to change first. |
| **Connectivity** | Summaries and lobbying data are cached to disk after first fetch, so the same bill can load instantly after the first request. |
| **Ease of use** | The project comes with one search box, one set of status filters, one click to bookmark, and one click to draft a letter. Moreover, an account is not required if you just want to read and understand a bill. An account is only needed for the following up on a bill by bookmarking it and enabling email alerts. |

## Files

| File | What's in it | Who |
|---|---|---|
| `bills.py` | Getting bills and bill text from parl.ca | A |
| `ai.py` → `summarize()`, `identify_affected_companies()` | Gemini summaries, company/sector detection, both cached | A |
| `ai.py` → `draft_letter()` | Gemini letter to your MP | B |
| `mp.py` | MP lookup by postal code (Represent API) | B |
| `impact.py` | Joins Gemini's affected-companies list against real lobbying activity; optional stock data | shared |
| `build_lobbying_activity.py` | One-time offline script: turns the Registry of Lobbyists' raw CSV exports into `data/lobbying_activity.json` | B |
| `auth.py` | Auth0 login/callback/logout (Authlib) | B |
| `users.py` | Mongo-backed bookmarks, user records, last-known bill status | B |
| `notifications.py` | Background job: emails bookmarkers when a bill's status changes | B |
| `voice.py` | "Listen to this summary" audio generation | C |
| `templates/`, `static/` | Frontend | C |
| `app.py` | Flask routes (shared, check with the team before changing) | everyone |
| `data/.cache_*.json` | Saved Gemini results. Commit them so everyone gets them for free | |
| `data/lobbying_activity.json` | Built once by `build_lobbying_activity.py`, then committed | |

## API

These shapes are what the frontend expects.

```
GET  /api/bills
     → [{ code, session, title_en, title_fr, status_en, introduced }]

GET  /api/bills/<session>/<code>/summary?lang=en|fr
     → { tldr, summary, key_changes[], title, official_summary, source_url }

GET  /api/bills/<session>/<code>/impact?lang=en|fr
     → { companies: [{ company, ticker, registered_name, lobbying_activity[] }], sectors[] }

GET  /api/mp?postal=K1N6N5
     → { name, party, riding, email, photo_url }

POST /api/letter  { lang, mp, bill, stance, note, name }
     → { subject, body }

GET    /api/bookmarks                        → [{ session, code, title_en }]   (requires login)
POST   /api/bookmarks  { session, code, title_en }                            (requires login)
DELETE /api/bookmarks/<session>/<code>                                        (requires login)

GET  /login    /callback    /logout           -- Auth0 flow
```

`stance` is `support`, `oppose` or `questions`.

## Data sources

- Bill list: https://www.parl.ca/legisinfo/en/bills/json
- One bill (has the `Publications` list): `https://www.parl.ca/legisinfo/en/bill/<session>/<code>/json`, e.g. `.../bill/45-1/c-5/json`
- Bill text page: `https://www.parl.ca/DocumentViewer/en/<PublicationId>` (`/fr/` for French)
- MP by postal code: `https://represent.opennorth.ca/postcodes/K1N6N5/` (no key needed)
- Lobbying activity: Canada's [Registry of Lobbyists](https://lobbycanada.gc.ca/en/bulk-data/) bulk data exports (`Communication_*Export.csv`)

## Running it locally

You need **Python3** (we use 3.14).

**1. Create and activate a virtual environment**

macOS/Linux (bash/zsh):
```bash
python3 -m venv venv
source venv/bin/activate
```
shell:
```bash
python3 -m venv venv
source venv/bin/activate.fish
```
Windows (PowerShell):
```powershell
python3 -m venv venv
venv\Scripts\Activate.ps1
```

**2. Install dependencies**
```bash
pip install -r requirements.txt
```

**3. Set up your environment variables**
```bash
cp .env.example .env
```
Then fill in `.env` (see the table below for what each one does and where to get it).

**4. Run it**
```bash
flask --app app run --debug
```
Then go to http://127.0.0.1:5000

### Environment variables

| Variable | Required? | What it's for |
|---|---|---|
| `GEMINI_API_KEY` | Yes | Bill summaries, letter drafting, company/sector detection. Free at https://aistudio.google.com/apikey — get your own, don't share one, the free tier is ~20 requests/day/model. |
| `GEMINI_MODEL` | Yes | Use `gemini-3.8-flash` or `gemini-flash-latest`. |
| `APP_SECRET_KEY` | Yes (for login) | Signs the Flask session cookie. Any random string, such as one generated by `python3 -c "import secrets; print(secrets.token_hex(32))"`. |
| `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `AUTH0_DOMAIN` | Yes (for login) | From your Auth0 application's Settings tab. |
| `MONGODB_URI` | Yes (for bookmarks) | From MongoDB Atlas → Database → Connect → Drivers. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` | Yes (for email alerts) | One shared mailbox the app sends *from*. For Gmail: enable 2-Step Verification, then create an App Password. |
| `FINNHUB_API_KEY`, `OPENFIGI_API_KEY` | Optional | Stock prices in the lobbying/impact panel. App runs fine without them, it just skips prices. |

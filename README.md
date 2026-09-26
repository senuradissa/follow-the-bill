# Follow the Bill

Hack the Hill III, Civic Technology track.

Pick a federal bill → read it in plain English or French → find your MP by postal code → send them a message.

## Setup (each teammate)

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # paste the Gemini key in here; share it privately, never commit it
flask --app app run --debug
```

Open http://127.0.0.1:5000

## Status

Skeleton only. Every route works but returns **fake data**. Each person replaces the fakes
in their files without changing the return shapes, so nobody blocks anyone else.

| File | Owner |
|---|---|
| `bills.py` | A |
| `ai.py` → `summarize()` | A |
| `mp.py` | B |
| `ai.py` → `draft_letter()` | B |
| `templates/index.html`, `static/` | C |
| `app.py` | shared (change only if you all agree) |

## API (the contract; don't change shapes without telling the team)

```
GET  /api/bills                                → [{ code, session, title_en, title_fr, status_en }]
GET  /api/bills/<session>/<code>/summary?lang=en|fr
                                               → { tldr, summary, key_changes[], title, source_url }
GET  /api/mp?postal=K1N6N5                     → { name, party, riding, email, photo_url }
POST /api/letter  { lang, mp, bill:{code,title,tldr}, stance, note, name }
                                               → { subject, body }
```

`stance` is `support`, `oppose` or `questions`.

## Phases

1. **Core loop**: bill → summary EN/FR → MP → message. Working end to end, deployed.
2. **Context**: "why now" (Gemini + Google Search grounding, cited links) and "who gains / who pays", labelled Fact / Reported / Inferred.
3. **Voice**: ElevenLabs play buttons.

Deploy and save a working version at the end of every phase.

## Data sources (checked and working)

- Bill list: `https://www.parl.ca/legisinfo/en/bills/json`
- One bill's details (includes `Publications`): `https://www.parl.ca/legisinfo/en/bill/45-1/c-5/json`
- Bill text as XML, English and French: linked from `https://www.parl.ca/DocumentViewer/en/<PublicationId>` (use `/fr/` for French)
- MP by postal code: `https://represent.opennorth.ca/postcodes/K1N6N5/` (no key needed)

parl.ca blocks direct requests from the browser, so bill data must be fetched in Python, not in `app.js`.

# Team plan

Three people, ~10 hours, Civic Technology track. Rule of thumb: **phase 1 working end to end before anyone starts phase 2.**

## Before anyone codes (30 min, all together)

1. Everyone clones the repo and follows the setup in the README until they see the fake bill list at http://127.0.0.1:5000.
2. One person shares the Gemini key privately (DM, never the repo). Everyone puts it in their own `.env`.
3. Read the API section of the README together. Those shapes are the contract: change anything *inside* your files, but not what they return, without telling the others.
4. Git habits: `git pull` before you start, commit small and often, `git pull` then `git push`. Each person mostly edits only their own files, so conflicts should be rare.

## Person A: Bills and summaries

**Files:** `bills.py`, and `summarize()` in `ai.py`

1. **`list_bills()`**: fetch `https://www.parl.ca/legisinfo/en/bills/json` with `requests` and map to the agreed shape.
   - Fields: `NumberCode`, `ShortTitleEn` (fall back to `LongTitleEn`), `ShortTitleFr`, `StatusNameEn`, `ParliamentNumber`, `SessionNumber`.
   - Skip bills whose status says "pro forma" (C-1 and S-1 are ceremonial placeholders).
   - Sort by `PassedHouseFirstReadingDateTime` / `PassedSenateFirstReadingDateTime`. `LatestBillEventDateTime` is always 0001-01-01 in this feed.
2. **`bill_text()`**: the hardest part, budget ~2 hours.
   - Fetch `https://www.parl.ca/legisinfo/en/bill/<session>/<code lowercase>/json` and look at its `Publications` list. The last one is the newest version.
   - Open `https://www.parl.ca/DocumentViewer/en/<PublicationId>` and find the link ending in `_E.xml` (`/fr/` and `_F.xml` for French). If the newest publication has no XML link, try the previous one.
   - Parse the XML with the built-in `xml.etree.ElementTree`. Useful elements: `Identification/ShortTitle`, `Identification/LongTitle`, `Introduction/Summary`, `Body`.
   - **Open these URLs in the browser first** and look at the data before writing code.
   - Send a browser-like `User-Agent` header. Cache results (even a dict) because parl.ca can be slow.
3. **`summarize()`**: Gemini call.
   ```python
   from google import genai
   client = genai.Client()  # reads GEMINI_API_KEY from the environment
   resp = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
   ```
   - Ask for JSON back (look up `response_mime_type`) so you get `tldr`, `summary`, `key_changes` as fields.
   - Key prompt rule: *"Use ONLY the bill text. Don't add opinions or facts not in the text."* Judges will test this.
   - For French, send the **French** bill text and ask for French. It's the official French version, not a translation; mention that in the pitch.
   - Cut very long bills off at ~150,000 characters.
4. **After phase 1:** phase 2 context ("why now" with Google Search grounding + cited links, "who gains / who pays" labelled Fact / Reported / Inferred).

## Person B: MP and letters

**Files:** `mp.py`, and `draft_letter()` in `ai.py`

1. **`find_mp()`**: easiest part, start here for a quick win.
   - Normalise the postal code (remove spaces, uppercase) and check it matches `A1A1A1`.
   - Fetch `https://represent.opennorth.ca/postcodes/<CODE>/` (no key needed).
   - In `representatives_centroid`, find the entry with `elected_office == "MP"`. Fields: `name`, `party_name`, `district_name`, `email`, `photo_url`.
   - A 404 means the postal code wasn't found: return `None`.
   - Test K1N 6N5 (uOttawa, should give Mona Fortier), plus a rural and a Quebec code.
2. **`draft_letter()`**: Gemini prompt taking MP, bill, stance, the user's own words and name; returns `{subject, body}`.
   - Respectful, under 200 words, in the chosen language.
   - Tell Gemini not to invent personal details or facts about the bill.
   - Add a plain template fallback in case Gemini fails during the demo.
3. **Then:** help A with bill text parsing if they're stuck.
4. **After phase 1:** phase 3 voice (ElevenLabs play buttons; save generated audio so replays are free).

## Person C: Frontend, design and delivery

**Files:** `templates/index.html`, `static/` (add a CSS file)

1. **Build the four-step flow against the fake data straight away** — no need to wait for A or B:
   - bill list with search
   - summary with an English/French toggle
   - postal code form showing an MP card
   - stance + own words + name form, then the drafted message with "open in email" (`mailto:` link) and "copy" buttons
2. **Unhappy paths:** loading indicators (summaries can take 10–20 s), error messages, invalid postal code.
3. **Accessibility** (counts toward Design & Usability): labels on every input, keyboard navigation, good contrast, set `<html lang="fr">` when French is selected.
4. **Styling:** a kit like Pico.css or Bootstrap gives a clean base fast; then make it your own for Best UI/UX.
5. **Delivery:** register the domain (GoDaddy prize), deploy (Render or Railway are easiest for Flask; Vultr adds a prize entry), Devpost draft (**due Saturday midnight**), slides.

## Checkpoints

| Time | Everyone should have… |
|---|---|
| +0.5 hr | Repo cloned, fake app running on every laptop, key shared |
| +3 hrs | Real bill list, real MP lookup, UI flow working on fake data |
| +5 hrs | **Phase 1 working end to end with real data. Deploy it.** |
| +7 hrs | Phase 2 (A) and phase 3 (B) working, UI polished (C) |
| +8.5 hrs | Feature freeze. Bug fixes only. |
| +10 hrs | Pitch rehearsed, Devpost submitted |

## Judging reminders

- Everyone must be able to explain the whole app, not just their part. Judges ask.
- "Depth matters more than breadth": a smooth core loop beats five half-working features.
- Pre-load your demo bills (both languages) before judging so the demo doesn't depend on wifi or API speed.
- Stuck for 30+ minutes? Say so to the team.

"""One-off script: pull the real, current federal MP roster (name, party,
riding, email) from Open North's Represent API -- no key needed.

Run from your project root (same venv as the Flask app, `requests` already
installed): python3 fetch_mp_roster.py

Writes data/mp_roster.json -- a reference list you can eyeball to pick real
names for data/mp_holdings.json, and the same data mp.py's real find_mp()
will eventually want (represent.opennorth.ca also has a
boundaries-by-postal-code lookup for that, see the API docs).
"""
import json
import time

import requests

BASE = "https://represent.opennorth.ca/representatives/house-of-commons/"

def fetch_all_mps():
    mps = []
    url = f"{BASE}?limit=100"
    while url:
        resp = requests.get(url, timeout=20)
        resp.raise_for_status()
        data = resp.json()
        for r in data["objects"]:
            mps.append({
                "name": r["name"],
                "party": r["party_name"],
                "riding": r["district_name"],
                "email": r.get("email"),
            })
        next_path = data["meta"].get("next")
        url = f"https://represent.opennorth.ca{next_path}" if next_path else None
        time.sleep(0.2)  # polite pause, well under the 60/min limit
    return mps

if __name__ == "__main__":
    roster = fetch_all_mps()
    with open("data/mp_roster.json", "w") as f:
        json.dump(roster, f, indent=2)
    print(f"Wrote {len(roster)} MPs to data/mp_roster.json")

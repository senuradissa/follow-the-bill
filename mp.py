"""Postal code -> federal MP (owner: Person B).

Real lookup via Represent (represent.opennorth.ca) — a free, no-API-key
Canadian civic data API. Given a postal code it returns every elected
official whose district contains that point (municipal, provincial,
federal); we filter down to the one with elected_office == "MP".
"""
import requests

HEADERS = {"User-Agent": "Mozilla/5.0 (Hack the Hill student project)"}


def find_mp(postal):
    """Return {name, party, riding, email, photo_url} or None if not found."""
    postal = (postal or "").strip().upper().replace(" ", "")
    if not postal:
        return None

    try:
        resp = requests.get(
            f"https://represent.opennorth.ca/postcodes/{postal}/",
            headers=HEADERS,
            timeout=15,
        )
    except requests.RequestException:
        return None

    if resp.status_code == 404:
        return None  # not a real/known Canadian postal code
    try:
        resp.raise_for_status()
        data = resp.json()
    except (requests.RequestException, ValueError):
        return None

    # representatives_centroid is representatives for the postal code's exact
    # point; representatives_concordance covers the wider FSA as a fallback.
    reps = data.get("representatives_centroid") or data.get("representatives_concordance") or []
    mp = next((r for r in reps if (r.get("elected_office") or "").strip().lower() == "mp"), None)
    if mp is None:
        return None

    return {
        "name": mp.get("name") or "Unknown",
        "party": mp.get("party_name") or "Independent",
        "riding": mp.get("district_name") or "",
        "email": mp.get("email") or "",
        "photo_url": mp.get("photo_url"),
    }

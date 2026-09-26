"""Federal bills (owner: Person A).

Replace the fake data below with real calls to parl.ca. Keep the return shapes the
same so the frontend doesn't break.
"""
import requests
HEADERS = {"User-Agent": "Mozilla/5.0 (Hack the Hill student project)"}

FAKE_BILLS = [
    {"code": "C-5", "session": "45-1", "title_en": "One Canadian Economy Act",
     "title_fr": "Loi sur l'unité de l'économie canadienne", "status_en": "Royal assent received"},
    {"code": "C-2", "session": "45-1", "title_en": "Strong Borders Act",
     "title_fr": "Loi visant une sécurité rigoureuse à la frontière", "status_en": "At second reading"},
]


def list_bills():
    """Return a list of bills: [{code, session, title_en, title_fr, status_en}, ...]"""
    resp = requests.get("https://www.parl.ca/legisinfo/en/bills/json", headers=HEADERS, timeout=30)
    resp.raise_for_status() #Check for site status. In case 404 gets returned or something.
    bills = []
    for b in resp.json():
        if "pro forma" in b["StatusNameEn"].lower():
            continue
        bills.append({
            "code": b["NumberCode"],
            "session": f"{b['ParliamentNumber']}-{b['SessionNumber']}",
            "title_en": b["ShortTitleEn"] or b["LongTitleEn"],

            "title_fr": b["ShortTitleFr"] or b["LongTitleFr"],
            "status_en": b["StatusNameEn"],
            "introduced": b["PassedHouseFirstReadingDateTime"] or b["PassedSenateFirstReadingDateTime"]
            })
    bills.sort(key=lambda bill: bill["introduced"], reverse=True)
    return bills



def bill_text(session, code, lang):
    """Return the bill's text in 'en' or 'fr':
    {title, official_summary, text, source_url}
    """
    # TODO(A): fetch the real bill text
    return {
        "title": f"Fake bill {code}",
        "official_summary": "This is placeholder text until the real bill is fetched.",
        "text": "Section 1. Placeholder.",
        "source_url": "https://www.parl.ca/legisinfo/",
    }

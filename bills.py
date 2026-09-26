"""Federal bills (owner: Person A).

list_bills() fetches the real parl.ca feed. bill_text() fetches a bill's
official text (EN or FR) from its parl.ca XML file.
"""
import requests
import re
import xml.etree.ElementTree as ET
HEADERS = {"User-Agent": "Mozilla/5.0 (Hack the Hill student project)"}



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


def latest_publication_id(session, code):
    url = f"https://www.parl.ca/legisinfo/en/bill/{session}/{code.lower()}/json"
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    bill = resp.json()[0]
    publications = bill["Publications"]
    return publications[-1]["PublicationId"]


def xml_url(publication_id, lang):
    page_url = f"https://www.parl.ca/DocumentViewer/{lang}/{publication_id}"
    resp = requests.get(page_url, headers=HEADERS, timeout=30)
    resp.raise_for_status()

    letter = "E" if lang == "en" else "F"
    match = re.search(rf'href="([^"]+_{letter}\.xml)"', resp.text)
    if match is None:
        return None
    return "https://www.parl.ca" + match.group(1)

def text_of(box):
    if box is None:
        return ""
    return " ".join(" ".join(box.itertext()).split())

def read_bill_xml(url):
    resp = requests.get(url, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    root = ET.fromstring(resp.content)

    return {
        "title": text_of(root.find("Identification/ShortTitle")) or text_of(root.find("Identification/LongTitle")),
        "official_summary": text_of(root.find("Introduction/Summary")),
        "text": text_of(root.find("Body")),
    }

_cache = {}

def bill_text(session, code, lang):
    key = (session, code, lang)
    if key in _cache:
        return _cache[key]

    publication_id = latest_publication_id(session, code)
    url = xml_url(publication_id, lang)
    bill = read_bill_xml(url)
    bill["source_url"] = f"https://www.parl.ca/DocumentViewer/{lang}/{publication_id}"

    _cache[key] = bill
    return bill   



    

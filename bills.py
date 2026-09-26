"""Federal bills (owner: Person A).

Replace the fake data below with real calls to parl.ca. Keep the return shapes the
same so the frontend doesn't break.
"""

FAKE_BILLS = [
    {"code": "C-5", "session": "45-1", "title_en": "One Canadian Economy Act",
     "title_fr": "Loi sur l'unité de l'économie canadienne", "status_en": "Royal assent received"},
    {"code": "C-2", "session": "45-1", "title_en": "Strong Borders Act",
     "title_fr": "Loi visant une sécurité rigoureuse à la frontière", "status_en": "At second reading"},
]


def list_bills():
    """Return a list of bills: [{code, session, title_en, title_fr, status_en}, ...]"""
    # TODO(A): fetch the real list
    return FAKE_BILLS


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

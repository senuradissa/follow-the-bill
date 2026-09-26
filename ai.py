"""Gemini calls (summary: Person A, letter: Person B).

Replace the fake returns with real Gemini calls. Keep the return shapes the same.
"""


def summarize(bill, lang):
    """Plain-language summary of a bill in 'en' or 'fr'.

    `bill` is what bills.bill_text() returns.
    Return {tldr, summary, key_changes: [str]}
    """
    # TODO(A): call Gemini
    return {
        "tldr": f"[{lang}] One-sentence fake summary of {bill['title']}.",
        "summary": "Fake paragraph one.\n\nFake paragraph two.",
        "key_changes": ["Fake change one", "Fake change two"],
    }


def draft_letter(lang, mp, bill, stance, note, name):
    """Message from a constituent to their MP.

    stance is 'support', 'oppose' or 'questions'.
    Return {subject, body}
    """
    # TODO(B): call Gemini
    return {
        "subject": f"Bill {bill['code']}",
        "body": f"Dear {mp['name']},\n\n(Fake letter: {stance}) {note}\n\n{name}",
    }

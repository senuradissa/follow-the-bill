"""Follow the Bill: Flask routes (shared).

Run:  flask --app app run --debug
The routes are thin; the real work goes in bills.py, mp.py and ai.py.
"""
from dotenv import load_dotenv

load_dotenv()  # loads GEMINI_API_KEY from .env

from flask import Flask, jsonify, render_template, request, send_file  # noqa: E402

import ai  # noqa: E402
import bills  # noqa: E402
import mp  # noqa: E402
import impact
import voice #noqa: E402

app = Flask(__name__)

@app.get("/")
def index():
    return render_template("index.html")

@app.get("/bill/<session>/<code>")
def bill_page(session, code):
    # Renders the shell; static/app.js fetches /api/bills/<session>/<code>/summary etc.
    return render_template("bill.html", session_id=session, code=code)

@app.get("/api/bills")
def list_bills():
    return jsonify(bills.list_bills())

@app.get("/api/bills/<session>/<code>/summary")
def bill_summary(session, code):
    lang = request.args.get("lang", "en")
    bill = bills.bill_text(session, code, lang)
    try:
        summary = ai.summarize(bill, lang)
    except Exception:
        summary = {"tldr": None, "summary": None, "key_changes": []}
    return jsonify({
        **summary,
        "title": bill["title"],
        "official_summary": bill["official_summary"],
        "source_url": bill["source_url"],
    })

@app.get("/api/mp")
def find_mp():
    result = mp.find_mp(request.args.get("postal", ""))
    if result is None:
        return jsonify({"error": "No MP found for that postal code"}), 404
    return jsonify(result)

@app.post("/api/letter")
def letter():
    data = request.get_json(force=True)
    return jsonify(ai.draft_letter(
        data.get("lang", "en"), data["mp"], data["bill"], data["stance"],
        data.get("note", ""), data.get("name", ""),
    ))

@app.get("/api/bills/<session>/<code>/impact")
def bill_impact(session, code):
    lang = request.args.get("lang", "en")
    bill = bills.bill_text(session, code, lang)
    return jsonify(impact.analyze_impact(bill, lang))

@app.get("/api/bills/<session>/<code>/audio")
def bill_audio(session, code):
    lang = request.args.get("lang", "en")
    bill = bills.bill_text(session, code, lang)
    summary = ai.summarize(bill, lang)

    heading = "Key Changes" if lang == "en" else "Principaux changements"
    text = "\n\n".join([
        bill["title"],
        summary["tldr"],
        summary["summary"],
        heading + ":",
        *summary["key_changes"],
    ])

    mp3_path = voice.speak(text)
    return send_file(mp3_path, mimetype="audio/mpeg")


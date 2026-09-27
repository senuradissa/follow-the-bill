"""Follow the Bill: Flask routes (shared).

Run:  flask --app app run --debug
The routes are thin; the real work goes in bills.py, mp.py and ai.py.
"""
import os

from dotenv import load_dotenv

load_dotenv()  # loads GEMINI_API_KEY, AUTH0_*, MONGODB_URI, SMTP_*, etc. from .env

from flask import Flask, jsonify, render_template, request  # noqa: E402
from apscheduler.schedulers.background import BackgroundScheduler  # noqa: E402

import ai  # noqa: E402
import auth  # noqa: E402
import bills  # noqa: E402
import mp  # noqa: E402
import notifications  # noqa: E402
import users  # noqa: E402
import impact
app = Flask(__name__)
auth.init_auth(app)
app.register_blueprint(auth.auth_bp)  # adds /login, /callback, /logout


@app.context_processor
def inject_user():
    # Lets every template check `{% if current_user %}` without each route
    # having to pass it in explicitly.
    return {"current_user": auth.current_user()}


# ---- Bill-change notifications (owner: Person B) ----
# Polls LEGISinfo every 10 minutes and emails anyone who's bookmarked a bill
# whose status changed since the last check. Optional: needs MONGODB_URI to
# do anything (that's where bookmarks and last-known statuses live), so if
# it's not set, skip this entirely rather than crashing app startup for
# everyone who hasn't set up Mongo yet.
#
# flask --debug runs this file twice (the reloader's watcher process + the
# real worker); WERKZEUG_RUN_MAIN is only set in the real worker, so this
# guard also stops the job from running, and therefore emailing, twice per
# change.
if not os.environ.get("MONGODB_URI"):
    print("[app] MONGODB_URI not set in .env -- bookmarks and bill-change email notifications are disabled, everything else still works.")
elif not app.debug or os.environ.get("WERKZEUG_RUN_MAIN") == "true":
    scheduler = BackgroundScheduler()
    scheduler.add_job(notifications.check_for_bill_changes, "interval", minutes=10)
    scheduler.start()
    notifications.check_for_bill_changes()  # also run once at startup, right away


@app.get("/")
def index():
    return render_template("index.html")

@app.get("/bookmarks")
def bookmarks_page():
    return render_template("bookmarks.html")

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


# ---- Bookmarks (owner: Person B) ----
# All three require login; a user's bookmarks are keyed on their stable
# Auth0 `sub`, never their email. See users.py for the Mongo side.

@app.get("/api/bookmarks")
def api_list_bookmarks():
    user = auth.current_user()
    if user is None:
        return jsonify({"error": "Not logged in"}), 401
    return jsonify(users.list_bookmarks(user["sub"]))

@app.post("/api/bookmarks")
def api_add_bookmark():
    user = auth.current_user()
    if user is None:
        return jsonify({"error": "Not logged in"}), 401
    data = request.get_json(force=True)
    users.add_bookmark(user["sub"], data["session"], data["code"], data.get("title_en", ""))
    return jsonify({"ok": True}), 201

@app.delete("/api/bookmarks/<session>/<code>")
def api_remove_bookmark(session, code):
    user = auth.current_user()
    if user is None:
        return jsonify({"error": "Not logged in"}), 401
    users.remove_bookmark(user["sub"], session, code)
    return jsonify({"ok": True})

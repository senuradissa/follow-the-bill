"""Bill-status-change email notifications (owner: Person B).

A background job (started in app.py) calls check_for_bill_changes() every
few minutes. It diffs each bill's current status against the last status
we recorded for it, and for any bill whose status changed -- and didn't
change TO "Bill defeated" -- emails everyone who has that bill bookmarked.

The very first time a bill is seen, its status is just recorded, not
"changed" (there's nothing to compare it to yet), so no one gets emailed
on day one for bills they bookmarked before this feature existed.

Requires in .env:
  SMTP_HOST      e.g. smtp.gmail.com
  SMTP_PORT      e.g. 587
  SMTP_USER      the sending mailbox, e.g. yourproject@gmail.com
  SMTP_PASSWORD  an app password (NOT your regular account password)
  SMTP_FROM      optional, defaults to SMTP_USER; what recipients see as "From"

Gmail setup: turn on 2-Step Verification on the sending account, then
create an App Password at myaccount.google.com/apppasswords and use that
as SMTP_PASSWORD -- your normal Gmail password will not work here.
"""
import os
import smtplib
from email.message import EmailMessage

import bills
import users

# Statuses that should NOT trigger a notification even though they're a change.
EXCLUDED_STATUSES = {"Bill defeated"}


def _send_email(to_email, subject, body):
    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", 587))
    user = os.environ["SMTP_USER"]
    password = os.environ["SMTP_PASSWORD"]
    sender = os.environ.get("SMTP_FROM", user)

    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = sender
    msg["To"] = to_email
    msg.set_content(body)

    with smtplib.SMTP(host, port, timeout=15) as smtp:
        smtp.starttls()
        smtp.login(user, password)
        smtp.send_message(msg)


def _notify_bookmarkers(session, code, title, old_status, new_status):
    bookmarkers = users.bookmarkers_for_bill(session, code)
    for sub, email, name in bookmarkers:
        if not email:
            continue
        subject = f"Bill {code}: {new_status}"
        body = (
            f"Hi {name or 'there'},\n\n"
            f"A bill you're following on Follow the Bill just changed status.\n\n"
            f"Bill {code} — {title}\n"
            f"  {old_status}\n"
            f"  -> {new_status}\n\n"
            f"Full details: http://localhost:5000/bill/{session}/{code}\n\n"
            f"— Follow the Bill"
        )
        try:
            _send_email(email, subject, body)
        except Exception as e:
            # A bad email shouldn't take down the whole check -- log and move on.
            print(f"[notifications] failed to email {email} about {code}: {e}")


def check_for_bill_changes():
    """Safe to call repeatedly/on a schedule. Compares every current bill's
    status against the last one we recorded and emails bookmarkers of
    anything that changed, except into "Bill defeated"."""
    for bill in bills.list_bills():
        session, code = bill["session"], bill["code"]
        new_status = bill.get("status_en")
        if not new_status:
            continue

        old_status = users.get_last_status(session, code)
        users.set_last_status(session, code, new_status)

        if old_status is None or old_status == new_status:
            continue
        if new_status in EXCLUDED_STATUSES:
            continue

        _notify_bookmarkers(session, code, bill.get("title_en", ""), old_status, new_status)

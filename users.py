"""Per-user data, backed by MongoDB (owner: Person B).

Requires MONGODB_URI in .env, e.g.:
  mongodb+srv://<user>:<password>@<cluster>.mongodb.net/?retryWrites=true&w=majority
(from an Atlas free-tier cluster -- create one, add a database user, and
allow access from anywhere (0.0.0.0/0) under Network Access so it works
from everyone's laptop during the hackathon.)

Users are identified by their Auth0 `sub` (e.g. "auth0|abc123" or
"google-oauth2|456"), never by email -- a person's email can change,
their sub doesn't. `sub` comes from auth.current_user()["sub"].

Two collections in the "followthebill" database:
  users      -- one doc per person, upserted on every login (name/email/
               last_login). Not required for bookmarks to work; it's here
               so we have a real user record if we ever want an admin
               view or per-user settings later.
  bookmarks  -- one doc per (user, bill). This is the actual per-user
               state the "Bookmarks" page reads.
"""
import os
from datetime import datetime, timezone

from pymongo import MongoClient

_client = None


def _db():
    global _client
    if _client is None:
        _client = MongoClient(os.environ["MONGODB_URI"])
        # Unique index also doubles as "don't insert the same bookmark twice".
        _client.followthebill.bookmarks.create_index(
            [("auth0_sub", 1), ("session", 1), ("code", 1)], unique=True
        )
    return _client.followthebill


def upsert_user(sub, profile):
    """Call after login with the Auth0 userinfo dict."""
    _db().users.update_one(
        {"auth0_sub": sub},
        {"$set": {
            "auth0_sub": sub,
            "name": profile.get("name"),
            "email": profile.get("email"),
            "last_login": datetime.now(timezone.utc),
        }},
        upsert=True,
    )


def list_bookmarks(sub):
    """Newest-saved first. Each item: {session, code, title_en}."""
    docs = _db().bookmarks.find({"auth0_sub": sub}).sort("added_at", -1)
    return [
        {"session": d["session"], "code": d["code"], "title_en": d.get("title_en", "")}
        for d in docs
    ]


def add_bookmark(sub, session, code, title_en=""):
    _db().bookmarks.update_one(
        {"auth0_sub": sub, "session": session, "code": code},
        {"$set": {
            "auth0_sub": sub,
            "session": session,
            "code": code,
            "title_en": title_en,
            "added_at": datetime.now(timezone.utc),
        }},
        upsert=True,
    )


def remove_bookmark(sub, session, code):
    _db().bookmarks.delete_one({"auth0_sub": sub, "session": session, "code": code})


def is_bookmarked(sub, session, code):
    return _db().bookmarks.count_documents(
        {"auth0_sub": sub, "session": session, "code": code}, limit=1
    ) > 0

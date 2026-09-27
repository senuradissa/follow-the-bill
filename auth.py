"""Auth0 login (owner: Person B).

Standard Auth0 + Flask login flow using Authlib's OAuth client -- Auth0
doesn't have its own login SDK for Flask, this is the pattern from their
own quickstart. Login is optional: everything else in the app (browsing
bills, summaries, lobbying activity, MP lookup) works with none of this
configured. Set these in .env to turn login on:
  APP_SECRET_KEY     any random string, used to sign the Flask session cookie
  AUTH0_CLIENT_ID
  AUTH0_CLIENT_SECRET
  AUTH0_DOMAIN       e.g. your-tenant.us.auth0.com (no https://, no path)

In the Auth0 dashboard (Regular Web Application):
  Allowed Callback URLs: http://localhost:5000/callback
  Allowed Logout URLs:   http://localhost:5000
  Allowed Web Origins:   http://localhost:5000
"""
import os
import secrets
from urllib.parse import quote_plus, urlencode

from authlib.integrations.flask_client import OAuth
from flask import Blueprint, redirect, session, url_for

import users

auth_bp = Blueprint("auth", __name__)
oauth = OAuth()


def init_auth(app):
    """Call once, right after creating the Flask app. Never raises, even
    with no AUTH0_* in .env -- it just leaves login disabled so the rest of
    the site still runs (see login() below for what that looks like)."""
    # Falls back to a random key so `session` never errors even if nobody's
    # set APP_SECRET_KEY yet. Sessions won't survive a restart in that case,
    # but nothing needs them to until login is actually configured.
    app.secret_key = os.environ.get("APP_SECRET_KEY") or secrets.token_hex(32)

    required = ("AUTH0_CLIENT_ID", "AUTH0_CLIENT_SECRET", "AUTH0_DOMAIN")
    if not all(os.environ.get(k) for k in required):
        print("[auth] AUTH0_* not set in .env -- login is disabled, everything else still works.")
        return

    oauth.init_app(app)
    oauth.register(
        "auth0",
        client_id=os.environ["AUTH0_CLIENT_ID"],
        client_secret=os.environ["AUTH0_CLIENT_SECRET"],
        client_kwargs={"scope": "openid profile email"},
        server_metadata_url=f'https://{os.environ["AUTH0_DOMAIN"]}/.well-known/openid-configuration',
    )


def current_user():
    """The logged-in user's Auth0 profile dict (sub, name, email, ...), or
    None if nobody's logged in. `sub` is the stable ID to key Mongo docs on."""
    user = session.get("user")
    return user.get("userinfo") if user else None


@auth_bp.route("/login")
def login():
    if not hasattr(oauth, "auth0"):
        return "Login isn't configured on this server yet (missing AUTH0_* in .env).", 503
    return oauth.auth0.authorize_redirect(redirect_uri=url_for("auth.callback", _external=True))


@auth_bp.route("/callback")
def callback():
    session["user"] = oauth.auth0.authorize_access_token()
    userinfo = session["user"]["userinfo"]
    users.upsert_user(userinfo["sub"], userinfo)  # so we have a user record even before their first bookmark
    return redirect(url_for("index"))


@auth_bp.route("/logout")
def logout():
    session.clear()
    return redirect(
        f'https://{os.environ["AUTH0_DOMAIN"]}/v2/logout?'
        + urlencode(
            {
                "returnTo": url_for("index", _external=True),
                "client_id": os.environ["AUTH0_CLIENT_ID"],
            },
            quote_via=quote_plus,
        )
    )

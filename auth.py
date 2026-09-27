"""Auth0 login (owner: Person B).

Standard Auth0 + Flask login flow using Authlib's OAuth client -- Auth0
doesn't have its own login SDK for Flask, this is the pattern from their
own quickstart. Requires these in .env:
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
from urllib.parse import quote_plus, urlencode

from authlib.integrations.flask_client import OAuth
from flask import Blueprint, redirect, session, url_for

import users

auth_bp = Blueprint("auth", __name__)
oauth = OAuth()


def init_auth(app):
    """Call once, right after creating the Flask app."""
    app.secret_key = os.environ["APP_SECRET_KEY"]
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

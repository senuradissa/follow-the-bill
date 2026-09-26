"""Postal code -> federal MP (owner: Person B).

Replace the fake data with a real lookup. Keep the return shape the same.
"""


def find_mp(postal):
    """Return {name, party, riding, email, photo_url} or None if not found."""
    # TODO(B): validate the postal code and look up the real MP
    return {
        "name": "Fake MP",
        "party": "Placeholder Party",
        "riding": "Ottawa Somewhere",
        "email": "fake.mp@example.com",
        "photo_url": None,
    }

"""Business logic layer.

One module per business area: auth, users, vehicles, trips, matching,
bookings, messaging, notifications, reviews, moderation. Services own the
transactions and are the only layer allowed to touch more than one table.
"""

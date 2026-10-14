"""Geospatial trip and passenger matching engine.

Deliberately isolated from the rest of the application, so the algorithm can be
evolved or replaced without touching trip and booking logic.
See docs/matching.md for the v1 candidate-generation strategy.
"""

from .scoring import (
    MatchBreakdown,
    MatchResult,
    MatchWeights,
    PassengerSearchInput,
    TripCandidateInput,
    score_trip_candidate,
)

__all__ = [
    "MatchBreakdown",
    "MatchResult",
    "MatchWeights",
    "PassengerSearchInput",
    "TripCandidateInput",
    "score_trip_candidate",
]

"""
Custom Presidio recognizer for Canadian bank transit numbers.

A Canadian transit number consists of a 5-digit branch number followed by a
3-digit financial institution number (e.g. 12345-678 or "10010 002").

Entity type returned: CA_BANK_TRANSIT

Confidence boosting:
    Presidio automatically raises the confidence score by 0.35 when any of the
    CONTEXT_WORDS appear within a 5-token window around the match.

    Base score:          0.50  (below the default 0.7 threshold)
    With context words:  0.85  (above the threshold → redacted)
"""
from presidio_analyzer import Pattern, PatternRecognizer

from config import CA_BANK_TRANSIT_BASE


class CanadianBankTransitRecognizer(PatternRecognizer):
    """Detects Canadian bank transit numbers (5-digit branch + 3-digit institution)."""

    ENTITY_TYPE = "CA_BANK_TRANSIT"
    PATTERN = r"\b\d{5}[-\s]?\d{3}\b"

    CONTEXT_WORDS = [
        "transit",
        "routing",
        "institution",
        "branch",
        "bank",
        "chequing",
        "checking",
        "deposit",
        "financial institution",
    ]

    def __init__(self):
        patterns = [
            Pattern(
                name="CA_TRANSIT_PATTERN",
                regex=self.PATTERN,
                score=CA_BANK_TRANSIT_BASE,
            )
        ]
        super().__init__(
            supported_entity=self.ENTITY_TYPE,
            patterns=patterns,
            context=self.CONTEXT_WORDS,
            supported_language="en",
        )

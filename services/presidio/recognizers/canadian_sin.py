"""
Custom Presidio recognizer for Canadian Social Insurance Numbers (SIN).

A Canadian SIN is a 9-digit number issued by Service Canada, formatted as
three groups of three digits (e.g. 046 454 286). The number must satisfy the
Luhn checksum algorithm.

Entity type returned: CA_SIN
"""
import re
from presidio_analyzer import Pattern, PatternRecognizer, RecognizerResult
from presidio_analyzer.nlp_engine import NlpArtifacts
from typing import List, Optional

from config import CA_SIN_HIGH_CONFIDENCE, CA_SIN_LOW_CONFIDENCE


def luhn_checksum(number_str: str) -> bool:
    """Validate a Canadian SIN using the Luhn algorithm.

    Args:
        number_str: Raw string potentially containing a SIN (digits + separators).

    Returns:
        True if the digits form a Luhn-valid 9-digit number; False otherwise.
    """
    digits = [int(d) for d in number_str if d.isdigit()]
    if len(digits) != 9:
        return False

    total = 0
    for i, digit in enumerate(reversed(digits)):
        if i % 2 == 1:
            doubled = digit * 2
            total += doubled - 9 if doubled > 9 else doubled
        else:
            total += digit
    return total % 10 == 0


class CanadianSinRecognizer(PatternRecognizer):
    """Detects Canadian Social Insurance Numbers (SINs).

    Pattern matches three groups of three digits separated by optional dashes
    or spaces. Luhn validation is applied post-match:
    - Luhn-valid match  → confidence 0.85
    - Pattern-only match → confidence 0.60
    """

    ENTITY_TYPE = "CA_SIN"
    # SINs beginning with 0 are not assigned; 8xxx are ITNs (Individual Tax Numbers).
    # The regex intentionally matches 0xx for completeness and lets Luhn weed out
    # many accidental matches (dollar amounts, phone fragments, etc.).
    PATTERN = r"\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b"

    CONTEXT_WORDS = [
        "sin",
        "social insurance",
        "social insurance number",
        "service canada",
        "sin number",
    ]

    def __init__(self):
        patterns = [
            Pattern(
                name="CA_SIN_PATTERN",
                regex=self.PATTERN,
                score=CA_SIN_LOW_CONFIDENCE,  # Overridden in analyze() after Luhn check
            )
        ]
        super().__init__(
            supported_entity=self.ENTITY_TYPE,
            patterns=patterns,
            context=self.CONTEXT_WORDS,
            supported_language="en",
        )

    def analyze(
        self,
        text: str,
        entities: List[str],
        nlp_artifacts: Optional[NlpArtifacts] = None,
    ) -> List[RecognizerResult]:
        """Override analyze to apply Luhn validation and adjust confidence."""
        results = super().analyze(text, entities, nlp_artifacts)

        validated: List[RecognizerResult] = []
        for result in results:
            match_str = text[result.start : result.end]
            if luhn_checksum(match_str):
                # Promote confidence for Luhn-valid numbers
                result.score = CA_SIN_HIGH_CONFIDENCE
            else:
                # Keep low confidence for pattern-only matches
                result.score = CA_SIN_LOW_CONFIDENCE
            validated.append(result)

        return validated

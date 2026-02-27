"""
Enhanced Presidio recognizer for Canadian addresses.

Detects:
1. Canadian postal codes (e.g. "M5V 3A8", "K1A0A6")
2. Street address patterns (e.g. "123 Main Street, Toronto, ON")

Entity type returned: ADDRESS
"""
import re
from presidio_analyzer import Pattern, PatternRecognizer, RecognizerResult
from presidio_analyzer.nlp_engine import NlpArtifacts
from typing import List, Optional


class CanadianAddressRecognizer(PatternRecognizer):
    """Recognizes Canadian postal codes and common street address formats."""

    ENTITY_TYPE = "ADDRESS"

    # Postal code: letter-digit-letter (space or dash optional) digit-letter-digit
    POSTAL_CODE_PATTERN = r"\b[A-Za-z]\d[A-Za-z][-\s]?\d[A-Za-z]\d\b"

    # Street address: number + street name + street type abbreviation
    # e.g. "123 Maple Street", "456 King St", "789 Queen Ave"
    STREET_ADDRESS_PATTERN = (
        r"\b\d{1,5}\s+[A-Za-z][A-Za-z\s]{1,30}"
        r"(?:Street|St|Avenue|Ave|Boulevard|Blvd|Drive|Dr|Road|Rd|"
        r"Crescent|Cres|Court|Ct|Lane|Ln|Place|Pl|Way|Circle|Cir|"
        r"Highway|Hwy|Terrace|Terr)\b"
    )

    CONTEXT_WORDS = [
        "address",
        "postal",
        "postal code",
        "zip",
        "street",
        "avenue",
        "boulevard",
        "city",
        "province",
        "mailing",
        "residence",
        "located at",
    ]

    def __init__(self):
        patterns = [
            Pattern(
                name="CA_POSTAL_CODE",
                regex=self.POSTAL_CODE_PATTERN,
                score=0.65,
            ),
            Pattern(
                name="CA_STREET_ADDRESS",
                regex=self.STREET_ADDRESS_PATTERN,
                score=0.50,
            ),
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
        """Override analyze to deduplicate overlapping postal code / address matches."""
        results = super().analyze(text, entities, nlp_artifacts)

        # Remove exact-duplicate spans (same start/end) keeping the higher score
        seen: dict[tuple[int, int], RecognizerResult] = {}
        for result in results:
            key = (result.start, result.end)
            if key not in seen or result.score > seen[key].score:
                seen[key] = result

        return list(seen.values())

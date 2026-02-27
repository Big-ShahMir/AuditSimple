"""
Custom Presidio recognizer for mortgage and loan account numbers.

Financial account numbers in Canadian mortgage documents typically follow a
pattern of 3 digits followed by 7–12 digits (e.g. "123 4567890", "456-78901234").

Entity type returned: FINANCIAL_ACCOUNT

Confidence boosting:
    Base score is intentionally low (0.50) because long digit sequences are
    extremely common in financial documents (dollar amounts, reference codes,
    dates, etc.). Context words adjacent to the match raise confidence to ~0.85,
    which clears the default 0.7 threshold enforced by the caller.

    Presidio raises the base score by 0.35 when any CONTEXT_WORDS appears
    within a 5-token window around the pattern match.

    Base score:          0.50
    With context words:  0.85  → above 0.7 threshold → redacted
    Without context:     0.50  → below threshold → not redacted
"""
from presidio_analyzer import Pattern, PatternRecognizer

from config import FINANCIAL_ACCOUNT_BASE


class MortgageAccountRecognizer(PatternRecognizer):
    """Detects mortgage and loan account numbers in financial documents."""

    ENTITY_TYPE = "FINANCIAL_ACCOUNT"
    PATTERN = r"\b\d{3}[-\s]?\d{7,12}\b"

    CONTEXT_WORDS = [
        "account",
        "mortgage",
        "loan",
        "reference",
        "acct",
        "account number",
        "account no",
        "loan number",
        "loan no",
        "mortgage number",
        "file number",
        "file no",
    ]

    def __init__(self):
        patterns = [
            Pattern(
                name="MORTGAGE_ACCOUNT_PATTERN",
                regex=self.PATTERN,
                score=FINANCIAL_ACCOUNT_BASE,
            )
        ]
        super().__init__(
            supported_entity=self.ENTITY_TYPE,
            patterns=patterns,
            context=self.CONTEXT_WORDS,
            supported_language="en",
        )

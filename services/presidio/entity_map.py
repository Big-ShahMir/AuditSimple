"""
Bidirectional mapping between Presidio entity types and the application's
PIIEntityType enum (defined in the Node.js backend).

Presidio uses its own naming conventions; the application has its own canonical
set of PII entity types. This module provides translation helpers so the rest of
the Python sidecar can work in Presidio terms while the Node.js backend receives
the app-canonical names.

IMPORTANT — DATE_TIME mapping note:
    Presidio's DATE_TIME entity catches *all* dates (e.g. "January 2024",
    "Q3 2023", invoice dates, etc.), not just dates of birth. Mapping it to
    DATE_OF_BIRTH is intentionally broad. The Node.js layer
    (lib/ingestion/scrub.ts) is responsible for filtering: only dates that
    appear in PII-indicative contexts (near words like "born", "DOB",
    "date of birth") should be treated as dates of birth and redacted.
    The Presidio sidecar detects broadly; the backend filters narrowly.
"""

# ---------------------------------------------------------------------------
# Presidio → App mapping
# ---------------------------------------------------------------------------
PRESIDIO_TO_APP: dict[str, str] = {
    # Presidio default entities
    "PERSON":            "PERSON_NAME",
    "PHONE_NUMBER":      "PHONE_NUMBER",
    "EMAIL_ADDRESS":     "EMAIL_ADDRESS",
    "CREDIT_CARD":       "CREDIT_CARD_NUMBER",
    "US_SSN":            "SSN_SIN",     # US SSN also maps to our SSN_SIN type
    "DATE_TIME":         "DATE_OF_BIRTH",  # NOTE: see module docstring above
    "LOCATION":          "ADDRESS",
    "URL":               "URL",
    "IP_ADDRESS":        "IP_ADDRESS",
    "NRP":               "NRP",

    # Custom Canadian entities
    "CA_SIN":            "SSN_SIN",
    "CA_BANK_TRANSIT":   "BANK_ACCOUNT",
    "FINANCIAL_ACCOUNT": "BANK_ACCOUNT",
    "ADDRESS":           "ADDRESS",
}

# ---------------------------------------------------------------------------
# App → Presidio mapping (reverse lookup)
# ---------------------------------------------------------------------------
# Note: some app types map to multiple Presidio types (e.g. BANK_ACCOUNT could
# come from CA_BANK_TRANSIT or FINANCIAL_ACCOUNT). This reverse map returns the
# *primary* Presidio entity type for filtering purposes.
APP_TO_PRESIDIO: dict[str, str] = {
    "PERSON_NAME":        "PERSON",
    "PHONE_NUMBER":       "PHONE_NUMBER",
    "EMAIL_ADDRESS":      "EMAIL_ADDRESS",
    "CREDIT_CARD_NUMBER": "CREDIT_CARD",
    "SSN_SIN":            "CA_SIN",    # prefer the Canadian recognizer
    "DATE_OF_BIRTH":      "DATE_TIME",
    "ADDRESS":            "ADDRESS",
    "BANK_ACCOUNT":       "CA_BANK_TRANSIT",
    "URL":                "URL",
    "IP_ADDRESS":         "IP_ADDRESS",
    "NRP":                "NRP",
}


def presidio_to_app(presidio_type: str) -> str:
    """Translate a Presidio entity type to the app's canonical PIIEntityType.

    Returns the original *presidio_type* unchanged if no mapping is found,
    so that novel Presidio entities surface rather than being silently dropped.
    """
    return PRESIDIO_TO_APP.get(presidio_type, presidio_type)


def app_to_presidio(app_type: str) -> str:
    """Translate an app PIIEntityType to the corresponding Presidio entity type.

    Returns the original *app_type* unchanged if no mapping is found.
    """
    return APP_TO_PRESIDIO.get(app_type, app_type)

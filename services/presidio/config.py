"""
Configuration constants for the Presidio PII detection sidecar service.
"""
import os

# ---------------------------------------------------------------------------
# Server configuration
# ---------------------------------------------------------------------------
PORT = int(os.environ.get("PRESIDIO_PORT", 5002))
WORKERS = int(os.environ.get("PRESIDIO_WORKERS", 4))
TIMEOUT = int(os.environ.get("PRESIDIO_TIMEOUT", 120))
LOG_LEVEL = os.environ.get("PRESIDIO_LOG_LEVEL", "INFO")

# ---------------------------------------------------------------------------
# CORS
# ---------------------------------------------------------------------------
# The sidecar must never be directly accessible from the browser.
# Restrict access to the Node.js backend origin only.
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")

# ---------------------------------------------------------------------------
# Score thresholds
# ---------------------------------------------------------------------------
# Default minimum confidence score for a detection to be included in results.
# NOTE: The caller (lib/ingestion/presidio-client.ts) enforces this threshold,
# not the sidecar. The sidecar returns *all* detections so the backend retains
# flexibility to adjust the threshold without redeploying this service.
DEFAULT_SCORE_THRESHOLD = float(os.environ.get("DEFAULT_SCORE_THRESHOLD", 0.7))

# Confidence scores assigned by the custom Canadian recognizers
CA_SIN_HIGH_CONFIDENCE = 0.85   # Luhn-valid SIN pattern
CA_SIN_LOW_CONFIDENCE = 0.60    # Pattern match only, failed Luhn check
CA_BANK_TRANSIT_BASE = 0.50     # Base score; boosted to ~0.85 with context words
FINANCIAL_ACCOUNT_BASE = 0.50   # Base score; context words raise it to 0.80

# ---------------------------------------------------------------------------
# Supported languages
# ---------------------------------------------------------------------------
SUPPORTED_LANGUAGES = ["en"]

# ---------------------------------------------------------------------------
# Entity types exposed by this service (Presidio names)
# ---------------------------------------------------------------------------
DEFAULT_ENTITIES = [
    # Presidio built-in
    "PERSON",
    "PHONE_NUMBER",
    "EMAIL_ADDRESS",
    "CREDIT_CARD",
    "US_SSN",
    "DATE_TIME",
    "LOCATION",
    "URL",
    "IP_ADDRESS",
    "NRP",
    # Custom Canadian financial
    "CA_SIN",
    "CA_BANK_TRANSIT",
    "FINANCIAL_ACCOUNT",
    "ADDRESS",
]

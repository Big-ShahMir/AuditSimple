# Module: services/presidio

## Purpose

This module is a **self-contained Docker sidecar** running Microsoft Presidio — an open-source PII detection and anonymization engine. It exists as a separate service for one reason: PII scrubbing must be deterministic, rule-based, and completely independent of the LLM. No prompt engineering, no model variance, no temperature settings. Presidio uses named entity recognition (NER) models and regex pattern matching — the same input always produces the same output.

The sidecar exposes two HTTP endpoints (`/analyze` and `/anonymize`) consumed by `lib/ingestion/presidio-client.ts` in the Node.js backend. It runs in its own Docker container alongside the main application and is deployed to Railway/Fly.io as a companion service.

This module also contains **custom recognizers** for Canadian financial document patterns (SIN numbers, bank transit numbers, mortgage account numbers) that Presidio's default English model does not cover.

## Interfaces (HTTP API contract)

### Consumed (requests from Node.js backend)

**`POST /analyze`** — Detect PII entities in text
```typescript
// Request body
interface AnalyzeRequest {
  text: string;
  language: "en";
  entities?: string[];       // Optional: restrict to specific entity types
  score_threshold?: number;  // Default: 0.7
  return_decision_process?: boolean; // Default: false
}

// Response body
interface AnalyzeResponse {
  results: {
    entity_type: string;     // e.g., "PERSON", "PHONE_NUMBER", "CA_SIN"
    start: number;           // char offset (inclusive)
    end: number;             // char offset (exclusive)
    score: number;           // confidence 0-1
    recognition_metadata: {
      recognizer_name: string;
      recognizer_identifier: string;
    };
  }[];
}
```

**`POST /anonymize`** — Replace PII entities with placeholders
```typescript
// Request body
interface AnonymizeRequest {
  text: string;
  analyzer_results: AnalyzeResponse["results"];
  anonymizers?: Record<string, {
    type: "replace" | "redact" | "mask" | "hash";
    new_value?: string;
    masking_char?: string;
    chars_to_mask?: number;
  }>;
}

// Response body
interface AnonymizeResponse {
  text: string;   // text with PII replaced
  items: {
    start: number;
    end: number;
    entity_type: string;
    text: string;  // the replacement value
    operator: string;
  }[];
}
```

**`GET /health`** — Health check
```typescript
// Response: 200 OK with body "healthy" if service is running
```

### Produced (responses to Node.js backend)
- `AnalyzeResponse` — list of detected PII entities with offsets and confidence scores
- `AnonymizeResponse` — scrubbed text with replacement metadata
- Health check status for readiness probes

## Dependencies

### This service depends on:
- `presidio-analyzer` Python package — the NER-based PII detection engine
- `presidio-anonymizer` Python package — the text replacement engine
- `spacy` with `en_core_web_lg` model — the underlying NLP model for English NER
- `Flask` or `FastAPI` — lightweight HTTP server (Presidio ships with Flask by default)
- No database. No external APIs. No LLM. Fully self-contained.

### Called by:
- `lib/ingestion/presidio-client.ts` — the only consumer. All requests come from the Node.js backend via HTTP.

### Does NOT interact with:
- The LLM (Anthropic API) — by design
- PostgreSQL — PII map storage is handled by the Node.js backend, not the sidecar
- Any frontend component — no direct client access

## Files to Create

- **`Dockerfile`** — Multi-stage Docker build. Stage 1: install Python dependencies and download the spaCy model. Stage 2: slim runtime image with only the necessary packages. Exposes port 5002. Healthcheck: `curl -f http://localhost:5002/health`. Based on `python:3.11-slim` to minimize image size.
- **`app.py`** — Main application entry point. Creates the Flask/FastAPI app, registers the custom recognizers, configures the analyzer and anonymizer engines, and exposes the three endpoints (`/analyze`, `/anonymize`, `/health`). Configures CORS to allow requests only from the backend origin. Runs with `gunicorn` in production (4 workers) or `uvicorn` for development.
- **`recognizers/canadian_sin.py`** — Custom Presidio recognizer for Canadian Social Insurance Numbers. Pattern: `\b\d{3}[-\s]?\d{3}[-\s]?\d{3}\b`. Implements Luhn checksum validation to reduce false positives (SIN numbers are Luhn-valid). Returns entity type `CA_SIN` with high confidence (0.85) for Luhn-valid matches, lower confidence (0.6) for pattern-only matches.
- **`recognizers/canadian_bank_transit.py`** — Custom recognizer for Canadian bank transit numbers (5-digit institution + 3-digit transit). Pattern: `\b\d{5}[-\s]?\d{3}\b`. Returns entity type `CA_BANK_TRANSIT`. Includes a context word list (`["transit", "routing", "institution", "branch"]`) to boost confidence when nearby words suggest financial context.
- **`recognizers/mortgage_account.py`** — Custom recognizer for mortgage and loan account numbers. Pattern: `\b\d{3}[-\s]?\d{7,12}\b`. Returns entity type `FINANCIAL_ACCOUNT`. Uses context words (`["account", "mortgage", "loan", "reference", "acct"]`) for confidence boosting. Lower base confidence (0.5) since long digit sequences are common in financial documents — context words raise it to 0.8.
- **`recognizers/canadian_address.py`** — Enhanced address recognizer for Canadian postal codes and common address formats. Pattern for postal codes: `\b[A-Za-z]\d[A-Za-z][-\s]?\d[A-Za-z]\d\b`. Also recognizes patterns like "123 [Street Name] [St|Ave|Blvd|Dr|Rd], [City], [Province]". Returns entity type `ADDRESS`.
- **`recognizers/__init__.py`** — Package init that exports all custom recognizers as a list for registration in `app.py`.
- **`config.py`** — Configuration constants. Score thresholds, entity type mappings between Presidio's internal types and the app's `PIIEntityType` enum, CORS settings, and server configuration (port, workers, timeouts).
- **`entity_map.py`** — Bidirectional mapping between Presidio entity types and the app's `PIIEntityType` enum. Presidio uses types like `PERSON`, `PHONE_NUMBER`, `EMAIL_ADDRESS` while the app uses `PERSON_NAME`, `PHONE_NUMBER`, `EMAIL_ADDRESS`. This file exports `presidio_to_app(presidio_type: str) -> str` and `app_to_presidio(app_type: str) -> str`. Also maps custom types: `CA_SIN` → `SSN_SIN`, `CA_BANK_TRANSIT` → `BANK_ACCOUNT`, `FINANCIAL_ACCOUNT` → `BANK_ACCOUNT`.
- **`requirements.txt`** — Pinned Python dependencies. Must include: `presidio-analyzer==2.2.*`, `presidio-anonymizer==2.2.*`, `spacy==3.7.*`, `flask==3.0.*` (or `fastapi==0.109.*` + `uvicorn`), `gunicorn==21.*`. Pin to minor versions for reproducibility.
- **`docker-compose.override.yml`** — Local development compose fragment. Runs Presidio alongside the Next.js app. Maps port 5002. Mounts `recognizers/` as a volume for hot-reload during development. Sets `PRESIDIO_LOG_LEVEL=DEBUG` for development.
- **`test_recognizers.py`** — Unit tests for all custom recognizers. Tests each recognizer against a set of positive matches (should detect) and negative matches (should not detect). Tests the SIN Luhn validation. Tests context word confidence boosting. Can be run with `pytest` inside the Docker container.

## Key Logic

### Custom Recognizer Registration
```python
# app.py — registering custom recognizers with the analyzer engine
from presidio_analyzer import AnalyzerEngine, RecognizerRegistry
from recognizers import (
    CanadianSinRecognizer,
    CanadianBankTransitRecognizer,
    MortgageAccountRecognizer,
    CanadianAddressRecognizer,
)

registry = RecognizerRegistry()
registry.load_predefined_recognizers()  # Load Presidio defaults (PERSON, PHONE, EMAIL, etc.)

# Register Canadian financial document recognizers
registry.add_recognizer(CanadianSinRecognizer())
registry.add_recognizer(CanadianBankTransitRecognizer())
registry.add_recognizer(MortgageAccountRecognizer())
registry.add_recognizer(CanadianAddressRecognizer())

analyzer = AnalyzerEngine(registry=registry)
```

### SIN Luhn Validation
```python
# recognizers/canadian_sin.py
def luhn_checksum(number_str: str) -> bool:
    """Validate a Canadian SIN using the Luhn algorithm."""
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
```

### Context-Aware Confidence Boosting
```python
# Pattern used by bank transit and mortgage account recognizers
class CanadianBankTransitRecognizer(PatternRecognizer):
    CONTEXT_WORDS = ["transit", "routing", "institution", "branch", "bank"]
    
    def __init__(self):
        patterns = [Pattern("CA_TRANSIT", r"\b\d{5}[-\s]?\d{3}\b", 0.5)]
        super().__init__(
            supported_entity="CA_BANK_TRANSIT",
            patterns=patterns,
            context=self.CONTEXT_WORDS,
            supported_language="en",
        )
    
    # Presidio automatically boosts confidence by 0.35 when context words
    # are found within a 5-word window of the match.
    # Base 0.5 + context boost 0.35 = 0.85 (above the 0.7 threshold)
    # Without context: 0.5 (below threshold, not redacted)
```

### Entity Type Mapping
```python
# entity_map.py
PRESIDIO_TO_APP = {
    # Presidio default entities
    "PERSON":           "PERSON_NAME",
    "PHONE_NUMBER":     "PHONE_NUMBER",
    "EMAIL_ADDRESS":    "EMAIL_ADDRESS",
    "CREDIT_CARD":      "CREDIT_CARD_NUMBER",
    "US_SSN":           "SSN_SIN",          # US SSN also maps to our SSN_SIN type
    "DATE_TIME":        "DATE_OF_BIRTH",    # Note: not all dates are DOB — see constraints
    "LOCATION":         "ADDRESS",
    
    # Custom Canadian entities
    "CA_SIN":           "SSN_SIN",
    "CA_BANK_TRANSIT":  "BANK_ACCOUNT",
    "FINANCIAL_ACCOUNT":"BANK_ACCOUNT",
    "ADDRESS":          "ADDRESS",
}
```

### Dockerfile Structure
```dockerfile
# Stage 1: Install dependencies and download spaCy model
FROM python:3.11-slim AS builder

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -m spacy download en_core_web_lg

# Stage 2: Slim runtime
FROM python:3.11-slim

WORKDIR /app
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

COPY . .

EXPOSE 5002

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -f http://localhost:5002/health || exit 1

CMD ["gunicorn", "app:app", "--bind", "0.0.0.0:5002", "--workers", "4", "--timeout", "120"]
```

### Health Check Endpoint
```python
@app.route("/health", methods=["GET"])
def health():
    # Verify the analyzer engine is loaded and functional
    try:
        test_result = analyzer.analyze(text="test", language="en", entities=["PERSON"])
        return "healthy", 200
    except Exception as e:
        return f"unhealthy: {str(e)}", 503
```

## Constraints

- **This is a Python service, not Node.js.** It is the only Python component in the system. The agent building this module must write Python, not TypeScript.
- **The sidecar must be stateless.** No database connections, no file storage, no session management. Every request is independent. This enables horizontal scaling and zero-downtime deploys.
- **CORS must restrict access to the backend origin only.** The sidecar should never be accessible from the browser. Configure `CORS_ORIGINS` from an environment variable defaulting to `http://localhost:3000`.
- **The `DATE_TIME` → `DATE_OF_BIRTH` mapping is imprecise.** Presidio's `DATE_TIME` entity catches all dates, not just birthdates. The Node.js `lib/ingestion/scrub.ts` layer is responsible for filtering — only redacting dates that appear in PII-indicative contexts (near words like "born", "DOB", "date of birth"). The Presidio sidecar detects broadly; the backend filters narrowly. Document this with a comment in `entity_map.py`.
- **The `en_core_web_lg` spaCy model is ~560MB.** The Docker image will be large (~1.2GB). This is acceptable for a sidecar deployment. Do NOT use `en_core_web_sm` — it has significantly worse NER accuracy for person names and addresses, which are the most critical PII types in financial documents.
- **Score threshold of 0.7 is enforced at the caller level** (`lib/ingestion/presidio-client.ts`), not in the sidecar. The sidecar returns all detections with their scores. The caller filters. This gives the backend flexibility to adjust the threshold without redeploying the sidecar.
- **Custom recognizers must include negative test cases.** The mortgage account pattern (`\d{3}[-\s]?\d{7,12}`) will match many non-PII number sequences in financial documents (e.g., dollar amounts, reference numbers). The context word boosting and the 0.7 threshold at the caller level are the defenses. `test_recognizers.py` must include at least 5 false-positive scenarios that should NOT be detected (e.g., "$123,456,789.00" should not match as a financial account).
- **Gunicorn with 4 workers and 120-second timeout.** Financial documents can be long. A single `/analyze` call on a 100-page document might take 30-60 seconds. The 120-second timeout prevents premature kills while the worker count prevents a single slow request from blocking the service.
- **Pin all dependencies to minor versions in `requirements.txt`.** Presidio's API surface can change between minor versions. Pinning to `2.2.*` ensures reproducibility.
- **Do not add any LLM dependencies to this service.** No `anthropic`, no `openai`, no `langchain`. This service is deterministic by design. If an agent tries to add LLM-based PII detection, reject it — it violates the architecture.
- **The health check must actually exercise the analyzer**, not just return 200. The check in the Key Logic section runs a trivial analysis to verify the spaCy model is loaded and the recognizer pipeline is functional.

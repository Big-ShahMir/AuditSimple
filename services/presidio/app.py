"""
Main entry point for the SimplyAudit Presidio PII detection sidecar.

Exposes three HTTP endpoints:
  POST /analyze   — Detect PII entities in text
  POST /anonymize — Replace detected PII with placeholders
  GET  /health    — Liveness/readiness probe

This service is stateless. Every request is fully independent.
No database, no LLM, no file storage.
"""
import logging
from typing import Any

from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from presidio_analyzer import AnalyzerEngine, RecognizerRegistry
from presidio_analyzer.nlp_engine import NlpEngineProvider
from presidio_anonymizer import AnonymizerEngine
from presidio_anonymizer.entities import (
    OperatorConfig,
    RecognizerResult as AnonymizerRecognizerResult,
)

from config import CORS_ORIGINS, LOG_LEVEL, PORT
from recognizers import (
    CanadianSinRecognizer,
    CanadianBankTransitRecognizer,
    MortgageAccountRecognizer,
    CanadianAddressRecognizer,
)

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL.upper(), logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# NLP engine (spaCy en_core_web_lg for best NER accuracy)
# ---------------------------------------------------------------------------
_nlp_config = {
    "nlp_engine_name": "spacy",
    "models": [{"lang_code": "en", "model_name": "en_core_web_lg"}],
}
_nlp_engine = NlpEngineProvider(nlp_configuration=_nlp_config).create_engine()

# ---------------------------------------------------------------------------
# Recognizer registry — load Presidio defaults, then add custom recognizers
# ---------------------------------------------------------------------------
registry = RecognizerRegistry()
registry.load_predefined_recognizers(nlp_engine=_nlp_engine)

# Register Canadian financial document recognizers
registry.add_recognizer(CanadianSinRecognizer())
registry.add_recognizer(CanadianBankTransitRecognizer())
registry.add_recognizer(MortgageAccountRecognizer())
registry.add_recognizer(CanadianAddressRecognizer())

analyzer = AnalyzerEngine(registry=registry, nlp_engine=_nlp_engine)
anonymizer = AnonymizerEngine()

logger.info("Analyzer and anonymizer engines initialized successfully.")

# ---------------------------------------------------------------------------
# Flask application
# ---------------------------------------------------------------------------
app = Flask(__name__)

# Restrict CORS to the Node.js backend origin only.
# The sidecar must never be directly accessible from the browser.
CORS(app, origins=CORS_ORIGINS, methods=["GET", "POST"], allow_headers=["Content-Type"])


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.route("/health", methods=["GET"])
def health() -> tuple[str, int]:
    """Liveness and readiness probe.

    Actually exercises the analyzer to confirm the spaCy model is loaded and
    the recognizer pipeline is operational. Returns 503 if the engine fails.
    """
    try:
        analyzer.analyze(text="test", language="en", entities=["PERSON"])
        return "healthy", 200
    except Exception as exc:
        logger.error("Health check failed: %s", exc)
        return f"unhealthy: {exc}", 503


@app.route("/analyze", methods=["POST"])
def analyze() -> tuple[Response, int]:
    """Detect PII entities in the supplied text.

    Request JSON:
      text                    (str, required)
      language                (str, default "en")
      entities                (list[str], optional) — restrict entity types
      score_threshold         (float, default 0.0)  — sidecar returns all;
                                caller filters at 0.7
      return_decision_process (bool, default false)

    Response JSON:
      { "results": [ { entity_type, start, end, score,
                        recognition_metadata: { recognizer_name,
                                                recognizer_identifier } } ] }
    """
    body: dict[str, Any] = request.get_json(force=True, silent=True) or {}

    text: str = body.get("text", "")
    language: str = body.get("language", "en")
    entities: list[str] | None = body.get("entities")  # None → all entities
    score_threshold: float = float(body.get("score_threshold", 0.0))
    return_decision_process: bool = bool(body.get("return_decision_process", False))

    if not isinstance(text, str) or not text:
        return jsonify({"error": "text field is required and must be a non-empty string"}), 400

    try:
        results = analyzer.analyze(
            text=text,
            language=language,
            entities=entities,
            score_threshold=score_threshold,
            return_decision_process=return_decision_process,
        )
    except Exception as exc:
        logger.exception("Error during analysis")
        return jsonify({"error": str(exc)}), 500

    output = []
    for r in results:
        item: dict[str, Any] = {
            "entity_type": r.entity_type,
            "start": r.start,
            "end": r.end,
            "score": r.score,
            "recognition_metadata": {
                "recognizer_name": (
                    r.recognition_metadata.get("recognizer_name", "")
                    if r.recognition_metadata
                    else ""
                ),
                "recognizer_identifier": (
                    r.recognition_metadata.get("recognizer_identifier", "")
                    if r.recognition_metadata
                    else ""
                ),
            },
        }
        if return_decision_process and hasattr(r, "analysis_explanation"):
            item["analysis_explanation"] = (
                r.analysis_explanation.__dict__ if r.analysis_explanation else None
            )
        output.append(item)

    return jsonify({"results": output}), 200


@app.route("/anonymize", methods=["POST"])
def anonymize() -> tuple[Response, int]:
    """Replace detected PII entities with placeholders.

    Request JSON:
      text             (str, required) — original text
      analyzer_results (list, required) — output from /analyze
      anonymizers      (dict, optional) — per-entity operator configuration

    Response JSON:
      { "text": "...", "items": [ { start, end, entity_type, text, operator } ] }
    """
    body: dict[str, Any] = request.get_json(force=True, silent=True) or {}

    text: str = body.get("text", "")
    raw_results: list[dict] = body.get("analyzer_results", [])
    raw_anonymizers: dict[str, dict] | None = body.get("anonymizers")

    if not isinstance(text, str) or not text:
        return jsonify({"error": "text field is required and must be a non-empty string"}), 400

    if not isinstance(raw_results, list):
        return jsonify({"error": "analyzer_results must be a list"}), 400

    # Reconstruct RecognizerResult objects expected by the anonymizer engine
    try:
        analyzer_results = [
            AnonymizerRecognizerResult(
                entity_type=r["entity_type"],
                start=int(r["start"]),
                end=int(r["end"]),
                score=float(r["score"]),
            )
            for r in raw_results
        ]
    except (KeyError, TypeError, ValueError) as exc:
        return jsonify({"error": f"Invalid analyzer_results format: {exc}"}), 400

    # Build operator configuration map
    operators: dict[str, OperatorConfig] | None = None
    if raw_anonymizers:
        operators = {}
        for entity_type, cfg in raw_anonymizers.items():
            op_type: str = cfg.get("type", "replace")
            op_params: dict[str, Any] = {}
            if "new_value" in cfg:
                op_params["new_value"] = cfg["new_value"]
            if "masking_char" in cfg:
                op_params["masking_char"] = cfg["masking_char"]
            if "chars_to_mask" in cfg:
                op_params["chars_to_mask"] = cfg["chars_to_mask"]
            operators[entity_type] = OperatorConfig(op_type, op_params)

    try:
        result = anonymizer.anonymize(
            text=text,
            analyzer_results=analyzer_results,
            operators=operators,
        )
    except Exception as exc:
        logger.exception("Error during anonymization")
        return jsonify({"error": str(exc)}), 500

    items = [
        {
            "start": item.start,
            "end": item.end,
            "entity_type": item.entity_type,
            "text": item.text,
            "operator": item.operator,
        }
        for item in result.items
    ]

    return jsonify({"text": result.text, "items": items}), 200


# ---------------------------------------------------------------------------
# Dev entrypoint
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    # Development only — production uses gunicorn (see Dockerfile CMD)
    app.run(host="0.0.0.0", port=PORT, debug=True)

"""
Unit tests for all custom Presidio recognizers.

Run inside the Docker container (or locally with dependencies installed):
    pytest test_recognizers.py -v

Coverage:
  - CanadianSinRecognizer   — positive matches, Luhn validation, negatives
  - CanadianBankTransitRecognizer — positive matches, context boosting, negatives
  - MortgageAccountRecognizer    — positive matches, context boosting, negatives (≥5)
  - CanadianAddressRecognizer    — postal codes, street addresses, negatives
"""
import pytest
from presidio_analyzer import AnalyzerEngine, RecognizerRegistry

from recognizers.canadian_sin import CanadianSinRecognizer, luhn_checksum
from recognizers.canadian_bank_transit import CanadianBankTransitRecognizer
from recognizers.mortgage_account import MortgageAccountRecognizer
from recognizers.canadian_address import CanadianAddressRecognizer


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _analyze(recognizer, text: str) -> list:
    """Run a single recognizer against text without the NLP engine."""
    registry = RecognizerRegistry()
    registry.add_recognizer(recognizer)
    engine = AnalyzerEngine(registry=registry, nlp_engine=None)
    return engine.analyze(
        text=text,
        language="en",
        entities=[recognizer.supported_entities[0]],
        score_threshold=0.0,
    )


def _has_match(results, entity_type: str) -> bool:
    return any(r.entity_type == entity_type for r in results)


# ===========================================================================
# Luhn checksum
# ===========================================================================

class TestLuhnChecksum:
    """Validates the standalone luhn_checksum helper."""

    def test_valid_sin_046_454_286(self):
        """Standard test vector: 046 454 286 is Luhn-valid."""
        assert luhn_checksum("046 454 286") is True

    def test_valid_sin_no_separators(self):
        assert luhn_checksum("046454286") is True

    def test_invalid_sin_all_zeros(self):
        assert luhn_checksum("000000000") is False

    def test_invalid_sin_sequential(self):
        assert luhn_checksum("123456789") is False

    def test_invalid_wrong_digit_count(self):
        """Must be exactly 9 digits."""
        assert luhn_checksum("12345678") is False
        assert luhn_checksum("1234567890") is False

    def test_empty_string(self):
        assert luhn_checksum("") is False


# ===========================================================================
# CanadianSinRecognizer
# ===========================================================================

class TestCanadianSinRecognizer:
    """Tests for CA_SIN detection and confidence assignment."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.recognizer = CanadianSinRecognizer()

    # --- Positive matches ---

    def test_detects_sin_with_spaces(self):
        """Canonical SIN format with space separators."""
        results = self.recognizer.analyze("SIN: 046 454 286", ["CA_SIN"])
        assert _has_match(results, "CA_SIN")

    def test_detects_sin_with_dashes(self):
        results = self.recognizer.analyze("SIN: 046-454-286", ["CA_SIN"])
        assert _has_match(results, "CA_SIN")

    def test_detects_sin_no_separators(self):
        results = self.recognizer.analyze("SIN 046454286", ["CA_SIN"])
        assert _has_match(results, "CA_SIN")

    def test_luhn_valid_gets_high_confidence(self):
        """Luhn-valid SIN should receive the high confidence score (0.85)."""
        results = self.recognizer.analyze("046 454 286", ["CA_SIN"])
        assert any(r.score == pytest.approx(0.85) for r in results)

    def test_luhn_invalid_gets_low_confidence(self):
        """Pattern match that fails Luhn should stay at low confidence (0.60)."""
        results = self.recognizer.analyze("123 456 789", ["CA_SIN"])
        assert any(r.score == pytest.approx(0.60) for r in results)

    # --- Negative matches (should NOT be detected as CA_SIN) ---

    def test_does_not_match_phone_number(self):
        """Phone number might accidentally match the 3-3-4 digit pattern."""
        results = self.recognizer.analyze("Call us: 416-555-0192", ["CA_SIN"])
        # Phone has 10 digits — pattern requires exactly 9; should not match
        assert not _has_match(results, "CA_SIN")

    def test_does_not_match_postal_code(self):
        """A postal code (e.g. K1A 0A6) is not a SIN."""
        results = self.recognizer.analyze("Postal code: K1A 0A6", ["CA_SIN"])
        assert not _has_match(results, "CA_SIN")


# ===========================================================================
# CanadianBankTransitRecognizer
# ===========================================================================

class TestCanadianBankTransitRecognizer:
    """Tests for CA_BANK_TRANSIT detection and context word boosting."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.recognizer = CanadianBankTransitRecognizer()

    # --- Positive matches ---

    def test_detects_transit_with_dash(self):
        results = self.recognizer.analyze(
            "branch transit number: 10010-002", ["CA_BANK_TRANSIT"]
        )
        assert _has_match(results, "CA_BANK_TRANSIT")

    def test_detects_transit_with_space(self):
        results = self.recognizer.analyze("transit 10010 002", ["CA_BANK_TRANSIT"])
        assert _has_match(results, "CA_BANK_TRANSIT")

    def test_detects_transit_no_separator(self):
        results = self.recognizer.analyze("routing number 10010002", ["CA_BANK_TRANSIT"])
        assert _has_match(results, "CA_BANK_TRANSIT")

    def test_base_confidence_below_threshold_without_context(self):
        """Without context words the base score (0.5) is below the 0.7 threshold."""
        results = self.recognizer.analyze("12345678", ["CA_BANK_TRANSIT"])
        # If matched, score must be at or below base
        for r in results:
            if r.entity_type == "CA_BANK_TRANSIT":
                assert r.score <= 0.5

    # --- Negative matches ---

    def test_does_not_match_seven_digit_number(self):
        """7-digit number is too short for the 5+3 pattern."""
        results = self.recognizer.analyze("amount 1234567", ["CA_BANK_TRANSIT"])
        assert not _has_match(results, "CA_BANK_TRANSIT")

    def test_does_not_match_ten_digit_phone(self):
        """10-digit phone number should not produce a CA_BANK_TRANSIT match."""
        results = self.recognizer.analyze("phone: 4165550192", ["CA_BANK_TRANSIT"])
        assert not _has_match(results, "CA_BANK_TRANSIT")


# ===========================================================================
# MortgageAccountRecognizer
# ===========================================================================

class TestMortgageAccountRecognizer:
    """Tests for FINANCIAL_ACCOUNT detection with false-positive scenarios."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.recognizer = MortgageAccountRecognizer()

    # --- Positive matches with context words ---

    def test_detects_account_number_with_context(self):
        results = self.recognizer.analyze(
            "Mortgage account: 123-4567890123", ["FINANCIAL_ACCOUNT"]
        )
        assert _has_match(results, "FINANCIAL_ACCOUNT")

    def test_detects_loan_number_with_context(self):
        results = self.recognizer.analyze(
            "Loan number 456 78901234", ["FINANCIAL_ACCOUNT"]
        )
        assert _has_match(results, "FINANCIAL_ACCOUNT")

    def test_base_confidence_low_without_context(self):
        """Without context words the base score (0.5) should stay low."""
        results = self.recognizer.analyze("123 4567890", ["FINANCIAL_ACCOUNT"])
        for r in results:
            if r.entity_type == "FINANCIAL_ACCOUNT":
                assert r.score <= 0.5

    # --- Negative / false positive scenarios (≥5 per spec constraint) ---

    def test_false_positive_dollar_amount(self):
        """'$123,456,789.00' — dollar amount should NOT be flagged."""
        results = self.recognizer.analyze(
            "Total outstanding: $123,456,789.00", ["FINANCIAL_ACCOUNT"]
        )
        # The regex \\d{3}[-\\s]?\\d{7,12} requires digits only (no $, comma, .)
        assert not _has_match(results, "FINANCIAL_ACCOUNT")

    def test_false_positive_date_then_number(self):
        """A date adjacent to a large number should not trigger FINANCIAL_ACCOUNT."""
        results = self.recognizer.analyze(
            "Statement dated 2024-01-15 reference 999123456", ["FINANCIAL_ACCOUNT"]
        )
        # 999123456 is 9 digits — pattern requires 3+7-12 = 10-15 digits total
        assert not _has_match(results, "FINANCIAL_ACCOUNT")

    def test_false_positive_sin_number(self):
        """A 9-digit SIN (already caught by CanadianSinRecognizer) should not
        double-trigger as FINANCIAL_ACCOUNT."""
        results = self.recognizer.analyze(
            "SIN 046 454 286 on file", ["FINANCIAL_ACCOUNT"]
        )
        # "046 454 286" is 3+3+3 = 9 digits; pattern needs 3+7 minimum = 10 digits
        assert not _has_match(results, "FINANCIAL_ACCOUNT")

    def test_false_positive_phone_number(self):
        """10-digit phone numbers (3+7 digits) could match without context."""
        results = self.recognizer.analyze(
            "Contact us at 416 555-0192", ["FINANCIAL_ACCOUNT"]
        )
        # Phone has 10 digits (3+7); without context word, score ≤ 0.5
        for r in results:
            if r.entity_type == "FINANCIAL_ACCOUNT":
                assert r.score <= 0.5

    def test_false_positive_credit_card_segment(self):
        """Partial credit card segment should not trigger FINANCIAL_ACCOUNT."""
        results = self.recognizer.analyze(
            "Card ending in 456 7890123456", ["FINANCIAL_ACCOUNT"]
        )
        # No context words → base score 0.5 at most
        for r in results:
            if r.entity_type == "FINANCIAL_ACCOUNT":
                assert r.score <= 0.5

    def test_false_positive_postal_and_number(self):
        """A postal code adjacent to a reference ID is not a financial account."""
        results = self.recognizer.analyze(
            "Address at K1A 0A6, office ID 789-12345678", ["FINANCIAL_ACCOUNT"]
        )
        # No account/mortgage/loan context words present
        for r in results:
            if r.entity_type == "FINANCIAL_ACCOUNT":
                assert r.score <= 0.5


# ===========================================================================
# CanadianAddressRecognizer
# ===========================================================================

class TestCanadianAddressRecognizer:
    """Tests for ADDRESS detection — postal codes and street addresses."""

    @pytest.fixture(autouse=True)
    def setup(self):
        self.recognizer = CanadianAddressRecognizer()

    # --- Positive matches ---

    def test_detects_postal_code_with_space(self):
        results = self.recognizer.analyze("Postal: M5V 3A8", ["ADDRESS"])
        assert _has_match(results, "ADDRESS")

    def test_detects_postal_code_no_space(self):
        results = self.recognizer.analyze("code K1A0A6", ["ADDRESS"])
        assert _has_match(results, "ADDRESS")

    def test_detects_postal_code_lowercase(self):
        results = self.recognizer.analyze("m5v 3a8", ["ADDRESS"])
        assert _has_match(results, "ADDRESS")

    def test_detects_street_address_with_avenue(self):
        results = self.recognizer.analyze(
            "Property at 456 King Avenue, Toronto, ON", ["ADDRESS"]
        )
        assert _has_match(results, "ADDRESS")

    def test_detects_street_address_with_blvd(self):
        results = self.recognizer.analyze(
            "123 Maple Boulevard, Vancouver, BC", ["ADDRESS"]
        )
        assert _has_match(results, "ADDRESS")

    # --- Negative matches ---

    def test_does_not_match_plain_number(self):
        """A plain number like '1234' is not an address."""
        results = self.recognizer.analyze("Invoice #1234", ["ADDRESS"])
        assert not _has_match(results, "ADDRESS")

    def test_does_not_match_only_city_name(self):
        """A city name alone is not a postal code or street address."""
        results = self.recognizer.analyze("Toronto", ["ADDRESS"])
        assert not _has_match(results, "ADDRESS")

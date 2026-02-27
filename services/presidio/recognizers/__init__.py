"""
Package init — exports all custom recognizers for registration in app.py.
"""
from recognizers.canadian_sin import CanadianSinRecognizer
from recognizers.canadian_bank_transit import CanadianBankTransitRecognizer
from recognizers.mortgage_account import MortgageAccountRecognizer
from recognizers.canadian_address import CanadianAddressRecognizer

__all__ = [
    "CanadianSinRecognizer",
    "CanadianBankTransitRecognizer",
    "MortgageAccountRecognizer",
    "CanadianAddressRecognizer",
]

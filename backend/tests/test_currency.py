import pytest

from app.currency import convert_minor_amount


@pytest.mark.parametrize(
    ("amount", "target", "expected"),
    [
        (18_800, "USD", 12_596),
        (18_800, "IDR", 197_400),
    ],
)
def test_convert_jpy_minor_amount_uses_target_currency_precision(amount, target, expected):
    rates = {"JPY": 1, "USD": 0.0067, "IDR": 10.5}

    assert convert_minor_amount(amount, "JPY", target, rates) == expected


def test_convert_minor_amount_preserves_amount_when_currency_matches():
    assert convert_minor_amount(1_299, "USD", "USD", {"rates": {}}) == 1_299


def test_convert_minor_amount_rejects_unsupported_currency():
    with pytest.raises(ValueError, match="Unsupported currency"):
        convert_minor_amount(100, "JPY", "CHF", {"JPY": 1})
"""Production -> revenue conversion using value_per_ton settings.

Plan §4.5 — uses hercules_ai_config:
    value_per_ton_flour
    value_per_ton_bran  (default = 0.4 × flour)
    value_per_ton_pasta
    production_value_per_ton  (legacy generic fallback)

The design system has Mill B as the only production asset that distinguishes
flour vs bran today; other assets fall back to the generic value.
"""

from .db import get_config_value


_DEFAULT_GENERIC = 0
_DEFAULT_BRAN_FRACTION = 0.4


def _flour_value(cur):
    val = get_config_value(cur, 'value_per_ton_flour')
    if val is None:
        val = get_config_value(cur, 'production_value_per_ton', _DEFAULT_GENERIC)
    try:
        return float(val or 0)
    except (ValueError, TypeError):
        return 0.0


def _bran_value(cur):
    val = get_config_value(cur, 'value_per_ton_bran')
    if val is None:
        return _flour_value(cur) * _DEFAULT_BRAN_FRACTION
    try:
        return float(val or 0)
    except (ValueError, TypeError):
        return 0.0


def _pasta_value(cur):
    val = get_config_value(cur, 'value_per_ton_pasta')
    if val is None:
        val = get_config_value(cur, 'production_value_per_ton', _DEFAULT_GENERIC)
    try:
        return float(val or 0)
    except (ValueError, TypeError):
        return 0.0


def kg_to_omr(cur, kg, asset):
    """Convert kg produced to OMR revenue using asset-aware pricing.

    Mill B → flour value (the ledger's primary product).
    Pasta lines → pasta value.
    Anything else → generic.
    """
    if kg is None or kg <= 0:
        return 0.0
    asset_lower = (asset or '').lower()
    if 'mill b' in asset_lower or 'mil b' in asset_lower:
        per_ton = _flour_value(cur)
    elif 'pasta' in asset_lower:
        per_ton = _pasta_value(cur)
    else:
        try:
            per_ton = float(get_config_value(cur, 'production_value_per_ton', 0) or 0)
        except (ValueError, TypeError):
            per_ton = 0.0
    return (kg / 1000.0) * per_ton


def value_per_ton(cur, product_kind):
    """Public lookup. product_kind ∈ {'flour','bran','pasta','generic'}."""
    if product_kind == 'flour':
        return _flour_value(cur)
    if product_kind == 'bran':
        return _bran_value(cur)
    if product_kind == 'pasta':
        return _pasta_value(cur)
    try:
        return float(get_config_value(cur, 'production_value_per_ton', 0) or 0)
    except (ValueError, TypeError):
        return 0.0

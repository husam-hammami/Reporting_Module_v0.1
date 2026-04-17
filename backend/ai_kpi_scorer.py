"""KPI scoring for plant health — pure math, no LLM.

Computes a composite 0-100 score from tag data and profiles.
Fast, deterministic, and reliable.
"""

import logging
logger = logging.getLogger(__name__)


def _clamp(val):
    """Clamp a value to 0-100 range."""
    return max(0, min(100, int(round(val))))


def _safe_float(v):
    """Try to convert to float, return None on failure."""
    if v is None or v == '' or v == 'N/A':
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def _ratio_score(current, previous):
    """Score based on current vs previous ratio.

    current >= previous  -> 100
    current = 0          -> 0
    else                 -> (current / previous) * 100
    """
    if current is None:
        return None
    if previous is None or previous == 0:
        if current == 0:
            return 0
        # No previous data to compare — neutral
        return 50
    if current >= previous:
        return 100
    return (current / previous) * 100


def _score_production(tag_data, prev_tag_data, profiles):
    """Production sub-score: counter tags with delta aggregation.

    Weight: 40%
    """
    scores = []

    for key, value in tag_data.items():
        # Parse namespaced key
        if '::' in key:
            agg_prefix, tag_name = key.split('::', 1)
        else:
            tag_name = key
            agg_prefix = 'last'

        prof = profiles.get(tag_name)
        if not prof:
            continue

        tag_type = (prof.get('tag_type') or '').lower()
        if tag_type != 'counter':
            continue

        current = _safe_float(value)
        prev_val = prev_tag_data.get(key)
        previous = _safe_float(prev_val)

        s = _ratio_score(current, previous)
        if s is not None:
            scores.append(s)

    if not scores:
        return 50  # neutral when no counters
    return sum(scores) / len(scores)


def _score_equipment(tag_data, prev_tag_data, profiles):
    """Equipment sub-score: boolean tags ON/OFF.

    Weight: 25%
    """
    on_count = 0
    total_count = 0

    for key, value in tag_data.items():
        if '::' in key:
            _, tag_name = key.split('::', 1)
        else:
            tag_name = key

        prof = profiles.get(tag_name)
        if not prof:
            continue

        tag_type = (prof.get('tag_type') or '').lower()
        if tag_type != 'boolean':
            continue

        v = _safe_float(value)
        if v is None:
            continue

        total_count += 1
        if v > 0:
            on_count += 1

    if total_count == 0:
        return 50  # neutral when no booleans
    return (on_count / total_count) * 100


def _score_power(tag_data, prev_tag_data, profiles):
    """Power Quality sub-score: power factor and power tags.

    Weight: 20%
    """
    scores = []

    for key, value in tag_data.items():
        if '::' in key:
            agg_prefix, tag_name = key.split('::', 1)
        else:
            tag_name = key
            agg_prefix = 'last'

        prof = profiles.get(tag_name)
        if not prof:
            continue

        tag_type = (prof.get('tag_type') or '').lower()
        unit = (prof.get('unit') or '').lower().strip()
        label = (prof.get('label') or '').lower()

        is_pf = False
        is_power = False

        # Power factor detection
        if unit in ('pf', 'cos') or 'cos' in unit:
            is_pf = True
        elif tag_type == 'percentage' and 'power factor' in label:
            is_pf = True

        # Power tags detection
        if unit in ('kva', 'kw', 'kwh', 'mwh', 'w'):
            is_power = True

        if not is_pf and not is_power:
            continue

        current = _safe_float(value)
        if current is None:
            continue

        if is_pf:
            # PF >= 0.95 -> 100, PF <= 0.5 -> 0, linear between
            if current >= 0.95:
                scores.append(100)
            elif current <= 0.5:
                scores.append(0)
            else:
                # Linear interpolation: (current - 0.5) / (0.95 - 0.5) * 100
                scores.append(((current - 0.5) / 0.45) * 100)
        elif is_power:
            prev_val = prev_tag_data.get(key)
            previous = _safe_float(prev_val)
            s = _ratio_score(current, previous)
            if s is not None:
                scores.append(s)

    if not scores:
        return 50  # neutral when no power tags
    return sum(scores) / len(scores)


def _score_flow(tag_data, prev_tag_data, profiles):
    """Flow Rates sub-score: rate tags.

    Weight: 15%
    """
    scores = []

    for key, value in tag_data.items():
        if '::' in key:
            agg_prefix, tag_name = key.split('::', 1)
        else:
            tag_name = key
            agg_prefix = 'last'

        prof = profiles.get(tag_name)
        if not prof:
            continue

        tag_type = (prof.get('tag_type') or '').lower()
        if tag_type != 'rate':
            continue

        current = _safe_float(value)
        prev_val = prev_tag_data.get(key)
        previous = _safe_float(prev_val)

        if current is None:
            continue

        if previous is not None and previous > 0 and current == 0:
            scores.append(0)
        else:
            s = _ratio_score(current, previous)
            if s is not None:
                scores.append(s)

    if not scores:
        return 50  # neutral when no rate tags
    return sum(scores) / len(scores)


def _compute_efficiency(tag_data, prev_tag_data, profiles):
    """Compute production efficiency: ton/kWh.

    Finds counter tags with weight units (kg, ton, t) and energy tags (kWh, MWh).
    Returns dict with current and previous efficiency, or None if insufficient data.
    """
    total_production_kg = 0
    prev_production_kg = 0
    total_energy_kwh = 0
    prev_energy_kwh = 0

    for key, value in tag_data.items():
        if '::' in key:
            agg_prefix, tag_name = key.split('::', 1)
        else:
            tag_name = key
            agg_prefix = 'last'

        prof = profiles.get(tag_name)
        if not prof:
            continue

        tag_type = (prof.get('tag_type') or '').lower()
        unit = (prof.get('unit') or '').lower().strip()
        current = _safe_float(value)
        prev_val = _safe_float(prev_tag_data.get(key))

        if current is None:
            continue

        # Production tags (weight units with delta aggregation)
        if tag_type == 'counter' and agg_prefix == 'delta':
            if unit in ('kg', 'kilogram', 'kilograms'):
                total_production_kg += current
                if prev_val is not None:
                    prev_production_kg += prev_val
            elif unit in ('t', 'ton', 'tons', 'tonne', 'tonnes'):
                total_production_kg += current * 1000  # convert to kg
                if prev_val is not None:
                    prev_production_kg += prev_val * 1000

        # Energy tags
        if unit in ('kwh', 'kw/h', 'kilowatt-hour', 'kilowatt-hours'):
            if agg_prefix == 'delta':
                total_energy_kwh += current
                if prev_val is not None:
                    prev_energy_kwh += prev_val
        elif unit in ('mwh', 'megawatt-hour'):
            if agg_prefix == 'delta':
                total_energy_kwh += current * 1000
                if prev_val is not None:
                    prev_energy_kwh += prev_val * 1000

    if total_production_kg == 0 or total_energy_kwh == 0:
        return None

    # Convert kg to tons for the ratio
    current_ton_per_kwh = (total_production_kg / 1000) / total_energy_kwh
    prev_ton_per_kwh = None
    if prev_production_kg > 0 and prev_energy_kwh > 0:
        prev_ton_per_kwh = (prev_production_kg / 1000) / prev_energy_kwh

    # Change percentage
    change_pct = None
    if prev_ton_per_kwh and prev_ton_per_kwh > 0:
        change_pct = ((current_ton_per_kwh - prev_ton_per_kwh) / prev_ton_per_kwh) * 100

    return {
        'current': round(current_ton_per_kwh, 4),
        'previous': round(prev_ton_per_kwh, 4) if prev_ton_per_kwh else None,
        'change_pct': round(change_pct, 1) if change_pct is not None else None,
        'production_tons': round(total_production_kg / 1000, 2),
        'energy_kwh': round(total_energy_kwh, 2),
    }


def compute_kpi_score(tag_data, prev_tag_data, profiles):
    """Compute plant health KPI score from tag data.

    Args:
        tag_data: dict {tag_key: value} current period
        prev_tag_data: dict {tag_key: value} previous period
        profiles: dict {tag_name: {label, tag_type, line_name, unit, ...}}

    Returns:
        dict {
            'score': int (0-100),
            'breakdown': {
                'production': {'score': int, 'label': 'Production'},
                'equipment': {'score': int, 'label': 'Equipment'},
                'power': {'score': int, 'label': 'Power Quality'},
                'flow': {'score': int, 'label': 'Flow Rates'},
            },
            'efficiency': dict or None,
        }
    """
    tag_data = tag_data or {}
    prev_tag_data = prev_tag_data or {}
    profiles = profiles or {}

    production = _score_production(tag_data, prev_tag_data, profiles)
    equipment = _score_equipment(tag_data, prev_tag_data, profiles)
    power = _score_power(tag_data, prev_tag_data, profiles)
    flow = _score_flow(tag_data, prev_tag_data, profiles)

    composite = int(round(
        production * 0.40 +
        equipment * 0.25 +
        power * 0.20 +
        flow * 0.15
    ))

    # Efficiency: tons produced per kWh consumed
    efficiency = _compute_efficiency(tag_data, prev_tag_data, profiles)

    return {
        'score': _clamp(composite),
        'breakdown': {
            'production': {'score': _clamp(production), 'label': 'Production'},
            'equipment': {'score': _clamp(equipment), 'label': 'Equipment'},
            'power': {'score': _clamp(power), 'label': 'Power Quality'},
            'flow': {'score': _clamp(flow), 'label': 'Flow Rates'},
        },
        'efficiency': efficiency,
    }

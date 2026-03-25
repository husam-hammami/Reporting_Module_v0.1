"""
Safe formula evaluation for KPI Engine (KPI_ENGINE_PLAN.md Phase 2).
Uses asteval for a restricted subset of Python expressions (no exec, no imports).
"""

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

_asteval = None


def _get_asteval():
    global _asteval
    if _asteval is None:
        try:
            from asteval import Interpreter
            _asteval = Interpreter()
        except ImportError:
            logger.warning("asteval not installed; KPI formula evaluation will fall back to restricted eval")
            _asteval = False
    return _asteval


def safe_evaluate(expression: str, variables: Optional[Dict[str, Any]] = None) -> Optional[float]:
    """
    Evaluate a numeric expression safely. Variables are passed as a dict (alias_name -> value).
    Returns float or None on error. Only math-like expressions are allowed (no side effects).
    """
    if not expression or not expression.strip():
        return None
    variables = variables or {}
    # Ensure all values are numeric for safety
    safe_vars = {}
    for k, v in variables.items():
        if v is None:
            safe_vars[k] = 0.0
        elif isinstance(v, (int, float)):
            safe_vars[k] = float(v)
        else:
            try:
                safe_vars[k] = float(v)
            except (TypeError, ValueError):
                safe_vars[k] = 0.0

    interp = _get_asteval()
    if interp is False:
        return _fallback_eval(expression, safe_vars)

    try:
        interp.symtable.update(safe_vars)
        result = interp(expression.strip())
        if result is None:
            return None
        if isinstance(result, (int, float)):
            return float(result)
        return float(result)
    except Exception as e:
        logger.debug("asteval failed for %r: %s", expression[:80], e)
        return _fallback_eval(expression, safe_vars)


def _fallback_eval(expression: str, variables: Dict[str, float]) -> Optional[float]:
    """
    Minimal safe fallback: only allow numbers, names from variables, and + - * / ( ).
    No builtins, no __, no globals.
    """
    allowed = set(variables.keys()) | {' ', '.', '(', ')', '+', '-', '*', '/', 'e', 'E'}
    for c in expression:
        if c.isalnum() or c in ' .()+-*/_':
            continue
        if c in 'eE' and (expression.count('e') + expression.count('E') <= 2):
            continue
        logger.warning("Rejected character in formula: %r", c)
        return None
    try:
        # Restrict to only our variables and literals
        code = compile(expression.strip(), "<kpi_formula>", "eval")
        if code.co_names and not all(n in variables for n in code.co_names):
            return None
        result = eval(code, {"__builtins__": {}}, variables)
        if isinstance(result, (int, float)):
            return float(result)
        return None
    except Exception:
        return None

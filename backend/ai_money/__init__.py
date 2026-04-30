"""
ai_money — deterministic Money Layer for Hercules ROI Genius.

Plan reference: docs/plans/AI Features/05_ROI_Genius_Layer_Plan_30_04.md §4

The LLM is never the calculator. Everything in this package is pure SQL +
arithmetic. The Narrator (Phase C) consumes typed payloads from here.
"""

from . import sec
from . import pf_penalty
from . import cost
from . import revenue
from . import savings_ledger
from . import levers
from . import payload_builder

__all__ = ['sec', 'pf_penalty', 'cost', 'revenue', 'savings_ledger', 'levers', 'payload_builder']

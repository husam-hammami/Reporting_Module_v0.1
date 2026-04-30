"""Phase B nightly worker — closes open forecasts in model_accuracy_log.

Walks rows where closed=FALSE AND target_at < NOW(); reads actuals from
tag_history_archive; computes abs/pct error and band_hit; flips closed=TRUE.

Phase A: stub. Phase B implements.
"""

import logging

logger = logging.getLogger(__name__)


def run_once():
    """Phase A no-op. Phase B walks open rows and closes them."""
    logger.debug("accuracy_closer: stub (Phase B implements).")
    return {'closed': 0, 'errors': 0}

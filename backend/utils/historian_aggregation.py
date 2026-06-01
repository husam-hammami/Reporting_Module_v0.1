"""
Shared SQL / logic for historian aggregations used by reports and distribution.

Average excludes exact zero (idle / empty PLC readings) so monthly reports match
operator expectation of "average while the signal was non-zero".
"""


def sql_value_agg_expr(aggregation: str, column: str = "value") -> str:
    """
    SQL aggregate expression for a numeric tag_history / archive column.

    For ``avg``: ``AVG(column) FILTER (WHERE column IS NOT NULL AND column <> 0)``
    Other aggregations are unchanged (min/max/sum/count include all samples).
    """
    if aggregation == "avg":
        return (
            f"AVG({column}) FILTER (WHERE {column} IS NOT NULL AND {column} <> 0)"
        )
    fn_map = {
        "min": "MIN",
        "max": "MAX",
        "sum": "SUM",
        "count": "COUNT",
    }
    if aggregation in fn_map:
        return f"{fn_map[aggregation]}({column})"
    raise ValueError(f"unsupported aggregation: {aggregation}")

# 06 -- Formulas and Calculations

## Why Formulas?

PLCs deliver raw sensor readings -- flow rates, temperatures, energy counters, weights. But operators and managers need derived values the PLC does not provide directly: flow rate conversions (t/h to kg/s), efficiency percentages, energy consumption deltas, production totals, conditional status flags. Formulas let you compute these derived values from raw tags without changing PLC programming. The calculation engine evaluates them automatically and stores the results alongside the raw data.

---

## Creating a Formula Tag

To create a formula-based tag:

1. Navigate to **Engineering --> Tags** in the frontend.
2. Click **Add Tag** and set the **source_type** to `"Formula"`.
3. Enter a **tag_name** (e.g., `Flow_Rate_KGS`) and a human-readable **display_name**.
4. In the **formula** field, write a mathematical expression.
5. Reference other tags by name using curly braces: `{Tag_Name}`.
6. Set the **unit** and **decimal_places** for display formatting.
7. Save. The system validates the formula syntax before persisting.

**Example formula field:**

```
{Flow_Rate_TH} * 1000 / 3600
```

This converts a flow rate from tonnes/hour to kilograms/second by referencing the `Flow_Rate_TH` tag.

---

## Available Functions

The calculation engine supports these built-in functions. All are available in formula expressions.

| Function | Description | Example |
|----------|-------------|---------|
| `SUM(tag1, tag2, ...)` | Sum of values across the listed tags or records | `SUM({Sender1_Weight}, {Sender2_Weight})` |
| `AVG(tag1, tag2, ...)` | Arithmetic mean of values | `AVG({Temp_Zone1}, {Temp_Zone2}, {Temp_Zone3})` |
| `DELTA(tag)` | Change since last reading -- critical for cumulative counters like energy meters | `DELTA({Total_Active_Energy})` |
| `MIN(tag1, tag2, ...)` | Minimum value | `MIN({Pressure_1}, {Pressure_2})` |
| `MAX(tag1, tag2, ...)` | Maximum value | `MAX({Flow_Rate_1}, {Flow_Rate_2})` |
| `COUNT(...)` | Number of non-null values in the set | `COUNT({Sensor_A}, {Sensor_B}, {Sensor_C})` |
| `IF(condition, true_val, false_val)` | Conditional logic -- returns `true_val` when condition is truthy, `false_val` otherwise | `IF({Temperature} > 80, 1, 0)` |
| `ROUND(value, decimals)` | Round to a specified number of decimal places | `ROUND({Efficiency} * 100, 2)` |
| `ABS(value)` | Absolute value | `ABS({Delta_Pressure})` |

The underlying evaluator also exposes Python math functions for advanced use:

| Function | Description |
|----------|-------------|
| `sqrt(x)` | Square root |
| `pow(x, y)` | Exponentiation |
| `sin(x)`, `cos(x)`, `tan(x)` | Trigonometric functions (radians) |
| `log(x)`, `log10(x)` | Natural and base-10 logarithm |
| `exp(x)` | Euler's number raised to x |
| `pi`, `e` | Mathematical constants |

---

## Calculation Methods

Each calculation has a **method** that determines how values are aggregated over a time range.

| Method | Behavior | When to Use |
|--------|----------|-------------|
| **DIRECT** | Use the formula result directly -- no aggregation | Single-point calculations, live conversions |
| **SUM** | Sum all values across the time range | Accumulating quantities like total production weight |
| **DELTA** | Difference between the last and first value in the range | Cumulative counters (energy meters, totalizers) where the PLC holds a running total |
| **AVERAGE** | Arithmetic mean of all values in the range | Rates, temperatures, pressures -- anything where the mean is meaningful |
| **CUSTOM** | Evaluate the formula expression as-is against the full record set | Complex KPIs that combine multiple aggregation types |

**DELTA explained:** Many PLC tags are cumulative counters that only go up (e.g., `Total_Active_Energy` starts at 0 and reaches millions of kWh over the plant's lifetime). To know how much energy was consumed in a specific period, you need `last_value - first_value`. The DELTA method does exactly this.

---

## Calculation Contexts

This is the most important concept in the calculation engine. A single formula can produce different results depending on **when** and **over what time range** it executes.

| Context | When It Executes | Data Available | Typical Use |
|---------|-----------------|----------------|-------------|
| **LIVE_MONITOR** | Every poll cycle (~1 second) | The latest tag values only | Real-time dashboards |
| **HOURLY_ARCHIVE** | When the archive worker runs (top of each hour) | All records from the previous hour | Hourly roll-ups stored in the archive table |
| **ORDER_ANALYTICS** | When a production order completes | All records from the order's start to finish | Order-level KPIs (total production, energy per ton, efficiency) |
| **REPORT_SUMMARY** | When a user views a report for a custom time range | All archive records within the selected period | Ad-hoc reporting and shift summaries |

### Why this matters

Consider the formula `DELTA({Total_Active_Energy})`:

- **LIVE_MONITOR** -- Returns the energy consumed in the last ~1 second (difference between current reading and previous reading).
- **HOURLY_ARCHIVE** -- Returns the energy consumed in the last hour (difference between the reading at the start of the hour and the end of the hour).
- **ORDER_ANALYTICS** -- Returns the total energy consumed during the entire production order.
- **REPORT_SUMMARY** -- Returns the energy consumed over whatever time range the user selected (e.g., an 8-hour shift, a full day, a week).

The same formula, the same tag, four different answers -- all correct for their context. This is what makes the calculation engine powerful: you define the formula once, and the system applies it correctly in every context.

### How it works internally

From the PRD (`Dynamic_System_PRD.md`, Feature 5):

```
Step 1: Load calculations for the current context
    calcs = config_cache[report_type]["calculations"]["LIVE_MONITOR"]

Step 2: Build a variable context with all PLC tag values
    variables = {
        "FlowRate_2_521WE": 12.456,
        "Sender1Weight": 5.2,
        ...
    }

Step 3: Evaluate each formula in order, feeding results back in
    for calc in calcs:
        result = evaluate_formula(calc.formula, variables)
        variables[calc.output_field_name] = result

Step 4: Return computed_values as a dict
    computed_values = {
        "total_sender_weight": 9.0,
        "produced_weight": 12.5,
        "efficiency_percent": 98.2
    }
```

This means formulas can reference the output of earlier formulas. Order matters -- place dependent calculations after their inputs.

---

## Practical Examples

### Flow rate conversion (t/h to kg/h)

```
{Flow_Rate_TH} * 1000
```

Multiplies the PLC value (in tonnes per hour) by 1000 to get kilograms per hour.

### Energy delta (energy consumed since last reading)

```
DELTA({Total_Active_Energy})
```

Returns the change in the cumulative energy counter. In the LIVE_MONITOR context, this gives instantaneous consumption. In the HOURLY_ARCHIVE context, this gives hourly consumption.

### Production efficiency (%)

```
{Actual_Output} / {Target_Output} * 100
```

Divides actual production by target and converts to a percentage.

### Conditional overheating flag

```
IF({Temperature} > 80, 1, 0)
```

Returns 1 when temperature exceeds 80 degrees, 0 otherwise. Useful for alarm counting or dashboard indicators.

### Specific energy consumption (kWh per tonne)

```
DELTA({Total_Active_Energy}) / {Produced_Weight}
```

Energy consumed divided by production weight. Combines DELTA aggregation with a direct tag reference.

### Total sender weight

```
SUM({Sender1_Weight}, {Sender2_Weight}, {Sender3_Weight})
```

Sums the weights of multiple material senders into a single value.

---

## Division by Zero and Error Handling

The calculation engine is designed to never crash, even when formulas encounter unexpected data.

| Scenario | Behavior |
|----------|----------|
| **Division by zero** | Returns `0` or `null` -- does not raise an exception. A warning is logged. |
| **Missing tag value** | If a referenced tag returns `None`, the formula returns the raw value unchanged (graceful fallback). |
| **Invalid formula syntax** | Caught during save-time validation. The system rejects the formula with an error message and does not persist it. |
| **Reference to unknown tag** | Returns `null` for that calculation. An error is logged. Other calculations continue normally. |
| **Circular reference** (A uses B, B uses A) | Detected during save. The system rejects the formula with an error message. |
| **Non-numeric result** | A warning is logged and the raw input value is returned as fallback. |

---

## For Developers

### Formula evaluation (tag_reader.py)

The core formula evaluator lives in `backend/utils/tag_reader.py` in the function `evaluate_value_formula()`.

**How it works:**

1. The raw PLC value is available as the variable `value` inside the formula string.
2. The function replaces all occurrences of the word `value` (case-insensitive, word-boundary matched via regex) with the actual numeric value.
3. The expression is evaluated using Python's `eval()` with a restricted `safe_dict` that exposes only mathematical functions and constants -- no builtins, no imports, no file access.

```python
safe_dict = {
    "abs": abs,
    "round": round,
    "min": min,
    "max": max,
    "pow": pow,
    "sqrt": math.sqrt,
    "sin": math.sin,
    "cos": math.cos,
    "tan": math.tan,
    "log": math.log,
    "log10": math.log10,
    "exp": math.exp,
    "pi": math.pi,
    "e": math.e,
    "__builtins__": {}   # <-- blocks all Python builtins
}
```

4. If the result is numeric (`int` or `float`), it is returned as a `float`.
5. If the result is non-numeric or an exception occurs, the original raw value is returned unchanged.

**Key file:** `backend/utils/tag_reader.py`, function `evaluate_value_formula()` (lines 23-82).

### Value formula vs scaling

Each tag has two transformation options:

- **`value_formula`** (preferred) -- A string expression like `value * 0.277778`. Applied first if present.
- **`scaling`** (legacy) -- A numeric multiplier. Applied only if `value_formula` is empty. Kept for backward compatibility.

The selection logic in `read_all_tags()`:

```python
value_formula = tag.get('value_formula')
if value_formula and value_formula.strip():
    final_value = evaluate_value_formula(value_formula, value)
else:
    scaling = float(tag.get('scaling', 1.0))
    final_value = value * scaling
```

### computed_values JSONB storage

When the monitor worker stores a record, calculated results are saved in a `computed_values` JSONB column alongside the raw `tag_values` JSONB column:

```sql
-- Live monitor table structure
CREATE TABLE <layout>_monitor_logs (
    id              SERIAL PRIMARY KEY,
    layout_id       INTEGER NOT NULL,
    order_name      TEXT,
    tag_values      JSONB NOT NULL DEFAULT '{}',   -- raw PLC values
    computed_values JSONB DEFAULT '{}',             -- formula results
    active_sources  JSONB DEFAULT '{}',
    line_running    BOOLEAN DEFAULT FALSE,
    created_at      TIMESTAMP DEFAULT NOW()
);
```

Both `tag_values` and `computed_values` are indexed JSONB, allowing efficient querying of any individual tag or computed field.

### Archive aggregation

The dynamic archive worker (`backend/workers/dynamic_archive_worker.py`) aggregates live records into hourly summaries. It applies different aggregation strategies based on tag naming conventions:

- Tags containing `flow`, `weight`, `rate`, or `produced` in their name are **summed** over the hour.
- All other tags are **averaged** over the hour.

The universal historian (`tag_history` / `tag_history_archive`) uses the `is_counter` flag on each tag:

- Counter tags (`is_counter = true`): aggregated using `SUM(value_delta)`.
- Non-counter tags: aggregated using `AVG(value)`.

### Performance considerations

- Formulas are evaluated on every poll cycle (~1 second). Keep them simple -- avoid deeply nested expressions or chains of more than ~10 dependent calculations.
- The `safe_dict` approach restricts the evaluation namespace, but `eval()` is inherently flexible. Do not allow untrusted users to write arbitrary formulas without review.
- Tag references in `{curly braces}` are resolved before evaluation. Missing tags return `None`, which will cause most arithmetic to fail gracefully and return the fallback value.

---

Previous: [05-TAG-MAPPING](05-TAG-MAPPING.md) | Next: [07-EMULATOR](07-EMULATOR.md)

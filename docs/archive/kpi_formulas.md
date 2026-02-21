# Flour Mill KPI Master Mapping (DB2099 Report/Flows/MIL-A)

**Source:** Tag names and types from DB2099 (Report/Flows/MIL-A).
**Purpose:** Complete KPI list with formulas, PLC tags, and aggregation (delta vs instant).

---

## Tag reference (from DB2099 screenshot)

| Tag name (exact)           | Example value | Type  | Offset | Use in KPI        |
|---------------------------|---------------|-------|--------|--------------------|
| FlowRate_2_521WE          | 7.8610        | Real  | 0      | AVG (instant)      |
| FlowRate_3_523WE          | 6.4346        | Real  | 4      | AVG (instant)      |
| FlowRate_3_522WE          | 6.4346        | Real  | 8      | AVG (instant)      |
| FlowRate_3_520WE          | 6.4346        | Real  | 12     | AVG (instant)      |
| FlowRate_3_524WE          | 1             | Real  | 16     | AVG (instant)      |
| Bran_Coarse               | 11.2870       | Real  | 20     | AVG (instant)      |
| Flour_1                    | 42.8610       | Real  | 24     | AVG (instant)      |
| B1                         | 23.5740       | Real  | 28     | AVG (instant)      |
| Bran_Fine                  | 7.6435        | Real  | 32     | AVG (instant)      |
| Semolina                   | 9.2870        | Real  | 36     | AVG (instant)      |
| Water_Flow                 | 85.7384       | Real  | 80     | SUM(delta) or AVG  |
| Receiver 2 cumulative      | 103656        | Dint  | 108    | SUM(delta) counter |
| semolina                   | 40731         | Dint  | 128    | SUM(delta) counter |
| bran_coarse                | 50731         | Dint  | 112    | SUM(delta) counter |
| flour_1                    | 120731        | Dint  | 116    | SUM(delta) counter |
| b1                         | 80731         | Dint  | 120    | SUM(delta) counter |
| bran_fine                  | 30731         | Dint  | 124    | SUM(delta) counter |

**Note:** In formulas use identifiers without spaces. If "Receiver 2 cumulative" is stored as `Receiver_2_cumulative` in `tags`, use that in formulas.

---

# 1. Production efficiency KPIs

## 1.1 Mill throughput
- **Tags:** `FlowRate_2_521WE`
- **Formula:** `FlowRate_2_521WE`
- **Delta vs instant:** Instant (AVG)

## 1.2 1st break capacity
- **Tags:** `FlowRate_2_521WE`
- **Formula:** `FlowRate_2_521WE`
- **Delta vs instant:** Instant (AVG)

---

# 2. Yield & mass balance KPIs

## 2.1 Flour extraction
- **Tags:** `flour_1`, `Receiver_2_cumulative` (or your DB tag_name for Receiver 2 cumulative)
- **Formula:** `(flour_1 / Receiver_2_cumulative) * 100`
- **Delta vs instant:** Delta (SUM) for both counters

## 2.2 Bran extraction
- **Tags:** `bran_coarse`, `bran_fine`, `Receiver_2_cumulative`
- **Formula:** `((bran_coarse + bran_fine) / Receiver_2_cumulative) * 100`
- **Delta vs instant:** Delta (SUM)

## 2.3 Semolina extraction
- **Tags:** `semolina`, `Receiver_2_cumulative`
- **Formula:** `(semolina / Receiver_2_cumulative) * 100`
- **Delta vs instant:** Delta (SUM)

## 2.4 B1 extraction
- **Tags:** `b1`, `Receiver_2_cumulative`
- **Formula:** `(b1 / Receiver_2_cumulative) * 100`
- **Delta vs instant:** Delta (SUM)

## 2.5 Milling loss
- **Tags:** `Receiver_2_cumulative`, `flour_1`, `bran_coarse`, `bran_fine`, `semolina`, `b1`
- **Formula:** `Receiver_2_cumulative - flour_1 - bran_coarse - bran_fine - semolina - b1`
- **Delta vs instant:** Delta (SUM)

## 2.6 Total water used
- **Tags:** `Water_Flow`
- **Formula:** `Water_Flow`
- **Delta vs instant:** Delta if counter; else instant

## 2.7 Water per ton wheat
- **Tags:** `Water_Flow`, `Receiver_2_cumulative`
- **Formula:** `Water_Flow / Receiver_2_cumulative`
- **Delta vs instant:** Delta (SUM)

---

# 3. Complete KPI → tag mapping

| KPI                 | Formula (identifiers)                                                    | Required tags (exact names)                    | Delta vs instant |
|---------------------|---------------------------------------------------------------------------|------------------------------------------------|------------------|
| Mill Throughput     | `FlowRate_2_521WE`                                                        | FlowRate_2_521WE                               | Instant (AVG)    |
| 1st Break            | `FlowRate_2_521WE`                                                        | FlowRate_2_521WE                               | Instant (AVG)    |
| Flour Extraction     | `(flour_1 / Receiver_2_cumulative) * 100`                                | flour_1, Receiver 2 cumulative                 | Delta (SUM)      |
| Bran Extraction      | `((bran_coarse + bran_fine) / Receiver_2_cumulative) * 100`               | bran_coarse, bran_fine, Receiver 2 cumulative  | Delta (SUM)      |
| Semolina Extraction  | `(semolina / Receiver_2_cumulative) * 100`                               | semolina, Receiver 2 cumulative                | Delta (SUM)      |
| B1 Extraction        | `(b1 / Receiver_2_cumulative) * 100`                                    | b1, Receiver 2 cumulative                      | Delta (SUM)      |
| Milling Loss         | `Receiver_2_cumulative - flour_1 - bran_coarse - bran_fine - semolina - b1` | All above counters                             | Delta (SUM)      |
| Total Water          | `Water_Flow`                                                             | Water_Flow                                     | Delta/instant    |
| Water per Ton        | `Water_Flow / Receiver_2_cumulative`                                     | Water_Flow, Receiver 2 cumulative             | Delta (SUM)      |

---

# 4. Tag classification (KPI engine)

**Counter tags (SUM(delta)); set `is_counter = true` in tags table:**
- Receiver 2 cumulative, flour_1, bran_coarse, bran_fine, semolina, b1, Water_Flow (if cumulative)

**Flow tags (AVG(value)):**
- FlowRate_2_521WE, FlowRate_3_523WE, FlowRate_3_522WE, FlowRate_3_520WE, FlowRate_3_524WE, Bran_Coarse, Flour_1, B1, Bran_Fine, Semolina
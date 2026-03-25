"""
PLC emulator for demo mode: returns same JSON shapes as real PLC endpoints
using time-based simulated values (no PLC connection).
"""

import math
import time
from datetime import datetime, timezone


def _sim(offset_key, base=0.0, amplitude=1.0, period=60.0):
    """Time-based value that varies smoothly for demo (same offset concept as PLC)."""
    t = time.time()
    return round(base + amplitude * math.sin(2 * math.pi * t / period), 6)


def _sim_int(offset_key, low=0, high=100):
    """Integer value derived from time for demo."""
    return (int(time.time()) + hash(offset_key) % 1000) % (high - low + 1) + low


# ---- DB2099 Report (same shape as get_db2099_report) ----
def emulate_db2099_report():
    """Returns (data_dict, None) for jsonify({'status': 'success', 'data': data}), 200."""
    result = {}
    tags_offsets = [
        ("FlowRate_2_521WE", 0, "t/h"), ("FlowRate_3_523WE", 4, "t/h"),
        ("FlowRate_3_522WE", 8, "t/h"), ("FlowRate_3_520WE", 12, "t/h"),
        ("FlowRate_3_524WE", 16, "t/h"),
        ("Bran_Coarse", 20, ""), ("Flour_1", 24, ""), ("B1", 28, ""),
        ("Bran_Fine", 32, ""), ("Semolina", 36, ""),
        ("031_2_710WE", 40, "t/h"), ("032_2_711WE", 44, "t/h"),
        ("FCL1_2_520WE", 48, "t/h"), ("021A_2_522WE", 52, "t/h"),
        ("021B_2_523WE", 56, "t/h"), ("021C_2_524WE", 60, "t/h"),
        ("021_2_782WE", 64, "t/h"), ("022_2_783WE", 68, "t/h"),
        ("023_2_784WE", 72, "t/h"), ("025_2_785WE", 76, "t/h"),
        ("2-500LC_Water_Flow", 80, "L/h"),
        ("027_2_786WE", 84, "t/h"), ("028_2_787WE", 88, "t/h"),
        ("029_2_708WE", 92, "t/h"),
    ]
    for tag, off, unit in tags_offsets:
        val = _sim((2099, off), base=10.0, amplitude=5.0)
        bin_code = tag.split("_")[0].replace("-", "").lstrip("0") if "_" in tag else None
        result[tag] = {"value": val, "unit": unit, "bin_code": bin_code, "bin_id": None, "bin_name": None}
    return result


# ---- FCL DB199 monitor (same shape as read_db199_monitor) ----
def emulate_db199_monitor():
    """Returns (result_dict, fcl_receivers) for FCL live monitor response."""
    t = time.time()
    # Simulate 1–2 active sources
    active_sources = [
        {
            "source_index": 1,
            "is_active": True,
            "bin_id": 29,
            "qty_percent": round(50.0 + 10 * math.sin(t / 30), 3),
            "produced_qty": round(100.0 + 20 * math.sin(t / 60), 3),
            "prd_code": 1,
            "weight": round(12.0 + 3 * math.sin(t / 45), 6),
            "prd_name": "Demo Material A",
        },
        {
            "source_index": 2,
            "is_active": True,
            "bin_id": 32,
            "qty_percent": round(30.0 + 5 * math.sin(t / 40), 3),
            "produced_qty": round(60.0 + 10 * math.sin(t / 50), 3),
            "prd_code": 2,
            "weight": round(8.0 + 2 * math.sin(t / 35), 6),
            "prd_name": "Demo Material B",
        },
    ]
    receiver_1_weight = round(20.0 + 4 * math.sin(t / 40), 6)
    receiver_2_counter = int(100000 + 5000 * (t % 3600) / 3600)  # cumulative kg
    fcl_receivers = [
        {"id": "0029", "name": "Output Bin", "location": "Output Bin", "weight": receiver_1_weight, "bin_id": 29},
        {"id": "FCL_2_520WE", "name": "FCL 2_520WE", "location": "FCL 2_520WE", "weight": float(receiver_2_counter)},
    ]
    result = {
        "line_running": True,
        "produced_weight": round(25.0 + 5 * math.sin(t / 50), 3),
        "water_consumed": round(1.2 + 0.2 * math.sin(t / 60), 3),
        "flow_rate": round(22.0 + 4 * math.sin(t / 45), 3),
        "moisture_setpoint": round(14.0 + 0.5 * math.sin(t / 120), 3),
        "moisture_offset": round(0.1 * math.sin(t / 90), 3),
        "cleaning_scale_bypass": False,
        "receiver": receiver_1_weight,
        "fcl_receivers": fcl_receivers,
        "job_status": 1,
        "os_comment": "Demo mode – no PLC",
        "active_destination": {"dest_no": 1, "bin_id": 29, "prd_code": 1},
        "active_sources": active_sources,
    }
    return result, result.get("fcl_receivers", [])


# ---- SCL DB299 monitor (same shape as db299_monitor) ----
def emulate_db299_monitor():
    """Returns result dict for SCL live monitor (status + timestamp + data)."""
    t = time.time()
    flow_val = round(18.0 + 4 * math.sin(t / 40), 3)
    active_sources = [
        {
            "source_index": 1,
            "is_active": True,
            "bin_id": 27,
            "qty_percent": round(60.0 + 10 * math.sin(t / 35), 3),
            "produced_qty": round(120.0 + 15 * math.sin(t / 50), 3),
            "prd_code": 1,
            "flowrate_tph": flow_val,
            "prd_name": "Demo SCL Material",
        },
    ]
    feeder_flows = {
        "027_2_786WE": {"bin_id": 27, "unit": "t/h", "value": flow_val},
        "028_2_787WE": {"bin_id": 28, "unit": "t/h", "value": round(10.0 + 2 * math.sin(t / 45), 3)},
        "029_2_708WE": {"bin_id": 29, "unit": "t/h", "value": round(8.0 + 2 * math.sin(t / 55), 3)},
        "032_2_711WE": {"bin_id": 32, "unit": "t/h", "value": round(5.0 + 1 * math.sin(t / 60), 3)},
    }
    result = {
        "DestNo": 1,
        "DestBinId": 29,
        "PrdCode": 1,
        "OS_Comment": "Demo mode – no PLC",
        "JobStatusCode": 1,
        "Flowrate": flow_val,
        "JobQty": round(150.0 + 20 * math.sin(t / 60), 3),
        "MoistureSetpoint": round(14.0 + 0.3 * math.sin(t / 120), 3),
        "MoistureOffset": round(0.05 * math.sin(t / 90), 3),
        "Dumping": False,
        "ActiveSources": active_sources,
        "FeederFlows": feeder_flows,
        "ProducedWeight": round(flow_val * 1.1, 3),
        "ProducedWeightBreakdown": {"source_total": round(flow_val, 3), "dest_weight": round(flow_val * 0.1, 3)},
    }
    return result


# ---- MILA DB499 + DB2099 monitor (same shape as read_db499_and_db2099_monitor) ----
def emulate_db499_db2099_monitor():
    """Returns (data_499, data_2099, bran_receiver, receiver_bins) for MILA response."""
    t = time.time()
    data_499 = {
        "scale_weight": round(500.0 + 50 * math.sin(t / 60), 3),
        "feeder_1_target": round(25.0 + 3 * math.sin(t / 45), 3),
        "feeder_1_selected": True,
        "feeder_2_target": round(20.0 + 2 * math.sin(t / 50), 3),
        "feeder_2_selected": True,
        "depot_selected": False,
        "flap_1_selected": True,
        "flap_2_selected": False,
        "receiver_bin_id_1": 1,
        "receiver_bin_id_2": 2,
        "semolina_selected": True,
        "mila_2_b789we_selected": False,
        "linning_running": True,
        "linning_stopped": False,
    }
    data_2099 = {
        "mila_2_b789we": round(0.5 + 0.1 * math.sin(t / 40), 3),
        "yield_max_flow": round(15.0 + 3 * math.sin(t / 45), 3),
        "yield_min_flow": round(5.0 + 1 * math.sin(t / 55), 3),
        "mila_unknown": round(1.0, 3),
        "mila_bran_coarse": round(12.0 + 1 * math.sin(t / 60), 3),
        "mila_flour_1": round(45.0 + 3 * math.sin(t / 50), 3),
        "mila_b1": round(25.0 + 2 * math.sin(t / 55), 3),
        "mila_bran_fine": round(8.0 + 0.5 * math.sin(t / 70), 3),
        "mila_semolina": round(10.0 + 1 * math.sin(t / 65), 3),
        "mila_B1_scale": round(100.0 + 10 * math.sin(t / 60), 3),
    }
    bran_receiver = {
        "bran_coarse": int(50000 + 1000 * (t % 3600) / 3600),
        "bran_fine": int(30000 + 800 * (t % 3600) / 3600),
        "flour_1": int(120000 + 2000 * (t % 3600) / 3600),
        "b1": int(80000 + 1500 * (t % 3600) / 3600),
        "semolina": int(40000 + 500 * (t % 3600) / 3600),
    }
    receiver_bins = [
        {"bin_id": 1, "material": {"id": 1, "material_name": "Demo Flour", "material_code": "DF1"}},
        {"bin_id": 2, "material": {"id": 2, "material_name": "Demo Semolina", "material_code": "DS1"}},
    ]
    return data_499, data_2099, bran_receiver, receiver_bins

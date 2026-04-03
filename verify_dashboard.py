"""
Hercules Dashboard Verification Script
Connects to portable PostgreSQL on port 5434 and compares
database values with what the dashboard should be showing.

Usage:
    python verify_dashboard.py
    python verify_dashboard.py --port 5434
    python verify_dashboard.py --shift-start "2026-04-03 05:00:00"
"""
import argparse
import sys

try:
    import psycopg2
    from psycopg2.extras import RealDictCursor
except ImportError:
    print("ERROR: psycopg2 not installed. Run: pip install psycopg2-binary")
    sys.exit(1)

from datetime import datetime, timedelta

SHIFT_HOUR = 5

MILL_B_TAGS = [
    'mil_b_job_flowrate', 'mil_b_flour_flowrate',
    'mil_b_bran_flowrate', 'mil_b_b1_flowrate',
    'mil_b_flour_percentage', 'mil_b_bran_percentage',
    'mil_b_b1_percentage',
    'mil_b_flour_totalizer', 'mil_b_bran_totalizer',
    'mil_b_b1_totalizer',
    'mil_b_order_active', 'mil_b_dampening_on',
    'mil_b_b1_scale', 'mil_b_vitamin_feeder_on',
    'mil_b_filter_flour_feeder',
]

WIDGET_AGGREGATIONS = {
    'mil_b_job_flowrate':      {'kpi': 'last', 'chart': 'avg', 'effective': 'avg'},
    'mil_b_flour_flowrate':    {'kpi': 'last', 'chart': 'avg', 'effective': 'avg'},
    'mil_b_bran_flowrate':     {'kpi': 'last', 'chart': 'avg', 'effective': 'avg'},
    'mil_b_b1_flowrate':       {'kpi': 'last', 'chart': 'avg', 'effective': 'avg'},
    'mil_b_flour_percentage':  {'kpi': 'last', 'chart': 'avg', 'effective': 'avg'},
    'mil_b_bran_percentage':   {'kpi': 'last', 'chart': 'avg', 'effective': 'avg'},
    'mil_b_b1_percentage':     {'kpi': 'last', 'chart': 'avg', 'effective': 'avg'},
    'mil_b_flour_totalizer':   {'kpi': 'last', 'chart': None,  'effective': 'last'},
    'mil_b_bran_totalizer':    {'kpi': 'last', 'chart': None,  'effective': 'last'},
    'mil_b_b1_totalizer':      {'kpi': 'last', 'chart': None,  'effective': 'last'},
}


def shift_start_today():
    now = datetime.now()
    d = now.replace(hour=SHIFT_HOUR, minute=0, second=0, microsecond=0)
    if now.hour < SHIFT_HOUR:
        d -= timedelta(days=1)
    return d


def fmt(val, decimals=2):
    if val is None:
        return 'NULL'
    return f'{val:,.{decimals}f}'


def header(title, width=70):
    print(f'\n{"="*width}')
    print(f'  {title}')
    print(f'{"="*width}')


def section(num, title):
    print(f'\n--- {num}. {title} ---')


def run(db_host, db_port, db_name, db_user, db_pass, shift_override):
    conn = psycopg2.connect(
        host=db_host, port=db_port, dbname=db_name,
        user=db_user, password=db_pass, connect_timeout=10,
    )
    conn.autocommit = True
    cur = conn.cursor(cursor_factory=RealDictCursor)

    shift = datetime.strptime(shift_override, '%Y-%m-%d %H:%M:%S') if shift_override else shift_start_today()
    now = datetime.now()

    header('HERCULES DASHBOARD VERIFICATION')
    print(f'  Database:    {db_name} @ {db_host}:{db_port}')
    print(f'  Shift start: {shift}')
    print(f'  Now:         {now}')

    # ── 1. Data availability ──
    section(1, 'DATA AVAILABILITY')
    cur.execute("SELECT count(*) AS n FROM tag_history WHERE \"timestamp\" >= %s", (shift,))
    raw_count = cur.fetchone()['n']
    cur.execute("SELECT count(*) AS n FROM tag_history_archive WHERE archive_hour >= %s", (shift,))
    arc_count = cur.fetchone()['n']
    print(f'  tag_history rows today:         {raw_count:,}')
    print(f'  tag_history_archive rows today: {arc_count:,}')
    source = 'tag_history' if raw_count > 0 else ('tag_history_archive' if arc_count > 0 else 'NO DATA')
    print(f'  Dashboard primary source:       {source}')

    if raw_count == 0 and arc_count == 0:
        print('\n  ** NO HISTORIAN DATA for this period. Dashboard will show empty values. **')
        cur.close()
        conn.close()
        return

    # ── 2. Resolve tag IDs ──
    section(2, 'TAG REGISTRATION')
    cur.execute(
        "SELECT id, tag_name, display_name, unit, COALESCE(is_counter, false) AS is_counter "
        "FROM tags WHERE tag_name = ANY(%s) AND is_active = true",
        (MILL_B_TAGS,),
    )
    tags = {r['tag_name']: r for r in cur.fetchall()}
    print(f'  Found: {len(tags)} / {len(MILL_B_TAGS)} expected Mill B tags')

    missing = set(MILL_B_TAGS) - set(tags.keys())
    if missing:
        print(f'  MISSING: {", ".join(sorted(missing))}')

    # ── 3. Last values ──
    section(3, 'LAST VALUES (KPI cards in Live / historical "last" mode)')
    print(f'  {"Tag":<32} {"Last Value":>14} {"Unit":<6} {"Sample Time"}')
    print(f'  {"-"*82}')
    for tn in sorted(tags.keys()):
        tid = tags[tn]['id']
        cur.execute(
            'SELECT value, "timestamp" FROM tag_history '
            'WHERE tag_id = %s AND "timestamp" >= %s '
            'ORDER BY "timestamp" DESC LIMIT 1',
            (tid, shift),
        )
        row = cur.fetchone()
        if row:
            print(f'  {tn:<32} {fmt(row["value"]):>14} {tags[tn]["unit"] or "":>5}  {row["timestamp"]}')
        else:
            cur.execute(
                'SELECT value, archive_hour FROM tag_history_archive '
                'WHERE tag_id = %s AND archive_hour >= %s '
                'ORDER BY archive_hour DESC LIMIT 1',
                (tid, shift),
            )
            arc_row = cur.fetchone()
            if arc_row:
                print(f'  {tn:<32} {fmt(arc_row["value"]):>14} {tags[tn]["unit"] or "":>5}  {arc_row["archive_hour"]}  (archive)')
            else:
                print(f'  {tn:<32} {"NO DATA":>14}')

    # ── 4. AVG values ──
    section(4, 'AVG / MIN / MAX (bar charts and line charts use AVG)')
    print(f'  {"Tag":<32} {"AVG":>10} {"MIN":>10} {"MAX":>10} {"Samples":>8}')
    print(f'  {"-"*77}')
    for tn in sorted(WIDGET_AGGREGATIONS.keys()):
        if tn not in tags:
            continue
        tid = tags[tn]['id']
        cur.execute(
            'SELECT round(AVG(value)::numeric, 2) AS avg_v, '
            'round(MIN(value)::numeric, 2) AS min_v, '
            'round(MAX(value)::numeric, 2) AS max_v, '
            'count(*) AS cnt '
            'FROM tag_history WHERE tag_id = %s AND "timestamp" >= %s',
            (tid, shift),
        )
        row = cur.fetchone()
        if row and row['cnt'] > 0:
            print(f'  {tn:<32} {fmt(row["avg_v"]):>10} {fmt(row["min_v"]):>10} {fmt(row["max_v"]):>10} {row["cnt"]:>8,}')
        else:
            print(f'  {tn:<32} {"NO DATA":>10}')

    # ── 5. Totalizer check ──
    section(5, 'TOTALIZER CHECK (cumulative counters — dashboard shows last reading)')
    print(f'  {"Tag":<32} {"First Value":>16} {"Last Value":>16} {"Delta Today":>14}')
    print(f'  {"-"*82}')
    for tn in ['mil_b_flour_totalizer', 'mil_b_bran_totalizer', 'mil_b_b1_totalizer']:
        if tn not in tags:
            continue
        tid = tags[tn]['id']
        cur.execute(
            'SELECT value FROM tag_history WHERE tag_id = %s AND "timestamp" >= %s ORDER BY "timestamp" ASC LIMIT 1',
            (tid, shift),
        )
        first = cur.fetchone()
        cur.execute(
            'SELECT value FROM tag_history WHERE tag_id = %s AND "timestamp" >= %s ORDER BY "timestamp" DESC LIMIT 1',
            (tid, shift),
        )
        last = cur.fetchone()
        if first and last:
            delta = last['value'] - first['value']
            print(f'  {tn:<32} {fmt(first["value"], 0):>16} {fmt(last["value"], 0):>16} {fmt(delta, 0):>14}')
        else:
            print(f'  {tn:<32} {"NO DATA":>16}')

    # ── 6. Archive SUM(value_delta) ──
    section(6, 'ARCHIVE SUM(value_delta) for counters')
    print(f'  {"Tag":<32} {"SUM delta":>14} {"Archive rows":>14}')
    print(f'  {"-"*64}')
    for tn in ['mil_b_flour_totalizer', 'mil_b_bran_totalizer', 'mil_b_b1_totalizer']:
        if tn not in tags:
            continue
        tid = tags[tn]['id']
        cur.execute(
            'SELECT round(SUM(COALESCE(value_delta, 0))::numeric, 2) AS sd, count(*) AS n '
            'FROM tag_history_archive WHERE tag_id = %s AND archive_hour >= %s',
            (tid, shift),
        )
        row = cur.fetchone()
        if row:
            print(f'  {tn:<32} {fmt(row["sd"]):>14} {row["n"]:>14,}')
        else:
            print(f'  {tn:<32} {"NO DATA":>14}')

    # ── 7. Aggregation conflict ──
    section(7, 'AGGREGATION CONFLICT CHECK (KPI=last vs Chart=avg)')
    print(f'  These tags appear in both a "last" KPI and an "avg" chart:')
    print(f'  {"Tag":<32} {"LAST":>10} {"AVG":>10} {"Diff":>10} {"%Diff":>8}')
    print(f'  {"-"*77}')
    conflicts = 0
    for tn, aggs in sorted(WIDGET_AGGREGATIONS.items()):
        if aggs['effective'] != 'avg' or tn not in tags:
            continue
        tid = tags[tn]['id']
        cur.execute(
            'SELECT value FROM tag_history WHERE tag_id = %s AND "timestamp" >= %s ORDER BY "timestamp" DESC LIMIT 1',
            (tid, shift),
        )
        last_row = cur.fetchone()
        cur.execute(
            'SELECT round(AVG(value)::numeric, 4) AS avg_v FROM tag_history WHERE tag_id = %s AND "timestamp" >= %s',
            (tid, shift),
        )
        avg_row = cur.fetchone()
        if last_row and avg_row and avg_row['avg_v'] is not None:
            last_v = float(last_row['value'])
            avg_v = float(avg_row['avg_v'])
            diff = abs(last_v - avg_v)
            pct = (diff / abs(avg_v) * 100) if avg_v != 0 else 0
            flag = ' <<<' if pct > 5 else ''
            print(f'  {tn:<32} {fmt(last_v):>10} {fmt(avg_v):>10} {fmt(diff, 4):>10} {pct:>7.1f}%{flag}')
            if pct > 5:
                conflicts += 1

    if conflicts > 0:
        print(f'\n  WARNING: {conflicts} tag(s) have >5% difference between LAST and AVG.')
        print(f'  In "Today" mode, KPI cards show AVG (not last) because chart widgets')
        print(f'  force avg aggregation via collectWidgetTagAggregations() priority.')
    else:
        print(f'\n  OK: All conflicting tags have <5% gap between LAST and AVG.')

    # ── 8. Archive vs raw ──
    section(8, 'ARCHIVE vs RAW LAST VALUE COMPARISON')
    print(f'  {"Tag":<32} {"Raw Last":>12} {"Arc Last":>12} {"Match?":>8}')
    print(f'  {"-"*69}')
    for tn in sorted(WIDGET_AGGREGATIONS.keys()):
        if tn not in tags:
            continue
        tid = tags[tn]['id']
        cur.execute(
            'SELECT value FROM tag_history WHERE tag_id = %s AND "timestamp" >= %s ORDER BY "timestamp" DESC LIMIT 1',
            (tid, shift),
        )
        raw = cur.fetchone()
        cur.execute(
            'SELECT value FROM tag_history_archive WHERE tag_id = %s AND archive_hour >= %s ORDER BY archive_hour DESC LIMIT 1',
            (tid, shift),
        )
        arc = cur.fetchone()
        raw_v = raw['value'] if raw else None
        arc_v = arc['value'] if arc else None
        if raw_v is None or arc_v is None:
            match = 'N/A'
        elif abs(raw_v - arc_v) < 0.01:
            match = 'YES'
        else:
            match = 'NO'
        print(f'  {tn:<32} {fmt(raw_v):>12} {fmt(arc_v):>12} {match:>8}')

    # ── 9. Sample frequency ──
    section(9, 'SAMPLE FREQUENCY (mil_b_job_flowrate per hour)')
    tid = tags.get('mil_b_job_flowrate', {}).get('id')
    if tid:
        cur.execute(
            "SELECT date_trunc('hour', \"timestamp\") AS hour, count(*) AS samples "
            "FROM tag_history WHERE tag_id = %s AND \"timestamp\" >= %s "
            "GROUP BY 1 ORDER BY 1",
            (tid, shift),
        )
        rows = cur.fetchall()
        if rows:
            max_samples = max(r['samples'] for r in rows)
            scale = 50 / max_samples if max_samples > 50 else 1
            for r in rows:
                bar = '#' * int(r['samples'] * scale)
                print(f'  {r["hour"].strftime("%H:%M")}  {r["samples"]:>5} samples  {bar}')
        else:
            print('  No samples found for this period.')
    else:
        print('  Tag mil_b_job_flowrate not found.')

    # ── Summary ──
    header('VERIFICATION COMPLETE')
    print(f'  Data source:  {source}')
    print(f'  Raw samples:  {raw_count:,}')
    print(f'  Archive rows: {arc_count:,}')
    print(f'  Tags found:   {len(tags)} / {len(MILL_B_TAGS)}')
    print(f'  Conflicts:    {conflicts} tag(s) with >5% last-vs-avg gap')
    print()

    cur.close()
    conn.close()


def main():
    parser = argparse.ArgumentParser(description='Verify Hercules dashboard data against PostgreSQL.')
    parser.add_argument('--host', default='127.0.0.1')
    parser.add_argument('--port', type=int, default=5434)
    parser.add_argument('--db', default='dynamic_db_hercules')
    parser.add_argument('--user', default='postgres')
    parser.add_argument('--password', default='')
    parser.add_argument('--shift-start', default=None,
                        help='Override shift start, e.g. "2026-04-03 05:00:00"')
    args = parser.parse_args()

    try:
        run(args.host, args.port, args.db, args.user, args.password, args.shift_start)
    except psycopg2.OperationalError as e:
        print(f'\nERROR: Cannot connect to database: {e}')
        print(f'Make sure PostgreSQL is running on port {args.port}.')
        sys.exit(1)
    except KeyboardInterrupt:
        print('\nAborted.')
        sys.exit(0)


if __name__ == '__main__':
    main()

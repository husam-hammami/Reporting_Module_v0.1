"""
Seed the tags table from a CSV file (e.g. tags.csv).
Idempotent: ON CONFLICT (tag_name) DO UPDATE.
Run from repo root with Docker:
  docker compose exec backend python tools/setup/seed_tags_from_csv.py
  docker compose exec backend python tools/setup/seed_tags_from_csv.py /path/to/tags.csv
"""

import csv
import os
import sys
import psycopg2
from pathlib import Path

# Resolve backend dir and load .env
SCRIPT_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SCRIPT_DIR.parent.parent
for env_path in [BACKEND_DIR / '.env', BACKEND_DIR.parent / '.env']:
    if env_path.exists():
        try:
            from dotenv import load_dotenv
            load_dotenv(env_path)
        except ImportError:
            pass
        break

DB_CONFIG = {
    'dbname': os.getenv('POSTGRES_DB', 'dynamic_db_hercules'),
    'user': os.getenv('POSTGRES_USER', 'postgres'),
    'password': os.getenv('POSTGRES_PASSWORD', 'Hercules'),
    'host': os.getenv('DB_HOST', '127.0.0.1'),
    'port': os.getenv('DB_PORT', '5432'),
}

# Default CSV: try repo root then backend dir (so Docker has backend/tags.csv -> /app/tags.csv)
REPO_ROOT = BACKEND_DIR.parent
DEFAULT_CSV = (REPO_ROOT / 'tags.csv' if (REPO_ROOT / 'tags.csv').exists() else BACKEND_DIR / 'tags.csv')


def _val(s, col):
    s = s.strip() if s else ''
    if s.upper() == 'NULL' or s == '':
        return None
    if col in ('db_number', 'offset', 'bit_position', 'string_length', 'decimal_places'):
        try:
            return int(float(s))
        except ValueError:
            return None
    if col in ('scaling',):
        try:
            return float(s)
        except ValueError:
            return None
    if col in ('byte_swap', 'is_active', 'is_bin_tag', 'is_counter'):
        return s.lower() in ('true', '1', 'yes')
    return s


def row_to_tuple(row, headers):
    d = {}
    for i, h in enumerate(headers):
        if h in ('id', 'created_at', 'updated_at'):
            continue
        d[h] = _val(row[i] if i < len(row) else '', h)
    return d


UPSERT_SQL = """
INSERT INTO tags (
    tag_name, display_name, source_type, db_number, "offset", data_type,
    bit_position, string_length, byte_swap, unit, scaling, decimal_places,
    formula, mapping_name, description, is_active,
    is_bin_tag, activation_tag_name, activation_condition, activation_value, value_formula, is_counter
) VALUES (
    %(tag_name)s, %(display_name)s, %(source_type)s, %(db_number)s, %(offset)s, %(data_type)s,
    %(bit_position)s, %(string_length)s, %(byte_swap)s, %(unit)s, %(scaling)s, %(decimal_places)s,
    %(formula)s, %(mapping_name)s, %(description)s, %(is_active)s,
    %(is_bin_tag)s, %(activation_tag_name)s, %(activation_condition)s, %(activation_value)s, %(value_formula)s, %(is_counter)s
)
ON CONFLICT (tag_name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    source_type = EXCLUDED.source_type,
    db_number = EXCLUDED.db_number,
    "offset" = EXCLUDED."offset",
    data_type = EXCLUDED.data_type,
    bit_position = EXCLUDED.bit_position,
    string_length = EXCLUDED.string_length,
    byte_swap = EXCLUDED.byte_swap,
    unit = EXCLUDED.unit,
    scaling = EXCLUDED.scaling,
    decimal_places = EXCLUDED.decimal_places,
    formula = EXCLUDED.formula,
    mapping_name = EXCLUDED.mapping_name,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    is_bin_tag = EXCLUDED.is_bin_tag,
    activation_tag_name = EXCLUDED.activation_tag_name,
    activation_condition = EXCLUDED.activation_condition,
    activation_value = EXCLUDED.activation_value,
    value_formula = EXCLUDED.value_formula,
    is_counter = EXCLUDED.is_counter,
    updated_at = NOW();
"""


def main():
    csv_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_CSV
    if not csv_path.is_file():
        print(f"CSV not found: {csv_path}")
        sys.exit(1)

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    with open(csv_path, newline='', encoding='utf-8') as f:
        reader = csv.reader(f)
        headers = next(reader)
        count = 0
        for row in reader:
            if not row or not any(cell.strip() for cell in row):
                continue
            try:
                data = row_to_tuple(row, headers)
                if not data.get('tag_name'):
                    continue
                cur.execute(UPSERT_SQL, data)
                count += 1
            except Exception as e:
                print(f"Row error: {row[:3]}... -> {e}")
                raise

    conn.commit()
    print(f"Inserted/updated {count} tags from {csv_path.name}")
    cur.close()
    conn.close()


if __name__ == '__main__':
    main()

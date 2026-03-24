"""
Seed the Default Grains Report template (and optionally all report templates)
from docs/report-templates/ into the report_builder_templates table.

This script lives in docs/Templates/ so template-related tooling is documented
and versioned under docs. Idempotent: updates existing templates by name.

Usage (from repo root):
  # Seed only the Default Grains template (Grain_Silos.json)
  python docs/Templates/seed_default_grains_report.py

  # Seed a specific template file
  python docs/Templates/seed_default_grains_report.py docs/report-templates/Grain_Silos.json

  # Seed all JSON templates in docs/report-templates/
  python docs/Templates/seed_default_grains_report.py --all
"""

import os
import sys
import json
import glob
import argparse

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..'))
REPORT_TEMPLATES_DIR = os.path.join(REPO_ROOT, 'docs', 'report-templates')
DEFAULT_GRAINS_FILE = os.path.join(REPORT_TEMPLATES_DIR, 'Grain_Silos.json')

# Load .env from backend/tools/setup or repo root
for env_path in [
    os.path.join(REPO_ROOT, 'backend', 'tools', 'setup', '.env'),
    os.path.join(REPO_ROOT, 'backend', '.env'),
    os.path.join(REPO_ROOT, '.env'),
]:
    if os.path.isfile(env_path):
        try:
            from dotenv import load_dotenv
            load_dotenv(env_path)
        except ImportError:
            pass
        break

try:
    import psycopg2
except ImportError:
    print("  ERROR: psycopg2 is required. Install with: pip install psycopg2-binary")
    sys.exit(1)


def get_db_config():
    return {
        'dbname': os.getenv('POSTGRES_DB', 'dynamic_db_hercules'),
        'user': os.getenv('POSTGRES_USER', 'postgres'),
        'password': os.getenv('POSTGRES_PASSWORD', ''),
        'host': os.getenv('DB_HOST', '127.0.0.1'),
        'port': os.getenv('DB_PORT', '5432'),
    }


def upsert_template(cur, template):
    """Insert or update a single report template by name."""
    name = template['name']
    description = template.get('description', '')
    is_default = template.get('is_default', False)
    layout_config = template['layout_config']

    cur.execute("SELECT id FROM report_builder_templates WHERE name = %s", (name,))
    row = cur.fetchone()

    if row:
        template_id = row[0]
        cur.execute("""
            UPDATE report_builder_templates
            SET layout_config = %s::jsonb, description = %s, is_active = true, is_default = %s
            WHERE id = %s
        """, (json.dumps(layout_config), description, is_default, template_id))
        action = 'Updated'
    else:
        cur.execute("""
            INSERT INTO report_builder_templates (name, description, layout_config, is_active, is_default)
            VALUES (%s, %s, %s::jsonb, true, %s)
            RETURNING id
        """, (name, description, json.dumps(layout_config), is_default))
        template_id = cur.fetchone()[0]
        action = 'Created'

    widget_count = len(layout_config.get('widgets', []))
    print(f"  {action} '{name}' (id={template_id}, {widget_count} widgets, default={is_default})")
    return template_id


def load_template_file(filepath):
    """Load and validate a single template JSON file."""
    with open(filepath, 'r', encoding='utf-8') as f:
        template = json.load(f)

    if 'name' not in template:
        raise ValueError(f"Template file {filepath} missing 'name' field")
    if 'layout_config' not in template:
        raise ValueError(f"Template file {filepath} missing 'layout_config' field")

    return template


def main():
    parser = argparse.ArgumentParser(description='Seed Default Grains (and optionally all) report templates.')
    parser.add_argument('files', nargs='*', help='Template JSON file path(s); if omitted, seeds Grain_Silos.json only')
    parser.add_argument('--all', action='store_true', help='Seed all .json files in docs/report-templates/')
    args = parser.parse_args()

    if args.all:
        if not os.path.isdir(REPORT_TEMPLATES_DIR):
            print(f"  No directory found at {REPORT_TEMPLATES_DIR}")
            return 1
        files = sorted(glob.glob(os.path.join(REPORT_TEMPLATES_DIR, '*.json')))
    elif args.files:
        files = [os.path.abspath(f) for f in args.files]
    else:
        # Default: seed only the Default Grains template
        if not os.path.isfile(DEFAULT_GRAINS_FILE):
            print(f"  Default Grains template not found at {DEFAULT_GRAINS_FILE}")
            return 1
        files = [DEFAULT_GRAINS_FILE]

    if not files:
        print("  No template files to seed.")
        return 0

    print(f"  Seeding {len(files)} report template(s) from docs/report-templates/")

    db_config = get_db_config()
    conn = psycopg2.connect(**db_config)
    cur = conn.cursor()

    seeded = 0
    for filepath in files:
        filename = os.path.basename(filepath)
        if not os.path.isfile(filepath):
            print(f"  SKIP {filename}: file not found")
            continue
        try:
            template = load_template_file(filepath)
            upsert_template(cur, template)
            seeded += 1
        except Exception as e:
            print(f"  ERROR seeding {filename}: {e}")

    conn.commit()
    cur.close()
    conn.close()
    print(f"  Done: seeded {seeded}/{len(files)} report template(s)")
    return 0 if seeded else 1


if __name__ == '__main__':
    sys.exit(main())

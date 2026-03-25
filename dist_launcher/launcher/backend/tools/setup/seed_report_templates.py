"""
Seed report templates from JSON files in docs/report-templates/.

Reads every *.json file in the templates folder and upserts into
report_builder_templates. Idempotent: updates existing templates by name.

Usage:
  # Standalone — seed all templates from docs/report-templates/
  python backend/tools/setup/seed_report_templates.py

  # Seed a single template
  python backend/tools/setup/seed_report_templates.py docs/report-templates/Grain_Silos.json
"""

import os
import sys
import json
import glob
import psycopg2
from dotenv import load_dotenv

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, '..', '..', '..'))
TEMPLATES_DIR = os.path.join(REPO_ROOT, 'docs', 'report-templates')

load_dotenv(os.path.join(SCRIPT_DIR, '.env'))

DB_CONFIG = {
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

    # Validate required fields
    if 'name' not in template:
        raise ValueError(f"Template file {filepath} missing 'name' field")
    if 'layout_config' not in template:
        raise ValueError(f"Template file {filepath} missing 'layout_config' field")

    return template


def main():
    # Determine which files to load
    if len(sys.argv) > 1:
        # Specific file(s) passed as arguments
        files = sys.argv[1:]
    else:
        # All JSON files in templates directory
        if not os.path.isdir(TEMPLATES_DIR):
            print(f"  No templates directory found at {TEMPLATES_DIR}")
            print(f"  Create it and add .json template files to seed reports.")
            return
        files = sorted(glob.glob(os.path.join(TEMPLATES_DIR, '*.json')))

    if not files:
        print(f"  No .json files found in {TEMPLATES_DIR}")
        return

    print(f"  Found {len(files)} template file(s)")

    conn = psycopg2.connect(**DB_CONFIG)
    cur = conn.cursor()

    seeded = 0
    for filepath in files:
        filename = os.path.basename(filepath)
        try:
            template = load_template_file(filepath)
            upsert_template(cur, template)
            seeded += 1
        except Exception as e:
            print(f"  ERROR seeding {filename}: {e}")

    conn.commit()
    cur.close()
    conn.close()
    print(f"  Seeded {seeded}/{len(files)} report template(s)")


if __name__ == '__main__':
    main()

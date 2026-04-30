# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for hercules-backend.exe (desktop app).

Build from backend/ directory:
    python -m PyInstaller hercules.spec --noconfirm
"""
import os
import glob
from PyInstaller.utils.hooks import collect_all, collect_submodules

block_cipher = None

# Collect reportlab, xhtml2pdf, matplotlib fully (data files + submodules)
reportlab_datas, reportlab_binaries, reportlab_hiddenimports = collect_all('reportlab')
xhtml2pdf_datas, xhtml2pdf_binaries, xhtml2pdf_hiddenimports = collect_all('xhtml2pdf')
matplotlib_datas, matplotlib_binaries, matplotlib_hiddenimports = collect_all('matplotlib')

# Locate snap7.dll in the python-snap7 package
snap7_dll = []
try:
    import snap7
    snap7_dir = os.path.dirname(snap7.__file__)
    for dll in glob.glob(os.path.join(snap7_dir, '*.dll')):
        snap7_dll.append((dll, '.'))
    # Also check lib subdirectory
    for dll in glob.glob(os.path.join(snap7_dir, 'lib', '*.dll')):
        snap7_dll.append((dll, '.'))
except ImportError:
    print("WARNING: snap7 not found — snap7.dll will NOT be bundled")


a = Analysis(
    ['desktop_entry.py'],
    pathex=['.'],
    binaries=snap7_dll + reportlab_binaries + xhtml2pdf_binaries,
    datas=[
        ('frontend/dist', 'frontend/dist'),
        ('config', 'config'),
        ('migrations', 'migrations'),
        ('version.txt', '.'),
        ('release_branch.txt', '.'),
    ] + reportlab_datas + xhtml2pdf_datas + matplotlib_datas,
    hiddenimports=[
        # eventlet (all hubs must be importable — eventlet probes them at init)
        'eventlet.hubs.selects',
        'eventlet.hubs.epolls',
        'eventlet.hubs.kqueue',
        'engineio.async_drivers.eventlet',

        # Flask-SocketIO
        'flask_socketio',
        'engineio',
        'socketio',

        # Blueprints
        'tags_bp',
        'tag_groups_bp',
        'live_monitor_bp',
        'historian_bp',
        'kpi_config_bp',
        'report_builder_bp',
        'mappings_bp',
        'license_bp',
        'branding_bp',
        'distribution_bp',
        'updates_bp',
        'hercules_ai_bp',
        'ai_provider',
        'ai_prompts',
        'ai_chart_generator',
        'ai_kpi_scorer',
        'matplotlib',
        'matplotlib.backends.backend_agg',
        'anthropic',
        'openai',

        # Workers
        'workers.historian_worker',
        'workers.dynamic_monitor_worker',
        'workers.dynamic_archive_worker',
        'workers.report_order_worker',
        'workers.sec_backfill',

        # Plan 5 — ROI Genius Money + Forecast layers
        'ai_money',
        'ai_money.db',
        'ai_money.sec',
        'ai_money.pf_penalty',
        'ai_money.cost',
        'ai_money.revenue',
        'ai_money.savings_ledger',
        'ai_money.levers',
        'ai_money.payload_builder',
        'ai_forecast',
        'ai_forecast.filters',
        'ai_forecast.shift_pace',
        'ai_forecast.daily_bill',
        'ai_forecast.trend_slope',
        'ai_forecast.sec_drift',
        'ai_forecast.anomaly',
        'ai_forecast.accuracy_closer',
        'ai_forecast.trust_score',
        'numpy',

        # Utils
        'utils.tag_value_cache',
        'utils.plc_parser',
        'utils.tag_reader',
        'utils.kpi_engine',
        'utils.kpi_formula',
        'utils.historian_helpers',
        'utils.dynamic_tables',
        'utils.layout_tag_extractor',
        'utils.section_data_resolver',
        'utils.order_tracker',

        # PLC
        'plc_utils',
        'plc_config',
        'plc_emulator',
        'plc_data_source',

        # Config modules
        'config_paths',
        'demo_mode',
        'smtp_config',
        'shifts_config',
        'scheduler',
        'machine_id',
        'distribution_engine',

        # Report PDF generation
        'report_mailer',
        'xhtml2pdf',
        'reportlab',
        'reportlab.graphics.barcode',
        'reportlab.graphics.barcode.code128',
        'reportlab.graphics.barcode.code39',
        'reportlab.graphics.barcode.code93',
        'reportlab.graphics.barcode.common',

        # Libraries
        'psycopg2',
        'psycopg2.extras',
        'snap7',
        'apscheduler',
        'apscheduler.schedulers.background',
        'apscheduler.triggers.cron',
        'asteval',
        'itsdangerous',
        'dotenv',
        'flask_login',
        'flask_cors',
        'werkzeug',
        'werkzeug.security',
        'dns',
        'dns.resolver',
    ] + reportlab_hiddenimports + xhtml2pdf_hiddenimports + matplotlib_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=['pyinstaller_runtime_hook.py'],
    excludes=[
        'gunicorn',
    ],
    noarchive=False,
    optimize=0,
)

pyz = PYZ(a.pure, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='hercules-backend',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='hercules-backend',
)

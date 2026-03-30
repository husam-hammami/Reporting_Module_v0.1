# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec for hercules-backend.exe (desktop app).

Build from backend/ directory:
    python -m PyInstaller hercules.spec --noconfirm
"""
import os
import glob

block_cipher = None

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
    binaries=snap7_dll,
    datas=[
        ('frontend/dist', 'frontend/dist'),
        ('config', 'config'),
        ('migrations', 'migrations'),
    ],
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

        # Workers
        'workers.historian_worker',
        'workers.dynamic_monitor_worker',
        'workers.dynamic_archive_worker',

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
    ],
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
    console=True,
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

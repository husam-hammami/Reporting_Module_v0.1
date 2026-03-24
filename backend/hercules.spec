# -*- mode: python ; coding: utf-8 -*-
"""
PyInstaller spec file for Hercules Reporting Module desktop backend.

Build with:
    cd backend
    python -m PyInstaller hercules.spec --noconfirm

Produces: dist/hercules-backend/ (one-dir mode)
"""

import os
import sys
from PyInstaller.utils.hooks import collect_submodules

block_cipher = None

# Collect all eventlet submodules (monkey-patching needs many internal modules)
eventlet_hiddenimports = collect_submodules('eventlet')
engineio_hiddenimports = collect_submodules('engineio')
socketio_hiddenimports = collect_submodules('socketio')

# Application hidden imports (dynamically loaded modules)
app_hiddenimports = [
    # Blueprints
    'tags_bp', 'tag_groups_bp', 'live_monitor_bp', 'historian_bp',
    'kpi_config_bp', 'report_builder_bp', 'mappings_bp', 'license_bp', 'branding_bp',
    # Workers
    'workers.historian_worker', 'workers.dynamic_monitor_worker', 'workers.dynamic_archive_worker',
    # Utils
    'utils.tag_value_cache', 'utils.plc_parser', 'utils.tag_reader',
    'utils.dynamic_tables', 'utils.historian_helpers', 'utils.kpi_engine',
    'utils.kpi_formula', 'utils.layout_tag_extractor', 'utils.order_tracker',
    'utils.section_data_resolver',
    # PLC
    'plc_utils', 'plc_config', 'plc_emulator', 'plc_data_source',
    # Config
    'config_paths', 'demo_mode', 'smtp_config', 'shifts_config',
    'scheduler', 'report_mailer', 'machine_id',
    # Libraries
    'psycopg2', 'psycopg2.extras', 'psycopg2.extensions',
    'xhtml2pdf', 'reportlab', 'reportlab.lib.pagesizes',
    'apscheduler', 'apscheduler.schedulers.background',
    'asteval', 'itsdangerous',
    # Flask-SocketIO async driver
    'engineio.async_drivers.eventlet',
    # eventlet hubs — Windows only needs selects
    'eventlet.hubs.selects',
]

all_hiddenimports = (
    app_hiddenimports +
    eventlet_hiddenimports +
    engineio_hiddenimports +
    socketio_hiddenimports
)

# Find snap7.dll if python-snap7 is installed
snap7_binaries = []
try:
    import snap7
    snap7_dir = os.path.dirname(snap7.__file__)
    for fname in os.listdir(snap7_dir):
        if fname.lower().startswith('snap7') and fname.lower().endswith('.dll'):
            snap7_binaries.append((os.path.join(snap7_dir, fname), '.'))
except ImportError:
    pass

a = Analysis(
    ['desktop_entry.py'],
    pathex=['.'],
    binaries=snap7_binaries,
    datas=[
        ('frontend/dist', 'frontend/dist'),   # Built React app
        ('config', 'config'),                   # Default config templates
        ('migrations', 'migrations'),           # SQL migration files
    ],
    hiddenimports=all_hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=['pyinstaller_runtime_hook.py'],
    excludes=[
        'tkinter', 'matplotlib', 'scipy', 'numpy',
        'PIL', 'cv2', 'tensorflow', 'torch',
    ],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

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
    console=True,  # Keep console for debugging; set to False for release
    icon='../Hercules_New.ico',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='hercules-backend',
)

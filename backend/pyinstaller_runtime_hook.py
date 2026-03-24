"""
PyInstaller runtime hook — ensures eventlet monkey-patching runs
before any stdlib modules are imported by the frozen application.

Register this in hercules.spec via: runtime_hooks=['pyinstaller_runtime_hook.py']
"""

import eventlet
eventlet.monkey_patch()

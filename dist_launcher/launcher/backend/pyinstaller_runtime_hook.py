"""
PyInstaller runtime hook — runs BEFORE any user code.
Ensures eventlet monkey-patching happens before PyInstaller's bootloader
loads real stdlib modules (socket, ssl, threading).
"""
import os
os.environ['EVENTLET_NO_GREENDNS'] = 'yes'
import eventlet
eventlet.monkey_patch()

"""
Hardware fingerprint for license binding.

Generates a deterministic machine ID: SHA-256(hostname + sorted_MACs + disk_serial).
Both Python and Node.js (Electron main.js) must produce identical output.

Uses PowerShell for disk serial (wmic is deprecated on Windows 11+).
"""
import hashlib
import os
import platform
import socket
import subprocess
import uuid
import logging

logger = logging.getLogger(__name__)

_MACHINE_ID_CACHE = None
_DISK_SERIAL_CACHE = None

# Prevent flashing console windows when the backend is spawned from Electron (windowsHide).
_SUBPROCESS_KWARGS = {}
if platform.system() == 'Windows':
    _SUBPROCESS_KWARGS['creationflags'] = getattr(subprocess, 'CREATE_NO_WINDOW', 0x08000000)


def _run_hidden(cmd, timeout=10):
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        **_SUBPROCESS_KWARGS,
    )


def _get_sorted_macs():
    """Get MAC address from uuid.getnode(), formatted as lowercase hex with colons."""
    node = uuid.getnode()
    mac = ":".join(f"{(node >> i) & 0xFF:02x}" for i in range(40, -1, -8))
    return mac


def _get_disk_serial():
    """Get the first physical disk serial number via PowerShell (Windows).
    Returns empty string on failure or non-Windows platforms."""
    global _DISK_SERIAL_CACHE
    if _DISK_SERIAL_CACHE is not None:
        return _DISK_SERIAL_CACHE

    if platform.system() != 'Windows':
        _DISK_SERIAL_CACHE = ''
        return _DISK_SERIAL_CACHE

    try:
        result = _run_hidden([
            'powershell', '-NoProfile', '-Command',
            '(Get-CimInstance Win32_DiskDrive | Select-Object -First 1).SerialNumber',
        ])
        serial = result.stdout.strip()
        _DISK_SERIAL_CACHE = serial if serial and serial.lower() != 'none' else ''
    except Exception as e:
        logger.warning("machine_id: disk serial lookup failed: %s", e)
        _DISK_SERIAL_CACHE = ''
    return _DISK_SERIAL_CACHE


def get_machine_id():
    """Return deterministic SHA-256 hex digest identifying this machine (cached per process)."""
    global _MACHINE_ID_CACHE
    if _MACHINE_ID_CACHE is not None:
        return _MACHINE_ID_CACHE

    hostname = socket.gethostname()
    mac = _get_sorted_macs()
    disk_serial = _get_disk_serial()

    raw = f"{hostname}{mac}{disk_serial}"
    _MACHINE_ID_CACHE = hashlib.sha256(raw.encode('utf-8')).hexdigest()
    return _MACHINE_ID_CACHE


def get_machine_info():
    """Return a dict of rich machine information for the license registration payload."""
    disk_serial = _get_disk_serial()
    info = {
        'machine_id': get_machine_id(),
        'hostname': socket.gethostname(),
        'mac_address': _get_sorted_macs(),
        'os_version': f"{platform.system()} {platform.version()}",
        'disk_serial': disk_serial,
    }

    try:
        info['ip_address'] = socket.gethostbyname(socket.gethostname())
    except Exception:
        info['ip_address'] = ''

    if platform.system() == 'Windows':
        try:
            result = _run_hidden([
                'powershell', '-NoProfile', '-Command',
                '(Get-CimInstance Win32_Processor | Select-Object -First 1).Name',
            ])
            info['cpu_info'] = result.stdout.strip()
        except Exception:
            info['cpu_info'] = platform.processor()

        try:
            result = _run_hidden([
                'powershell', '-NoProfile', '-Command',
                '[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)',
            ])
            info['ram_gb'] = float(result.stdout.strip())
        except Exception:
            info['ram_gb'] = 0.0
    else:
        info['cpu_info'] = platform.processor()
        info['ram_gb'] = 0.0

    return info


if __name__ == '__main__':
    import json
    info = get_machine_info()
    print(json.dumps(info, indent=2))

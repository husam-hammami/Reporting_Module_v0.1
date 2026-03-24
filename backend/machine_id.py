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


def _get_sorted_macs():
    """Get MAC address from uuid.getnode(), formatted as lowercase hex with colons."""
    node = uuid.getnode()
    mac = ":".join(f"{(node >> i) & 0xFF:02x}" for i in range(40, -1, -8))
    return mac


def _get_disk_serial():
    """Get the first physical disk serial number via PowerShell (Windows).
    Returns empty string on failure or non-Windows platforms."""
    if platform.system() != 'Windows':
        return ''
    try:
        result = subprocess.run(
            [
                'powershell', '-NoProfile', '-Command',
                '(Get-CimInstance Win32_DiskDrive | Select-Object -First 1).SerialNumber'
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        serial = result.stdout.strip()
        return serial if serial and serial.lower() != 'none' else ''
    except Exception as e:
        logger.warning("machine_id: disk serial lookup failed: %s", e)
        return ''


def get_machine_id():
    """Return deterministic SHA-256 hex digest identifying this machine."""
    hostname = socket.gethostname()
    mac = _get_sorted_macs()
    disk_serial = _get_disk_serial()

    raw = f"{hostname}{mac}{disk_serial}"
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()


def get_machine_info():
    """Return a dict of rich machine information for the license registration payload."""
    info = {
        'machine_id': get_machine_id(),
        'hostname': socket.gethostname(),
        'mac_address': _get_sorted_macs(),
        'os_version': f"{platform.system()} {platform.version()}",
        'disk_serial': _get_disk_serial(),
    }

    try:
        info['ip_address'] = socket.gethostbyname(socket.gethostname())
    except Exception:
        info['ip_address'] = ''

    if platform.system() == 'Windows':
        try:
            result = subprocess.run(
                ['powershell', '-NoProfile', '-Command',
                 '(Get-CimInstance Win32_Processor | Select-Object -First 1).Name'],
                capture_output=True, text=True, timeout=10,
            )
            info['cpu_info'] = result.stdout.strip()
        except Exception:
            info['cpu_info'] = platform.processor()

        try:
            result = subprocess.run(
                ['powershell', '-NoProfile', '-Command',
                 '[math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)'],
                capture_output=True, text=True, timeout=10,
            )
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

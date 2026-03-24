"""
Hardware fingerprint generator for license enforcement.

Generates a deterministic machine ID: SHA-256(hostname + sorted_MACs + disk_serial).
Used by both Python (defense-in-depth license check) and Node.js (Electron license gate).
Both implementations MUST produce identical output for the same machine.
"""

import hashlib
import platform
import socket
import subprocess
import uuid
import logging

logger = logging.getLogger(__name__)


def _get_mac_addresses():
    """Get MAC address from uuid.getnode() as a hex string."""
    mac = uuid.getnode()
    mac_str = ':'.join(f'{(mac >> i) & 0xff:02x}' for i in range(0, 48, 8))
    return mac_str


def _get_disk_serial():
    """Get primary disk serial number. Uses PowerShell on Windows, lsblk on Linux."""
    try:
        if platform.system() == 'Windows':
            result = subprocess.run(
                ['powershell', '-Command',
                 '(Get-CimInstance Win32_DiskDrive | Select-Object -First 1).SerialNumber'],
                capture_output=True, text=True, timeout=10
            )
            serial = result.stdout.strip()
            if serial:
                return serial
        else:
            # Linux fallback (for testing)
            result = subprocess.run(
                ['lsblk', '-ndo', 'SERIAL'],
                capture_output=True, text=True, timeout=10
            )
            serial = result.stdout.strip().split('\n')[0].strip()
            if serial:
                return serial
    except Exception as e:
        logger.warning("Failed to get disk serial: %s", e)
    return 'unknown'


def get_machine_id():
    """Generate deterministic SHA-256 machine fingerprint."""
    hostname = socket.gethostname()
    mac = _get_mac_addresses()
    disk_serial = _get_disk_serial()

    raw = f"{hostname}{mac}{disk_serial}"
    machine_id = hashlib.sha256(raw.encode('utf-8')).hexdigest()
    return machine_id


def get_machine_info():
    """Get full machine info dict for license registration payload."""
    import os
    info = {
        'machine_id': get_machine_id(),
        'hostname': socket.gethostname(),
        'mac_address': _get_mac_addresses(),
        'disk_serial': _get_disk_serial(),
        'os_version': f"{platform.system()} {platform.release()} {platform.version()}",
    }
    try:
        info['cpu_info'] = platform.processor() or 'unknown'
    except Exception:
        info['cpu_info'] = 'unknown'
    try:
        import psutil
        info['ram_gb'] = round(psutil.virtual_memory().total / (1024 ** 3), 1)
    except ImportError:
        # psutil not available — skip RAM info
        info['ram_gb'] = None
    return info


if __name__ == '__main__':
    print(f"Machine ID: {get_machine_id()}")
    import json
    print(json.dumps(get_machine_info(), indent=2))

"""
License module entitlements — Digital Twin and Hercules AI per machine.

Resolves features from (in order): in-memory cache, Electron license_cache.json,
cloud api.herculesv2.app license/status, local licenses row.
Avoids spawning PowerShell when Electron cache already has features + machine_id.
"""

import json
import logging
import os
import ssl
import time
import urllib.error
import urllib.request
from datetime import date, datetime

logger = logging.getLogger(__name__)

LICENSE_SERVER = os.environ.get('HERCULES_LICENSE_SERVER', 'https://api.herculesv2.app')
CACHE_TTL_SEC = 300

_CACHE = {'at': 0.0, 'features': None, 'source': 'default'}
_FILE_CACHE = {'at': 0.0, 'data': None}

_LICENSE_COLS = (
    'status', 'expiry', 'enable_digital_twin', 'enable_atlas_ai'
)


def _license_cache_path():
    appdata = os.environ.get('APPDATA', os.path.expanduser('~'))
    return os.path.join(appdata, 'Hercules', 'license_cache.json')


def _default_features():
    return {'digital_twin': False, 'atlas_ai': False}


def _effective_status(row):
    status = row.get('status') or 'pending'
    expiry = row.get('expiry')
    if status == 'approved' and expiry:
        expiry_date = expiry if isinstance(expiry, date) else datetime.strptime(str(expiry)[:10], '%Y-%m-%d').date()
        if expiry_date < date.today():
            return 'expired'
    return status


def features_from_license_row(row):
    """Map a licenses table row (or API payload) to feature flags."""
    if not row:
        return dict(_default_features())
    if _effective_status(row) != 'approved':
        return dict(_default_features())
    return {
        'digital_twin': bool(row.get('enable_digital_twin', True)),
        'atlas_ai': bool(row.get('enable_atlas_ai', True)),
    }


def _load_license_cache_file():
    """Read Electron license_cache.json once per few seconds (no subprocess)."""
    now = time.time()
    if _FILE_CACHE['data'] is not None and (now - _FILE_CACHE['at']) < 30:
        return _FILE_CACHE['data']

    path = _license_cache_path()
    data = None
    if os.path.isfile(path):
        try:
            with open(path, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception as e:
            logger.debug('license cache read failed: %s', e)

    _FILE_CACHE['at'] = now
    _FILE_CACHE['data'] = data
    return data


def _read_electron_cache():
    data = _load_license_cache_file()
    if not data or data.get('status') != 'approved':
        return None
    expiry = data.get('expiry')
    if expiry:
        expiry_date = datetime.strptime(str(expiry)[:10], '%Y-%m-%d').date()
        if expiry_date < date.today():
            return None
    feats = data.get('features')
    if isinstance(feats, dict):
        return {
            'digital_twin': bool(feats.get('digital_twin', False)),
            'atlas_ai': bool(feats.get('atlas_ai', False)),
        }
    return None


def _machine_id_without_powershell():
    """Prefer machine_id from Electron cache; fall back to cached get_machine_id() once."""
    data = _load_license_cache_file()
    if data:
        mid = (data.get('machine_id') or '').strip()
        if mid:
            return mid
    try:
        from machine_id import get_machine_id
        return get_machine_id()
    except Exception:
        return None


def _fetch_cloud_status(machine_id):
    url = f'{LICENSE_SERVER.rstrip("/")}/api/license/status?machine_id={urllib.request.quote(machine_id)}'
    try:
        ctx = ssl.create_default_context()
        req = urllib.request.Request(url, method='GET', headers={
            'User-Agent': 'HerculesBackend/1.0',
            'ngrok-skip-browser-warning': 'true',
        })
        with urllib.request.urlopen(req, timeout=8, context=ctx) as resp:
            payload = json.loads(resp.read().decode('utf-8'))
        feats = payload.get('features')
        if isinstance(feats, dict):
            return {
                'digital_twin': bool(feats.get('digital_twin', False)),
                'atlas_ai': bool(feats.get('atlas_ai', False)),
            }
        if payload.get('status') == 'approved':
            return {'digital_twin': True, 'atlas_ai': True}
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        logger.debug('cloud license status HTTP %s', e.code)
    except Exception as e:
        logger.debug('cloud license status failed: %s', e)
    return None


def _fetch_local_license_row(machine_id):
    try:
        import sys
        if 'app' not in sys.modules:
            return None
        get_conn = getattr(sys.modules['app'], 'get_db_connection', None)
        if not get_conn:
            return None
        from contextlib import closing
        from psycopg2.extras import RealDictCursor

        with closing(get_conn()) as conn:
            actual = conn._conn if hasattr(conn, '_conn') else conn
            cur = actual.cursor(cursor_factory=RealDictCursor)
            try:
                cur.execute(
                    f"SELECT {_LICENSE_COLS[0]}, {_LICENSE_COLS[1]}, "
                    f"{_LICENSE_COLS[2]}, {_LICENSE_COLS[3]} "
                    "FROM licenses WHERE machine_id = %s",
                    (machine_id,),
                )
            except Exception:
                cur.execute(
                    "SELECT status, expiry FROM licenses WHERE machine_id = %s",
                    (machine_id,),
                )
            row = cur.fetchone()
            if row:
                return features_from_license_row(row)
    except Exception as e:
        logger.debug('local license row lookup failed: %s', e)
    return None


def get_entitlements(force_refresh=False):
    """
    Return (features dict, source str).
    source: dev | cache | cloud | local | default
    """
    global _CACHE
    now = time.time()
    if not force_refresh and _CACHE['features'] is not None and (now - _CACHE['at']) < CACHE_TTL_SEC:
        return _CACHE['features'], _CACHE['source']

    if os.environ.get('DEV_MODE') == '1' or os.environ.get('FLASK_ENV') == 'development':
        feats = {'digital_twin': True, 'atlas_ai': True}
        _CACHE = {'at': now, 'features': feats, 'source': 'dev'}
        return feats, 'dev'

    # Fast path: Electron wrote features at startup (no PowerShell).
    cached = _read_electron_cache()
    if cached is not None:
        _CACHE = {'at': now, 'features': cached, 'source': 'cache'}
        return cached, 'cache'

    machine_id = _machine_id_without_powershell()
    if machine_id:
        cloud = _fetch_cloud_status(machine_id)
        if cloud is not None:
            _CACHE = {'at': now, 'features': cloud, 'source': 'cloud'}
            return cloud, 'cloud'

        local = _fetch_local_license_row(machine_id)
        if local is not None:
            _CACHE = {'at': now, 'features': local, 'source': 'local'}
            return local, 'local'

    feats = _default_features()
    _CACHE = {'at': now, 'features': feats, 'source': 'default'}
    return feats, 'default'


def is_atlas_ai_enabled():
    features, _ = get_entitlements()
    return bool(features.get('atlas_ai'))


def is_digital_twin_enabled():
    features, _ = get_entitlements()
    return bool(features.get('digital_twin'))


def invalidate_entitlements_cache():
    global _CACHE, _FILE_CACHE
    _CACHE = {'at': 0.0, 'features': None, 'source': 'default'}
    _FILE_CACHE = {'at': 0.0, 'data': None}

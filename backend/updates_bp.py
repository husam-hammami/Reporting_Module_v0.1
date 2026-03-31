"""
Updates Blueprint
=================
API for checking available software updates from GitHub Releases.
Each deployment knows its own branch (via release_branch.txt or RELEASE_BRANCH env var).
Releases are filtered by branch-prefixed tags (e.g. salalah_mill_b-v1.0.42).
"""

import json
import logging
import os
import ssl
import urllib.request
import urllib.error

from flask import Blueprint, jsonify
from flask_login import login_required

logger = logging.getLogger(__name__)

updates_bp = Blueprint('updates_bp', __name__)

GITHUB_REPO = "husam-hammami/Reporting_Module_v0.1"
GITHUB_API = f"https://api.github.com/repos/{GITHUB_REPO}/releases"

# Resolve paths relative to the backend directory (works frozen or not)
_BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
_VERSION_FILE = os.path.join(_BACKEND_DIR, 'version.txt')
_BRANCH_FILE = os.path.join(_BACKEND_DIR, 'release_branch.txt')


def _get_local_version():
    try:
        with open(_VERSION_FILE, encoding='utf-8') as f:
            return f.read().strip()
    except FileNotFoundError:
        return '0.0.0'


def _get_release_branch():
    """Read from release_branch.txt (written by CI) or fall back to env var."""
    try:
        with open(_BRANCH_FILE, encoding='utf-8') as f:
            return f.read().strip()
    except FileNotFoundError:
        pass
    return os.environ.get('RELEASE_BRANCH', 'main')


def _branch_slug(branch):
    return branch.replace('/', '-').lower()


def _version_tuple(v):
    return tuple(int(x) for x in v.replace('v', '').split('.'))


def _ssl_context():
    ctx = ssl.create_default_context()
    try:
        ctx.load_default_certs()
    except Exception:
        pass
    if not ctx.get_ca_certs():
        ctx = ssl._create_unverified_context()
    return ctx


def _fetch_releases():
    """Fetch recent releases from GitHub API."""
    req = urllib.request.Request(
        GITHUB_API + '?per_page=20',
        headers={
            'User-Agent': 'HerculesBackend/1.0',
            'Accept': 'application/vnd.github+json',
        },
    )
    ctx = _ssl_context()
    with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
        return json.loads(resp.read().decode('utf-8'))


@updates_bp.route('/settings/version', methods=['GET'])
def get_version():
    """Return the current app version and branch (lightweight, no GitHub call)."""
    return jsonify({
        'version': _get_local_version(),
        'branch': _get_release_branch(),
    }), 200


@updates_bp.route('/settings/updates/check', methods=['GET'])
@login_required
def check_for_updates():
    """Check GitHub Releases for a newer version matching this branch."""
    local_ver = _get_local_version()
    branch = _get_release_branch()
    slug = _branch_slug(branch)

    try:
        releases = _fetch_releases()
    except Exception as e:
        logger.warning("Update check failed (GitHub unreachable): %s", e)
        return jsonify({
            'current_version': local_ver,
            'branch': branch,
            'update_available': False,
            'error': 'Could not reach update server',
        }), 200

    # Find the latest release whose tag starts with this branch's slug
    prefix = f"{slug}-v"
    latest = None
    for rel in releases:
        tag = rel.get('tag_name', '')
        if not tag.startswith(prefix):
            continue
        ver_str = tag[len(prefix):]
        try:
            ver = _version_tuple(ver_str)
        except (ValueError, AttributeError):
            continue
        if latest is None or ver > _version_tuple(latest['version']):
            # Find the installer exe asset
            download_url = None
            for asset in rel.get('assets', []):
                name = asset.get('name', '')
                if name.endswith('.exe') and not name.endswith('.blockmap'):
                    download_url = asset['browser_download_url']
                    break
            latest = {
                'version': ver_str,
                'tag': tag,
                'download_url': download_url,
                'release_name': rel.get('name', ''),
                'published_at': rel.get('published_at', ''),
                'body': rel.get('body', ''),
            }

    if latest and _version_tuple(latest['version']) > _version_tuple(local_ver):
        return jsonify({
            'current_version': local_ver,
            'branch': branch,
            'update_available': True,
            'latest': latest,
        }), 200

    return jsonify({
        'current_version': local_ver,
        'branch': branch,
        'update_available': False,
    }), 200

import eventlet
eventlet.monkey_patch()  # Required for eventlet to work with standard library
import os
import logging
import webbrowser
import json
from flask import Flask, jsonify, request, render_template, redirect, url_for, flash
from flask_login import LoginManager, UserMixin, login_user, login_required, logout_user, current_user
from werkzeug.security import generate_password_hash, check_password_hash
from contextlib import closing
import sys
sys.path.insert(0, os.path.abspath(os.path.dirname(__file__)))
from tags_bp import tags_bp
from tag_groups_bp import tag_groups_bp
from live_monitor_bp import live_monitor_bp
from historian_bp import historian_bp
from kpi_config_bp import kpi_config_bp
from report_builder_bp import report_builder_bp

import psycopg2
from psycopg2.extras import RealDictCursor
from psycopg2 import pool
from flask import send_from_directory
from psycopg2 import sql
from flask_socketio import SocketIO, emit
# eventlet import moved to top
import time
import urllib3
import re
http = urllib3.PoolManager()
from scheduler import start_scheduler


logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)


# Initialize logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
# Initialize the Flask application
app = Flask(__name__, static_folder='frontend/dist')
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'hercules-dev-secret-key-2026')

# Session cookie: use env for HTTP (dev/remote) vs HTTPS (production).
# For HTTP (e.g. http://100.118.31.61): Secure=False, SameSite=Lax so cookies are sent.
# For HTTPS: set SESSION_COOKIE_SECURE=true and SESSION_COOKIE_SAMESITE=None in env.
_session_secure = os.getenv('SESSION_COOKIE_SECURE', 'false').lower() == 'true'
_session_samesite = os.getenv('SESSION_COOKIE_SAMESITE', 'Lax')
app.config.update(
    SESSION_COOKIE_SAMESITE=_session_samesite,
    SESSION_COOKIE_SECURE=_session_secure
)

# Explicit allowed origins (NO regex, NO wildcard)
# Include both 5174 and 5175 so CORS works regardless of Vite dev server port
ALLOWED_ORIGINS = {
    "http://localhost:5174",
    "http://127.0.0.1:5174",
    "http://localhost:5175",
    "http://127.0.0.1:5175",
    "https://dot-hardwood-songs-cables.trycloudflare.com",
    "http://100.118.31.61:5174",
    "http://100.118.31.61:80",
    "https://dynamic-config.netlify.app",
}

# Initialize SocketIO (NO wildcard)
socketio = SocketIO(
    app,
    cors_allowed_origins=list(ALLOWED_ORIGINS),
    async_mode="eventlet",
    supports_credentials=True
)

# CORS preflight: respond to OPTIONS with 200 + full CORS headers (before any route)
CORS_ALLOW_HEADERS = "Content-Type, Authorization, ngrok-skip-browser-warning"

def _normalize_origin(origin):
    """Strip trailing slash so https://example.com/ matches https://example.com."""
    if not origin:
        return origin
    return origin.rstrip("/")

@app.before_request
def handle_options_preflight():
    if request.method == "OPTIONS":
        origin = request.headers.get("Origin")
        if _normalize_origin(origin) in ALLOWED_ORIGINS:
            from flask import Response
            r = Response("", status=200)
            r.headers["Access-Control-Allow-Origin"] = origin
            r.headers["Access-Control-Allow-Credentials"] = "true"
            r.headers["Access-Control-Allow-Headers"] = CORS_ALLOW_HEADERS
            r.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
            return r
        return "", 200

# Request logging ONLY (no CORS logic here)
@app.before_request
def log_request_info():
    logger.info(f"Incoming request: {request.method} {request.path}")
    logger.info(f"Request headers: {dict(request.headers)}")

    if request.is_json:
        logger.info(f"Request JSON: {request.get_json()}")
    elif request.form:
        logger.info(f"Request form: {dict(request.form)}")

# Single source of truth for CORS headers
@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")
    if _normalize_origin(origin) in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Headers"] = CORS_ALLOW_HEADERS
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"

    return response

# Global OPTIONS handler (preflight) - backup if before_request didn't run
@app.route("/<path:path>", methods=["OPTIONS"])
def options_handler(path):
    response = jsonify({})
    origin = request.headers.get("Origin")
    if _normalize_origin(origin) in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Headers"] = CORS_ALLOW_HEADERS
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"

    return response, 200

# Debug routes - only registered in DEV_MODE
DEV_MODE = os.environ.get('FLASK_ENV') == 'development' or os.environ.get('DEV_MODE') == '1'
if DEV_MODE:
    @app.route('/test', methods=['GET', 'POST'])
    def test_endpoint():
        logger.info("Test endpoint called!")
        return jsonify({"status": "ok", "message": "Server is receiving requests", "method": request.method}), 200

    @app.route('/debug/routes', methods=['GET'])
    def list_routes():
        routes = []
        for rule in app.url_map.iter_rules():
            routes.append({
                'endpoint': rule.endpoint,
                'methods': list(rule.methods),
                'path': str(rule)
            })
        return jsonify({
            'status': 'success',
            'routes': sorted(routes, key=lambda x: x['path'])
        })

    @app.route('/debug/test-layouts', methods=['GET', 'POST'])
    def test_layouts():
        return jsonify({
            'status': 'success',
            'message': 'Live monitor routes are accessible',
            'method': request.method,
            'path': request.path
        })

# Register ONLY the 6 active blueprints
app.register_blueprint(tags_bp, url_prefix='/api')
app.register_blueprint(tag_groups_bp, url_prefix='/api')
app.register_blueprint(live_monitor_bp, url_prefix='/api')
app.register_blueprint(historian_bp, url_prefix='/api')
app.register_blueprint(kpi_config_bp, url_prefix='/api')
app.register_blueprint(report_builder_bp, url_prefix='/api')

# Demo mode: single source of truth for Production vs Demo (emulator)
@app.route('/api/settings/demo-mode', methods=['GET'])
def get_demo_mode_setting():
    from demo_mode import get_demo_mode
    return jsonify({'demo_mode': get_demo_mode()}), 200

@app.route('/api/settings/demo-mode', methods=['POST'])
def set_demo_mode_setting():
    from demo_mode import get_demo_mode, set_demo_mode
    data = request.get_json(silent=True) or {}
    enabled = data.get('enabled', False)
    set_demo_mode(bool(enabled))
    return jsonify({'demo_mode': get_demo_mode()}), 200

# PLC connection configuration (IP, rack, slot)
@app.route('/api/settings/plc-config', methods=['GET'])
def get_plc_config_route():
    from plc_config import get_plc_config
    return jsonify(get_plc_config()), 200

@app.route('/api/settings/plc-config', methods=['POST'])
def set_plc_config_route():
    from plc_config import set_plc_config, get_plc_config
    data = request.get_json(silent=True) or {}
    ip = data.get('ip', '192.168.23.11')
    rack = data.get('rack', 0)
    slot = data.get('slot', 3)
    ok = set_plc_config(ip, rack, slot)
    if not ok:
        return jsonify({'error': 'Invalid PLC config. IP must be a valid IPv4 address.'}), 400
    # Trigger reconnect of shared PLC connection with new config
    try:
        from plc_utils import reconnect_shared_plc
        reconnect_shared_plc(ip, rack, slot)
    except Exception as e:
        logger.warning("PLC reconnect after config change failed: %s", e)
    return jsonify(get_plc_config()), 200

# SMTP email configuration
@app.route('/api/settings/smtp-config', methods=['GET'])
@login_required
def get_smtp_config_route():
    from smtp_config import get_smtp_config
    cfg = get_smtp_config()
    if cfg.get('password'):
        cfg['password'] = '********'
    return jsonify(cfg), 200

@app.route('/api/settings/smtp-config', methods=['POST'])
@login_required
def set_smtp_config_route():
    from smtp_config import get_smtp_config, set_smtp_config
    data = request.get_json(silent=True) or {}
    if data.get('password') == '********':
        existing = get_smtp_config()
        data['password'] = existing.get('password', '')
    set_smtp_config(data)
    return jsonify({'status': 'saved'}), 200

@app.route('/api/settings/smtp-test', methods=['POST'])
@login_required
def smtp_test_route():
    from smtp_config import test_smtp_connection
    data = request.get_json(silent=True) or {}
    to_email = data.get('to_email')
    result = test_smtp_connection(to_email)
    return jsonify(result), 200

# Shifts schedule configuration
@app.route('/api/settings/shifts', methods=['GET'])
@login_required
def get_shifts_route():
    from shifts_config import get_shifts_config
    return jsonify(get_shifts_config()), 200

@app.route('/api/settings/shifts', methods=['POST'])
@login_required
def set_shifts_route():
    from shifts_config import set_shifts_config
    data = request.get_json(silent=True) or {}
    try:
        set_shifts_config(data)
        return jsonify({'status': 'saved'}), 200
    except ValueError as e:
        return jsonify({'error': str(e)}), 400

# Combined system status for Navbar badge
@app.route('/api/settings/system-status', methods=['GET'])
def get_system_status():
    from demo_mode import get_demo_mode
    from plc_config import get_plc_config
    return jsonify({
        'demo_mode': get_demo_mode(),
        'plc_config': get_plc_config(),
    }), 200

# Emulator offsets: all integrated (db, offset) with current values (for Settings UI)
@app.route('/api/settings/emulator-offsets', methods=['GET'])
def get_emulator_offsets_route():
    from plc_data_source import get_emulator_offsets
    return jsonify(get_emulator_offsets()), 200

# Custom emulator offsets: add/remove dynamic (db, offset) for use with tags
@app.route('/api/settings/emulator-custom-offsets', methods=['GET'])
def get_emulator_custom_offsets_route():
    from plc_data_source import get_custom_offsets
    return jsonify(get_custom_offsets()), 200

@app.route('/api/settings/emulator-custom-offsets', methods=['POST'])
def add_emulator_custom_offset_route():
    from plc_data_source import add_custom_offset
    data = request.get_json() or {}
    db_number = data.get('db_number')
    offset = data.get('offset')
    data_type = data.get('data_type', 'Real')
    label = data.get('label', '')
    initial_value = data.get('initial_value')
    sim_base = data.get('sim_base', 0.0)
    sim_amplitude = data.get('sim_amplitude', 1.0)
    if db_number is None or offset is None:
        return jsonify({'error': 'db_number and offset are required'}), 400
    ok, err = add_custom_offset(db_number, offset, data_type, label, initial_value, sim_base, sim_amplitude)
    if not ok:
        return jsonify({'error': err or 'Failed to add custom offset'}), 400
    return jsonify({'status': 'ok', 'message': 'Custom offset added'}), 200

@app.route('/api/settings/emulator-custom-offsets', methods=['DELETE'])
def delete_emulator_custom_offset_route():
    from plc_data_source import remove_custom_offset
    db_number = request.args.get('db_number')
    offset = request.args.get('offset')
    if db_number is None or offset is None:
        return jsonify({'error': 'db_number and offset query params are required'}), 400
    try:
        db_number = int(db_number)
        offset = int(offset)
    except (TypeError, ValueError):
        return jsonify({'error': 'db_number and offset must be integers'}), 400
    ok, err = remove_custom_offset(db_number, offset)
    if not ok:
        return jsonify({'error': err or 'Failed to remove custom offset'}), 404
    return jsonify({'status': 'ok', 'message': 'Custom offset removed'}), 200

# NOTE: React catch-all route moved to end of file to avoid intercepting API routes


# Error handling decorator - include detail in response for debugging (e.g. missing table, wrong DB)
def handle_db_errors(f):
    def wrapper_func(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except psycopg2.Error as e:
            logging.error(f"Database error: {e}", exc_info=True)
            return jsonify({
                'error': 'A database error occurred.',
                'detail': str(e)
            }), 500
        except Exception as e:
            logging.error(f"Unexpected error: {e}", exc_info=True)
            return jsonify({
                'error': 'An unexpected error occurred.',
                'detail': str(e)
            }), 500
    wrapper_func.__name__ = f.__name__
    return wrapper_func

# Role-based access control decorator
from functools import wraps

def require_role(*roles):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            if not current_user.is_authenticated:
                return jsonify({'error': 'Not authenticated'}), 401
            if current_user.role not in roles:
                return jsonify({'error': 'Insufficient permissions'}), 403
            return f(*args, **kwargs)
        return wrapper
    return decorator


# Database connection function with default cursor factory

# OPTIMIZATION: Create connection pool for better performance
class PooledConnection:
    """Wrapper for pooled connection that returns to pool on close"""
    def __init__(self, conn, pool):
        self._conn = conn
        self._pool = pool
        self._closed = False

    def __enter__(self):
        return self._conn

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()
        return False

    def close(self):
        if not self._closed and self._pool:
            try:
                self._pool.putconn(self._conn)
                self._closed = True
            except Exception as e:
                logger.warning(f"Failed to return connection to pool: {e}")
                self._conn.close()

    def __getattr__(self, name):
        return getattr(self._conn, name)

try:
    db_pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=5,
        maxconn=20,
        dbname=os.getenv('POSTGRES_DB', 'dynamic_db_hercules'),
        user=os.getenv('POSTGRES_USER', 'postgres'),
        password=os.getenv('POSTGRES_PASSWORD', 'Hercules'),
        host=os.getenv('DB_HOST', '127.0.0.1'),
        port=int(os.getenv('DB_PORT', 5432)),
        connect_timeout=10
    )
    logger.info("Database connection pool created (5-20 connections, 10s timeout)")
except Exception as e:
    logger.error(f"Failed to create connection pool: {e}")
    db_pool = None

def get_db_connection():
    """Get connection from pool if available, otherwise create new connection"""
    if db_pool:
        try:
            conn = db_pool.getconn()
            # Set cursor factory for this connection
            conn.cursor_factory = RealDictCursor
            # Return wrapped connection that will return to pool on close
            return PooledConnection(conn, db_pool)
        except Exception as e:
            logger.warning(f"Failed to get connection from pool: {e}, creating new connection")

    # Fallback: create new connection if pool fails (same defaults as run_users_migration.py)
    conn = psycopg2.connect(
        dbname=os.getenv('POSTGRES_DB', 'dynamic_db_hercules'),
        user=os.getenv('POSTGRES_USER', 'postgres'),
        password=os.getenv('POSTGRES_PASSWORD', 'Hercules'),
        host=os.getenv('DB_HOST', '127.0.0.1'),
        port=int(os.getenv('DB_PORT', 5432)),
        cursor_factory=RealDictCursor,
        connect_timeout=10
    )
    return conn


# Initialize Flask-Login
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = 'login'

# Handle unauthorized access for API endpoints (return JSON instead of redirect)
@login_manager.unauthorized_handler
def unauthorized():
    """Return JSON error for API requests instead of redirecting to login"""
    # Check if this is an API request (JSON expected or /api/ prefix or common API paths)
    api_paths = ['/api/', '/materials', '/bins', '/users', '/orders/', '/tags', '/tag-groups', '/live-monitor']
    is_api_request = any(request.path.startswith(path) for path in api_paths) or request.is_json or request.accept_mimetypes.accept_json

    if is_api_request:
        return jsonify({
            'error': 'Unauthorized',
            'message': 'Authentication required',
            'authenticated': False
        }), 401
    # For non-API requests (like HTML pages), redirect to login
    return redirect(url_for('login'))

# User class for Flask-Login
class User(UserMixin):
    def __init__(self, id, username, password_hash, role):
        self.id = id
        self.username = username
        self.password_hash = password_hash
        self.role = role

@login_manager.user_loader
def load_user(user_id):
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute(
            'SELECT id, username, password_hash, role FROM users WHERE id = %s',
            (user_id,)
        )
        user = cursor.fetchone()
        if user:
            return User(user['id'], user['username'], user['password_hash'], user['role'])
        return None


def _auth_token_serializer():
    from itsdangerous import URLSafeTimedSerializer
    return URLSafeTimedSerializer(app.secret_key, salt='auth-token')


@login_manager.request_loader
def load_user_from_request(request):
    """Load user from Authorization: Bearer <token> so cross-origin requests work when cookie is not sent."""
    auth = request.headers.get('Authorization')
    if auth and auth.startswith('Bearer '):
        token = auth[7:].strip()
        if not token:
            return None
        try:
            data = _auth_token_serializer().loads(token, max_age=86400 * 7)  # 7 days
            user_id = data.get('user_id')
            if user_id:
                return load_user(int(user_id))
        except Exception:
            pass
    return None


# Demo mode: auto-authenticate a dev admin user so @login_required works without login page.
# When demo mode is active and no user is logged in, auto-login the first admin user (or any user).
_demo_auto_login_checked = False

@app.before_request
def demo_auto_login():
    """In demo mode, automatically log in a dev admin user if not already authenticated."""
    global _demo_auto_login_checked
    # Skip for static files, OPTIONS, and the login endpoint itself
    if request.method == 'OPTIONS' or request.path.startswith('/static'):
        return
    # Only check if user is not already authenticated
    if current_user.is_authenticated:
        return
    # Check demo mode
    try:
        from demo_mode import get_demo_mode
        if not get_demo_mode():
            return
    except Exception:
        return
    # Auto-login: find an admin user (or first available user) from the database
    try:
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor()
            # Try admin first, then any user
            cursor.execute("SELECT id, username, password_hash, role FROM users WHERE role = 'admin' ORDER BY id LIMIT 1")
            user_row = cursor.fetchone()
            if not user_row:
                cursor.execute("SELECT id, username, password_hash, role FROM users ORDER BY id LIMIT 1")
                user_row = cursor.fetchone()
            if user_row:
                user_obj = User(user_row['id'], user_row['username'], user_row['password_hash'], user_row['role'])
                login_user(user_obj, remember=True)
                if not _demo_auto_login_checked:
                    logger.info("Demo mode: auto-logged in as '%s' (role=%s)", user_row['username'], user_row['role'])
                    _demo_auto_login_checked = True
    except Exception as e:
        if not _demo_auto_login_checked:
            logger.warning("Demo auto-login failed: %s", e)
            _demo_auto_login_checked = True


from flask import make_response
# User authentication routes
@app.route('/login', methods=['POST'])
def login():
    logger.info("Login endpoint called")
    if request.method == 'POST':
        logger.info(f"Login request received - method: POST")
        logger.info(f"Request content type: {request.content_type}")
        logger.info(f"Request is_json: {request.is_json}")

        if not request.is_json:
            logger.warning("Login request is not JSON, attempting to parse anyway")
            try:
                data = request.get_json(force=True)
            except Exception as e:
                logger.error(f"Failed to parse JSON: {e}")
                return jsonify({"message": "Invalid request format"}), 400
        else:
            data = request.get_json()

        username = data.get('username') if data else request.json.get('username')
        password = data.get('password') if data else request.json.get('password')

        logger.info(f"Attempting login for username: {username}")

        with closing(get_db_connection()) as conn:
            cursor = conn.cursor()
            cursor.execute('SELECT id, username, password_hash, role FROM users WHERE username = %s', (username,))
            user = cursor.fetchone()

            if user and check_password_hash(user['password_hash'], password):
                user_obj = User(user['id'], user['username'], user['password_hash'], user['role'])
                login_user(user_obj)

                # Auth token for cross-origin (when cookie is not sent, frontend sends Authorization: Bearer)
                auth_token = _auth_token_serializer().dumps({'user_id': user['id']})

                response = make_response(jsonify({
                    "message": "Login successful",
                    "user_data": {
                        "id": user['id'],
                        "username": user['username'],
                        "role": user['role'],
                        "auth_token": auth_token
                    }
                }), 200)

                response.set_cookie(
                    'auth_token', 'fake_token_here',
                    httponly=True,
                    secure=app.config['SESSION_COOKIE_SECURE'],
                    samesite=app.config['SESSION_COOKIE_SAMESITE']
                )

                return response

            return jsonify({"message": "Invalid username or password"}), 401

@app.route('/logout', methods=['POST'])
@login_required
def logout():
    logout_user()
    return jsonify({"message": "You have been logged out successfully"}), 200

@app.route('/check-auth', methods=['GET'])
def check_auth():
    if current_user.is_authenticated:
        return jsonify({
            "authenticated": True,
            "user_data": {
                "id": current_user.id,
                "username": current_user.username,
                "role": getattr(current_user, "role", "N/A")  # Include user role if available
            }
        }), 200
    return jsonify({
        "authenticated": False,
        "message": "User is not authenticated"
    }), 401

# Main index route
@app.route('/')
@login_required
def index():
    return render_template('index.html')

# Users management routes
@app.route('/users', methods=['GET'])
@login_required
@handle_db_errors
def get_users():
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT id, username,role FROM users")
        users = cursor.fetchall()
        return jsonify(users)

@app.route('/add-user', methods=['POST'])
@login_required
@require_role('admin')
@handle_db_errors
def add_user():
    logging.debug("Inside add_user route.")
    data = request.get_json(silent=True)
    if not data or not isinstance(data, dict):
        return jsonify({'error': 'Invalid or missing JSON body'}), 400

    username = (data.get('username') or '').strip()
    password = data.get('password')
    role = (data.get('role') or '').strip()

    if not username or not password or not role:
        return jsonify({'error': 'Missing data (username, password, and role required)'}), 400

    password_hash = generate_password_hash(password)

    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM users WHERE username = %s', (username,))
        if cursor.fetchone():
            return jsonify({'error': 'duplicate'}), 400

        cursor.execute('INSERT INTO users (username, password_hash, role) VALUES (%s, %s, %s)', (username, password_hash, role))
        conn.commit()
    return jsonify({'status': 'success'}), 201

@app.route('/delete-user/<int:user_id>', methods=['DELETE'])
@login_required
@require_role('admin')
@handle_db_errors
def delete_user(user_id):

    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM users WHERE id = %s', (user_id,))
        conn.commit()
    return jsonify({'status': 'success'}), 200

@app.route('/update-user/<int:user_id>', methods=['PUT'])
@login_required
@require_role('admin')
@handle_db_errors
def update_user(user_id):
    data = request.get_json(silent=True) or {}
    username = (data.get('username') or '').strip()
    role = (data.get('role') or '').strip()
    if role not in ('admin', 'manager', 'operator'):
        return jsonify({'error': 'Invalid role. Must be admin, manager, or operator.'}), 400
    if not username:
        return jsonify({'error': 'Username is required'}), 400
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        # Prevent demoting the last admin
        cursor.execute("SELECT role FROM users WHERE id = %s", (user_id,))
        current = cursor.fetchone()
        if not current:
            return jsonify({'error': 'User not found'}), 404
        if current['role'] == 'admin' and role != 'admin':
            cursor.execute("SELECT COUNT(*) as cnt FROM users WHERE role='admin'")
            admin_count = cursor.fetchone()['cnt']
            if admin_count <= 1:
                return jsonify({'error': 'Cannot demote the last admin user'}), 400
        cursor.execute("UPDATE users SET username=%s, role=%s WHERE id=%s", (username, role, user_id))
        conn.commit()
        cursor.execute("SELECT id, username, role FROM users WHERE id=%s", (user_id,))
        updated = cursor.fetchone()
    return jsonify(updated), 200

@app.route('/change-password/<int:user_id>', methods=['POST'])
@login_required
@require_role('admin')
@handle_db_errors
def change_password(user_id):
    data = request.get_json(silent=True) or {}
    new_password = data.get('new_password', '')
    if len(new_password) < 2:
        return jsonify({'error': 'Password must be at least 2 characters'}), 400
    password_hash = generate_password_hash(new_password)
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET password_hash=%s WHERE id=%s", (password_hash, user_id))
        conn.commit()
    return jsonify({'status': 'password_changed'}), 200

@app.route('/change-own-password', methods=['POST'])
@login_required
@handle_db_errors
def change_own_password():
    data = request.get_json(silent=True) or {}
    current_password = data.get('current_password', '')
    new_password = data.get('new_password', '')
    if not current_user.is_authenticated:
        return jsonify({'error': 'Not authenticated'}), 401
    # Verify current password
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT password_hash FROM users WHERE id=%s", (current_user.id,))
        row = cursor.fetchone()
        if not row or not check_password_hash(row['password_hash'], current_password):
            return jsonify({'error': 'Current password is incorrect'}), 401
    if len(new_password) < 2:
        return jsonify({'error': 'New password must be at least 2 characters'}), 400
    password_hash = generate_password_hash(new_password)
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE users SET password_hash=%s WHERE id=%s", (password_hash, current_user.id))
        conn.commit()
    return jsonify({'status': 'password_changed'}), 200


# SocketIO event handlers
@socketio.on('connect')
def handle_connect():
    logger.info('Client connected to WebSocket')
    logger.info('WebSocket connected - dynamic monitor worker handles data storage')

@socketio.on('disconnect')
def handle_disconnect():
    logger.info('Client disconnected from WebSocket')

@socketio.on('message')
def handle_message(message):
    logger.info(f'Received message: {message}')


def dynamic_tag_realtime_monitor():
    """New dynamic tag-based monitor - runs in parallel with existing monitors"""
    import datetime
    import eventlet

    logger.info("Starting dynamic tag realtime monitor")

    while True:
        try:
            # Import here to avoid circular imports
            from utils.tag_reader import read_all_tags

            # Read all active tags from PLC
            tag_values = read_all_tags(tag_names=None, db_connection_func=get_db_connection)

            # Build WebSocket payload
            ws_data = {
                'timestamp': datetime.datetime.now().isoformat(),
                'tag_values': tag_values,
                'plc_connected': True
            }

            # Emit to WebSocket
            socketio.emit('live_tag_data', ws_data)

            eventlet.sleep(1)  # Update every 1 second

        except Exception as e:
            logger.error(f"Error in dynamic tag monitor: {e}", exc_info=True)
            socketio.emit('live_tag_data', {
                'error': str(e),
                'plc_connected': False,
                'timestamp': datetime.datetime.now().isoformat()
            })
            eventlet.sleep(5)  # Wait longer on error


# Spawn dynamic workers
logger.info("Starting dynamic monitoring system")

# Dynamic tag monitor (for WebSocket data only, not storage)
eventlet.spawn(dynamic_tag_realtime_monitor)

# Universal historian worker (records ALL active PLC tags, independent of layouts)
try:
    from workers.historian_worker import historian_worker
    eventlet.spawn(historian_worker)
    logger.info("Started universal historian worker")
except Exception as e:
    logger.error(f"Could not start historian worker: {e}", exc_info=True)

# Dynamic monitoring workers (for published layouts - Live Monitor storage + archiving)
try:
    from workers.dynamic_monitor_worker import dynamic_monitor_worker
    from workers.dynamic_archive_worker import dynamic_archive_worker
    eventlet.spawn(dynamic_monitor_worker)
    eventlet.spawn(dynamic_archive_worker)
    logger.info("Started dynamic monitor and archive workers")
except Exception as e:
    logger.error(f"Could not start dynamic workers: {e}", exc_info=True)

# Auto-seed emulator with all DB tags when in demo mode (runs regardless of entry point)
try:
    from demo_mode import get_demo_mode
    if get_demo_mode():
        from plc_data_source import seed_tags_from_db
        seed_tags_from_db(get_db_connection)
        logger.info("Demo mode: seeded emulator with all DB tags")
except Exception as e:
    logger.warning("Demo mode emulator seed skipped: %s", e)


# React catch-all route - MUST be last to avoid intercepting API routes
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_react(path):
    # Don't intercept API routes - let Flask handle them via blueprints
    # Flask will match blueprint routes first, so this should only catch React routes
    # Just serve the React app for any non-API route

    if path and os.path.exists(os.path.join(app.static_folder, path)):
        return send_from_directory(app.static_folder, path)
    else:
        return send_from_directory(app.static_folder, 'index.html')

if __name__ == '__main__':
    logger.info("Starting Flask-SocketIO server...")
    start_scheduler()

    logger.info("Server will listen on: http://0.0.0.0:5000")
    logger.info("Test endpoint available at: http://localhost:5000/test")
    # Eventlet handles HTTP and WebSocket requests properly
    socketio.run(app, debug=False, host='0.0.0.0', port=5000, use_reloader=False)

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
from orders_bp import orders_bp  # Import the test blueprint
from energy import energy_bp # Import energy blueprint
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
from orders_bp import get_db_number_for_job_type,write_active_order_to_plc
from flask_socketio import SocketIO, emit
# eventlet import moved to top
import time
import urllib3
import re
import snap7
from snap7.util import get_bool, get_int, get_real, get_dint
http = urllib3.PoolManager()
from scheduler import start_scheduler


logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s %(levelname)s: %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout)  # ✅ Send logs to stdout
    ]
)


# Initialize logger
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)
# Initialize the Flask application
app = Flask(__name__, static_folder='frontend/dist')
app.secret_key = os.getenv('FLASK_SECRET_KEY', 'hercules-dev-secret-key-2026')

# ✅ Session cookie: use env for HTTP (dev/remote) vs HTTPS (production).
# For HTTP (e.g. http://100.118.31.61): Secure=False, SameSite=Lax so cookies are sent.
# For HTTPS: set SESSION_COOKIE_SECURE=true and SESSION_COOKIE_SAMESITE=None in env.
_session_secure = os.getenv('SESSION_COOKIE_SECURE', 'false').lower() == 'true'
_session_samesite = os.getenv('SESSION_COOKIE_SAMESITE', 'Lax')
app.config.update(
    SESSION_COOKIE_SAMESITE=_session_samesite,
    SESSION_COOKIE_SECURE=_session_secure
)

# ✅ Explicit allowed origins (NO regex, NO wildcard)
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

# ✅ Initialize SocketIO (NO wildcard)
socketio = SocketIO(
    app,
    cors_allowed_origins=list(ALLOWED_ORIGINS),
    async_mode="eventlet",
    supports_credentials=True
)

# ✅ CORS preflight: respond to OPTIONS with 200 + full CORS headers (before any route)
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

# ✅ Request logging ONLY (no CORS logic here)
@app.before_request
def log_request_info():
    logger.info(f"📥 Incoming request: {request.method} {request.path}")
    logger.info(f"📥 Request headers: {dict(request.headers)}")

    if request.is_json:
        logger.info(f"📥 Request JSON: {request.get_json()}")
    elif request.form:
        logger.info(f"📥 Request form: {dict(request.form)}")

# ✅ Single source of truth for CORS headers
@app.after_request
def add_cors_headers(response):
    origin = request.headers.get("Origin")
    if _normalize_origin(origin) in ALLOWED_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
        response.headers["Access-Control-Allow-Headers"] = CORS_ALLOW_HEADERS
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"

    return response

# ✅ Global OPTIONS handler (preflight) – backup if before_request didn’t run
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

# Debug routes — only registered in DEV_MODE
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

# 1) Register the blueprint first
app.register_blueprint(orders_bp, url_prefix='/orders')
app.register_blueprint(energy_bp)
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
        from orders_bp import reconnect_shared_plc
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


# ✅ Demo mode: auto-authenticate a dev admin user so @login_required works without login page.
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
                    logger.info("✅ Demo mode: auto-logged in as '%s' (role=%s)", user_row['username'], user_row['role'])
                    _demo_auto_login_checked = True
    except Exception as e:
        if not _demo_auto_login_checked:
            logger.warning("⚠️ Demo auto-login failed: %s", e)
            _demo_auto_login_checked = True


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

# ✅ OPTIMIZATION: Create connection pool for better performance
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
                logger.warning(f"⚠️ Failed to return connection to pool: {e}")
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
    logger.info("✅ Database connection pool created (5-20 connections, 10s timeout)")
except Exception as e:
    logger.error(f"❌ Failed to create connection pool: {e}")
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
            logger.warning(f"⚠️ Failed to get connection from pool: {e}, creating new connection")
    
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


from flask import make_response
# User authentication routes
@app.route('/login', methods=['POST'])
def login():
    logger.info("🔐 Login endpoint called")
    if request.method == 'POST':
        logger.info(f"🔐 Login request received - method: POST")
        logger.info(f"🔐 Request content type: {request.content_type}")
        logger.info(f"🔐 Request is_json: {request.is_json}")
        
        if not request.is_json:
            logger.warning("⚠️ Login request is not JSON, attempting to parse anyway")
            try:
                data = request.get_json(force=True)
            except Exception as e:
                logger.error(f"❌ Failed to parse JSON: {e}")
                return jsonify({"message": "Invalid request format"}), 400
        else:
            data = request.get_json()
        
        username = data.get('username') if data else request.json.get('username')
        password = data.get('password') if data else request.json.get('password')
        
        logger.info(f"🔐 Attempting login for username: {username}")

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

# Materials management routes
@app.route('/materials', methods=['GET'])
@login_required
@handle_db_errors
def get_materials():
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id, material_name, material_code, category, is_released FROM materials')
        materials = cursor.fetchall()
        return jsonify(materials)

@app.route('/material/<int:material_id>', methods=['GET'])
@login_required
@handle_db_errors
def get_material(material_id):
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id, material_name, material_code, category, is_released FROM materials WHERE id = %s', (material_id,))
        material = cursor.fetchone()
        if material:
            return jsonify(material)
        return jsonify({'error': 'Material not found'}), 404

@app.route('/add-material', methods=['POST'])
@login_required
@handle_db_errors
def add_material():
    data = request.get_json()    
    logging.debug(f"Received data for add-material: {data}")
    material_name = data.get('materialName')
    material_code = data.get('materialCode')
    category = []

    if data.get('categoryIN'):
        category.append('IN')
    if data.get('categoryOUT'):
        category.append('OUT')

    is_released = data.get('isReleased', False)

    if not material_name or not material_code or not category:
        return jsonify({'error': 'Missing data'}), 400

    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id FROM materials WHERE material_code = %s', (material_code,))
        if cursor.fetchone():
            return jsonify({'error': 'duplicate'}), 400

        cursor.execute('INSERT INTO materials (material_name, material_code, category, is_released) VALUES (%s, %s, %s, %s)',
                       (material_name, material_code, ','.join(category), is_released))
        conn.commit()
    return jsonify({'status': 'success'}), 201

@app.route('/update-material', methods=['POST'])
@login_required
@handle_db_errors
def update_material():
    data = request.get_json()
    material_id = data.get('materialId')
    material_name = data.get('materialName')
    material_code = data.get('materialCode')

    if not material_id or not material_name or not material_code:
        return jsonify({'error': 'Material Name and Material Code are required.'}), 400

    category = []
    if data.get('categoryIN'):
        category.append('IN')
    if data.get('categoryOUT'):
        category.append('OUT')

    is_released = data.get('isReleased', False)

    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute(
            'UPDATE materials SET material_name = %s, material_code = %s, category = %s, is_released = %s WHERE id = %s',
            (material_name, material_code, ','.join(category), is_released, material_id)
        )
        conn.commit()
    
    return jsonify({'status': 'success'}), 200

@app.route('/delete-material/<int:material_id>', methods=['DELETE'])
@login_required
@handle_db_errors
def delete_material(material_id):
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM materials WHERE id = %s', (material_id,))
        conn.commit()
    return jsonify({'status': 'success'}), 200

# Bins management routes
@app.route('/bins', methods=['GET'])
@login_required
@handle_db_errors
def get_bins():
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT bins.id, bins.bin_name, bins.bin_code, bins.material_id, materials.material_name, materials.material_code
            FROM bins
            LEFT JOIN materials ON bins.material_id = materials.id
            ORDER BY bins.bin_code
        ''')
        bins = cursor.fetchall()
        return jsonify(bins)
    
from orders_bp import connect_to_plc, write_destination_struct

@app.route('/assign-bin', methods=['POST'])
@login_required
@handle_db_errors
def assign_bin():
    raw = request.get_json()
    logger.debug(f"Received data: {raw}")

    if not isinstance(raw, dict) or 'assignments' not in raw:
        return jsonify({'error': 'Invalid request format. Expected key: assignments'}), 400

    assignments = raw['assignments']
    if not isinstance(assignments, list) or not assignments:
        return jsonify({'error': 'Assignments must be a non-empty list'}), 400

    db_number = 1400  # PLC DB block

    # Bin → offset map from Excel
    bin_offset_map = {
        'Bin_021A': 22, 'Bin_021B': 148, 'Bin_021C': 274, 'Bin_0021': 400, 'Bin_0022': 526, 'Bin_0023': 652,
        'Bin_0024': 778, 'Bin_0025': 904, 'Bin_0026': 1030, 'Bin_0027': 1156, 'Bin_0028': 1282,
        'Bin_0029': 1408, 'Bin_0030': 1534, 'Bin_0031': 1660, 'Bin_0032': 1786, 'Bin_0033': 1912,
        'Bin_0034': 2038, 'Bin_0040': 2164, 'Bin_0050': 2290, 'Bin_0051': 2416, 'Bin_0052': 2542,
        'Bin_0053': 2668, 'Bin_0054': 2794, 'Bin_0055': 2920, 'Bin_0056': 3046, 'Bin_0057': 3172,
        'Bin_0060': 3298, 'Bin_0061': 3424, 'Bin_0062': 3550, 'Bin_0070': 3676, 'Bin_0071': 3802,
        'Bin_0081': 3928, 'Bin_0170': 4054, 'Bin_0171': 4180, 'Bin_0921': 4306, 'Bin_0922': 4432,
        'Bin_0923': 4558, 'Bin_0924': 4684
    }

    try:
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor()
            try:
                plc = connect_to_plc()
            except Exception as plc_connect_error:
                logger.error(f"Failed to connect to PLC: {plc_connect_error}")
                return jsonify({'error': 'PLC connection failed'}), 500

            for assignment in assignments:
                bin_id = assignment.get('bin_id')
                material_id = assignment.get('material_id')

                try:
                    bin_id = int(bin_id)
                    material_id = int(material_id)
                except (TypeError, ValueError):
                    return jsonify({'error': f'Invalid bin_id or material_id in {assignment}'}), 400

                # ✅ Fetch actual bin_code from DB
                cursor.execute("SELECT bin_code FROM bins WHERE id = %s", (bin_id,))
                row = cursor.fetchone()
                if not row or not row['bin_code']:
                    return jsonify({'error': f'No bin_code found for bin_id {bin_id}'}), 404

                # Format bin_code with proper padding
                raw_code = row['bin_code'].replace('-', '').strip()
                
                # Check if code ends with a letter (e.g., 21A, 21B, 21C)
                if raw_code and raw_code[-1].isalpha():
                    # Format as 3 digits + letter (e.g., 21A -> 021A)
                    number_part = raw_code[:-1]
                    letter_part = raw_code[-1]
                    formatted_code = f"{number_part.zfill(3)}{letter_part}"
                else:
                    # Format as 4 digits (e.g., 21 -> 0021)
                    formatted_code = raw_code.zfill(4)
                
                bin_code = f"Bin_{formatted_code}"
                offset = bin_offset_map.get(bin_code)
                if offset is None:
                    return jsonify({'error': f'Unknown PLC offset for bin_id {bin_id} (code: {bin_code}, raw: {raw_code})'}), 400

                # Update material_id in DB
                cursor.execute(
                    'UPDATE bins SET material_id = %s WHERE id = %s',
                    (material_id, bin_id)
                )

                # Fetch material details for PLC write
                cursor.execute("""
                    SELECT m.material_name, m.material_code
                    FROM bins b
                    JOIN materials m ON b.material_id = m.id
                    WHERE b.id = %s
                """, (bin_id,))
                mat_row = cursor.fetchone()
                if not mat_row:
                    return jsonify({'error': f'Material not found for bin {bin_id}'}), 404

                destination = {
                    'bin_id': bin_id,
                    'prd_code': int(mat_row['material_code']),
                    'prd_name': mat_row['material_name']
                }

                # ✅ Write to PLC at correct offset
                write_destination_struct(plc, db_number, offset, destination)
                logger.debug(f"PLC write to offset {offset} for bin {bin_code}: {destination}")

            conn.commit()
            plc.disconnect()
            logger.info(f"✅ Bin assignment complete: {len(assignments)} bins written")

            return jsonify({'status': 'success', 'written_count': len(assignments)}), 200

    except Exception as e:
        logger.exception("Unhandled error in assign_bin")
        return jsonify({'error': 'Internal server error during bin assignment'}), 500

@app.route('/unassign-bin/<int:bin_id>', methods=['POST'])
@login_required
@handle_db_errors
def unassign_bin(bin_id):
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('UPDATE bins SET material_id = NULL WHERE id = %s', (bin_id,))
        conn.commit()
    return jsonify({'status': 'success'}), 200

@app.route('/released-materials', methods=['GET'])
@login_required
@handle_db_errors
def get_released_materials():
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id, material_name, material_code, category FROM materials WHERE is_released = TRUE')
        materials = cursor.fetchall()
        return jsonify(materials)

# Getting Released Input Ingredients
@app.route('/released-ingredients', methods=['GET'])
@login_required
@handle_db_errors
def get_released_ingredients():
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, material_name, material_code 
            FROM materials 
            WHERE is_released = TRUE 
            AND (category LIKE '%IN%' OR category LIKE '%IN/OUT%')
        ''')
        ingredients = cursor.fetchall()
        return jsonify(ingredients)

# Job management routes
@app.route('/job-types', methods=['GET'])
@login_required
@handle_db_errors
def get_job_types():
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id, name, description, db_number FROM job_types')  # ✅ Ensure db_number is selected
        job_types = cursor.fetchall()
        return jsonify(job_types)

# Fetch job-specific parameters and recipe data
@app.route('/job-fields/<int:job_type_id>', methods=['GET'])

@handle_db_errors
def get_job_fields(job_type_id):
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()

        # Fetch KPI definitions
        cursor.execute('''
            SELECT id, kpi_name, data_type, default_value, unit
            FROM kpi_definitions
            WHERE job_type_id = %s
        ''', (job_type_id,))
        kpis = cursor.fetchall()

        # Fetch available recipes for this job type
        cursor.execute('SELECT id, name FROM recipes WHERE job_type_id = %s', (job_type_id,))
        recipes = cursor.fetchall()
        for r in recipes:
            r['type'] = 'regular'  # ✅ Add this

        return jsonify({'kpis': kpis, 'recipes': recipes})

# Load a specific recipe and its fields for a job type
@app.route('/load-recipe/<int:recipe_id>', methods=['GET'])

@handle_db_errors
def load_recipe(recipe_id):
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()

        # Fetch the recipe details including final_product_id
        cursor.execute('''
            SELECT id, name, job_type_id, final_product_id, kpis, sources, destinations, description, released
            FROM recipes
            WHERE id = %s
        ''', (recipe_id,))
        recipe = cursor.fetchone()

        if not recipe:
            return jsonify({'error': 'Recipe not found'}), 404

        recipe['type'] = 'regular'  # ✅ Add this
        return jsonify(recipe)

# Add Recipe Route
@app.route('/add-recipe', methods=['POST'])
@login_required
@handle_db_errors
def add_recipe():
    data = request.get_json()
    logging.debug(f"Received data for add-recipe: {data}")

    job_type_id = data.get('jobTypeId')
    recipe_name = data.get('recipeName')
    kpis = data.get('kpis', [])

    # Allow empty KPI lists by checking for None instead of an empty list
    if not job_type_id or not recipe_name or kpis is None:
        return jsonify({'error': 'Missing required data'}), 400

    # Use an empty list as default if kpis is empty
    kpis = kpis if kpis else []

    try:
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO recipes (job_type_id, name, kpis)
                VALUES (%s, %s, %s::jsonb)
                RETURNING id
            ''', (job_type_id, recipe_name, json.dumps(kpis)))
            recipe_id = cursor.fetchone()['id']
            conn.commit()
            logging.info(f"New recipe added with ID: {recipe_id}")
            return jsonify({'status': 'success', 'recipeId': recipe_id})
    except Exception as e:
        logging.error(f"Unexpected error during recipe addition: {e}")
        return jsonify({'error': 'An unexpected error occurred while adding the recipe.'}), 500





# Update Recipe Route
@app.route('/update-recipe', methods=['POST'])
@login_required
@handle_db_errors
def update_recipe():
    data = request.get_json()
    recipe_id = data.get('recipeId')
    final_product_id = data.get('finalProductId')
    is_released = data.get('is_released')  # Get the is_released field
    kpis = data.get('kpis')
    sources = data.get('sources')
    destinations = data.get('destinations')
    description = data.get('description')  # Expecting JSON

    if not recipe_id or not final_product_id or not kpis:
        return jsonify({'error': 'Missing required data'}), 400

    if is_released is not None and not isinstance(is_released, bool):
        return jsonify({'error': 'is_released must be a boolean'}), 400

    if description is not None and not isinstance(description, dict):
        return jsonify({'error': 'description must be a JSON object'}), 400

    # Convert IDs to integers
    try:
        recipe_id = int(recipe_id)
        final_product_id = int(final_product_id)
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid recipeId or finalProductId'}), 400

    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()

        try:
            cursor.execute('''
                UPDATE recipes
                SET final_product_id = %s, kpis = %s::jsonb, sources = %s::jsonb, destinations = %s::jsonb, description = %s::jsonb, released = %s
                WHERE id = %s
            ''', (final_product_id, json.dumps(kpis), json.dumps(sources), json.dumps(destinations), json.dumps(description), is_released, recipe_id))

            conn.commit()
            logging.info(f"Recipe ID {recipe_id} updated successfully")

            return jsonify({'status': 'success'})

        except Exception as e:
            logging.error(f"Unexpected error during recipe update: {e}")
            conn.rollback()
            return jsonify({'error': 'An unexpected error occurred while updating the recipe.'}), 500


@app.route('/delete-recipe/<int:recipe_id>', methods=['DELETE'])
@login_required
@handle_db_errors
def delete_recipe(recipe_id):
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()

        cursor.execute('DELETE FROM recipes WHERE id = %s', (recipe_id,))

        conn.commit()

    return jsonify({'success': True}), 200

# Release a recipe
@app.route('/release-recipe/<int:recipe_id>', methods=['POST'])
@login_required
@handle_db_errors
def release_recipe(recipe_id):
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()

        # Set the released status to TRUE for the selected recipe
        cursor.execute('UPDATE recipes SET released = TRUE WHERE id = %s', (recipe_id,))
        conn.commit()

    return jsonify({'success': True}), 200

@app.route('/unrelease-recipe/<int:recipe_id>', methods=['POST'])
@login_required
@handle_db_errors
def unrelease_recipe(recipe_id):
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()

        # Set the released status to FALSE for the selected recipe
        cursor.execute('UPDATE recipes SET released = FALSE WHERE id = %s', (recipe_id,))
        conn.commit()

    return jsonify({'success': True}), 200

# Get Released Status
@app.route('/recipe-status/<int:recipe_id>', methods=['GET'])
@login_required
@handle_db_errors
def get_recipe_status(recipe_id):
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT released FROM recipes WHERE id = %s', (recipe_id,))
        recipe = cursor.fetchone()
        if recipe is not None:
            return jsonify({'released': bool(recipe['released'])})
        return jsonify({'error': 'Recipe not found'}), 404

# Create a new order (job)
@app.route('/create-job', methods=['POST'])
@login_required
@handle_db_errors
def create_job():
    data = request.get_json()
    job_type_id = data.get('jobTypeId')
    recipe_id = data.get('recipeId')
    order_name = data.get('orderName')
    kpis = data.get('kpis')
    order_sources = data.get('sources')
    order_destinations = data.get('destinations')

    if not job_type_id or not recipe_id or not kpis or not order_name:
        return jsonify({'error': 'Missing required job data'}), 400

    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()

        # Insert the job into the orders table
        cursor.execute('''
            INSERT INTO orders (job_type_id, recipe_id, order_name, kpis, order_sources, order_destinations)
            VALUES (%s, %s, %s, %s::jsonb, %s::jsonb, %s::jsonb)
            RETURNING id
        ''', (job_type_id, recipe_id, order_name, json.dumps(kpis), json.dumps(order_sources), json.dumps(order_destinations)))
        order_id = cursor.fetchone()['id']
        conn.commit()

    # Fetch the dynamic DB number for the job type
    db_number = get_db_number_for_job_type(job_type_id)
    if not db_number:
        return jsonify({'error': 'DB number not found for the given job type'}), 500

    # Prepare destination data for PLC
    formatted_destinations = []
    for dest in order_destinations:
        formatted_destinations.append({
            'selected': dest.get('selected', False),
            'bin_id': int(dest.get('bin_id', 0)),
            'prd_code': int(dest.get('prd_code', 0)),
            'prd_name': str(dest.get('prd_name', ''))
        })

    # Prepare source data for PLC
    formatted_sources = []
    for src in order_sources:
        formatted_sources.append({
            'selected': src.get('selected', False),
            'bin_id': int(src.get('bin_id', 0)),
            'qty_percent': float(src.get('qty_percent', 100.0)),
            'prd_code': int(src.get('prd_code', 0)),
            'prd_name': str(src.get('prd_name', ''))
        })

    # Prepare active order data to send to the PLC
    active_order = {
        'destinations': formatted_destinations,
        'sources': formatted_sources,
        'final_product': recipe_id,
        'kpi_definitions': [],
        'kpis': kpis,
        'stop_options': {'job_qty': True, 'full_dest': False, 'empty_source': True, 'held_status': False}
    }

    try:
        # Send active order to PLC
        write_active_order_to_plc(active_order, db_number)
        return jsonify({'status': 'success', 'orderId': order_id}), 200
    except Exception as e:
        logger.error(f"Failed to send data to PLC: {e}")
        return jsonify({'error': 'Failed to send data to PLC'}), 500



#Modified to include DB number
@app.route('/add-job-type', methods=['POST'])
@login_required
@handle_db_errors
def add_job_type():
    data = request.get_json()
    job_type_name = data.get('jobTypeName')
    job_type_description = data.get('jobTypeDescription', '')
    db_number = data.get('dbNumber')  # Fetch db_number from request

    if not job_type_name or not db_number:
        return jsonify({'error': 'Job Type Name and DB Number are required.'}), 400

    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO job_types (name, description, db_number)
            VALUES (%s, %s, %s)
            RETURNING id
        ''', (job_type_name, job_type_description, db_number))
        job_type_id = cursor.fetchone()['id']
        conn.commit()
    return jsonify({'status': 'success', 'jobTypeId': job_type_id}), 201

# Route to get all job types


# Existing code in main_app.py
from flask import Flask, request, jsonify
from contextlib import closing
import json  # Import json module for serialization
@app.route('/add-kpi-definition', methods=['POST'])
@login_required
@handle_db_errors
def add_kpi_definition():
    data = request.get_json()
    job_type_id = data.get('jobTypeId')
    kpi_name = data.get('kpiName')
    data_type = data.get('kpiDataType')
    default_value = data.get('kpiDefaultValue')
    db_offset = data.get('kpiDbOffset')
    unit = data.get('kpiUnit')  # Existing Field
    read_write = data.get('kpiAccessType', 'RW')  # 'R', 'W', or 'RW'
    bit_value = data.get('bitValue', 0)  # New Field for bit value

    # Validation
    if not job_type_id or not kpi_name or not data_type:
        return jsonify({'error': 'Missing required fields.'}), 400

    # Validate that bit_value is an integer or convertible to integer
    try:
        bit_value = int(bit_value)
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid bit value. It must be an integer.'}), 400

    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO kpi_definitions (job_type_id, kpi_name, data_type, default_value, db_offset, read_write, unit, bit_value)
            VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s, %s)
        ''', (job_type_id, kpi_name, data_type, json.dumps(default_value), db_offset, read_write, unit, bit_value))
        conn.commit()

    return jsonify({'status': 'success'}), 201



@app.route('/get-kpi/<int:kpi_id>', methods=['GET'])
@login_required
@handle_db_errors
def get_kpi(kpi_id):
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, job_type_id, kpi_name, data_type, default_value, db_offset, read_write, unit
            FROM kpi_definitions
            WHERE id = %s
        ''', (kpi_id,))
        kpi = cursor.fetchone()
        if not kpi:
            return jsonify({'error': 'KPI not found'}), 404
        return jsonify(kpi)

@app.route('/update-kpi', methods=['PUT'])
@login_required
@handle_db_errors
def update_kpi():
    data = request.get_json()
    kpi_id = data.get('kpiId')
    kpi_name = data.get('kpiName')
    data_type = data.get('kpiDataType')
    default_value = data.get('kpiDefaultValue')
    db_offset = data.get('kpiDbOffset')
    unit = data.get('kpiUnit')  # New Field
    read_write = data.get('kpiAccessType', 'RW')

    if not kpi_id or not kpi_name:
        return jsonify({'error': 'Missing KPI ID or name'}), 400

    # Convert default_value to JSON
    json_default_value = json.dumps(default_value) if default_value else 'null'
    
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            UPDATE kpi_definitions
            SET kpi_name = %s,
                data_type = %s,
                default_value = %s::jsonb,
                db_offset = %s,
                read_write = %s,
                unit = %s
            WHERE id = %s
        ''', (kpi_name, data_type, json_default_value, db_offset, read_write, unit, kpi_id))
        if cursor.rowcount == 0:
            return jsonify({'error': 'KPI not found'}), 404
        conn.commit()

    return jsonify({'status': 'success'}), 200

@app.route('/delete-kpi/<int:kpi_id>', methods=['DELETE'])
@login_required
@handle_db_errors
def delete_kpi(kpi_id):
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('DELETE FROM kpi_definitions WHERE id = %s', (kpi_id,))
        if cursor.rowcount == 0:
            return jsonify({'error': 'KPI not found'}), 404
        conn.commit()

    return jsonify({'success': True}), 200

@app.route('/kpis/<int:job_type_id>', methods=['GET'])
@login_required
@handle_db_errors
def get_kpis_for_job_type(job_type_id):
    try:
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor()

            # Updated SQL query to explicitly fetch the bit_value field
            query = '''
                SELECT id, kpi_name, data_type, default_value, db_offset, read_write AS access, unit, bit_value
                FROM kpi_definitions
                WHERE job_type_id = %s
            '''
            cursor.execute(query, (job_type_id,))
            kpis = cursor.fetchall()

            # Log the raw fetched KPIs
            print("Raw KPIs from DB:", kpis)

            # Process the KPIs to ensure access and bit_value fields are included
            processed_kpis = []
            for kpi in kpis:
                # Convert the kpi row to a dictionary explicitly
                kpi_dict = dict(kpi)

                # Add the access field if missing or null
                if 'access' not in kpi_dict:
                    kpi_dict['access'] = 'N/A'

                # Add the bit_value field if missing or null
                if 'bit_value' not in kpi_dict:
                    kpi_dict['bit_value'] = 0  # Default bit value

                # Print each KPI to debug
                print("Processed KPI:", kpi_dict)
                processed_kpis.append(kpi_dict)

            return jsonify(processed_kpis)

    except Exception as e:
        logging.error(f"Error fetching KPIs for job_type_id {job_type_id}: {e}")
        return jsonify({'error': 'An error occurred while fetching KPIs'}), 500
@app.route('/get-order/<int:order_id>', methods=['GET'])
@login_required
@handle_db_errors
def get_order(order_id):
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM orders WHERE id = %s', (order_id,))
        order = cursor.fetchone()

        if not order:
            return jsonify({'error': 'Order not found'}), 404

        return jsonify(order)
    
# ---------------------------------------Feeders_recipe API ----------------------------------------------------------------------

@app.route('/feeder-recipes/create', methods=['POST'])
@handle_db_errors
def create_feeder_recipe():
    data = request.get_json()
    job_type_id = data['jobTypeId']
    name = data['recipeName']
    kpis = data.get('kpis', [])
    feeders = data.get('feeders', [])
    final_product_id = data.get('finalProductId')
    description = data.get('description', {})

    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            INSERT INTO feeder_recipes (job_type_id, name, kpis, feeders, final_product_id, description)
            VALUES (%s, %s, %s::jsonb, %s::jsonb, %s, %s::jsonb)
            RETURNING id
        ''', (
            job_type_id,
            name,
            json.dumps(kpis),
            json.dumps(feeders),
            final_product_id,
            json.dumps(description)
        ))
        recipe_id = cursor.fetchone()['id']
        conn.commit()

    return jsonify({'status': 'success', 'recipeId': recipe_id}), 201


@app.route('/feeder-recipes/update', methods=['POST'])
@handle_db_errors
def update_feeder_recipe():
    data = request.get_json()
    logging.debug(f"Received data for update_feeder_recipe: {data}")

    # Extract fields
    recipe_id = data.get('recipeId')
    final_product_ids = data.get('final_product_id')  # now expects a list
    is_released = data.get('isReleased', False)
    kpis = data.get('kpis', [])
    feeders = data.get('feeders', [])
    description = data.get('description', {})
    destinations = data.get('destinations', [])

    # ---------- VALIDATION ----------
    if not recipe_id or not final_product_ids or not kpis:
        return jsonify({'error': 'Missing required data'}), 400

    if not isinstance(final_product_ids, list):
        return jsonify({'error': 'final_product_id must be a list of integers'}), 400

    try:
        recipe_id = int(recipe_id)
        final_product_ids = [int(pid) for pid in final_product_ids]
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid recipeId or final_product_id values'}), 400

    if is_released is not None and not isinstance(is_released, bool):
        return jsonify({'error': 'isReleased must be a boolean'}), 400

    if description is not None and not isinstance(description, dict):
        return jsonify({'error': 'description must be a JSON object'}), 400

    if not isinstance(destinations, list):
        return jsonify({'error': 'destinations must be a list'}), 400

    # ---------- DATABASE UPDATE ----------
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()

        try:
            cursor.execute('''
                UPDATE feeder_recipes
                SET final_product_id = %s,
                    kpis = %s::jsonb,
                    feeders = %s::jsonb,
                    destinations = %s::jsonb,
                    description = %s::jsonb,
                    released = %s
                WHERE id = %s
            ''', (
                final_product_ids,
                json.dumps(kpis),
                json.dumps(feeders),
                json.dumps(destinations),
                json.dumps(description),
                is_released,
                recipe_id
            ))

            conn.commit()
            logging.info(f"Feeder recipe ID {recipe_id} updated successfully")
            return jsonify({'status': 'success'}), 200

        except Exception as e:
            logging.error(f"Unexpected error during feeder recipe update: {e}")
            conn.rollback()
            return jsonify({'error': 'An unexpected error occurred while updating the feeder recipe.'}), 500

@app.route('/feeder-recipes/<int:job_type_id>', methods=['GET'])
@login_required
@handle_db_errors
def list_feeder_recipes(job_type_id):
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, name, released FROM feeder_recipes
            WHERE job_type_id = %s
        ''', (job_type_id,))
        recipes = cursor.fetchall()

        # Add 'type' field while still inside the block
        for r in recipes:
            r['type'] = 'feeder'

        return jsonify(recipes)  # still inside the block

@app.route('/feeder-recipes/details/<int:recipe_id>', methods=['GET'])
@handle_db_errors
def get_feeder_recipe_details(recipe_id):
    try:
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

            # 1. Fetch recipe
            cursor.execute('''
                SELECT id, job_type_id, name, kpis, feeders, released,
                       final_product_id, description
                FROM feeder_recipes
                WHERE id = %s
            ''', (recipe_id,))
            recipe = cursor.fetchone()

            if not recipe:
                return jsonify({'error': 'Recipe not found'}), 404

            # 2. Safely parse JSON fields
            for key in ['kpis', 'feeders', 'description']:
                if isinstance(recipe.get(key), str):
                    try:
                        recipe[key] = json.loads(recipe[key])
                    except Exception:
                        recipe[key] = [] if key != 'description' else {}

            # 3. Fetch material map
            cursor.execute("SELECT id, material_name FROM materials")
            material_map = {row['id']: row['material_name'] for row in cursor.fetchall()}

            # 4. Normalize feeders with material name
            enriched_feed = []
            for f in recipe.get('feeders', []):
                material_id = f.get('material_id') or f.get('materialId')
                enriched_feed.append({
                    'materialId': material_id,
                    'percentage': f.get('percentage', 0),
                    'material_name': material_map.get(material_id, 'Unnamed')
                })

            # 5. Return structured response
            return jsonify({
                'id': recipe['id'],
                'job_type_id': recipe['job_type_id'],
                'name': recipe['name'],
                'kpis': recipe.get('kpis', []),
                'feeders': enriched_feed,
                'final_product_id': recipe.get('final_product_id'),
                'description': recipe.get('description', {}),
                'released': recipe.get('released', False),
                'type': 'feeder'
            }), 200

    except Exception as e:
        logging.error(f"Error in get_feeder_recipe_details: {e}")
        return jsonify({'error': 'Unexpected server error'}), 500
    
@app.route('/feeder-recipes/delete/<int:recipe_id>', methods=['DELETE'])
@handle_db_errors
def delete_feeder_recipe(recipe_id):
    with closing(get_db_connection()) as conn:
        cursor = conn.cursor()

        # Optional: Check if recipe exists first
        cursor.execute("SELECT id FROM feeder_recipes WHERE id = %s", (recipe_id,))
        if not cursor.fetchone():
            return jsonify({'error': 'Feeder recipe not found'}), 404

        try:
            cursor.execute("DELETE FROM feeder_recipes WHERE id = %s", (recipe_id,))
            conn.commit()
            logging.info(f"Feeder recipe ID {recipe_id} deleted successfully")
            return jsonify({'status': 'success', 'message': f'Recipe {recipe_id} deleted'}), 200
        except Exception as e:
            logging.error(f"Error deleting feeder recipe ID {recipe_id}: {e}")
            conn.rollback()
            return jsonify({'error': 'Failed to delete feeder recipe'}), 500
        
from collections import defaultdict
def archive_old_logs():
    from collections import defaultdict
    import datetime
    import json

    # ✅ Wait until the next hour boundary before starting
    now = datetime.datetime.now()
    next_hour = (now + datetime.timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    wait_seconds = (next_hour - now).total_seconds()
    logger.info(f"⏰ [FCL Archive] Waiting {wait_seconds:.0f} seconds until {next_hour.strftime('%H:%M:%S')} for first archive run")
    eventlet.sleep(wait_seconds)

    while True:
        try:
            with get_db_connection() as conn:
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    # 1. Select logs before current hour
                    cur.execute("""
                        SELECT * FROM fcl_monitor_logs
                        WHERE created_at < date_trunc('hour', NOW())
                    """)
                    rows = cur.fetchall()

                    if not rows:
                        logger.info("ℹ️ No full-hour FCL logs to archive.")
                        # ✅ Wait until next hour boundary
                        now = datetime.datetime.now()
                        next_hour = (now + datetime.timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
                        wait_seconds = (next_hour - now).total_seconds()
                        logger.info(f"⏰ [FCL Archive] Next check at {next_hour.strftime('%H:%M:%S')}")
                        eventlet.sleep(wait_seconds)
                        continue

                    # 2. Build CUMULATIVE per-bin weights (convert t/h → kg for each record)
                    # ✅ Calculate divisor dynamically based on actual record count and time span
                    first_time = min(r.get('created_at') for r in rows if r.get('created_at'))
                    last_time = max(r.get('created_at') for r in rows if r.get('created_at'))
                    time_span_seconds = (last_time - first_time).total_seconds()
                    
                    # Calculate actual divisor: how many records per hour?
                    # divisor = (number of records / time span in hours) = records per hour
                    if time_span_seconds > 0:
                        time_span_hours = time_span_seconds / 3600
                        actual_divisor = len(rows) / time_span_hours
                    else:
                        actual_divisor = 1200  # Fallback to 3-second assumption
                    
                    logger.info(f"📊 [FCL Archive] Time span: {time_span_seconds:.0f}s | Records: {len(rows)} | Divisor: {actual_divisor:.0f} (records/hour)")
                    
                    bin_cumulative = defaultdict(float)
                    receiver_cumulative_kg = 0.0
                    fcl_2_520we_last = 0  # Track the cumulative counter from last record

                    for row in rows:
                        sources = row.get('active_sources', [])
                        if isinstance(sources, str):
                            sources = json.loads(sources)
                        
                        # ✅ Convert each sender's flow rate (t/h) to kg per record using ACTUAL divisor
                        for src in sources:
                            bin_id = src.get('bin_id')
                            weight_tph = float(src.get('weight', 0))  # t/h
                            kg_per_record = weight_tph * 1000 / actual_divisor  # ✅ Dynamic divisor!
                            bin_cumulative[bin_id] += kg_per_record  # Accumulate kg
                        
                        # ✅ Convert receiver flow rate (t/h) to kg per record using ACTUAL divisor
                        receiver_tph = float(row.get('receiver', 0) or 0)  # t/h (flow rate only, not cumulative)
                        receiver_kg_per_record = receiver_tph * 1000 / actual_divisor  # ✅ Dynamic divisor!
                        receiver_cumulative_kg += receiver_kg_per_record
                        
                        # ✅ FCL_2_520WE: Cumulative counter (NOT a flow rate!)
                        # This value is ALREADY in kg and keeps overwriting to get the LAST value
                        # We do NOT sum it or convert it - just store the final value!
                        fcl_receivers = row.get('fcl_receivers', [])
                        if isinstance(fcl_receivers, str):
                            fcl_receivers = json.loads(fcl_receivers)
                        for rec in fcl_receivers:
                            if rec.get('id') == 'FCL_2_520WE':
                                fcl_2_520we_last = float(rec.get('weight', 0))  # Already in kg, just keep last value

                    # Store cumulative kg for each bin
                    per_bin_json = json.dumps([
                        {"bin_id": k, "total_weight": round(v, 3)}  # kg
                        for k, v in bin_cumulative.items()
                    ])
                    
                    # Total produced = sum of all sender bins (kg) + receiver flow (kg)
                    total_bin_weight_kg = sum(bin_cumulative.values())
                    produced_weight = round(total_bin_weight_kg + receiver_cumulative_kg, 3)
                    
                    logger.info(f"📦 [FCL Archive] Records: {len(rows)} | Senders: {total_bin_weight_kg:.1f} kg | Receiver: {receiver_cumulative_kg:.1f} kg | Total: {produced_weight:.1f} kg | FCL_2_520WE (last value): {fcl_2_520we_last:.0f} kg")

                    latest = max(rows, key=lambda r: r.get('created_at') or datetime.datetime.min)

                    # ✅ Use Dubai timezone for archive timestamp
                    import pytz
                    from datetime import datetime as dt
                    dubai_tz = pytz.timezone('Asia/Dubai')
                    archive_time = dt.now(pytz.utc).astimezone(dubai_tz).replace(tzinfo=None)

                    # 3. Insert archive summary
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS fcl_monitor_logs_archive (
                            id SERIAL PRIMARY KEY,
                            job_status INT,
                            line_running BOOLEAN,
                            receiver NUMERIC,
                            fcl_receivers JSONB,
                            flow_rate NUMERIC,
                            produced_weight NUMERIC,
                            water_consumed NUMERIC,
                            moisture_offset NUMERIC,
                            moisture_setpoint NUMERIC,
                            active_sources JSONB,
                            active_destination JSONB,
                            order_name TEXT,
                            per_bin_weights JSONB,
                            created_at TIMESTAMP
                        );
                    """)
                    # ✅ FCL_2_520WE: Store LAST value (not summed!)
                    # This is a cumulative counter from PLC (already in kg)
                    # We just store the final reading from the last record of the hour
                    latest_fcl_receivers = latest.get('fcl_receivers', [])
                    if isinstance(latest_fcl_receivers, str):
                        latest_fcl_receivers = json.loads(latest_fcl_receivers)
                    
                    # Update FCL_2_520WE to the LAST cumulative value (not summed over the hour!)
                    for rec in latest_fcl_receivers:
                        if rec.get('id') == 'FCL_2_520WE':
                            rec['weight'] = fcl_2_520we_last  # Just the last value, already in kg
                    
                    cur.execute("""
                        INSERT INTO fcl_monitor_logs_archive (
                            job_status, line_running, receiver, fcl_receivers, flow_rate, produced_weight,
                            water_consumed, moisture_offset, moisture_setpoint, cleaning_scale_bypass,
                            active_sources, active_destination, order_name,
                            per_bin_weights, created_at
                        )
                        VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s, %s,
                                %s::jsonb, %s::jsonb, %s,
                                %s::jsonb, %s)
                    """, (
                        latest['job_status'],
                        latest['line_running'],
                        round(receiver_cumulative_kg, 3),  # ✅ Cumulative kg, not summed t/h
                        json.dumps(latest_fcl_receivers),  # ✅ Include updated FCL_2_520WE counter
                        latest['flow_rate'],
                        produced_weight,  # ✅ Total cumulative kg (senders + receiver)
                        latest['water_consumed'],
                        latest['moisture_offset'],
                        latest['moisture_setpoint'],
                        latest.get('cleaning_scale_bypass', False), # ✅ New field
                        json.dumps(latest['active_sources']),
                        json.dumps(latest['active_destination']),
                        latest['order_name'],
                        per_bin_json,  # ✅ Per-bin cumulative kg
                        archive_time  # ✅ Explicit Dubai timezone timestamp
                    ))

                    # 4. Now safely delete the logs that were archived
                    cur.execute("""
                        DELETE FROM fcl_monitor_logs
                        WHERE created_at < date_trunc('hour', NOW())
                    """)
                    conn.commit()

                    logger.info(f"✅ FCL archive inserted and {len(rows)} logs deleted. | Archive Time: {archive_time}")

        except Exception as e:
            logger.error(f"❌ Archive failed: {e}", exc_info=True)

        # ✅ Wait until the next hour boundary (not just 3600 seconds)
        now = datetime.datetime.now()
        next_hour = (now + datetime.timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
        wait_seconds = (next_hour - now).total_seconds()
        logger.info(f"⏰ [FCL Archive] Next archive at {next_hour.strftime('%H:%M:%S')} (sleeping {wait_seconds:.0f} seconds)")
        eventlet.sleep(wait_seconds)

def archive_old_scl_logs():
    from collections import defaultdict
    import json
    import datetime

    # ✅ Wait until the next hour boundary before starting
    now = datetime.datetime.now()
    next_hour = (now + datetime.timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    wait_seconds = (next_hour - now).total_seconds()
    logger.info(f"⏰ [SCL Archive] Waiting {wait_seconds:.0f} seconds until {next_hour.strftime('%H:%M:%S')} for first archive run")
    eventlet.sleep(wait_seconds)

    while True:
        try:
            with get_db_connection() as conn:
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    # ✅ Use Dubai timezone for archive timestamp
                    import pytz
                    from datetime import datetime as dt
                    dubai_tz = pytz.timezone('Asia/Dubai')
                    archive_time = dt.now(pytz.utc).astimezone(dubai_tz).replace(tzinfo=None)

                    # 1. Ensure archive table exists
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS scl_monitor_logs_archive (
                            id SERIAL PRIMARY KEY,
                            job_status INT,
                            line_running BOOLEAN,
                            receiver NUMERIC,
                            flow_rate NUMERIC,
                            produced_weight NUMERIC,
                            water_consumed NUMERIC,
                            moisture_offset NUMERIC,
                            moisture_setpoint NUMERIC,
                            active_sources JSONB,
                            active_destination JSONB,
                            order_name TEXT,
                            per_bin_weights JSONB,
                            created_at TIMESTAMP
                        );
                    """)

                    # 2. SELECT ONLY — do not delete yet
                    cur.execute("""
                        SELECT *
                        FROM scl_monitor_logs
                        WHERE created_at < date_trunc('hour', NOW())
                    """)
                    rows = cur.fetchall()

                    if not rows:
                        logger.info("ℹ️ No full-hour SCL logs to archive.")
                        # ✅ Wait until next hour boundary
                        now = datetime.datetime.now()
                        next_hour = (now + datetime.timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
                        wait_seconds = (next_hour - now).total_seconds()
                        logger.info(f"⏰ [SCL Archive] Next check at {next_hour.strftime('%H:%M:%S')}")
                        eventlet.sleep(wait_seconds)
                        continue

                    # 3. Build CUMULATIVE per-bin weights (convert t/h → kg for each record)
                    # ✅ Calculate divisor dynamically based on actual record count and time span
                    first_time = min(r.get('created_at') for r in rows if r.get('created_at'))
                    last_time = max(r.get('created_at') for r in rows if r.get('created_at'))
                    time_span_seconds = (last_time - first_time).total_seconds()
                    
                    # Calculate actual divisor based on records per hour
                    if time_span_seconds > 0:
                        time_span_hours = time_span_seconds / 3600
                        actual_divisor = len(rows) / time_span_hours
                    else:
                        actual_divisor = 1200  # Fallback
                    
                    logger.info(f"📊 [SCL Archive] Time span: {time_span_seconds:.0f}s | Records: {len(rows)} | Divisor: {actual_divisor:.0f} (records/hour)")
                    
                    bin_cumulative = defaultdict(float)
                    receiver_cumulative_kg = 0.0

                    for row in rows:
                        sources = row.get('active_sources', [])
                        if isinstance(sources, str):
                            sources = json.loads(sources)

                        # ✅ Convert each sender's flow rate (t/h) to kg per record using ACTUAL divisor
                        for src in sources:
                            bin_id = src.get('bin_id')
                            flowrate_tph = float(src.get('flowrate_tph', 0))  # t/h
                            kg_per_record = flowrate_tph * 1000 / actual_divisor  # ✅ Dynamic divisor!
                            bin_cumulative[bin_id] += kg_per_record  # Accumulate kg
                            logger.debug(f"[SCL Archive] bin_id={bin_id}, flowrate={flowrate_tph} t/h → {kg_per_record:.3f} kg/record")

                        # ✅ Convert receiver flow rate (t/h) to kg per record using ACTUAL divisor
                        receiver_tph = float(row.get('receiver') or 0)  # t/h
                        receiver_kg_per_record = receiver_tph * 1000 / actual_divisor  # ✅ Dynamic divisor!
                        receiver_cumulative_kg += receiver_kg_per_record

                    # 4. Store cumulative kg for each bin
                    per_bin_json = json.dumps([
                        {"bin_id": k, "total_weight": round(v, 3)}  # kg
                        for k, v in bin_cumulative.items()
                    ])

                    # Total produced = receiver flow (kg) (which matches sender flow)
                    total_bin_weight_kg = sum(bin_cumulative.values())
                    
                    # ✅ Force receiver to match sender total (Input = Output) for consistency
                    receiver_cumulative_kg = total_bin_weight_kg
                    
                    produced_weight = round(receiver_cumulative_kg, 3)

                    # ✅ Safety Check: Max capacity 24,000 kg/hour
                    if produced_weight > 24000:
                         logger.warning(f"⚠️ [SCL Archive] Produced weight {produced_weight} kg > 24000 kg! Capping at 24000.")
                         produced_weight = 24000
                    
                    logger.info(f"📦 [SCL Archive] Records: {len(rows)} | Senders: {total_bin_weight_kg:.1f} kg | Receiver: {receiver_cumulative_kg:.1f} kg | Produced (Capped): {produced_weight:.1f} kg")

                    # 5. Use latest record metadata
                    latest = max(rows, key=lambda r: r.get('created_at') or datetime.datetime.min)

                    # 6. Insert into archive with cumulative kg values
                    cur.execute("""
                        INSERT INTO scl_monitor_logs_archive (
                            job_status, line_running, receiver, flow_rate, produced_weight,
                            water_consumed, moisture_offset, moisture_setpoint,
                            active_sources, active_destination, order_name,
                            per_bin_weights, created_at
                        )
                        VALUES (%s, %s, %s, %s, %s, %s, %s, %s,
                                %s::jsonb, %s::jsonb, %s,
                                %s::jsonb, %s)
                    """, (
                        latest['job_status'],
                        latest['line_running'],
                        round(receiver_cumulative_kg, 3),  # ✅ Cumulative kg, not summed t/h
                        latest['flow_rate'],
                        produced_weight,  # ✅ Total cumulative kg (senders + receiver)
                        latest['water_consumed'],
                        latest['moisture_offset'],
                        latest['moisture_setpoint'],
                        json.dumps(latest['active_sources']),
                        json.dumps(latest['active_destination']),
                        latest['order_name'],
                        per_bin_json,  # ✅ Per-bin cumulative kg
                        archive_time  # ✅ Explicit Dubai timezone timestamp
                    ))

                    # 7. Delete only now that insert is done
                    cur.execute("""
                        DELETE FROM scl_monitor_logs
                        WHERE created_at < date_trunc('hour', NOW())
                    """)

                    conn.commit()
                    logger.info(f"✅ SCL archive inserted. {len(rows)} rows archived and deleted from live table. | Archive Time: {archive_time}")

        except Exception as e:
            logger.error(f"❌ Archive SCL failed: {e}", exc_info=True)

        # ✅ Wait until the next hour boundary (not just 3600 seconds)
        now = datetime.datetime.now()
        next_hour = (now + datetime.timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
        wait_seconds = (next_hour - now).total_seconds()
        logger.info(f"⏰ [SCL Archive] Next archive at {next_hour.strftime('%H:%M:%S')} (sleeping {wait_seconds:.0f} seconds)")
        eventlet.sleep(wait_seconds)

def archive_mila_logs():
    import json
    from collections import defaultdict
    import datetime

    # ✅ Wait until the next hour boundary before starting
    now = datetime.datetime.now()
    next_hour = (now + datetime.timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    wait_seconds = (next_hour - now).total_seconds()
    logger.info(f"⏰ [MILA Archive] Waiting {wait_seconds:.0f} seconds until {next_hour.strftime('%H:%M:%S')} for first archive run")
    eventlet.sleep(wait_seconds)

    while True:
        try:
            with get_db_connection() as conn:
                with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
                    # ✅ Use Dubai timezone for archive timestamp
                    import pytz
                    from datetime import datetime as dt
                    dubai_tz = pytz.timezone('Asia/Dubai')
                    archive_time = dt.now(pytz.utc).astimezone(dubai_tz).replace(tzinfo=None)

                    # 1. Ensure archive table exists
                    cur.execute("""
                        CREATE TABLE IF NOT EXISTS mila_monitor_logs_archive (
                            id SERIAL PRIMARY KEY,
                            order_name TEXT,
                            status TEXT,
                            receiver JSONB,
                            bran_receiver JSONB,
                            yield_log JSONB,
                            setpoints_produced JSONB,
                            produced_weight NUMERIC,
                            created_at TIMESTAMP
                        );
                    """)

                    # 2. Select rows from the last full hour
                    cur.execute("""
                        SELECT *
                        FROM mila_monitor_logs
                        WHERE created_at < date_trunc('hour', NOW())
                    """)
                    rows = cur.fetchall()

                    if not rows:
                        logger.info("ℹ️ No MILA logs to archive.")
                        # ✅ Wait until next hour boundary
                        now = datetime.datetime.now()
                        next_hour = (now + datetime.timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
                        wait_seconds = (next_hour - now).total_seconds()
                        logger.info(f"⏰ [MILA Archive] Next check at {next_hour.strftime('%H:%M:%S')}")
                        eventlet.sleep(wait_seconds)
                        continue

                    count = len(rows)

                    # 3. Max/Min flow
                    max_flow = max(r['yield_log'].get("Yield Max Flow (kg/s)", 0) for r in rows)
                    min_flow = min(r['yield_log'].get("Yield Min Flow (kg/s)", 0) for r in rows)

                    # 4. Average yield %
                    avg_yield_pct = defaultdict(float)
                    yield_pct_keys = set()
                    
                    # Track MILA_Flour1 sum separately if it appears in yield_log (legacy support)
                    mila_flour1_sum = 0.0
                    
                    for r in rows:
                        for k, v in r['yield_log'].items():
                            # Special handling for MILA_Flour1 if it exists in yield_log
                            if "MILA_Flour1" in k:
                                if isinstance(v, (int, float)):
                                    mila_flour1_sum += v
                                continue
                                
                            if isinstance(v, (int, float)) and "%" in k:
                                avg_yield_pct[k] += v
                                yield_pct_keys.add(k)
                    for k in yield_pct_keys:
                        avg_yield_pct[k] = round(avg_yield_pct[k] / count, 3)

                    # 5. Average setpoints %
                    avg_setpoints_pct = defaultdict(float)
                    setpoint_keys = set()
                    for r in rows:
                        for k, v in r['setpoints_produced'].items():
                            if isinstance(v, (int, float)) and "%" in k:
                                avg_setpoints_pct[k] += v
                                setpoint_keys.add(k)
                    for k in setpoint_keys:
                        avg_setpoints_pct[k] = round(avg_setpoints_pct[k] / count, 3)

                    # 6. Final setpoints: last row + avg %
                    last_row = rows[-1]
                    final_setpoints = {}
                    for k, v in last_row['setpoints_produced'].items():
                        if "%" in k and k in avg_setpoints_pct:
                            final_setpoints[k] = avg_setpoints_pct[k]
                        else:
                            final_setpoints[k] = v

                    # 7. ✅ Bran Receiver: Cumulative counters (NOT flow rates!)
                    # These values are ALREADY in kg and are cumulative totals from PLC
                    # We do NOT sum them or convert them - just store the LAST value!
                    # Examples: 9106 Bran coarse (288,078 kg), B1Scale (391,880 kg)
                    last_row = rows[-1]
                    
                    # Store the LAST cumulative value for bran_receiver (not summed over the hour!)
                    final_bran_receiver = {}
                    for k, v in last_row['bran_receiver'].items():
                        if isinstance(v, (int, float)):
                            final_bran_receiver[k] = round(float(v), 3)  # Just last value, already in kg
                    
                    logger.info(f"📊 Archive - Bran Receiver (last value, NOT summed): {final_bran_receiver}")


                    # 8. ✅ Receiver: FLOW RATE in kg/s - convert to total kg for the hour!
                    # Live monitor now stores in kg/s (converted from t/h)
                    # We need to: SUM all kg/s values, then multiply by average time interval
                    
                    # Calculate time span
                    first_time = min(r.get('created_at') for r in rows)
                    last_time = max(r.get('created_at') for r in rows)
                    time_span_seconds = (last_time - first_time).total_seconds() if last_time and first_time else 3600
                    
                    if time_span_seconds < 60:
                        time_span_seconds = 3600  # Fallback to 1 hour
                    
                    logger.info(f"📊 [MILA Archive] Records: {len(rows)} over {time_span_seconds:.0f}s")
                    
                    # SUM receiver flow rates (stored in kg/s, convert to total kg)
                    receiver_totals = defaultdict(lambda: {"bin_id": None, "material_code": None, "material_name": None, "sum_kg_s": 0.0})
                    
                    for row in rows:
                        receivers = row.get("receiver", [])
                        if isinstance(receivers, str):
                            receivers = json.loads(receivers or "[]")
                        
                        for rec in receivers:
                            bin_id = rec.get("bin_id")  # Capture bin_id
                            code = rec.get("material_code")
                            name = rec.get("material_name")
                            kg_per_s = float(rec.get("weight_kg", 0))  # Already in kg/s from live monitor
                        
                            key = f"{bin_id}-{code}-{name}"  # Include bin_id in key
                            receiver_totals[key]["bin_id"] = bin_id
                            receiver_totals[key]["material_code"] = code
                            receiver_totals[key]["material_name"] = name
                            receiver_totals[key]["sum_kg_s"] += kg_per_s  # SUM all kg/s values
                    
                    # Convert summed kg/s to total kg for the hour
                    # Method: average kg/s × total seconds
                    final_receiver = []
                    for val in receiver_totals.values():
                        avg_kg_s = val["sum_kg_s"] / len(rows)  # Average flow rate
                        total_kg = avg_kg_s * time_span_seconds  # Total kg over the time span
                        
                        final_receiver.append({
                            "bin_id": val["bin_id"],  # Include bin_id in archive
                            "material_code": val["material_code"],
                            "material_name": val["material_name"],
                            "weight_kg": round(total_kg, 3)
                        })
                    
                    logger.info(f"📊 Archive - Receiver (converted from kg/s to total kg): {final_receiver}")

                    # 9. ✅ Produced weight: Cumulative counter (NOT a flow rate!)
                    # This is ALREADY in kg from PLC cumulative counter
                    # We do NOT sum it - just store the LAST value!
                    last_produced = float(last_row.get("produced_weight", 0))
                    total_produced_weight = round(last_produced, 3)  # Last value only, already in kg
                    
                    logger.info(f"📊 Archive - Produced Weight (last value, NOT summed): {total_produced_weight} kg")

                    # 10. Final yield log
                    final_yield_log = {
                        "Yield Max Flow (kg/s)": round(max_flow, 3),
                        "Yield Min Flow (kg/s)": round(min_flow, 3),
                        **avg_yield_pct
                    }

                    # ✅ Add MILA_Flour1 (%) if it was tracked separately
                    if mila_flour1_sum > 0 and count > 0:
                        final_yield_log["MILA_Flour1 (%)"] = round(mila_flour1_sum / count, 3)
                        logger.debug(f"📊 Archive - Added MILA_Flour1 (%): {final_yield_log['MILA_Flour1 (%)']}")

                    # 11. ✅ Insert archive with MIXED handling
                    # MILA has BOTH flow rates and cumulative counters!
                    # - receiver: SUMMED from flow rates (converted to kg total)
                    # - bran_receiver: Last cumulative kg values (NOT summed)
                    # - produced_weight: Last cumulative kg value (NOT summed)
                    cur.execute("""
                        INSERT INTO mila_monitor_logs_archive (
                            order_name, status, receiver,
                            bran_receiver, yield_log, setpoints_produced,
                            produced_weight, created_at
                        )
                        VALUES (%s, %s, %s::jsonb, %s::jsonb, %s::jsonb,
                                %s::jsonb, %s, %s)
                    """, (
                        last_row["order_name"],
                        last_row["status"],
                        json.dumps(final_receiver),         # ✅ SUMMED from flow rates
                        json.dumps(final_bran_receiver),    # Last value, already kg
                        json.dumps(final_yield_log),
                        json.dumps(final_setpoints),
                        total_produced_weight,              # Last value, already kg
                        archive_time  # ✅ Explicit Dubai timezone timestamp
                    ))

                    # 12. Delete archived rows
                    cur.execute("""
                        DELETE FROM mila_monitor_logs
                        WHERE created_at < date_trunc('hour', NOW())
                    """)

                    conn.commit()
                    logger.info(f"✅ MILA archive inserted (RAW cumulative values). Order: {last_row['order_name']} | {len(rows)} rows deleted | Last Produced Weight: {total_produced_weight} kg | Archive Time: {archive_time}")

        except Exception as e:
            logger.error(f"❌ MILA archive error: {e}", exc_info=True)

        # ✅ Wait until the next hour boundary (not just 3600 seconds)
        now = datetime.datetime.now()
        next_hour = (now + datetime.timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
        wait_seconds = (next_hour - now).total_seconds()
        logger.info(f"⏰ [MILA Archive] Next archive at {next_hour.strftime('%H:%M:%S')} (sleeping {wait_seconds:.0f} seconds)")
        eventlet.sleep(wait_seconds)

# ✅ OPTIMIZATION: Persistent PLC Connection Manager
class PersistentPLCConnection:
    """Manages persistent PLC connection with automatic reconnection"""
    
    def __init__(self, ip=None, rack=None, slot=None, name="PLC"):
        from plc_config import get_plc_config
        cfg = get_plc_config()
        self.ip = ip if ip is not None else cfg['ip']
        self.rack = rack if rack is not None else cfg['rack']
        self.slot = slot if slot is not None else cfg['slot']
        self.name = name
        self.client = None
        self.connected = False
        self.last_error = None
        self.reconnect_attempts = 0
        
    def connect(self):
        """Establish PLC connection"""
        try:
            if self.client:
                try:
                    self.client.disconnect()
                    self.client.destroy()
                except:
                    pass
            
            self.client = snap7.client.Client()
            self.client.connect(self.ip, self.rack, self.slot)
            self.connected = True
            self.reconnect_attempts = 0
            logger.info(f"✅ [{self.name}] PLC connected: {self.ip}")
            return True
        except Exception as e:
            self.connected = False
            self.last_error = str(e)
            logger.error(f"❌ [{self.name}] PLC connection failed: {e}")
            return False
    
    def is_connected(self):
        """Check if connection is alive"""
        if not self.client or not self.connected:
            return False
        
        try:
            # Try a quick operation to verify connection
            self.client.get_cpu_state()
            return True
        except:
            self.connected = False
            return False
    
    def reconnect_if_needed(self):
        """Reconnect if connection is lost"""
        if not self.is_connected():
            logger.warning(f"⚠️ [{self.name}] Connection lost, reconnecting...")
            return self.connect()
        return True
    
    def read_db(self, db_number, start, size):
        """Read data from PLC DB with automatic reconnection"""
        max_retries = 3
        
        for attempt in range(max_retries):
            if not self.reconnect_if_needed():
                if attempt < max_retries - 1:
                    eventlet.sleep(0.5)  # Wait before retry
                    continue
                else:
                    raise Exception(f"Failed to reconnect to PLC after {max_retries} attempts")
            
            try:
                data = self.client.db_read(db_number, start, size)
                return data
            except Exception as e:
                logger.warning(f"⚠️ [{self.name}] Read failed (attempt {attempt + 1}/{max_retries}): {e}")
                self.connected = False
                if attempt < max_retries - 1:
                    eventlet.sleep(0.5)
                else:
                    raise
    
    def disconnect(self):
        """Disconnect from PLC"""
        try:
            if self.client:
                self.client.disconnect()
                self.client.destroy()
                self.connected = False
                logger.info(f"🔌 [{self.name}] PLC disconnected")
        except Exception as e:
            logger.warning(f"⚠️ [{self.name}] Error during disconnect: {e}")

# Create persistent PLC connections (will be initialized when monitors start)
fcl_plc = None
scl_plc = None
mila_plc = None

def get_next_order_number(prefix, live_table, archive_table):
    """
    Determines the next order number by checking both live and archive tables
    for the highest existing number associated with the given prefix.
    """
    max_num = 0
    
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cursor:
                # Check live table
                cursor.execute(f"SELECT order_name FROM {live_table} WHERE order_name LIKE %s", (f'{prefix}%',))
                live_rows = cursor.fetchall()
                
                # Check archive table
                cursor.execute(f"SELECT order_name FROM {archive_table} WHERE order_name LIKE %s", (f'{prefix}%',))
                archive_rows = cursor.fetchall()
                
                all_rows = live_rows + archive_rows
                
                for row in all_rows:
                    name = row['order_name']
                    # Extract number part using regex
                    match = re.search(rf"^{prefix}(\d+)$", name)
                    if match:
                        num = int(match.group(1))
                        if num > max_num:
                            max_num = num
                            
    except Exception as e:
        logger.error(f"Error calculating next order number for {prefix}: {e}")
        
    return max_num + 1

mila_order_counter = 1
mila_current_order_name = None
mila_session_started = None

def mila_realtime_monitor():
    import datetime
    import json

    global mila_order_counter, mila_current_order_name, mila_session_started

    # Initialize counter from DB
    mila_order_counter = get_next_order_number("MILA", "mila_monitor_logs", "mila_monitor_logs_archive")
    logger.info(f"✅ MILA monitor started. Next Order ID: {mila_order_counter}")

    # Material keyword → DB2099 key mapping
    material_flow_mapping = {
        "semolina": "mila_semolina",
        "flour": "mila_flour_1",
        "baking": "mila_flour_1",
        "bran fine": "bran_fine",
        "bran coarse": "bran_coarse"
    }

    while True:
        loop_start_time = time.time()  # ✅ Record loop start time
        try:
            res = http.request("GET", "http://127.0.0.1:5001/orders/plc/db499-db2099-monitor")
            if res.status != 200:
                logger.warning("⚠️ Failed to fetch MILA monitor")
                eventlet.sleep(1)
                continue

            data = json.loads(res.data.decode("utf-8"))
            if data.get("status") != "success":
                logger.warning("❌ Invalid response from MILA monitor")
                eventlet.sleep(1)
                continue

            DB499 = data.get("DB499", {})
            DB2099 = data.get("DB2099", {})

            # WebSocket data
            mila_websocket_data = {
                "DB499": DB499,
                "DB2099": DB2099,
                "bran_receiver": data.get("bran_receiver", {}),  # ✅ Include bran_receiver for live monitor
                "receiver_bins": data.get("receiver_bins", []),
                "timestamp": datetime.datetime.now().isoformat()
            }
            socketio.emit("mila_data", mila_websocket_data)

            # Enrich receiver bin weights - Use same logic as frontend
            # ✅ Only process first 2 receiver bins (exclude Semolina)
            receiver_bins = []
            receiver_bin_list = data.get("receiver_bins", [])
            
            for idx, bin_data in enumerate(receiver_bin_list):
                # Skip Semolina entries (material_code 9103 or idx > 1)
                material = bin_data.get("material")
                if material and material.get("material_code") == "9103":
                    logger.debug(f"[MILA] Skipping Semolina receiver (bin_id={bin_data.get('bin_id')})")
                    continue
                
                # Only process first 2 receiver bins
                if idx > 1:
                    logger.debug(f"[MILA] Skipping receiver bin {idx} (only first 2 bins stored)")
                    continue
                
                entry = {
                    "material_name": None,
                    "material_code": None,
                    "weight_kg": 0
                }
                
                bin_id = bin_data.get("bin_id")
                
                # Use database material if available, otherwise use default names
                if material:
                    entry["material_name"] = material.get("material_name")
                    entry["material_code"] = material.get("material_code")
                
                # Match receiver bin position to DB2099 flow field (same as frontend logic)
                if idx == 0 and DB499.get("receiver_bin_id_1", 0) != 0:
                    # First receiver bin uses yield_max_flow (PLC sends in t/h)
                    flow_rate_tph = DB2099.get("yield_max_flow", 0)
                    # ✅ Convert t/h to kg/s for consistent storage
                    entry["weight_kg"] = flow_rate_tph * 1000 / 3600  # t/h → kg/s
                    # Provide default name if not in database
                    if not entry["material_name"]:
                        entry["material_name"] = "Flour Silo"
                        entry["material_code"] = "0051"
                    
                    # ✅ Store bin ID directly in the entry for report display
                    entry["bin_id"] = str(bin_id) if bin_id else "Unknown"
                    
                    logger.debug(f"[MILA] Receiver bin 1 (bin_id={bin_id}) → {flow_rate_tph} t/h = {entry['weight_kg']:.3f} kg/s")
                    receiver_bins.append(entry)
                elif idx == 1 and DB499.get("receiver_bin_id_2", 0) != 0:
                    # Second receiver bin uses yield_min_flow (PLC sends in t/h)
                    flow_rate_tph = DB2099.get("yield_min_flow", 0)
                    # ✅ Convert t/h to kg/s for consistent storage
                    entry["weight_kg"] = flow_rate_tph * 1000 / 3600  # t/h → kg/s
                    # Provide default name if not in database
                    if not entry["material_name"]:
                        entry["material_name"] = "Flour Silo"
                        entry["material_code"] = "0055"
                        
                    # ✅ Store bin ID directly in the entry for report display
                    entry["bin_id"] = str(bin_id) if bin_id else "Unknown"
                    
                    logger.debug(f"[MILA] Receiver bin 2 (bin_id={bin_id}) → {flow_rate_tph} t/h = {entry['weight_kg']:.3f} kg/s")
                    receiver_bins.append(entry)
                else:
                    logger.debug(f"[MILA] Receiver bin {idx} (bin_id={bin_id}) inactive or not configured")
            
            # Semolina is tracked in bran_receiver, not in receiver

            # ✅ Use Asia/Dubai timezone (UTC+4) for correct local timestamps
            import pytz
            from datetime import datetime as dt
            dubai_tz = pytz.timezone('Asia/Dubai')
            # Get current UTC time and convert to Dubai timezone (naive datetime for TIMESTAMP column)
            now = dt.now(pytz.utc).astimezone(dubai_tz).replace(tzinfo=None)
            
            # ✅ Convert boolean flags to status code
            linning_running = DB499.get("linning_running", False)
            linning_stopped = DB499.get("linning_stopped", False)
            
            # Determine status: 1 = running, 0 = stopped
            mila_status = 1 if linning_running and not linning_stopped else 0
            
            logger.info(f"[MILA] Loop Time: {now} | Line Running: {linning_running} | Status: {mila_status} | Order: {mila_current_order_name}")

            # ✅ Simplified: Only use status 1 (start) and 0 (end)
            if mila_status == 1:
                # 🆕 Order starts - create new order if not exists
                if not mila_current_order_name or not mila_session_started:
                    mila_current_order_name = f"MILA{mila_order_counter}"
                    mila_order_counter += 1
                    mila_session_started = now
                    logger.info(f"🆕 New MILA Order Started: {mila_current_order_name}")
                # Store data when status = 1
                
            elif mila_status == 0:
                # 🛑 Order ends - mark complete and move to next order
                if mila_current_order_name:
                    logger.info(f"✅ MILA Order Completed: {mila_current_order_name}")
                mila_current_order_name = None
                mila_session_started = None
                continue  # Skip storage when stopped

            # ✅ Only store data when status = 1 (order is active)
            if mila_status == 1:
                # Structured yield log
                # ✅ Convert flow rates from t/h to kg/s for consistent storage
                yield_max_tph = DB2099.get("yield_max_flow", 0)
                yield_min_tph = DB2099.get("yield_min_flow", 0)
                
                yield_log = {
                    "Yield Max Flow (kg/s)": round(yield_max_tph * 1000 / 3600, 3) if yield_max_tph else 0,  # t/h → kg/s
                    "Yield Min Flow (kg/s)": round(yield_min_tph * 1000 / 3600, 3) if yield_min_tph else 0,  # t/h → kg/s
                    "MILA_B1 (%)": DB2099.get("mila_b1", 0),
                    "MILA_Flour1 (%)": DB2099.get("mila_flour_1", 0),
                    "MILA_BranCoarse (%)": DB2099.get("mila_bran_coarse", 0),
                    "MILA_Semolina (%)": DB2099.get("mila_semolina", 0),
                    "MILA_BranFine (%)": DB2099.get("mila_bran_fine", 0)
                }

                # ✅ Use bran_receiver Non-Erasable Weights from API (DInt values in kg from DB2099)
                bran_receiver = data.get("bran_receiver", {})
                # Format with proper labels for database storage
                bran_receiver_formatted = {
                    "9106 Bran coarse (kg)": bran_receiver.get("bran_coarse", 0),
                    "9105 Bran fine (kg)": bran_receiver.get("bran_fine", 0),
                    "MILA_Flour1 (kg)": bran_receiver.get("flour_1", 0),
                    "B1Scale (kg)": bran_receiver.get("b1", 0),
                    "Semolina (kg)": bran_receiver.get("semolina", 0)
                }

                # Setpoint and status info
                setpoints_produced = {
                    "Feeder 1 Target (%)": DB499.get("feeder_1_target", 0),
                    "Feeder 1 Enabled (Bool)": DB499.get("feeder_1_selected", False),
                    "Feeder 2 Target (%)": DB499.get("feeder_2_target", 0),
                    "Feeder 2 Enabled (Bool)": DB499.get("feeder_2_selected", False),
                    "Flap 1 Selected (Bool)": DB499.get("flap_1_selected", False),
                    "Flap 2 Selected (Bool)": DB499.get("flap_2_selected", False),
                    "Depot Selected (Bool)": DB499.get("depot_selected", False),
                    "Semolina Selected (Bool)": DB499.get("semolina_selected", False),
                    "MILA_2_B789WE Selected (Bool)": DB499.get("mila_2_b789we_selected", False)
                }

                # Final produced weight (sum of known flows)
                produced_weight = round(
                    DB2099.get("bran_coarse", 0) +
                    DB2099.get("bran_fine", 0) +
                    DB2099.get("mila_flour_1", 0) +
                    DB2099.get("mila_semolina", 0) +
                    DB2099.get("mila_B1_scale", 0),
                    6
                )

                with get_db_connection() as conn:
                    cursor = conn.cursor()
                    
                    # ✅ Create table if it doesn't exist
                    cursor.execute("""
                        CREATE TABLE IF NOT EXISTS mila_monitor_logs (
                            id SERIAL PRIMARY KEY,
                            order_name TEXT,
                            status TEXT,
                            receiver JSONB,
                            bran_receiver JSONB,
                            yield_log JSONB,
                            setpoints_produced JSONB,
                            produced_weight NUMERIC,
                            created_at TIMESTAMP DEFAULT NOW()
                        );
                    """)
                    
                    # ✅ Ensure created_at column exists (for existing tables)
                    cursor.execute("""
                        DO $$ 
                        BEGIN
                            IF NOT EXISTS (
                                SELECT 1 FROM information_schema.columns 
                                WHERE table_name = 'mila_monitor_logs' 
                                AND column_name = 'created_at'
                            ) THEN
                                ALTER TABLE mila_monitor_logs 
                                ADD COLUMN created_at TIMESTAMP DEFAULT NOW();
                            END IF;
                        END $$;
                    """)
                    conn.commit()
                    
                    cursor.execute("""
                        INSERT INTO mila_monitor_logs (
                            order_name, status, receiver,
                            bran_receiver, yield_log,
                            setpoints_produced, produced_weight, created_at
                        ) VALUES (%s, %s, %s::jsonb, %s::jsonb, %s::jsonb,
                                  %s::jsonb, %s, %s)
                    """, (
                        mila_current_order_name,
                        "running",
                        json.dumps(receiver_bins),
                        json.dumps(bran_receiver_formatted),  # ✅ Use formatted bran receiver with DInt values
                        json.dumps(yield_log),
                        json.dumps(setpoints_produced),
                        produced_weight,
                        now  # ✅ Now uses Asia/Dubai timezone
                    ))
                    conn.commit()
                    logger.info(f"✅ MILA log saved: {mila_current_order_name} | Produced: {produced_weight} kg | Time: {now}")

        except Exception as e:
            logger.error(f"❌ MILA monitor error: {e}", exc_info=True)

        # ✅ Dynamic sleep to ensure EXACTLY 1 second per loop
        elapsed = time.time() - loop_start_time
        sleep_time = max(0, 1.0 - elapsed)
        if sleep_time < 0.5:
            logger.warning(f"[MILA] Loop took {elapsed:.3f}s, only sleeping {sleep_time:.3f}s")
        eventlet.sleep(sleep_time)

import datetime

monitor_running = False
fcl_order_counter = 1
fcl_current_order_name = None
fcl_session_started = None

def fcl_realtime_monitor():
    global monitor_running, fcl_order_counter
    global fcl_current_order_name, fcl_session_started

    monitor_running = True
    
    # Initialize counter from DB
    fcl_order_counter = get_next_order_number("FCL", "fcl_monitor_logs", "fcl_monitor_logs_archive")
    logger.info(f"✅ FCL monitor started. Next Order ID: {fcl_order_counter}")

    while True:
        loop_start_time = time.time()  # ✅ Record loop start time
        try:
            res = http.request("GET", "http://127.0.0.1:5001/orders/plc/db199-monitor")
            if res.status != 200:
                logger.warning("⚠️ Failed to fetch /db199-monitor")
                eventlet.sleep(1)
                continue

            response_json = json.loads(res.data.decode("utf-8"))
            data = response_json.get("data", {})
            fcl_receivers = response_json.get("fcl_receivers", [])  # ✅ Extract fcl_receivers from response
            
            # ✅ Include fcl_receivers in the data being emitted
            data['fcl_receivers'] = fcl_receivers
            
            logger.info(f"[FCL] Loop Time: {datetime.datetime.now()} | Job Status: {data.get('job_status')} | Order: {fcl_current_order_name} | Receivers: {[r.get('id') for r in fcl_receivers]}")

            socketio.emit("fcl_data", data)

            job_status = data.get("job_status")
            now = datetime.datetime.now()

            logger.debug(f"FCL Monitor Loop: job_status={job_status}, current_order={fcl_current_order_name}")

            # ✅ Simplified: Only use status 1 (start) and 0 (end)
            if job_status == 1:
                # 🆕 Order starts - create new order if not exists
                if not fcl_current_order_name or not fcl_session_started:
                    fcl_current_order_name = f"FCL{fcl_order_counter}"
                    fcl_order_counter += 1
                    fcl_session_started = now
                    logger.info(f"🆕 New FCL Order Started: {fcl_current_order_name}")
                # Store data when status = 1
                
            elif job_status == 0:
                # 🛑 Order ends - mark complete and move to next order
                if fcl_current_order_name:
                    logger.info(f"✅ FCL Order Completed: {fcl_current_order_name}")
                fcl_current_order_name = None
                fcl_session_started = None
                continue  # Skip storage when stopped

            # ✅ Only store data when status = 1 (order is active)
            if job_status == 1:

                # Use the enriched sources data (already includes weight and material info)
                enriched_sources = data.get("active_sources", [])
                total_sender_weight = 0.0

                for src in enriched_sources:
                    weight = float(src.get("weight", 0.0))  # t/h
                    total_sender_weight += weight

                # ✅ Get all receivers (array of objects)
                fcl_receivers = data.get("fcl_receivers", [])
                
                # ✅ FIX: Only sum flow rates (t/h), exclude cumulative counters (kg)
                # Receiver 1: bin 29 with flow rate ~23.9 t/h
                # Receiver 2: FCL_2_520WE with cumulative kg counter (don't add to produced_weight!)
                total_receiver_weight = 0.0
                for r in fcl_receivers:
                    receiver_id = r.get("id", "")
                    weight = float(r.get("weight", 0))
                    
                    # Only include flow rates (not cumulative counters like FCL_2_520WE)
                    if receiver_id != "FCL_2_520WE" and "520WE" not in str(receiver_id):
                        total_receiver_weight += weight
                        logger.debug(f"[FCL] Adding receiver {receiver_id}: {weight} t/h to total")
                    else:
                        logger.debug(f"[FCL] Skipping cumulative counter {receiver_id}: {weight} kg (not added to produced_weight)")
                
                # For backwards compatibility, store the first receiver's weight (bin 29 flow rate)
                receiver_weight = total_receiver_weight
                
                # ✅ Produced weight = sender flow rates + receiver flow rates (all in t/h)
                produced_weight = round(total_sender_weight + total_receiver_weight, 6)
                
                logger.info(f"[FCL] Senders: {total_sender_weight:.3f} t/h | Receiver flow: {total_receiver_weight:.3f} t/h | Produced: {produced_weight:.3f} t/h")

                # Insert log
                try:
                    # ✅ Use Asia/Dubai timezone (UTC+4) for correct local timestamps
                    import pytz
                    from datetime import datetime as dt
                    dubai_tz = pytz.timezone('Asia/Dubai')
                    # Get current UTC time and convert to Dubai timezone (naive datetime for TIMESTAMP column)
                    now = dt.now(pytz.utc).astimezone(dubai_tz).replace(tzinfo=None)
                    
                    with get_db_connection() as conn:
                        cursor = conn.cursor()
                        cursor.execute("""
                            CREATE TABLE IF NOT EXISTS fcl_monitor_logs (
                                id SERIAL PRIMARY KEY,
                                job_status INT,
                                line_running BOOLEAN,
                                receiver NUMERIC,
                                fcl_receivers JSONB,
                                flow_rate NUMERIC,
                                produced_weight NUMERIC,
                                water_consumed NUMERIC,
                                moisture_offset NUMERIC,
                                moisture_setpoint NUMERIC,
                                cleaning_scale_bypass BOOLEAN,
                                active_sources JSONB,
                                active_destination JSONB,
                                order_name TEXT,
                                created_at TIMESTAMP DEFAULT NOW()
                            );
                        """)
                        
                        # ✅ Ensure fcl_receivers column exists (for existing tables)
                        cursor.execute("""
                            DO $$ 
                            BEGIN
                                IF NOT EXISTS (
                                    SELECT 1 FROM information_schema.columns 
                                    WHERE table_name = 'fcl_monitor_logs' 
                                    AND column_name = 'fcl_receivers'
                                ) THEN
                                    ALTER TABLE fcl_monitor_logs 
                                    ADD COLUMN fcl_receivers JSONB DEFAULT '[]'::jsonb;
                                END IF;
                                
                                IF NOT EXISTS (
                                    SELECT 1 FROM information_schema.columns 
                                    WHERE table_name = 'fcl_monitor_logs' 
                                    AND column_name = 'cleaning_scale_bypass'
                                ) THEN
                                    ALTER TABLE fcl_monitor_logs 
                                    ADD COLUMN cleaning_scale_bypass BOOLEAN DEFAULT FALSE;
                                END IF;
                            END $$;
                        """)
                        conn.commit()

                        cursor.execute("""
                            INSERT INTO fcl_monitor_logs (
                                job_status, line_running, receiver, fcl_receivers, flow_rate, produced_weight,
                                water_consumed, moisture_offset, moisture_setpoint, cleaning_scale_bypass,
                                active_sources, active_destination, order_name, created_at
                            ) VALUES (%s, %s, %s, %s::jsonb, %s, %s, %s, %s, %s, %s,
                                      %s::jsonb, %s::jsonb, %s, %s)
                        """, (
                            job_status,
                            data.get("line_running"),
                            receiver_weight,  # ✅ Only flow rate (t/h), not cumulative
                            json.dumps(fcl_receivers),
                            data.get("flow_rate"),
                            produced_weight,  # ✅ Sum of all flow rates (t/h)
                            data.get("water_consumed"),
                            data.get("moisture_offset"),
                            data.get("moisture_setpoint"),
                            data.get("cleaning_scale_bypass"), # ✅ New field
                            json.dumps(enriched_sources),
                            json.dumps(data.get("active_destination")),
                            fcl_current_order_name,
                            now  # ✅ Explicit Asia/Dubai timestamp
                        ))
                        conn.commit()
                        logger.info(f"✅ FCL log saved under order {fcl_current_order_name} | Time: {now}")
                except Exception as db_err:
                    logger.error(f"❌ DB insert failed: {db_err}", exc_info=True)

        except Exception as e:
            logger.error(f"❌ FCL monitor error: {e}", exc_info=True)

        # ✅ Dynamic sleep to ensure EXACTLY 1 second per loop
        elapsed = time.time() - loop_start_time
        sleep_time = max(0, 1.0 - elapsed)
        if sleep_time < 0.5:
            logger.warning(f"[FCL] Loop took {elapsed:.3f}s, only sleeping {sleep_time:.3f}s")
        eventlet.sleep(sleep_time)

scl_monitor_running = False
scl_current_order_name = None
scl_session_started = None
scl_order_counter = 1
scl_data_stored = False

def scl_realtime_monitor():
    global scl_monitor_running, scl_current_order_name, scl_session_started, scl_order_counter
    global scl_data_stored

    scl_monitor_running = True
    
    # Initialize counter from DB
    scl_order_counter = get_next_order_number("SCL", "scl_monitor_logs", "scl_monitor_logs_archive")
    logger.info(f"✅ SCL monitor started. Next Order ID: {scl_order_counter}")

    while True:
        loop_start_time = time.time()  # ✅ Record loop start time
        try:
            res = http.request("GET", "http://127.0.0.1:5001/orders/plc/db299-monitor")
            if res.status != 200:
                logger.warning("⚠️ Failed to fetch /db299-monitor")
                eventlet.sleep(1)
                continue

            data = json.loads(res.data.decode("utf-8")).get("data", {})
            logger.info(f"[SCL] Loop Time: {datetime.datetime.now()} | Job Status: {data.get('JobStatusCode')} | Order: {scl_current_order_name}")

            socketio.emit("scl_data", data)

            job_status = data.get("JobStatusCode")
            now = datetime.datetime.now()

            # ✅ Simplified: Only use status 1 (start) and 0 (end)
            if job_status == 1:
                # 🆕 Order starts - create new order if not exists
                if not scl_current_order_name or not scl_session_started:
                    scl_session_started = now
                    scl_current_order_name = f"SCL{scl_order_counter}"
                    scl_order_counter += 1
                    scl_data_stored = False
                    logger.info(f"🆕 SCL Order Started: {scl_current_order_name}")
                # Store data when status = 1
                
            elif job_status == 0:
                # 🛑 Order ends - mark complete and move to next order
                if scl_current_order_name:
                    logger.info(f"✅ SCL Order Completed: {scl_current_order_name}")
                scl_session_started = None
                scl_current_order_name = None
                continue  # Skip storage when stopped

            # ✅ Only store data when status = 1 (order is active)
            if job_status == 1:

                # ✅ Compute sender weight (sum of all active sources)
                total_sender_weight = 0.0
                active_sender_bins = []
                for src in data.get("ActiveSources", []):
                    sender_weight = float(src.get("flowrate_tph", 0.0))
                    total_sender_weight += sender_weight
                    active_sender_bins.append(src.get("bin_id"))

                # ✅ Force receiver weight to match sender weight (Input = Output)
                receiver_weight = total_sender_weight
                logger.info(f"[SCL] ✅ Receiver weight synced to sender: {receiver_weight} t/h")
                
                # ✅ Produced weight is just the output (receiver), not sum of both
                produced_weight = round(receiver_weight, 6)
                logger.info(f"[SCL] 📊 Final → Sender: {total_sender_weight:.3f} t/h | Receiver: {receiver_weight:.3f} t/h | Produced: {produced_weight:.3f} t/h")

                # ✅ Construct active_destination object from DestBinId and DestMaterial
                active_destination = {}
                dest_bin_id = data.get("DestBinId", 0)
                dest_material = data.get("DestMaterial", {})
                
                if dest_bin_id and dest_bin_id > 0:
                    active_destination = {
                        "bin_id": dest_bin_id,
                        "dest_no": 1,  # Default destination number
                        "material": dest_material,
                        "prd_code": dest_material.get("id", 0) if dest_material else 0
                    }
                    logger.info(f"[SCL] 📦 Active Destination: bin {dest_bin_id}, material: {dest_material.get('material_name', 'N/A')}")
                
                try:
                    # ✅ Use Asia/Dubai timezone (UTC+4) for correct local timestamps
                    import pytz
                    from datetime import datetime as dt
                    dubai_tz = pytz.timezone('Asia/Dubai')
                    # Get current UTC time and convert to Dubai timezone (naive datetime for TIMESTAMP column)
                    now = dt.now(pytz.utc).astimezone(dubai_tz).replace(tzinfo=None)
                    
                    with get_db_connection() as conn:
                        cursor = conn.cursor()
                        # Ensure table with created_at
                        cursor.execute("""
                            CREATE TABLE IF NOT EXISTS scl_monitor_logs (
                                id SERIAL PRIMARY KEY,
                                job_status INT,
                                line_running BOOLEAN,
                                receiver NUMERIC,
                                flow_rate NUMERIC,
                                produced_weight NUMERIC,
                                water_consumed NUMERIC,
                                moisture_offset NUMERIC,
                                moisture_setpoint NUMERIC,
                                active_sources JSONB,
                                active_destination JSONB,
                                order_name TEXT,
                                created_at TIMESTAMP DEFAULT NOW()
                            );
                        """)

                        # Insert log
                        cursor.execute("""
                            INSERT INTO scl_monitor_logs (
                                job_status, line_running, receiver, flow_rate, produced_weight,
                                water_consumed, moisture_offset, moisture_setpoint,
                                active_sources, active_destination, order_name, created_at
                            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s,
                                      %s::jsonb, %s::jsonb, %s, %s)
                        """, (
                            job_status,
                            data.get("line_running"),
                            receiver_weight,  # ✅ Use calculated receiver weight (t/h)
                            data.get("Flowrate"),
                            produced_weight,
                            0,
                            data.get("MoistureOffset"),
                            data.get("MoistureSetpoint"),
                            json.dumps(data.get("ActiveSources")),
                            json.dumps(active_destination),  # ✅ Use constructed active_destination
                            scl_current_order_name,
                            now  # ✅ Explicit Asia/Dubai timestamp
                        ))

                        conn.commit()
                        logger.info(f"✅ SCL log saved: {scl_current_order_name} | Sender: {total_sender_weight:.3f} t/h | Receiver: {receiver_weight:.3f} t/h | Produced: {produced_weight:.3f} t/h | Time: {now}")
                        scl_data_stored = True

                except Exception as db_err:
                    logger.error(f"❌ SCL DB insert failed: {db_err}", exc_info=True)

        except Exception as e:
            logger.error(f"❌ SCL monitor error: {e}", exc_info=True)

        # ✅ Dynamic sleep to ensure EXACTLY 1 second per loop
        elapsed = time.time() - loop_start_time
        sleep_time = max(0, 1.0 - elapsed)
        if sleep_time < 0.5:
            logger.warning(f"[SCL] Loop took {elapsed:.3f}s, only sleeping {sleep_time:.3f}s")
        eventlet.sleep(sleep_time)


def emit_hourly_data():
    while True:
        try:
            with get_db_connection() as conn:
                with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                    # FCL hourly data (using created_at)
                    cursor.execute("""
                        SELECT DISTINCT ON (date_trunc('hour', created_at)) *
                        FROM fcl_monitor_logs_archive
                        ORDER BY date_trunc('hour', created_at) DESC, created_at DESC
                    """)
                    fcl_rows = cursor.fetchall()

                    # SCL hourly data (using created_at)
                    cursor.execute("""
                        SELECT DISTINCT ON (date_trunc('hour', created_at)) *
                        FROM scl_monitor_logs_archive
                        ORDER BY date_trunc('hour', created_at) DESC, created_at DESC
                    """)
                    scl_rows = cursor.fetchall()

                    # MILA hourly data (also using created_at)
                    cursor.execute("""
                        SELECT DISTINCT ON (date_trunc('hour', created_at)) *
                        FROM mila_monitor_logs_archive
                        ORDER BY date_trunc('hour', created_at) DESC, created_at DESC
                    """)
                    mila_rows = cursor.fetchall()

                    # Emit all 3
                    socketio.emit('hourly_archive_data', {
                        'fcl': fcl_rows,
                        'scl': scl_rows,
                        'mila': mila_rows
                    })

        except Exception as e:
            logger.error(f"❌ Error in hourly archive emit: {e}", exc_info=True)

        eventlet.sleep(3600)  # or 60 for dev testing



# SocketIO event handlers
@socketio.on('connect')
def handle_connect():
    global monitor_running
    logger.info('Client connected to WebSocket')
    
    # ✅ REMOVED: Start the monitor when first client connects (only if not already running)
    # The dynamic monitor worker handles all data storage now
    # if not monitor_running:
    #     logger.info('Starting FCL monitor for first client')
    #     eventlet.spawn(fcl_realtime_monitor)
    # else:
    #     logger.info('FCL monitor already running')
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
    
    logger.info("🟢 Starting dynamic tag realtime monitor")
    
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


if not monitor_running:
    logger.info("🟢 Starting dynamic monitoring system (hardcoded monitors disabled)")

    # ✅ REMOVED: Hardcoded FCL, SCL, and MILA monitors
    # These are now handled by the dynamic monitor worker for published layouts
    # # FCL
    # eventlet.spawn(fcl_realtime_monitor)
    # eventlet.spawn(archive_old_logs)
    #
    # # SCL
    # eventlet.spawn(scl_realtime_monitor)
    # eventlet.spawn(archive_old_scl_logs)
    #
    # # MILA
    # eventlet.spawn(mila_realtime_monitor)
    # eventlet.spawn(archive_mila_logs)

    # NEW: Dynamic tag monitor (for WebSocket data only, not storage)
    eventlet.spawn(dynamic_tag_realtime_monitor)

    # Universal historian worker (records ALL active PLC tags, independent of layouts)
    try:
        from workers.historian_worker import historian_worker
        eventlet.spawn(historian_worker)
        logger.info("🟢 Started universal historian worker")
    except Exception as e:
        logger.error(f"❌ Could not start historian worker: {e}", exc_info=True)

    # Dynamic monitoring workers (for published layouts — Live Monitor storage + archiving)
    try:
        from workers.dynamic_monitor_worker import dynamic_monitor_worker
        from workers.dynamic_archive_worker import dynamic_archive_worker
        eventlet.spawn(dynamic_monitor_worker)
        eventlet.spawn(dynamic_archive_worker)
        logger.info("🟢 Started dynamic monitor and archive workers")
    except Exception as e:
        logger.error(f"❌ Could not start dynamic workers: {e}", exc_info=True)

    # Emission task
    eventlet.spawn(emit_hourly_data)


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
    # ✅ REMOVED: Start monitor manually for testing
    # eventlet.spawn(fcl_realtime_monitor)
    logger.info("Server will listen on: http://0.0.0.0:5001")
    logger.info("Test endpoint available at: http://localhost:5001/test")
    # Eventlet handles HTTP and WebSocket requests properly
    socketio.run(app, debug=False, host='0.0.0.0', port=5001, use_reloader=False)



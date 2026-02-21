"""
Live Monitor Blueprint

API endpoints for live monitor layouts and live tag values.
"""

import logging
import sys
from datetime import datetime
from flask import Blueprint, jsonify, request, current_app
from contextlib import closing
from psycopg2.extras import RealDictCursor
from utils.tag_reader import read_all_tags

logger = logging.getLogger(__name__)

live_monitor_bp = Blueprint('live_monitor_bp', __name__)

# Cache the function reference to avoid repeated lookups
_cached_get_db_connection = None

def _get_db_connection():
    """Helper function to get database connection, avoiding circular imports"""
    global _cached_get_db_connection
    
    # If we've already found it, use the cached version (performance optimization)
    if _cached_get_db_connection is not None:
        return _cached_get_db_connection
    
    # NEVER do 'from app import' - it causes circular import issues
    # Only access via sys.modules to avoid triggering import resolution
    
    if 'app' not in sys.modules:
        raise ImportError(
            "app module not found in sys.modules. "
            "This should not happen at runtime - the app must be fully loaded."
        )
    
    app_module = sys.modules['app']
    
    # Use getattr to safely access the function
    get_db_connection = getattr(app_module, 'get_db_connection', None)
    
    if get_db_connection is None:
        # Provide detailed error info
        available_funcs = [attr for attr in dir(app_module) 
                          if not attr.startswith('_') and callable(getattr(app_module, attr, None))]
        raise ImportError(
            f"get_db_connection not found in app module. "
            f"Available callable attributes: {available_funcs[:10]}"
        )
    
    if not callable(get_db_connection):
        raise ImportError(
            f"get_db_connection exists in app module but is not callable. "
            f"Type: {type(get_db_connection)}"
        )
    
    # Cache it for future use
    _cached_get_db_connection = get_db_connection
    logger.debug("✅ Got get_db_connection from sys.modules['app'] (cached)")
    return get_db_connection


@live_monitor_bp.route('/live-monitor/predefined', methods=['GET'])
def get_predefined_report():
    """
    Predefined report: integrated (db, offset) with current values (same as emulator offsets).
    Used by Live Monitor when no layouts exist — hardcoded report using integrated offsets.
    """
    try:
        from plc_data_source import get_emulator_offsets
        data = get_emulator_offsets()
        return jsonify(data), 200
    except Exception as e:
        logger.error("Error getting predefined report: %s", e, exc_info=True)
        return jsonify({
            'DB199': [], 'DB2099': [], 'DB299': [], 'DB499': []
        }), 200


@live_monitor_bp.route('/live-monitor/tags', methods=['GET'])
def get_live_tag_values():
    """
    Get current values for all active tags (for live monitor).
    This replaces the hardcoded /plc-monitor endpoint.
    """
    try:
        logger.info("=== GET LIVE TAG VALUES REQUEST START ===")
        get_db_connection = _get_db_connection()
        
        # Optional: get specific tags
        tag_names_param = request.args.get('tags')
        tag_names = None
        if tag_names_param:
            tag_names = [t.strip() for t in tag_names_param.split(',') if t.strip()]
            logger.info(f"Requesting values for {len(tag_names)} tags: {tag_names}")
        else:
            logger.info("Requesting values for all active tags")
        
        # Read tags from PLC
        logger.info("Reading tags from PLC...")
        values = read_all_tags(tag_names=tag_names, db_connection_func=get_db_connection)
        logger.info(f"Successfully read {len(values)} tag values")
        
        return jsonify({
            'status': 'success',
            'timestamp': datetime.now().isoformat(),
            'tag_values': values
        })
    
    except Exception as e:
        logger.error(f"Error reading live tags: {e}", exc_info=True)
        return jsonify({
            'status': 'error',
            'message': str(e),
            'tag_values': {}
        }), 500


@live_monitor_bp.route('/live-monitor/layouts', methods=['GET'])
def get_all_layouts():
    """List all live monitor layouts"""
    import time
    start_time = time.time()
    
    try:
        logger.info("=== GET ALL LAYOUTS REQUEST ===")
        # Only filter by is_active if explicitly provided
        is_active_param = request.args.get('is_active')
        is_active = None
        if is_active_param is not None:
            is_active = is_active_param.lower() == 'true'
        
        logger.info(f"Loading layouts - is_active filter: {is_active}")
        
        db_conn_start = time.time()
        get_db_connection = _get_db_connection()
        db_conn_time = (time.time() - db_conn_start) * 1000
        logger.info(f"Got database connection function in {db_conn_time:.2f}ms")
        
        query_start = time.time()
        with closing(get_db_connection()) as conn:
            logger.info("Database connection established")
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            query = """
                SELECT id, layout_name, description, is_active, is_default, 
                       order_status_tag_name, order_prefix, order_start_value, order_stop_value,
                       include_line_running_tag, line_running_tag_name,
                       is_published, created_at, updated_at
                FROM live_monitor_layouts
                WHERE 1=1
            """
            params = []
            
            if is_active is not None:
                query += " AND is_active = %s"
                params.append(is_active)
            
            query += " ORDER BY is_default DESC, layout_name"
            
            logger.info(f"Executing query: {query[:100]}...")
            cursor.execute(query, params)
            layouts = cursor.fetchall()
            query_time = (time.time() - query_start) * 1000
            logger.info(f"Fetched {len(layouts)} layouts from database in {query_time:.2f}ms")
            
            result = [dict(layout) for layout in layouts]
            
            total_time = (time.time() - start_time) * 1000
            logger.info(f"Returning {len(result)} layouts (total time: {total_time:.2f}ms)")
            return jsonify({
                'status': 'success',
                'layouts': result
            })
    
    except Exception as e:
        logger.error(f"Error getting layouts: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


@live_monitor_bp.route('/live-monitor/layouts', methods=['POST'])
def create_layout():
    """Create live monitor layout"""
    try:
        logger.info("=== CREATE LAYOUT REQUEST ===")
        logger.info(f"Request method: {request.method}")
        logger.info(f"Request path: {request.path}")
        logger.info(f"Request URL: {request.url}")
        logger.info(f"Request headers: {dict(request.headers)}")
        
        data = request.get_json()
        logger.info(f"Request JSON data: {data}")
        
        if not data or not data.get('layout_name'):
            logger.warning("Missing layout_name in request")
            return jsonify({'status': 'error', 'message': 'layout_name is required'}), 400
        
        layout_name = data['layout_name'].strip()
        
        get_db_connection = _get_db_connection()
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor()
            
            # Check if layout_name already exists
            cursor.execute("SELECT id FROM live_monitor_layouts WHERE layout_name = %s", (layout_name,))
            if cursor.fetchone():
                return jsonify({'status': 'error', 'message': f'Layout "{layout_name}" already exists'}), 400
            
            # Insert layout (including order tracking fields and line running tag)
            # Try with line running tag fields first, fallback if columns don't exist
            try:
                logger.info(f"Attempting INSERT with line running tag fields...")
                cursor.execute("""
                    INSERT INTO live_monitor_layouts (
                        layout_name, description, is_active, is_default,
                        order_status_tag_name, order_prefix, order_start_value, order_stop_value,
                        include_line_running_tag, line_running_tag_name
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    layout_name,
                    data.get('description', ''),
                    data.get('is_active', True),
                    data.get('is_default', False),
                    data.get('order_status_tag_name'),
                    data.get('order_prefix', ''),
                    data.get('order_start_value', 1),
                    data.get('order_stop_value', 0),
                    data.get('include_line_running_tag', False),
                    data.get('line_running_tag_name') if data.get('include_line_running_tag') else None
                ))
                logger.info("✅ INSERT with line running tag fields succeeded")
            except Exception as col_error:
                # If columns don't exist, insert without them
                error_msg = str(col_error).lower()
                if 'column' in error_msg and ('include_line_running_tag' in str(col_error) or 'line_running_tag_name' in str(col_error)):
                    logger.warning(f"Line running tag columns not found, inserting without them: {col_error}")
                    try:
                        cursor.execute("""
                            INSERT INTO live_monitor_layouts (
                                layout_name, description, is_active, is_default,
                                order_status_tag_name, order_prefix, order_start_value, order_stop_value
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
                            RETURNING id
                        """, (
                            layout_name,
                            data.get('description', ''),
                            data.get('is_active', True),
                            data.get('is_default', False),
                            data.get('order_status_tag_name'),
                            data.get('order_prefix', ''),
                            data.get('order_start_value', 1),
                            data.get('order_stop_value', 0)
                        ))
                        logger.info("✅ INSERT without line running tag fields succeeded")
                    except Exception as fallback_error:
                        logger.error(f"❌ Fallback INSERT also failed: {fallback_error}", exc_info=True)
                        raise
                else:
                    logger.error(f"❌ INSERT failed with unexpected error: {col_error}", exc_info=True)
                    raise  # Re-raise if it's a different error
            
            result = cursor.fetchone()
            if not result:
                raise Exception("INSERT did not return a layout ID")
            # Use dictionary access since cursor_factory is RealDictCursor
            layout_id = result['id'] if isinstance(result, dict) or hasattr(result, 'get') else result[0]
            logger.info(f"✅ Layout ID returned: {layout_id}")
            
            # If this is set as default, unset others
            if data.get('is_default', False):
                cursor.execute("""
                    UPDATE live_monitor_layouts 
                    SET is_default = false 
                    WHERE id != %s
                """, (layout_id,))
            
            conn.commit()
            
            logger.info(f"Created layout: {layout_name} (ID: {layout_id})")
            
            return jsonify({
                'status': 'success',
                'layout_id': layout_id,
                'message': f'Layout "{layout_name}" created successfully'
            }), 201
    
    except Exception as e:
        logger.error(f"Error creating layout: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


@live_monitor_bp.route('/live-monitor/layouts/<int:layout_id>', methods=['GET'])
def get_layout(layout_id):
    """Get layout with sections and columns"""
    try:
        get_db_connection = _get_db_connection()
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get layout
            cursor.execute("""
                SELECT id, layout_name, description, is_active, is_default, created_at, updated_at
                FROM live_monitor_layouts
                WHERE id = %s
            """, (layout_id,))
            
            layout = cursor.fetchone()
            
            if not layout:
                return jsonify({'status': 'error', 'message': 'Layout not found'}), 404
            
            layout_dict = dict(layout)
            
            # Get sections
            cursor.execute("""
                SELECT id, section_name, section_type, display_order, is_active
                FROM live_monitor_sections
                WHERE layout_id = %s
                ORDER BY display_order
            """, (layout_id,))
            
            sections = cursor.fetchall()
            layout_dict['sections'] = []
            
            for section in sections:
                section_dict = dict(section)
                section_id = section_dict['id']
                
                # Get columns for table sections
                if section_dict['section_type'] == 'Table':
                    # Get table config
                    cursor.execute("""
                        SELECT tag_group_id, row_mode, refresh_interval
                        FROM live_monitor_table_config
                        WHERE section_id = %s
                    """, (section_id,))
                    table_config = cursor.fetchone()
                    if table_config:
                        section_dict['table_config'] = dict(table_config)
                    
                    # Get columns
                    cursor.execute("""
                        SELECT id, column_label, source_type, tag_name, formula, 
                               mapping_name, text_value, unit, decimals, alignment, 
                               width, display_order
                        FROM live_monitor_columns
                        WHERE section_id = %s
                        ORDER BY display_order
                    """, (section_id,))
                    columns = cursor.fetchall()
                    section_dict['columns'] = [dict(col) for col in columns]
                
                # Get KPI configs for KPI sections
                elif section_dict['section_type'] == 'KPI':
                    cursor.execute("""
                        SELECT id, card_label, source_type, tag_name, formula, 
                               unit, decimals, icon, color, size, display_order
                        FROM live_monitor_kpi_config
                        WHERE section_id = %s
                        ORDER BY display_order
                    """, (section_id,))
                    kpi_configs = cursor.fetchall()
                    section_dict['kpi_cards'] = [dict(kpi) for kpi in kpi_configs]
                
                layout_dict['sections'].append(section_dict)
            
            return jsonify({
                'status': 'success',
                'layout': layout_dict
            })
    
    except Exception as e:
        logger.error(f"Error getting layout: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


@live_monitor_bp.route('/live-monitor/layouts/<int:layout_id>', methods=['PUT'])
def update_layout(layout_id):
    """Update layout including order tracking configuration"""
    try:
        data = request.get_json()
        
        get_db_connection = _get_db_connection()
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Check if layout exists
            cursor.execute("SELECT * FROM live_monitor_layouts WHERE id = %s", (layout_id,))
            existing_layout = cursor.fetchone()
            
            if not existing_layout:
                return jsonify({'status': 'error', 'message': 'Layout not found'}), 404
            
            existing_dict = dict(existing_layout)
            
            # Update layout including order tracking fields and line running tag
            # Try with line running tag fields first
            try:
                # Fix: Only set line_running_tag_name if both checkbox is checked AND tag name is provided
                include_line_running = data.get('include_line_running_tag', False)
                line_running_tag_name = data.get('line_running_tag_name') if (include_line_running and data.get('line_running_tag_name')) else None
                
                cursor.execute("""
                    UPDATE live_monitor_layouts SET
                        layout_name = %s,
                        description = %s,
                        is_active = %s,
                        is_default = %s,
                        order_status_tag_name = %s,
                        order_prefix = %s,
                        order_start_value = %s,
                        order_stop_value = %s,
                        include_line_running_tag = %s,
                        line_running_tag_name = %s
                    WHERE id = %s
                """, (
                    data.get('layout_name', existing_dict.get('layout_name')),
                    data.get('description', existing_dict.get('description', '')),
                    data.get('is_active', existing_dict.get('is_active', True)),
                    data.get('is_default', existing_dict.get('is_default', False)),
                    data.get('order_status_tag_name'),  # Can be None
                    data.get('order_prefix', existing_dict.get('order_prefix', '')),
                    data.get('order_start_value', existing_dict.get('order_start_value', 1)),
                    data.get('order_stop_value', existing_dict.get('order_stop_value', 0)),
                    include_line_running,
                    line_running_tag_name,
                    layout_id
                ))
                logger.info("✅ UPDATE with line running tag fields succeeded")
            except Exception as col_error:
                # If columns don't exist, update without them
                error_msg = str(col_error).lower()
                if 'column' in error_msg and ('include_line_running_tag' in str(col_error) or 'line_running_tag_name' in str(col_error)):
                    logger.warning(f"Line running tag columns not found, updating without them: {col_error}")
                    try:
                        cursor.execute("""
                            UPDATE live_monitor_layouts SET
                                layout_name = %s,
                                description = %s,
                                is_active = %s,
                                is_default = %s,
                                order_status_tag_name = %s,
                                order_prefix = %s,
                                order_start_value = %s,
                                order_stop_value = %s
                            WHERE id = %s
                        """, (
                            data.get('layout_name', existing_dict.get('layout_name')),
                            data.get('description', existing_dict.get('description', '')),
                            data.get('is_active', existing_dict.get('is_active', True)),
                            data.get('is_default', existing_dict.get('is_default', False)),
                            data.get('order_status_tag_name'),
                            data.get('order_prefix', existing_dict.get('order_prefix', '')),
                            data.get('order_start_value', existing_dict.get('order_start_value', 1)),
                            data.get('order_stop_value', existing_dict.get('order_stop_value', 0)),
                            layout_id
                        ))
                        logger.info("✅ UPDATE without line running tag fields succeeded")
                    except Exception as fallback_error:
                        logger.error(f"❌ Fallback UPDATE also failed: {fallback_error}", exc_info=True)
                        raise
                else:
                    logger.error(f"❌ UPDATE failed with unexpected error: {col_error}", exc_info=True)
                    raise  # Re-raise if it's a different error
            
            # If set as default, unset others
            if data.get('is_default', False):
                cursor.execute("""
                    UPDATE live_monitor_layouts 
                    SET is_default = false 
                    WHERE id != %s
                """, (layout_id,))
            
            conn.commit()
            
            # Clear order tracker cache if order tracking config changed
            if 'order_status_tag_name' in data or 'order_prefix' in data:
                try:
                    from workers.dynamic_monitor_worker import order_trackers
                    if layout_id in order_trackers:
                        del order_trackers[layout_id]
                except ImportError:
                    pass  # Workers may not be loaded yet
            
            logger.info(f"Updated layout ID: {layout_id}")
            
            return jsonify({
                'status': 'success',
                'message': 'Layout updated successfully'
            })
    
    except Exception as e:
        logger.error(f"Error updating layout: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


@live_monitor_bp.route('/live-monitor/layouts/<int:layout_id>/sections', methods=['POST'])
def create_section(layout_id):
    """Create section in layout"""
    try:
        data = request.get_json()
        
        if not data or not data.get('section_name') or not data.get('section_type'):
            return jsonify({'status': 'error', 'message': 'section_name and section_type are required'}), 400
        
        section_type = data['section_type']
        if section_type not in ['Table', 'KPI']:
            return jsonify({'status': 'error', 'message': 'section_type must be Table or KPI'}), 400
        
        get_db_connection = _get_db_connection()
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor()
            
            # Check if layout exists
            cursor.execute("SELECT id FROM live_monitor_layouts WHERE id = %s", (layout_id,))
            if not cursor.fetchone():
                return jsonify({'status': 'error', 'message': 'Layout not found'}), 404
            
            # Insert section
            cursor.execute("""
                INSERT INTO live_monitor_sections (layout_id, section_name, section_type, display_order, is_active)
                VALUES (%s, %s, %s, %s, %s)
                RETURNING id
            """, (
                layout_id,
                data['section_name'],
                section_type,
                int(data.get('display_order', 0)),
                data.get('is_active', True)
            ))
            
            result = cursor.fetchone()
            # Use dictionary access since cursor_factory is RealDictCursor
            section_id = result['id'] if isinstance(result, dict) or hasattr(result, 'get') else result[0]
            
            # Create table config if Table section
            if section_type == 'Table':
                cursor.execute("""
                    INSERT INTO live_monitor_table_config (section_id, tag_group_id, row_mode, refresh_interval)
                    VALUES (%s, %s, %s, %s)
                """, (
                    section_id,
                    data.get('table_config', {}).get('tag_group_id'),
                    data.get('table_config', {}).get('row_mode', 'Dynamic'),
                    int(data.get('table_config', {}).get('refresh_interval', 1))
                ))
            
            conn.commit()
            
            logger.info(f"Created section: {data['section_name']} (ID: {section_id})")
            
            return jsonify({
                'status': 'success',
                'section_id': section_id,
                'message': 'Section created successfully'
            }), 201
    
    except Exception as e:
        logger.error(f"Error creating section: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


@live_monitor_bp.route('/live-monitor/sections/<int:section_id>/columns', methods=['POST'])
def create_column(section_id):
    """Create column in table section"""
    try:
        data = request.get_json()
        
        if not data or not data.get('column_label') or not data.get('source_type'):
            return jsonify({'status': 'error', 'message': 'column_label and source_type are required'}), 400
        
        get_db_connection = _get_db_connection()
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor()
            
            # Check if section exists and is Table type
            cursor.execute("""
                SELECT section_type FROM live_monitor_sections WHERE id = %s
            """, (section_id,))
            section_row = cursor.fetchone()
            if not section_row:
                return jsonify({'status': 'error', 'message': 'Section not found'}), 404
            # Use dictionary access since cursor_factory is RealDictCursor
            section_type = section_row['section_type'] if isinstance(section_row, dict) or hasattr(section_row, 'get') else section_row[0]
            if section_type != 'Table':
                return jsonify({'status': 'error', 'message': 'Section is not a Table section'}), 400
            
            # Insert column
            cursor.execute("""
                INSERT INTO live_monitor_columns (
                    section_id, column_label, source_type, tag_name, formula,
                    mapping_name, text_value, unit, decimals, alignment, width, display_order
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                section_id,
                data['column_label'],
                data['source_type'],
                data.get('tag_name'),
                data.get('formula'),
                data.get('mapping_name'),
                data.get('text_value'),
                data.get('unit', ''),
                int(data.get('decimals', 2)),
                data.get('alignment', 'left'),
                data.get('width'),
                int(data.get('display_order', 0))
            ))
            
            result = cursor.fetchone()
            # Use dictionary access since cursor_factory is RealDictCursor
            column_id = result['id'] if isinstance(result, dict) or hasattr(result, 'get') else result[0]
            conn.commit()
            
            logger.info(f"Created column: {data['column_label']} (ID: {column_id})")
            
            return jsonify({
                'status': 'success',
                'column_id': column_id,
                'message': 'Column created successfully'
            }), 201
    
    except Exception as e:
        logger.error(f"Error creating column: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


@live_monitor_bp.route('/live-monitor/sections/<int:section_id>/kpi-cards', methods=['POST'])
def create_kpi_card(section_id):
    """Create KPI card in KPI section"""
    try:
        data = request.get_json()
        
        if not data or not data.get('card_label') or not data.get('source_type'):
            return jsonify({'status': 'error', 'message': 'card_label and source_type are required'}), 400
        
        get_db_connection = _get_db_connection()
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor()
            
            # Check if section exists and is KPI type
            cursor.execute("""
                SELECT section_type FROM live_monitor_sections WHERE id = %s
            """, (section_id,))
            section_row = cursor.fetchone()
            if not section_row:
                return jsonify({'status': 'error', 'message': 'Section not found'}), 404
            # Use dictionary access since cursor_factory is RealDictCursor
            section_type = section_row['section_type'] if isinstance(section_row, dict) or hasattr(section_row, 'get') else section_row[0]
            if section_type != 'KPI':
                return jsonify({'status': 'error', 'message': 'Section is not a KPI section'}), 400
            
            # Insert KPI card
            cursor.execute("""
                INSERT INTO live_monitor_kpi_config (
                    section_id, card_label, source_type, tag_name, formula,
                    unit, decimals, icon, color, size, display_order
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                RETURNING id
            """, (
                section_id,
                data['card_label'],
                data['source_type'],
                data.get('tag_name'),
                data.get('formula'),
                data.get('unit', ''),
                int(data.get('decimals', 2)),
                data.get('icon'),
                data.get('color'),
                data.get('size', 'Medium'),
                int(data.get('display_order', 0))
            ))
            
            result = cursor.fetchone()
            # Use dictionary access since cursor_factory is RealDictCursor
            kpi_id = result['id'] if isinstance(result, dict) or hasattr(result, 'get') else result[0]
            conn.commit()
            
            logger.info(f"Created KPI card: {data['card_label']} (ID: {kpi_id})")
            
            return jsonify({
                'status': 'success',
                'kpi_id': kpi_id,
                'message': 'KPI card created successfully'
            }), 201
    
    except Exception as e:
        logger.error(f"Error creating KPI card: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


@live_monitor_bp.route('/live-monitor/layouts/<int:layout_id>/config', methods=['PUT'])
def save_layout_config(layout_id):
    """Save full layout configuration (including sections) as JSONB"""
    try:
        data = request.get_json()
        
        if 'config' not in data:
            return jsonify({'status': 'error', 'message': 'config is required'}), 400
        
        get_db_connection = _get_db_connection()
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor()
            
            # Check if layout exists
            cursor.execute("SELECT id FROM live_monitor_layouts WHERE id = %s", (layout_id,))
            if not cursor.fetchone():
                return jsonify({'status': 'error', 'message': 'Layout not found'}), 404
            
            # Save config as JSONB
            import json
            cursor.execute("""
                UPDATE live_monitor_layouts 
                SET config = %s::jsonb,
                    updated_at = NOW()
                WHERE id = %s
            """, (json.dumps(data['config']), layout_id))
            
            conn.commit()
            logger.info(f"Saved config for layout ID: {layout_id}")
            
            return jsonify({
                'status': 'success',
                'message': 'Layout config saved successfully'
            })
    
    except Exception as e:
        logger.error(f"Error saving layout config: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


@live_monitor_bp.route('/live-monitor/layouts/<int:layout_id>/config', methods=['GET'])
def get_layout_config(layout_id):
    """Get full layout configuration"""
    import time
    start_time = time.time()
    
    try:
        logger.info(f"=== GET LAYOUT CONFIG REQUEST for layout_id={layout_id} ===")
        
        db_conn_start = time.time()
        get_db_connection = _get_db_connection()
        db_conn_time = (time.time() - db_conn_start) * 1000
        logger.debug(f"Got database connection function in {db_conn_time:.2f}ms")
        
        query_start = time.time()
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            cursor.execute("""
                SELECT id, layout_name, description, is_active, is_default,
                       order_status_tag_name, order_prefix, order_start_value, order_stop_value,
                       is_published, config, created_at, updated_at
                FROM live_monitor_layouts
                WHERE id = %s
            """, (layout_id,))
            
            layout = cursor.fetchone()
            if not layout:
                return jsonify({'status': 'error', 'message': 'Layout not found'}), 404
            
            query_time = (time.time() - query_start) * 1000
            logger.debug(f"Query executed in {query_time:.2f}ms")
            
            layout_dict = dict(layout)
            
            # Parse config JSONB
            parse_start = time.time()
            if layout_dict.get('config'):
                import json
                if isinstance(layout_dict['config'], str):
                    layout_dict['config'] = json.loads(layout_dict['config'])
            else:
                layout_dict['config'] = {}
            parse_time = (time.time() - parse_start) * 1000
            
            total_time = (time.time() - start_time) * 1000
            logger.info(f"Returned config for layout_id={layout_id} (total: {total_time:.2f}ms, query: {query_time:.2f}ms, parse: {parse_time:.2f}ms)")
            
            return jsonify({
                'status': 'success',
                'layout': layout_dict
            })
    
    except Exception as e:
        logger.error(f"Error getting layout config: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


@live_monitor_bp.route('/live-monitor/layouts/<int:layout_id>', methods=['DELETE'])
def delete_layout(layout_id):
    """Delete a layout (hard delete: remove from database)"""
    try:
        get_db_connection = _get_db_connection()
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Check if layout exists
            cursor.execute("SELECT id, layout_name FROM live_monitor_layouts WHERE id = %s", (layout_id,))
            layout = cursor.fetchone()
            if not layout:
                return jsonify({'status': 'error', 'message': 'Layout not found'}), 404
            
            # Get layout name before deletion
            layout_dict = dict(layout) if hasattr(layout, 'get') else {'layout_name': layout[1] if len(layout) > 1 else 'Unknown'}
            layout_name = layout_dict.get('layout_name', 'Unknown')
            
            # Hard delete (actually remove from database)
            cursor.execute("DELETE FROM live_monitor_layouts WHERE id = %s", (layout_id,))
            conn.commit()
            
            logger.info(f"✅ Hard deleted layout ID: {layout_id} ({layout_name})")
            
            return jsonify({
                'status': 'success',
                'message': f'Layout "{layout_name}" deleted successfully'
            })
    
    except Exception as e:
        logger.error(f"Error deleting layout: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


@live_monitor_bp.route('/live-monitor/layouts/<int:layout_id>/publish', methods=['POST'])
def publish_layout(layout_id):
    """Publish a layout and start data monitoring"""
    import time
    start_time = time.time()
    
    try:
        logger.info(f"=== PUBLISH LAYOUT REQUEST for layout_id={layout_id} ===")
        
        get_db_connection = _get_db_connection()
        from utils.dynamic_tables import (
            create_dynamic_monitor_tables,
            register_dynamic_monitor,
            sanitize_table_name
        )
        
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # ✅ FIX: First verify migration tables exist (quick check)
            check_start = time.time()
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'dynamic_monitor_registry'
                );
            """)
            
            migration_exists = cursor.fetchone()
            check_time = (time.time() - check_start) * 1000
            logger.debug(f"Migration check took {check_time:.2f}ms")
            
            if not migration_exists or not migration_exists.get('exists', False):
                logger.error("❌ Migration not run - dynamic_monitor_registry table does not exist")
                return jsonify({
                    'status': 'error', 
                    'message': 'Migration not run. Please run: python backend/check_and_run_migration.py or python backend/run_dynamic_monitoring_migration.py'
                }), 400
            
            # Get layout (quick query)
            query_start = time.time()
            cursor.execute("""
                SELECT id, layout_name, is_published 
                FROM live_monitor_layouts 
                WHERE id = %s
            """, (layout_id,))
            layout = cursor.fetchone()
            query_time = (time.time() - query_start) * 1000
            logger.debug(f"Layout query took {query_time:.2f}ms")
            
            if not layout:
                return jsonify({'status': 'error', 'message': 'Layout not found'}), 404
            
            layout_dict = dict(layout)
            
            if layout_dict.get('is_published'):
                logger.warning(f"Layout {layout_id} ({layout_dict['layout_name']}) is already published")
                return jsonify({
                    'status': 'error', 
                    'message': 'Layout is already published'
                }), 400
            
            # Create tables
            try:
                table_start = time.time()
                logger.info(f"Creating tables for layout {layout_id} ({layout_dict['layout_name']})...")
                live_table, archive_table = create_dynamic_monitor_tables(
                    layout_id,
                    layout_dict['layout_name'],
                    get_db_connection
                )
                table_time = (time.time() - table_start) * 1000
                logger.info(f"✅ Created tables: {live_table}, {archive_table} (took {table_time:.2f}ms)")
            except Exception as table_error:
                logger.error(f"❌ Error creating tables: {table_error}", exc_info=True)
                return jsonify({
                    'status': 'error', 
                    'message': f'Failed to create tables: {str(table_error)}'
                }), 500
            
            # ✅ FIX: Verify tables were created
            cursor.execute("""
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = %s
                );
            """, (live_table,))
            
            table_check = cursor.fetchone()
            if not table_check or not table_check.get('exists', False):
                logger.error(f"❌ Table {live_table} was not created successfully")
                return jsonify({
                    'status': 'error', 
                    'message': f'Table {live_table} was not created successfully'
                }), 500
            
            # Register in monitor registry
            try:
                register_dynamic_monitor(
                    layout_id,
                    layout_dict['layout_name'],
                    live_table,
                    archive_table,
                    get_db_connection
                )
                logger.info(f"✅ Registered monitor for layout {layout_dict['layout_name']}")
            except Exception as reg_error:
                logger.error(f"❌ Error registering monitor: {reg_error}", exc_info=True)
                return jsonify({
                    'status': 'error', 
                    'message': f'Failed to register monitor: {str(reg_error)}'
                }), 500
            
            # Mark as published
            cursor.execute("""
                UPDATE live_monitor_layouts 
                SET is_published = TRUE,
                    published_at = NOW(),
                    monitoring_enabled = TRUE
                WHERE id = %s
            """, (layout_id,))
            
            conn.commit()
            
            total_time = (time.time() - start_time) * 1000
            logger.info(f"✅ Published layout: {layout_dict['layout_name']} (ID: {layout_id}) in {total_time:.2f}ms")
            
            # ✅ FIX: Create response immediately after commit to avoid timeout
            response_data = {
                'status': 'success',
                'message': f'Layout "{layout_dict["layout_name"]}" published successfully',
                'live_table': live_table,
                'archive_table': archive_table
            }
            
            logger.info(f"📤 Sending success response for layout {layout_id}: {response_data}")
            return jsonify(response_data), 200
    
    except Exception as e:
        total_time = (time.time() - start_time) * 1000
        logger.error(f"❌ Error publishing layout {layout_id} (took {total_time:.2f}ms): {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


@live_monitor_bp.route('/live-monitor/layouts/<int:layout_id>/unpublish', methods=['POST'])
def unpublish_layout(layout_id):
    """Unpublish a layout: stop data monitoring and set is_published = FALSE."""
    try:
        get_db_connection = _get_db_connection()
        with closing(get_db_connection()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT id, layout_name, is_published
                FROM live_monitor_layouts
                WHERE id = %s
            """, (layout_id,))
            layout = cursor.fetchone()
            if not layout:
                return jsonify({'status': 'error', 'message': 'Layout not found'}), 404
            layout_dict = dict(layout)
            if not layout_dict.get('is_published'):
                return jsonify({
                    'status': 'error',
                    'message': 'Layout is not published'
                }), 400
            # Stop worker from processing this layout
            cursor.execute("""
                UPDATE dynamic_monitor_registry
                SET is_active = FALSE
                WHERE layout_id = %s
            """, (layout_id,))
            # Mark layout as unpublished
            cursor.execute("""
                UPDATE live_monitor_layouts
                SET is_published = FALSE,
                    monitoring_enabled = FALSE,
                    published_at = NULL
                WHERE id = %s
            """, (layout_id,))
            conn.commit()
        logger.info(f"✅ Unpublished layout: {layout_dict['layout_name']} (ID: {layout_id})")
        return jsonify({
            'status': 'success',
            'message': f'Layout "{layout_dict["layout_name"]}" unpublished. Data monitoring stopped.'
        }), 200
    except Exception as e:
        logger.error(f"❌ Error unpublishing layout {layout_id}: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


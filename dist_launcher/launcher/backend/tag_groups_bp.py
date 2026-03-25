"""
Tag Groups Blueprint

API endpoints for managing tag groups.
"""

import logging
from flask import Blueprint, jsonify, request
from contextlib import closing
from psycopg2.extras import RealDictCursor
import psycopg2

logger = logging.getLogger(__name__)

tag_groups_bp = Blueprint('tag_groups_bp', __name__)


def _get_db_connection():
    """Helper function to get database connection, avoiding circular imports"""
    import sys
    if 'app' in sys.modules:
        app_module = sys.modules['app']
        get_db_connection = getattr(app_module, 'get_db_connection', None)
        if get_db_connection is None:
            raise ImportError("get_db_connection not found in app module")
        return get_db_connection
    else:
        from app import get_db_connection
        return get_db_connection


@tag_groups_bp.route('/tag-groups', methods=['GET'])
def get_all_tag_groups():
    """List all tag groups"""
    try:
        is_active = request.args.get('is_active', 'true').lower() == 'true'
        
        get_db_connection_func = _get_db_connection()
        with closing(get_db_connection_func()) as conn:
            # Handle both PooledConnection and regular connection
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor(cursor_factory=RealDictCursor)
            
            query = """
                SELECT id, group_name, description, display_order, is_active, created_at, updated_at
                FROM tag_groups
                WHERE 1=1
            """
            params = []
            
            if is_active is not None:
                query += " AND is_active = %s"
                params.append(is_active)
            
            query += " ORDER BY display_order, group_name"
            
            cursor.execute(query, params)
            groups = cursor.fetchall()
            
            # Get tags for each group
            result = []
            for group in groups:
                group_dict = dict(group)
                
                # Get tags in this group
                cursor.execute("""
                    SELECT t.id, t.tag_name, t.display_name, t.source_type, 
                           t.data_type, t.unit, t.is_active, tgm.display_order
                    FROM tags t
                    JOIN tag_group_members tgm ON t.id = tgm.tag_id
                    WHERE tgm.group_id = %s
                    ORDER BY tgm.display_order, t.tag_name
                """, (group_dict['id'],))
                
                tags = cursor.fetchall()
                group_dict['tags'] = [dict(tag) for tag in tags]
                group_dict['tag_count'] = len(tags)
                
                result.append(group_dict)
            
            return jsonify({
                'status': 'success',
                'tag_groups': result
            })
    
    except Exception as e:
        logger.error(f"Error getting tag groups: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


@tag_groups_bp.route('/tag-groups', methods=['POST'])
def create_tag_group():
    """Create tag group"""
    try:
        logger.info("=== CREATE TAG GROUP REQUEST START ===")
        data = request.get_json()
        logger.info(f"Request data: {data}")
        
        if not data or not data.get('group_name'):
            logger.error("group_name is missing")
            return jsonify({'status': 'error', 'message': 'group_name is required'}), 400
        
        group_name = data['group_name'].strip()
        
        get_db_connection_func = _get_db_connection()
        logger.info("Getting database connection...")
        
        try:
            conn = get_db_connection_func()
            logger.info("Database connection obtained")
        except Exception as conn_error:
            logger.error(f"Failed to get database connection: {conn_error}", exc_info=True)
            return jsonify({'status': 'error', 'message': f'Database connection failed: {str(conn_error)}'}), 500
        
        try:
            with closing(conn) as conn_wrapper:
                # Handle both PooledConnection and regular connection
                actual_conn = conn_wrapper._conn if hasattr(conn_wrapper, '_conn') else conn_wrapper
                cursor = actual_conn.cursor(cursor_factory=RealDictCursor)
                logger.info("Cursor created")
                
                # Check if group_name already exists
                logger.info(f"Checking if group '{group_name}' already exists...")
                cursor.execute("SELECT id FROM tag_groups WHERE group_name = %s", (group_name,))
                existing = cursor.fetchone()
                if existing:
                    logger.warning(f"Group '{group_name}' already exists")
                    return jsonify({'status': 'error', 'message': f'Tag group "{group_name}" already exists'}), 400
                logger.info(f"Group '{group_name}' is available")
                
                # Insert group
                logger.info("Inserting new tag group...")
                cursor.execute("""
                    INSERT INTO tag_groups (group_name, description, display_order, is_active)
                    VALUES (%s, %s, %s, %s)
                    RETURNING id
                """, (
                    group_name,
                    data.get('description', ''),
                    int(data.get('display_order', 0)),
                    data.get('is_active', True)
                ))
                
                result = cursor.fetchone()
                if not result:
                    raise Exception("INSERT did not return an ID")
                
                # Handle both dict (RealDictCursor) and tuple results
                if isinstance(result, dict):
                    group_id = result.get('id')
                else:
                    group_id = result[0]
                
                if group_id is None:
                    raise Exception("Failed to retrieve group ID after insert")
                
                logger.info(f"Created tag group: {group_name} (ID: {group_id})")
                
                # Add tags to group if provided - optimized to use single query
                tag_names = data.get('tag_names', [])
                logger.info(f"Adding {len(tag_names)} tags to group...")
                
                if tag_names:
                    # Get all tag IDs in a single query
                    placeholders = ','.join(['%s'] * len(tag_names))
                    cursor.execute(f"""
                        SELECT id, tag_name FROM tags 
                        WHERE tag_name IN ({placeholders})
                    """, tag_names)
                    
                    tag_map = {}
                    for row in cursor.fetchall():
                        if isinstance(row, dict):
                            tag_map[row['tag_name']] = row['id']
                        else:
                            tag_map[row[1]] = row[0]  # (id, tag_name)
                    
                    # Insert all tag memberships in batch
                    if tag_map:
                        insert_values = []
                        for idx, tag_name in enumerate(tag_names):
                            if tag_name in tag_map:
                                insert_values.append((tag_map[tag_name], group_id, idx))
                        
                        if insert_values:
                            # Use executemany for batch insert
                            cursor.executemany("""
                                INSERT INTO tag_group_members (tag_id, group_id, display_order)
                                VALUES (%s, %s, %s)
                                ON CONFLICT (tag_id, group_id) DO UPDATE SET display_order = EXCLUDED.display_order
                            """, insert_values)
                            logger.info(f"Added {len(insert_values)} tags to group")
                        
                        # Log any missing tags
                        missing_tags = [name for name in tag_names if name not in tag_map]
                        if missing_tags:
                            logger.warning(f"Tags not found in database: {missing_tags}")
                
                # Commit on the actual connection
                if hasattr(conn_wrapper, '_conn'):
                    conn_wrapper._conn.commit()
                else:
                    actual_conn.commit()
                logger.info(f"Tag group '{group_name}' created successfully with ID {group_id}")
                
                return jsonify({
                    'status': 'success',
                    'group_id': group_id,
                    'message': f'Tag group "{group_name}" created successfully'
                }), 201
        except psycopg2.OperationalError as e:
            logger.error(f"Database operational error creating tag group: {e}", exc_info=True)
            return jsonify({'status': 'error', 'message': f'Database connection error: {str(e)}'}), 500
    
    except psycopg2.IntegrityError as e:
        logger.error(f"Database integrity error creating tag group: {e}", exc_info=True)
        error_msg = str(e) or repr(e) or 'Unknown integrity error'
        if 'unique constraint' in error_msg.lower() or 'duplicate key' in error_msg.lower():
            return jsonify({
                'status': 'error',
                'message': f'Tag group "{group_name}" already exists'
            }), 400
        return jsonify({
            'status': 'error',
            'message': f'Database integrity error: {error_msg}'
        }), 500
    except psycopg2.Error as e:
        logger.error(f"Database error creating tag group: {e}", exc_info=True)
        error_msg = str(e) or repr(e) or 'Unknown database error'
        return jsonify({
            'status': 'error',
            'message': f'Database error: {error_msg}'
        }), 500
    except Exception as e:
        logger.error(f"Error creating tag group: {e}", exc_info=True)
        import traceback
        error_details = traceback.format_exc()
        logger.error(f"Full traceback: {error_details}")
        error_msg = str(e) or repr(e) or f'Unknown error: {type(e).__name__}'
        return jsonify({
            'status': 'error',
            'message': error_msg,
            'error_type': type(e).__name__
        }), 500


@tag_groups_bp.route('/tag-groups/<int:group_id>', methods=['GET'])
def get_tag_group(group_id):
    """Get single tag group with tags"""
    try:
        get_db_connection_func = _get_db_connection()
        with closing(get_db_connection_func()) as conn:
            # Handle both PooledConnection and regular connection
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor(cursor_factory=RealDictCursor)
            
            # Get group
            cursor.execute("""
                SELECT id, group_name, description, display_order, is_active, created_at, updated_at
                FROM tag_groups
                WHERE id = %s
            """, (group_id,))
            
            group = cursor.fetchone()
            
            if not group:
                return jsonify({'status': 'error', 'message': 'Tag group not found'}), 404
            
            group_dict = dict(group)
            
            # Get tags in this group
            cursor.execute("""
                SELECT t.id, t.tag_name, t.display_name, t.source_type, 
                       t.data_type, t.unit, t.is_active, tgm.display_order
                FROM tags t
                JOIN tag_group_members tgm ON t.id = tgm.tag_id
                WHERE tgm.group_id = %s
                ORDER BY tgm.display_order, t.tag_name
            """, (group_id,))
            
            tags = cursor.fetchall()
            group_dict['tags'] = [dict(tag) for tag in tags]
            
            return jsonify({
                'status': 'success',
                'tag_group': group_dict
            })
    
    except Exception as e:
        logger.error(f"Error getting tag group: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


@tag_groups_bp.route('/tag-groups/<int:group_id>', methods=['PUT'])
def update_tag_group(group_id):
    """Update tag group"""
    try:
        data = request.get_json()
        
        get_db_connection_func = _get_db_connection()
        with closing(get_db_connection_func()) as conn:
            # Handle both PooledConnection and regular connection
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor(cursor_factory=RealDictCursor)
            
            # Check if group exists
            cursor.execute("SELECT * FROM tag_groups WHERE id = %s", (group_id,))
            existing_group = cursor.fetchone()
            
            if not existing_group:
                return jsonify({'status': 'error', 'message': 'Tag group not found'}), 404
            
            existing_dict = dict(existing_group)
            
            # Update group
            cursor.execute("""
                UPDATE tag_groups SET
                    group_name = %s,
                    description = %s,
                    display_order = %s,
                    is_active = %s
                WHERE id = %s
            """, (
                data.get('group_name', existing_dict.get('group_name')),
                data.get('description', existing_dict.get('description', '')),
                int(data.get('display_order', existing_dict.get('display_order', 0))),
                data.get('is_active', existing_dict.get('is_active', True)),
                group_id
            ))
            
            # Commit on the actual connection
            if hasattr(conn, '_conn'):
                conn._conn.commit()
            else:
                actual_conn.commit()
            
            logger.info(f"Updated tag group ID: {group_id}")
            
            return jsonify({
                'status': 'success',
                'message': 'Tag group updated successfully'
            })
    
    except Exception as e:
        logger.error(f"Error updating tag group: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


@tag_groups_bp.route('/tag-groups/<int:group_id>', methods=['DELETE'])
def delete_tag_group(group_id):
    """Delete tag group (soft delete: set is_active=false)"""
    try:
        get_db_connection_func = _get_db_connection()
        with closing(get_db_connection_func()) as conn:
            # Handle both PooledConnection and regular connection
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor()
            
            # Check if group exists
            cursor.execute("SELECT id FROM tag_groups WHERE id = %s", (group_id,))
            if not cursor.fetchone():
                return jsonify({'status': 'error', 'message': 'Tag group not found'}), 404
            
            # Soft delete
            cursor.execute("UPDATE tag_groups SET is_active = false WHERE id = %s", (group_id,))
            # Commit on the actual connection
            if hasattr(conn, '_conn'):
                conn._conn.commit()
            else:
                actual_conn.commit()
            
            logger.info(f"Deleted tag group ID: {group_id}")
            
            return jsonify({
                'status': 'success',
                'message': 'Tag group deleted successfully'
            })
    
    except Exception as e:
        logger.error(f"Error deleting tag group: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


@tag_groups_bp.route('/tag-groups/<int:group_id>/tags', methods=['POST'])
def add_tags_to_group(group_id):
    """Add tags to group"""
    try:
        data = request.get_json()
        tag_names = data.get('tag_names', [])
        
        if not tag_names:
            return jsonify({'status': 'error', 'message': 'tag_names array is required'}), 400
        
        get_db_connection_func = _get_db_connection()
        with closing(get_db_connection_func()) as conn:
            # Handle both PooledConnection and regular connection
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor()
            
            # Check if group exists
            cursor.execute("SELECT id FROM tag_groups WHERE id = %s", (group_id,))
            if not cursor.fetchone():
                return jsonify({'status': 'error', 'message': 'Tag group not found'}), 404
            
            added = 0
            errors = []
            
            for idx, tag_name in enumerate(tag_names):
                try:
                    # Get tag ID
                    cursor.execute("SELECT id FROM tags WHERE tag_name = %s", (tag_name,))
                    tag_row = cursor.fetchone()
                    if not tag_row:
                        errors.append({'tag': tag_name, 'error': 'Tag not found'})
                        continue
                    
                    tag_id = tag_row[0]
                    
                    # Check if already in group
                    cursor.execute("""
                        SELECT id FROM tag_group_members 
                        WHERE tag_id = %s AND group_id = %s
                    """, (tag_id, group_id))
                    
                    if cursor.fetchone():
                        # Update display order
                        cursor.execute("""
                            UPDATE tag_group_members 
                            SET display_order = %s
                            WHERE tag_id = %s AND group_id = %s
                        """, (idx, tag_id, group_id))
                    else:
                        # Insert
                        cursor.execute("""
                            INSERT INTO tag_group_members (tag_id, group_id, display_order)
                            VALUES (%s, %s, %s)
                        """, (tag_id, group_id, idx))
                    
                    added += 1
                
                except Exception as e:
                    errors.append({'tag': tag_name, 'error': str(e)})
            
            # Commit on the actual connection
            if hasattr(conn, '_conn'):
                conn._conn.commit()
            else:
                actual_conn.commit()
            
            return jsonify({
                'status': 'success',
                'added': added,
                'errors': errors,
                'message': f'Added {added} tags to group'
            })
    
    except Exception as e:
        logger.error(f"Error adding tags to group: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


@tag_groups_bp.route('/tag-groups/<int:group_id>/tags/<int:tag_id>', methods=['DELETE'])
def remove_tag_from_group(group_id, tag_id):
    """Remove tag from group"""
    try:
        get_db_connection_func = _get_db_connection()
        with closing(get_db_connection_func()) as conn:
            # Handle both PooledConnection and regular connection
            actual_conn = conn._conn if hasattr(conn, '_conn') else conn
            cursor = actual_conn.cursor()
            
            # Check if membership exists
            cursor.execute("""
                SELECT id FROM tag_group_members 
                WHERE tag_id = %s AND group_id = %s
            """, (tag_id, group_id))
            
            if not cursor.fetchone():
                return jsonify({'status': 'error', 'message': 'Tag not found in group'}), 404
            
            # Delete membership
            cursor.execute("""
                DELETE FROM tag_group_members 
                WHERE tag_id = %s AND group_id = %s
            """, (tag_id, group_id))
            
            # Commit on the actual connection
            if hasattr(conn, '_conn'):
                conn._conn.commit()
            else:
                actual_conn.commit()
            
            logger.info(f"Removed tag {tag_id} from group {group_id}")
            
            return jsonify({
                'status': 'success',
                'message': 'Tag removed from group successfully'
            })
    
    except Exception as e:
        logger.error(f"Error removing tag from group: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': str(e)}), 500


"""
Section Data Resolver

Resolves column values for sections based on tag values and column configurations.
Used for storing section-based data in dynamic monitor tables.
"""

import logging
import json
import re
from asteval import Interpreter
from contextlib import closing
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)


def resolve_column_value(column, tag_values, bin_id=None, tag_group_members=None):
    """
    Resolve a column's value from tag_values based on column configuration.
    
    Args:
        column: Column configuration dict (from live_monitor_columns)
        tag_values: Dictionary of tag_name -> value
        bin_id: Optional bin_id for dynamic rows
        tag_group_members: Optional list of tag group members for pattern matching
        
    Returns:
        Resolved value for the column
    """
    source_type = column.get('source_type', '').lower()
    tag_name = column.get('tag_name', '').strip()
    formula = column.get('formula', '').strip()
    mapping_name = column.get('mapping_name', '').strip()
    text_value = column.get('text_value', '').strip()
    
    # Handle different source types
    if source_type == 'tag':
        if not tag_name:
            return None
        
        # Handle pattern-based tag names (e.g., {tag_name}Weight)
        if '{tag_name}' in tag_name and tag_group_members:
            # Replace {tag_name} with actual tag from tag group
            for member_tag in tag_group_members:
                resolved_tag = tag_name.replace('{tag_name}', member_tag)
                if resolved_tag in tag_values:
                    value = tag_values[resolved_tag]
                    # Apply formula if provided
                    if formula:
                        try:
                            value = evaluate_formula(formula, value)
                        except Exception as e:
                            logger.warning(f"Error evaluating formula '{formula}' for tag '{resolved_tag}': {e}")
                    return value
        
        # Handle bin_id-based patterns (e.g., FCL_Source_bin_{bin_id})
        if bin_id and '{bin_id}' in tag_name:
            resolved_tag = tag_name.replace('{bin_id}', str(int(bin_id)))
            if resolved_tag in tag_values:
                value = tag_values[resolved_tag]
                if formula:
                    try:
                        value = evaluate_formula(formula, value)
                    except Exception as e:
                        logger.warning(f"Error evaluating formula '{formula}' for tag '{resolved_tag}': {e}")
                return value
        
        # Direct tag lookup
        if tag_name in tag_values:
            value = tag_values[tag_name]
            # Apply formula if provided
            if formula:
                try:
                    value = evaluate_formula(formula, value)
                except Exception as e:
                    logger.warning(f"Error evaluating formula '{formula}' for tag '{tag_name}': {e}")
            return value
        
        # Try case-insensitive match
        for key, val in tag_values.items():
            if key.lower() == tag_name.lower():
                value = val
                if formula:
                    try:
                        value = evaluate_formula(formula, value)
                    except Exception as e:
                        logger.warning(f"Error evaluating formula '{formula}' for tag '{key}': {e}")
                return value
        
        # Try partial match (for dynamic bin tags)
        tag_lower = tag_name.lower()
        for key, val in tag_values.items():
            key_lower = key.lower()
            # Match patterns like FCL_Source_bin_21 when looking for FCL_source_1_weight
            if bin_id:
                # Pattern: FCL_source_1_bin_id -> FCL_Source_bin_21
                if f'_source_{bin_id}' in key_lower or f'_source_{int(bin_id)}' in key_lower:
                    # Check if this is a weight/material tag
                    if 'weight' in tag_lower and 'weight' in key_lower:
                        if formula:
                            try:
                                return evaluate_formula(formula, val)
                            except Exception:
                                pass
                        return val
                    if 'material' in tag_lower and ('material' in key_lower or 'prd_code' in key_lower):
                        if formula:
                            try:
                                return evaluate_formula(formula, val)
                            except Exception:
                                pass
                        return val
        
        return None
    
    elif source_type == 'formula':
        if not formula:
            return None
        # Formula might reference multiple tags
        try:
            return evaluate_formula(formula, tag_values)
        except Exception as e:
            logger.warning(f"Error evaluating formula '{formula}': {e}")
            return None
    
    elif source_type == 'mapping':
        if not mapping_name:
            return None
        # Resolve the mapping: look up the input tag's value in the mapping's lookup table
        return resolve_mapping_value(mapping_name, tag_values)
    
    elif source_type == 'text':
        return text_value
    
    elif source_type == 'bin_id':
        # Return the bin_id directly
        return bin_id
    
    return None


def resolve_material_name(source_tag_name, bin_id, tag_values):
    """
    Resolve material name for a bin_id.
    
    Args:
        source_tag_name: The source tag name (e.g., FCL_source_1_bin_id)
        bin_id: The bin ID value
        tag_values: Dictionary of tag_name -> value
        
    Returns:
        Material name string or "N/A"
    """
    # Extract source number from tag name (e.g., FCL_source_1_bin_id -> 1)
    source_match = re.search(r'(?:source|SOURCE)[_\s]*(\d+)', source_tag_name)
    source_number = source_match.group(1) if source_match else None
    
    # Try various material name tag patterns
    material_patterns = []
    
    if source_number:
        material_patterns.extend([
            f"FCL_source_{source_number}_material_name",
            f"FCL_source_{source_number}_MaterialName",
            f"FCL_SOURCE_{source_number}_MATERIAL_NAME",
            f"FCL_source_{source_number}_material_name_Code",
            f"FCL_source_{source_number}_MaterialName_Code",
            f"FCL_SOURCE_{source_number}_MATERIAL_NAME_CODE",
        ])
    
    # Also try patterns based on source_tag_name
    base_tag = source_tag_name.replace('_bin_id', '').replace('BinId', '').replace('BIN_ID', '')
    material_patterns.extend([
        f"{base_tag}_material_name",
        f"{base_tag}_MaterialName",
        f"{base_tag}_MATERIAL_NAME",
        f"{base_tag}_material_name_Code",
        f"{base_tag}_MaterialName_Code",
    ])
    
    # Try each pattern
    for pattern in material_patterns:
        if pattern in tag_values:
            material_value = tag_values[pattern]
            if material_value and str(material_value).strip() and str(material_value).strip() != '0':
                return str(material_value).strip()
    
    return "N/A"


def resolve_weight_value(source_tag_name, bin_id, tag_values):
    """
    Resolve weight value for a bin_id.
    
    Args:
        source_tag_name: The source tag name (e.g., FCL_source_1_bin_id)
        bin_id: The bin ID value
        tag_values: Dictionary of tag_name -> value
        
    Returns:
        Weight value or None
    """
    # Try bin-based weight patterns (e.g., FCL_Source_bin_21)
    weight_patterns = [
        f"FCL_Source_bin_{bin_id}",
        f"FCL_source_bin_{bin_id}",
        f"FCL_SOURCE_BIN_{bin_id}",
        f"FCL_Source_bin_{str(bin_id).zfill(2)}",
        f"FCL_source_bin_{str(bin_id).zfill(2)}",
    ]
    
    # Handle special bin codes (211->21A, 212->21B, 213->21C)
    if bin_id == 211:
        weight_patterns.extend(['FCL_Source_bin_21A', 'FCL_source_bin_21A', 'FCL_SOURCE_BIN_21A'])
    elif bin_id == 212:
        weight_patterns.extend(['FCL_Source_bin_21B', 'FCL_source_bin_21B', 'FCL_SOURCE_BIN_21B'])
    elif bin_id == 213:
        weight_patterns.extend(['FCL_Source_bin_21C', 'FCL_source_bin_21C', 'FCL_SOURCE_BIN_21C'])
    
    # Extract source number from tag name
    source_match = re.search(r'(?:source|SOURCE)[_\s]*(\d+)', source_tag_name)
    source_number = source_match.group(1) if source_match else None
    
    if source_number:
        weight_patterns.extend([
            f"FCL_source_{source_number}_weight",
            f"FCL_source_{source_number}_Weight",
            f"FCL_SOURCE_{source_number}_WEIGHT",
        ])
    
    # Try each pattern
    for pattern in weight_patterns:
        if pattern in tag_values:
            weight_value = tag_values[pattern]
            if weight_value is not None:
                try:
                    return float(weight_value)
                except (ValueError, TypeError):
                    return weight_value
    
    return None


def resolve_mapping_value(mapping_name, tag_values):
    """
    Resolve a mapping value by looking up the input tag's current value
    in the mapping's lookup table (stored in the database).

    Args:
        mapping_name: Name of the mapping (e.g., 'Bin → Material')
        tag_values: Dictionary of tag_name -> value

    Returns:
        Resolved output string, fallback, or None
    """
    try:
        import sys
        if 'app' not in sys.modules:
            logger.warning("app module not loaded, cannot resolve mapping")
            return None

        app_module = sys.modules['app']
        get_db_connection = getattr(app_module, 'get_db_connection', None)
        if not get_db_connection:
            return None

        with closing(get_db_connection()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT input_tag, lookup, fallback
                FROM mappings
                WHERE LOWER(name) = LOWER(%s) AND is_active = true
            """, (mapping_name,))
            row = cursor.fetchone()

        if not row:
            logger.debug(f"Mapping '{mapping_name}' not found in database")
            return None

        input_tag = row['input_tag']
        lookup = row['lookup']
        fallback = row.get('fallback', 'Unknown')

        if isinstance(lookup, str):
            import json
            lookup = json.loads(lookup)

        # Get the input tag's current value
        input_value = tag_values.get(input_tag)
        if input_value is None:
            # Try case-insensitive match
            for k, v in tag_values.items():
                if k.lower() == input_tag.lower():
                    input_value = v
                    break

        if input_value is None:
            return fallback

        # Lookup: round numeric values to int for key matching
        try:
            key = str(int(round(float(input_value))))
        except (ValueError, TypeError):
            key = str(input_value).strip()

        return lookup.get(key, fallback)

    except Exception as e:
        logger.warning(f"Error resolving mapping '{mapping_name}': {e}")
        return None


def evaluate_formula(formula, value_or_dict):
    """
    Evaluate a formula expression.
    
    Args:
        formula: Formula string (e.g., "value * 0.277778")
        value_or_dict: Either a single value or a dict of tag_name -> value
        
    Returns:
        Evaluated result
    """
    if not formula or not formula.strip():
        return value_or_dict
    
    try:
        # If value_or_dict is a dict, replace tag names in formula
        if isinstance(value_or_dict, dict):
            expression = formula.strip()
            # Replace tag names with their values
            for tag_name, tag_value in value_or_dict.items():
                # Escape special regex characters
                escaped_tag = re.escape(tag_name)
                # Replace tag_name with its value
                expression = re.sub(r'\b' + escaped_tag + r'\b', str(tag_value), expression)
            # Evaluate the expression safely via asteval
            result = Interpreter()(expression)
            return result if result is not None else value_or_dict
        else:
            # Single value formula
            expression = formula.strip().replace('value', str(value_or_dict))
            result = Interpreter()(expression)
            return result if result is not None else value_or_dict
    except Exception as e:
        logger.warning(f"Formula evaluation error: {e}")
        return value_or_dict


def resolve_section_data(section, tag_values, db_connection_func, layout_id=None):
    """
    Resolve all column values for a section.
    
    Args:
        section: Section configuration dict
        tag_values: Dictionary of tag_name -> value
        db_connection_func: Function to get database connection
        layout_id: Optional layout_id to query by section name if section_id is missing
        
    Returns:
        Dictionary of column_label -> value
    """
    section_data = {}
    section_type = section.get('section_type', '').lower()
    
    if section_type not in ['table', 'table_section']:
        # For non-table sections, return empty or handle KPI/chart sections
        return section_data
    
    section_id = section.get('id')
    section_name = section.get('section_name', '').strip()
    # Handle both structures: section.config.tables and section.tables (for config JSONB)
    section_config = section.get('config', {})
    if not section_config or not section_config.get('tables'):
        # Try direct access (for config JSONB format)
        if 'tables' in section:
            section_config = {'tables': section.get('tables', [])}
    
    # ✅ FIX: Prioritize database tables (where actual column data is stored)
    columns_list = []
    row_mode = 'static'
    tag_group_id = None
    
    # Try database first (where columns are actually stored)
    # Use section_id if available, otherwise try section_name + layout_id
    if section_id:
        try:
            with closing(db_connection_func()) as conn:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                
                # Get table config
                cursor.execute("""
                    SELECT tag_group_id, row_mode, refresh_interval
                    FROM live_monitor_table_config
                    WHERE section_id = %s
                """, (section_id,))
                table_config = cursor.fetchone()
                
                if table_config:
                    table_config_dict = dict(table_config)
                    row_mode = table_config_dict.get('row_mode', 'static').lower()
                    tag_group_id = table_config_dict.get('tag_group_id')
                
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
                
                if columns:
                    columns_list = [dict(col) for col in columns]
                    logger.debug(f"📋 Loaded {len(columns_list)} column(s) from database for section_id={section_id}")
        except Exception as e:
            logger.warning(f"⚠️ Error loading columns from database for section_id={section_id}: {e}")
    
    # If no columns found by section_id, try by section_name + layout_id
    if not columns_list and section_name and layout_id:
        try:
            logger.info(f"🔍 [resolve_section_data] Section has no ID or columns not found, trying to find by name '{section_name}' for layout_id={layout_id}")
            with closing(db_connection_func()) as conn:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                
                # Find section by name and layout_id
                cursor.execute("""
                    SELECT id, section_name, section_type
                    FROM live_monitor_sections
                    WHERE layout_id = %s AND LOWER(section_name) = LOWER(%s) AND is_active = TRUE
                    LIMIT 1
                """, (layout_id, section_name))
                found_section = cursor.fetchone()
                
                if found_section:
                    found_section_id = found_section['id']
                    logger.info(f"✅ [resolve_section_data] Found section '{section_name}' in database with ID={found_section_id}")
                    
                    # Get table config
                    cursor.execute("""
                        SELECT tag_group_id, row_mode, refresh_interval
                        FROM live_monitor_table_config
                        WHERE section_id = %s
                    """, (found_section_id,))
                    table_config = cursor.fetchone()
                    
                    if table_config:
                        table_config_dict = dict(table_config)
                        row_mode = table_config_dict.get('row_mode', 'static').lower()
                        tag_group_id = table_config_dict.get('tag_group_id')
                    
                    # Get columns using the found section_id
                    cursor.execute("""
                        SELECT id, column_label, source_type, tag_name, formula, 
                               mapping_name, text_value, unit, decimals, alignment, 
                               width, display_order
                        FROM live_monitor_columns
                        WHERE section_id = %s
                        ORDER BY display_order
                    """, (found_section_id,))
                    columns = cursor.fetchall()
                    
                    if columns:
                        columns_list = [dict(col) for col in columns]
                        logger.info(f"✅ [resolve_section_data] Loaded {len(columns_list)} column(s) from database for section '{section_name}' (ID: {found_section_id})")
                        # Update section_id for later use
                        section_id = found_section_id
                else:
                    logger.warning(f"⚠️ [resolve_section_data] Section '{section_name}' not found in database for layout_id={layout_id}")
        except Exception as e:
            logger.error(f"❌ Error finding section by name '{section_name}': {e}", exc_info=True)
    
    # If still no columns, try loading from config JSONB
    if not columns_list and section_config:
        logger.info(f"🔍 [resolve_section_data] No columns in database, trying config JSONB for section '{section_name}'")
        tables = section_config.get('tables', [])
        if tables:
            table = tables[0]  # Get first table
            columns_config = table.get('columns', [])
            if columns_config:
                columns_list = []
                for col_config in columns_config:
                    columns_list.append({
                        'column_label': col_config.get('label', col_config.get('column_label', '')),
                        'source_type': col_config.get('source_type', 'tag'),
                        'tag_name': col_config.get('tag_name', ''),
                        'formula': col_config.get('formula', ''),
                        'mapping_name': col_config.get('mapping_name', ''),
                        'text_value': col_config.get('text_value', ''),
                        'unit': col_config.get('unit', ''),
                        'decimals': col_config.get('decimals', 2),
                        'alignment': col_config.get('alignment', 'left'),
                        'width': col_config.get('width'),
                        'display_order': col_config.get('display_order', 0)
                    })
                row_mode = table.get('row_mode', 'static').lower()
                tag_group_id = table.get('tag_group_id')
                logger.info(f"✅ [resolve_section_data] Loaded {len(columns_list)} column(s) from config JSONB for section '{section_name}'")
    
    if not columns_list:
        logger.warning(f"⚠️ [resolve_section_data] No columns found for section (ID: {section_id}, Name: {section_name})")
        return section_data
    
    try:
        with closing(db_connection_func()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get tag group members if dynamic rows
            tag_group_members = None
            if row_mode == 'dynamic':
                # tag_group_id might come from config or database
                if not tag_group_id:
                    # Try to get from database if not in config
                    cursor.execute("""
                        SELECT tag_group_id
                        FROM live_monitor_table_config
                        WHERE section_id = %s
                    """, (section_id,))
                    table_config = cursor.fetchone()
                    if table_config:
                        tag_group_id = table_config.get('tag_group_id')
                
                if tag_group_id:
                    cursor.execute("""
                        SELECT t.tag_name
                        FROM tag_group_members tgm
                        JOIN tags t ON tgm.tag_id = t.id
                        JOIN tag_groups tg ON tgm.group_id = tg.id
                        WHERE tgm.group_id = %s AND t.is_active = TRUE AND tg.is_active = TRUE
                    """, (tag_group_id,))
                    members = cursor.fetchall()
                    tag_group_members = [m.get('tag_name') for m in members if m.get('tag_name')]
            
            # For dynamic rows, resolve data for each active bin
            if row_mode == 'dynamic' and tag_group_members:
                logger.info(f"🔍 [resolve_section_data] Processing dynamic rows with {len(tag_group_members)} tag group member(s): {tag_group_members[:5]}")
                # Get bin_ids from tag values (e.g., FCL_source_1_bin_id, FCL_source_2_bin_id)
                bin_ids_map = {}  # Map bin_id to source tag name
                for tag_name in tag_group_members:
                    if tag_name in tag_values:
                        bin_id = tag_values[tag_name]
                        if bin_id and bin_id != 0:
                            try:
                                bin_id = int(float(bin_id))
                                if bin_id not in bin_ids_map:
                                    bin_ids_map[bin_id] = tag_name
                                    logger.debug(f"🔍 [resolve_section_data] Found active bin_id={bin_id} from tag '{tag_name}'")
                            except (ValueError, TypeError):
                                pass
                
                logger.info(f"🔍 [resolve_section_data] Found {len(bin_ids_map)} active bin(s): {list(bin_ids_map.keys())}")
                
                # For each bin, resolve column values
                rows_data = []
                for bin_id, source_tag_name in bin_ids_map.items():
                    row_data = {}
                    for column in columns_list:
                        column_label = column.get('column_label', '').strip()
                        if not column_label:
                            continue
                        
                        column_label_lower = column_label.lower()
                        
                        # Handle ID column: return bin_id directly
                        if column_label_lower == 'id' or column_label_lower == 'bin_id' or column_label_lower == 'bin_code':
                            row_data[column_label_lower] = bin_id
                            continue
                        
                        # Handle MATERIAL column: look up material name
                        if 'material' in column_label_lower:
                            material_value = resolve_material_name(source_tag_name, bin_id, tag_values)
                            row_data[column_label_lower] = material_value
                            continue
                        
                        # Handle WEIGHT column: look up weight using bin_id
                        if 'weight' in column_label_lower or 'qtt' in column_label_lower or 'produce' in column_label_lower:
                            weight_value = resolve_weight_value(source_tag_name, bin_id, tag_values)
                            row_data[column_label_lower] = weight_value
                            continue
                        
                        # For other columns, use standard resolution
                        value = resolve_column_value(column, tag_values, bin_id, tag_group_members)
                        row_data[column_label_lower] = value
                    
                    if row_data:
                        rows_data.append(row_data)
                        logger.debug(f"🔍 [resolve_section_data] Resolved row for bin_id={bin_id}: {row_data}")
                
                # Store as array of rows (for dynamic sections)
                # Format: [{"id": 21, "material": "SEMI-115", "weight": 4.83}, ...]
                # Return as a special marker dict that will be converted to array in get_layout_sections_data
                if rows_data:
                    logger.info(f"✅ [resolve_section_data] Resolved {len(rows_data)} row(s) for dynamic section")
                    section_data['_dynamic_rows'] = rows_data
                    return section_data
                else:
                    logger.warning(f"⚠️ [resolve_section_data] No rows resolved for dynamic section (bin_ids_map had {len(bin_ids_map)} bins, tag_values has {len(tag_values)} tags)")
                    return {}
            else:
                # Static rows: resolve values for each column
                for column in columns_list:
                    column_label = column.get('column_label', '').strip().lower()
                    if not column_label:
                        continue
                    
                    value = resolve_column_value(column, tag_values, None, None)
                    section_data[column_label] = value
    
    except Exception as e:
        logger.error(f"Error resolving section data for section {section_id}: {e}", exc_info=True)
    
    return section_data


def get_layout_sections_data(layout_id, tag_values, db_connection_func):
    """
    Get section-based data for a layout.
    
    Args:
        layout_id: Layout ID
        tag_values: Dictionary of tag_name -> value
        db_connection_func: Function to get database connection
        
    Returns:
        Dictionary of section_name -> section_data
        For dynamic sections: section_name -> array of row objects
        For static sections: section_name -> object with column values
    """
    sections_data = {}
    
    try:
        with closing(db_connection_func()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            logger.info(f"🔍 [get_layout_sections_data] Starting for layout_id={layout_id}")
            
            # ✅ FIX: Get sections from both database and config JSONB, then merge
            # First, get sections from database
            cursor.execute("""
                SELECT id, section_name, section_type, display_order, is_active
                FROM live_monitor_sections
                WHERE layout_id = %s AND is_active = TRUE
                ORDER BY display_order
            """, (layout_id,))
            
            db_sections = cursor.fetchall()
            logger.info(f"🔍 [get_layout_sections_data] Found {len(db_sections)} section(s) in database table")
            db_sections_dict = {s['section_name'].lower(): dict(s) for s in db_sections}
            
            # Also get sections from config JSONB
            cursor.execute("""
                SELECT config
                FROM live_monitor_layouts
                WHERE id = %s AND is_published = TRUE
            """, (layout_id,))
            
            layout = cursor.fetchone()
            if layout and layout.get('config'):
                config = layout['config']
                if isinstance(config, str):
                    import json
                    config = json.loads(config)
                
                if isinstance(config, dict):
                    config_sections = config.get('sections', [])
                    logger.info(f"🔍 [get_layout_sections_data] Found {len(config_sections)} section(s) in config JSONB")
                    
                    # Merge config sections with database sections (database takes priority for IDs)
                    for section in config_sections:
                        if isinstance(section, dict):
                            section_dict = section
                        else:
                            section_dict = dict(section)
                        
                        section_name = section_dict.get('section_name', '').strip().lower()
                        if section_name:
                            # If section exists in database, use database version (has ID)
                            # Otherwise, use config version
                            if section_name not in db_sections_dict:
                                logger.info(f"🔍 [get_layout_sections_data] Adding section '{section_name}' from config JSONB (no DB entry)")
                                db_sections_dict[section_name] = section_dict
            
            # Convert back to list
            all_sections = list(db_sections_dict.values())
            
            if not all_sections:
                logger.warning(f"⚠️ [get_layout_sections_data] No sections found for layout_id={layout_id} (checked database table and config JSONB)")
                return sections_data
            
            logger.info(f"🔍 [get_layout_sections_data] Processing {len(all_sections)} section(s): {[s.get('section_name', 'N/A') for s in all_sections]}")
            
            for section in all_sections:
                # Handle both config format and database format
                if isinstance(section, dict):
                    section_dict = section
                else:
                    section_dict = dict(section)
                
                section_name = section_dict.get('section_name', '').strip().lower()
                section_id = section_dict.get('id')
                
                if not section_name:
                    logger.warning(f"⚠️ Section {section_id} has no section_name, skipping")
                    continue
                
                try:
                    # Resolve section data (pass layout_id for section name lookup)
                    logger.info(f"🔍 [get_layout_sections_data] Resolving section '{section_name}' (ID: {section_id})")
                    section_data = resolve_section_data(section_dict, tag_values, db_connection_func, layout_id)
                    logger.info(f"🔍 [get_layout_sections_data] Section '{section_name}' resolved: {bool(section_data)}, type: {type(section_data)}, keys: {list(section_data.keys()) if isinstance(section_data, dict) else 'not a dict'}")
                    if section_data and isinstance(section_data, dict) and '_dynamic_rows' in section_data:
                        logger.info(f"🔍 [get_layout_sections_data] Section '{section_name}' has {len(section_data['_dynamic_rows'])} dynamic rows")
                    
                    if section_data:
                        # For dynamic sections, section_data contains '_dynamic_rows' key with array
                        # For static sections, section_data is a dict with column values
                        if '_dynamic_rows' in section_data:
                            # Return array directly for dynamic sections
                            rows_array = section_data['_dynamic_rows']
                            if rows_array:  # Only add if array is not empty
                                sections_data[section_name] = rows_array
                                logger.info(f"✅ [get_layout_sections_data] Resolved {len(rows_array)} row(s) for section '{section_name}'")
                            else:
                                logger.warning(f"⚠️ [get_layout_sections_data] Section '{section_name}' resolved to empty array")
                        else:
                            # Return dict for static sections
                            sections_data[section_name] = section_data
                            logger.info(f"✅ [get_layout_sections_data] Resolved static section '{section_name}' with {len(section_data)} column(s): {list(section_data.keys())}")
                    else:
                        logger.warning(f"⚠️ Section '{section_name}' (ID: {section_id}) resolved to empty data")
                
                except Exception as section_error:
                    logger.error(f"❌ Error resolving section '{section_name}' (ID: {section_id}): {section_error}", exc_info=True)
                    continue
    
    except Exception as e:
        logger.error(f"❌ Error getting layout sections data for layout {layout_id}: {e}", exc_info=True)
    
    return sections_data


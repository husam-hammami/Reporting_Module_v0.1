"""
Layout Tag Extractor

Extracts tag names from layout configuration for efficient data storage.
Only stores tags that are actually used in the layout's sections.
"""

import logging
import json
import re

logger = logging.getLogger(__name__)


def extract_tags_from_layout_config(layout_config):
    """
    Extract all tag names used in a layout's configuration.
    
    Args:
        layout_config: Dictionary containing layout config (from JSONB column)
        
    Returns:
        set: Set of tag names used in the layout
    """
    tag_names = set()
    
    if not layout_config:
        return tag_names
    
    sections = layout_config.get('sections', [])
    logger.info(f"📋 [extract_tags_from_layout_config] Processing {len(sections)} section(s)")
    
    for section in sections:
        section_type = section.get('section_type', '').lower()
        section_name = section.get('section_name', '')
        
        logger.info(f"🔍 [extract_tags_from_layout_config] Section '{section_name}' type: {section_type}, keys: {list(section.keys())}")
        
        if section_type in ['table', 'table_section']:
            # Extract tags from table sections
            # Handle both section.config.tables and section.tables structures
            tables = section.get('config', {}).get('tables', [])
            if not tables:
                tables = section.get('tables', [])
            
            logger.info(f"📋 [extract_tags_from_layout_config] Section '{section_name}' has {len(tables)} table(s)")
            
            # If tables found, process them
            if tables:
                for table in tables:
                    # Get tags from static rows
                    static_rows = table.get('static_rows', [])
                    for row in static_rows:
                        cells = row.get('cells', [])
                        for cell in cells:
                            tag_name = cell.get('tag_name')
                            if tag_name and tag_name.strip():
                                tag_names.add(tag_name.strip())
                        
                        # Legacy support: row-level tag_name
                        if row.get('tag_name'):
                            tag_names.add(row.get('tag_name').strip())
                    
                    # For dynamic rows, get tags from tag group
                    if table.get('row_mode') == 'dynamic':
                        tag_group = table.get('tag_group')
                        if tag_group:
                            # The tag group name itself might be a tag, but usually
                            # we need to get the actual tags from the tag group
                            # For now, we'll extract pattern-based tags
                            # The actual tag group members will be loaded separately
                            pass
                    
                    # ✅ FIX: Get tags from columns in config JSONB
                    columns = table.get('columns', [])
                    logger.info(f"📋 [extract_tags_from_layout_config] Table has {len(columns)} column(s)")
                    for column in columns:
                        tag_name = column.get('tag_name')
                        if tag_name and tag_name.strip():
                            # Handle pattern-based tag names (e.g., {tag_name}Weight)
                            if '{tag_name}' in tag_name:
                                # This is a pattern - we'll need to resolve it at runtime
                                # For now, skip it as it will be resolved from tag group
                                pass
                            else:
                                tag_names.add(tag_name.strip())
                                logger.info(f"📋 [extract_tags_from_layout_config] Added column tag: {tag_name}")
            
            # ✅ FIX: If no tables found, check for columns directly in section
            else:
                # Check if columns are directly in section.config or section
                columns_direct = section.get('config', {}).get('columns', [])
                if not columns_direct:
                    columns_direct = section.get('columns', [])
                
                # Also check if section itself has column-like properties (flat structure)
                if not columns_direct:
                    # Check if section has column properties directly (like column_label, tag_name)
                    if section.get('column_label') or section.get('tag_name'):
                        # This might be a single column section, treat as array
                        columns_direct = [section]
                
                if columns_direct:
                    logger.info(f"🔍 [extract_tags_from_layout_config] Found {len(columns_direct)} column(s) directly in section '{section_name}'")
                    
                    # ✅ FIX: Check row_mode and tag_group on SECTION, not on columns
                    row_mode = section.get('row_mode', '').lower()
                    if not row_mode:
                        row_mode = section.get('config', {}).get('row_mode', '').lower()
                    
                    tag_group = section.get('tag_group')
                    if not tag_group:
                        tag_group = section.get('config', {}).get('tag_group')
                    
                    logger.info(f"🔍 [extract_tags_from_layout_config] Section '{section_name}' row_mode: {row_mode}, tag_group: {tag_group}")
                    
                    for column in columns_direct:
                        tag_name = column.get('tag_name')
                        if tag_name and tag_name.strip():
                            tag_names.add(tag_name.strip())
                            logger.info(f"📋 [extract_tags_from_layout_config] Added column tag: {tag_name}")
                        else:
                            logger.debug(f"📋 [extract_tags_from_layout_config] Column '{column.get('column_label', 'unknown')}' has no tag_name (may be pattern-based for dynamic rows)")
                    
                    if row_mode == 'dynamic' and tag_group:
                        logger.info(f"📋 [extract_tags_from_layout_config] Section '{section_name}' has dynamic rows with tag_group: {tag_group}")
                        # Tag group members will be loaded in get_layout_tags
                else:
                    logger.warning(f"⚠️ [extract_tags_from_layout_config] Section '{section_name}' has no tables and no columns found")
        
        elif section_type in ['kpi', 'kpi_cards', 'kpi_section']:
            # Extract tags from KPI cards
            kpi_cards = section.get('config', {}).get('kpi_cards', [])
            for kpi in kpi_cards:
                tag_name = kpi.get('tag_name')
                if tag_name and tag_name.strip():
                    tag_names.add(tag_name.strip())
        
        elif section_type in ['chart', 'chart_section']:
            # Extract tags from chart configuration
            chart_config = section.get('config', {}).get('chart_config', {})
            
            # X-axis tags
            x_axis_labels = chart_config.get('xAxisLabel', [])
            if isinstance(x_axis_labels, list):
                for label in x_axis_labels:
                    if label and isinstance(label, str):
                        tag_names.add(label.strip())
            elif x_axis_labels:
                tag_names.add(str(x_axis_labels).strip())
            
            # Dataset tags
            datasets = chart_config.get('datasets', [])
            for dataset in datasets:
                tag_name = dataset.get('tag_name')
                if tag_name and tag_name.strip():
                    tag_names.add(tag_name.strip())
    
    logger.info(f"✅ [extract_tags_from_layout_config] Extracted {len(tag_names)} tag(s) from config")
    return tag_names


def get_layout_tags(layout_id, db_connection_func):
    """
    Get all tag names used in a layout by loading its config from database.
    
    Args:
        layout_id: Layout ID
        db_connection_func: Function to get database connection
        
    Returns:
        set: Set of tag names used in the layout
    """
    from contextlib import closing
    from psycopg2.extras import RealDictCursor
    
    logger.info(f"🔍 [get_layout_tags] Starting tag extraction for layout_id={layout_id}")
    tag_names = set()
    
    try:
        with closing(db_connection_func()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            
            # Get layout config
            cursor.execute("""
                SELECT config, order_status_tag_name, line_running_tag_name
                FROM live_monitor_layouts
                WHERE id = %s AND is_published = TRUE
            """, (layout_id,))
            
            layout = cursor.fetchone()
            if not layout:
                logger.warning(f"⚠️ [get_layout_tags] Layout {layout_id} not found or not published")
                return tag_names
            
            logger.info(f"✅ [get_layout_tags] Layout {layout_id} found, extracting tags...")
            layout_dict = dict(layout)
            
            # Add order tracking tag if configured
            if layout_dict.get('order_status_tag_name'):
                tag_names.add(layout_dict['order_status_tag_name'].strip())
                logger.info(f"📋 [get_layout_tags] Added order status tag: {layout_dict['order_status_tag_name']}")
            
            # Add line running tag if configured
            if layout_dict.get('line_running_tag_name'):
                tag_names.add(layout_dict['line_running_tag_name'].strip())
            
            # Parse config JSONB
            config = layout_dict.get('config')
            logger.info(f"🔍 [get_layout_tags] Config exists: {config is not None}, type: {type(config)}")
            if config:
                if isinstance(config, str):
                    config = json.loads(config)
                
                # Extract tags from config
                config_tags = extract_tags_from_layout_config(config)
                tag_names.update(config_tags)
                logger.info(f"📋 [get_layout_tags] Extracted {len(config_tags)} tag(s) from config JSONB")
            
            # For dynamic rows, we need to get tags from tag groups
            # This requires querying tag_group_members table
            if config and isinstance(config, dict):
                sections = config.get('sections', [])
                logger.info(f"📋 [get_layout_tags] Processing {len(sections)} section(s) from config for layout_id={layout_id}")
                for section in sections:
                    section_name = section.get('section_name', '')
                    logger.info(f"🔍 [get_layout_tags] Section '{section_name}' keys: {list(section.keys())}")
                    
                    # Handle both section.config.tables and section.tables structures
                    tables = section.get('config', {}).get('tables', [])
                    if not tables:
                        tables = section.get('tables', [])
                    
                    logger.info(f"📋 [get_layout_tags] Section '{section_name}' has {len(tables)} table(s)")
                    
                    # If no tables, check for columns directly in section
                    if not tables:
                        # Check for columns directly in section
                        columns_direct = section.get('config', {}).get('columns', [])
                        if not columns_direct:
                            columns_direct = section.get('columns', [])
                        
                        # Also check if section itself has column properties (flat structure)
                        if not columns_direct:
                            if section.get('column_label') or section.get('tag_name'):
                                columns_direct = [section]
                        
                        if columns_direct:
                            logger.info(f"🔍 [get_layout_tags] Found {len(columns_direct)} column(s) directly in section '{section_name}'")
                            
                            # Check for row_mode and tag_group on SECTION
                            row_mode = section.get('row_mode', '').lower()
                            if not row_mode:
                                row_mode = section.get('config', {}).get('row_mode', '').lower()
                            
                            tag_group_id = section.get('tag_group_id')
                            tag_group_name = section.get('tag_group')
                            if not tag_group_name:
                                tag_group_name = section.get('config', {}).get('tag_group')
                            
                            logger.info(f"🔍 [get_layout_tags] Section '{section_name}' row_mode: {row_mode}, tag_group_id: {tag_group_id}, tag_group_name: {tag_group_name}")
                            
                            # If dynamic rows, get tags from tag group
                            if row_mode == 'dynamic':
                                logger.info(f"📋 [get_layout_tags] Dynamic section '{section_name}': tag_group_id={tag_group_id}, tag_group_name={tag_group_name}")
                                
                                # Try to get tag group by ID first, then by name
                                if tag_group_id:
                                    cursor.execute("""
                                        SELECT t.tag_name
                                        FROM tag_group_members tgm
                                        JOIN tags t ON tgm.tag_id = t.id
                                        JOIN tag_groups tg ON tgm.group_id = tg.id
                                        WHERE tgm.group_id = %s AND t.is_active = TRUE AND tg.is_active = TRUE
                                    """, (tag_group_id,))
                                elif tag_group_name:
                                    cursor.execute("""
                                        SELECT t.tag_name
                                        FROM tag_group_members tgm
                                        JOIN tags t ON tgm.tag_id = t.id
                                        JOIN tag_groups tg ON tgm.group_id = tg.id
                                        WHERE tg.group_name = %s AND t.is_active = TRUE AND tg.is_active = TRUE
                                    """, (tag_group_name,))
                                else:
                                    logger.warning(f"⚠️ [get_layout_tags] No tag_group_id or tag_group_name for dynamic section '{section_name}'")
                                
                                if tag_group_id or tag_group_name:
                                    members = cursor.fetchall()
                                    logger.info(f"📋 [get_layout_tags] Found {len(members)} tag group member(s) for section '{section_name}'")
                                    if members:
                                        sample_members = [m.get('tag_name') for m in members[:5]]
                                        logger.info(f"📋 [get_layout_tags] Sample tag group members: {sample_members}")
                                    for member in members:
                                        tag_name = member.get('tag_name')
                                        if tag_name:
                                            tag_name = tag_name.strip()
                                            tag_names.add(tag_name)
                                            
                                            # For bin_id tags, also add related tags
                                            if 'bin_id' in tag_name.lower():
                                                # Add common FCL source tag patterns
                                                tag_names.add(f"FCL_Source_bin_21")
                                                tag_names.add(f"FCL_Source_bin_22")
                                                tag_names.add(f"FCL_Source_bin_23")
                                                tag_names.add(f"FCL_Source_bin_24")
                                                tag_names.add(f"FCL_Source_bin_25")
                                                tag_names.add(f"FCL_Source_bin_26")
                                                tag_names.add(f"FCL_Source_bin_27")
                                                tag_names.add(f"FCL_Source_bin_28")
                                                tag_names.add(f"FCL_Source_bin_29")
                                                tag_names.add(f"FCL_Source_bin_30")
                                                tag_names.add(f"FCL_source_bin_21")
                                                tag_names.add(f"FCL_source_bin_22")
                                                tag_names.add(f"FCL_source_bin_23")
                                                tag_names.add(f"FCL_source_bin_24")
                                                tag_names.add(f"FCL_source_bin_25")
                                                tag_names.add(f"FCL_source_bin_26")
                                                tag_names.add(f"FCL_source_bin_27")
                                                tag_names.add(f"FCL_source_bin_28")
                                                tag_names.add(f"FCL_source_bin_29")
                                                tag_names.add(f"FCL_source_bin_30")
                                                tag_names.add(f"FCL_Source_bin_21A")
                                                tag_names.add(f"FCL_Source_bin_21B")
                                                tag_names.add(f"FCL_Source_bin_21C")
                                                tag_names.add(f"FCL_source_bin_21A")
                                                tag_names.add(f"FCL_source_bin_21B")
                                                tag_names.add(f"FCL_source_bin_21C")
                                                
                                                # Add material name tags
                                                source_match = re.search(r'source[_\s]*(\d+)', tag_name, re.IGNORECASE)
                                                if source_match:
                                                    source_num = source_match.group(1)
                                                    tag_names.add(f"FCL_source_{source_num}_material_name")
                                                    tag_names.add(f"FCL_source_{source_num}_MaterialName")
                                                    tag_names.add(f"FCL_SOURCE_{source_num}_MATERIAL_NAME")
                                            
                                            logger.debug(f"📋 [get_layout_tags] Added tag: {tag_name}")
                            
                            # Extract tags from columns (even if empty, for logging)
                            for column in columns_direct:
                                tag_name = column.get('tag_name')
                                if tag_name and tag_name.strip():
                                    tag_name = tag_name.strip()
                                    tag_names.add(tag_name)
                                    logger.info(f"📋 [get_layout_tags] Added column tag: {tag_name}")
                                    
                                    # For bin_id tags, add related tags
                                    tag_lower = tag_name.lower()
                                    if 'bin_id' in tag_lower or 'binid' in tag_lower or 'bin_code' in tag_lower:
                                        # Generate pattern-based tag names based on common patterns
                                        # Pattern 1: FCL_source_1_bin_id -> FCL_source_1_weight, etc.
                                        if '_bin_id' in tag_lower:
                                            base = tag_name.rsplit('_bin_id', 1)[0]
                                            tag_names.add(f"{base}_weight")
                                            tag_names.add(f"{base}_Weight")
                                            tag_names.add(f"{base}_WEIGHT")
                                            tag_names.add(f"{base}_qty_percent")
                                            tag_names.add(f"{base}_QtyPercent")
                                            tag_names.add(f"{base}_QTY_PERCENT")
                                            tag_names.add(f"{base}_material_name")
                                            tag_names.add(f"{base}_MaterialName")
                                            tag_names.add(f"{base}_MATERIAL_NAME")
                                            
                                            # Also add flow rate tags (FCL_Source_bin_X) for common bin IDs
                                            # Extract source number
                                            source_match = re.search(r'source[_\s]*(\d+)', tag_name, re.IGNORECASE)
                                            if source_match:
                                                source_num = source_match.group(1)
                                                # Add common bin flow rate tags
                                                for bin_code in ['21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '21A', '21B', '21C']:
                                                    tag_names.add(f"FCL_Source_bin_{bin_code}")
                                                    tag_names.add(f"FCL_source_bin_{bin_code}")
                                            
                                            logger.info(f"📋 [get_layout_tags] Added bin-related tags for {tag_name}")
                                else:
                                    logger.debug(f"📋 [get_layout_tags] Column '{column.get('column_label', 'unknown')}' has no tag_name")
                    
                    # Process tables if found
                    for table in tables:
                        if table.get('row_mode') == 'dynamic':
                            tag_group_id = table.get('tag_group_id')
                            tag_group_name = table.get('tag_group')
                            
                            logger.info(f"📋 [get_layout_tags] Dynamic table in '{section_name}': tag_group_id={tag_group_id}, tag_group_name={tag_group_name}")
                            
                            # Try to get tag group by ID first, then by name
                            if tag_group_id:
                                cursor.execute("""
                                    SELECT t.tag_name
                                    FROM tag_group_members tgm
                                    JOIN tags t ON tgm.tag_id = t.id
                                    JOIN tag_groups tg ON tgm.group_id = tg.id
                                    WHERE tgm.group_id = %s AND t.is_active = TRUE AND tg.is_active = TRUE
                                """, (tag_group_id,))
                            elif tag_group_name:
                                cursor.execute("""
                                    SELECT t.tag_name
                                    FROM tag_group_members tgm
                                    JOIN tags t ON tgm.tag_id = t.id
                                    JOIN tag_groups tg ON tgm.group_id = tg.id
                                    WHERE tg.group_name = %s AND t.is_active = TRUE AND tg.is_active = TRUE
                                """, (tag_group_name,))
                            else:
                                logger.warning(f"⚠️ [get_layout_tags] No tag_group_id or tag_group_name for dynamic table in section '{section_name}'")
                                continue
                            
                            members = cursor.fetchall()
                            logger.info(f"📋 [get_layout_tags] Found {len(members)} tag group member(s) for section '{section_name}'")
                            for member in members:
                                tag_name = member.get('tag_name')
                                if tag_name:
                                    tag_name = tag_name.strip()
                                    tag_names.add(tag_name)
                                    
                                    # For bin_id tags, also add related tags (Weight, MaterialName)
                                    if 'bin_id' in tag_name.lower():
                                        # Add common FCL source tag patterns
                                        tag_names.add(f"FCL_Source_bin_21")
                                        tag_names.add(f"FCL_Source_bin_22")
                                        tag_names.add(f"FCL_Source_bin_23")
                                        tag_names.add(f"FCL_Source_bin_24")
                                        tag_names.add(f"FCL_Source_bin_25")
                                        tag_names.add(f"FCL_Source_bin_26")
                                        tag_names.add(f"FCL_Source_bin_27")
                                        tag_names.add(f"FCL_Source_bin_28")
                                        tag_names.add(f"FCL_Source_bin_29")
                                        tag_names.add(f"FCL_Source_bin_30")
                                        tag_names.add(f"FCL_source_bin_21")
                                        tag_names.add(f"FCL_source_bin_22")
                                        tag_names.add(f"FCL_source_bin_23")
                                        tag_names.add(f"FCL_source_bin_24")
                                        tag_names.add(f"FCL_source_bin_25")
                                        tag_names.add(f"FCL_source_bin_26")
                                        tag_names.add(f"FCL_source_bin_27")
                                        tag_names.add(f"FCL_source_bin_28")
                                        tag_names.add(f"FCL_source_bin_29")
                                        tag_names.add(f"FCL_source_bin_30")
                                        tag_names.add(f"FCL_Source_bin_21A")
                                        tag_names.add(f"FCL_Source_bin_21B")
                                        tag_names.add(f"FCL_Source_bin_21C")
                                        tag_names.add(f"FCL_source_bin_21A")
                                        tag_names.add(f"FCL_source_bin_21B")
                                        tag_names.add(f"FCL_source_bin_21C")
                                        
                                        # Add material name tags
                                        source_match = re.search(r'source[_\s]*(\d+)', tag_name, re.IGNORECASE)
                                        if source_match:
                                            source_num = source_match.group(1)
                                            tag_names.add(f"FCL_source_{source_num}_material_name")
                                            tag_names.add(f"FCL_source_{source_num}_MaterialName")
                                            tag_names.add(f"FCL_SOURCE_{source_num}_MATERIAL_NAME")
                                    
                                    logger.debug(f"📋 [get_layout_tags] Added tag: {tag_name}")
                        
                        # Also extract tags from columns in the table
                        columns = table.get('columns', [])
                        logger.info(f"📋 [get_layout_tags] Table has {len(columns)} column(s)")
                        for column in columns:
                            tag_name = column.get('tag_name')
                            if tag_name and tag_name.strip():
                                tag_name = tag_name.strip()
                                tag_names.add(tag_name)
                                logger.info(f"📋 [get_layout_tags] Added column tag: {tag_name}")
                                
                                # For bin_id tags, also add related tags (Weight, QtyPercent, MaterialName)
                                tag_lower = tag_name.lower()
                                if 'bin_id' in tag_lower or 'binid' in tag_lower or 'bin_code' in tag_lower:
                                    # Generate pattern-based tag names based on common patterns
                                    # Pattern 1: FCL_source_1_bin_id -> FCL_source_1_weight, etc.
                                    if '_bin_id' in tag_lower:
                                        base = tag_name.rsplit('_bin_id', 1)[0]
                                        tag_names.add(f"{base}_weight")
                                        tag_names.add(f"{base}_Weight")
                                        tag_names.add(f"{base}_WEIGHT")
                                        tag_names.add(f"{base}_qty_percent")
                                        tag_names.add(f"{base}_QtyPercent")
                                        tag_names.add(f"{base}_QTY_PERCENT")
                                        tag_names.add(f"{base}_material_name")
                                        tag_names.add(f"{base}_MaterialName")
                                        tag_names.add(f"{base}_MATERIAL_NAME")
                                        
                                        # Also add flow rate tags (FCL_Source_bin_X) for common bin IDs
                                        # Extract source number
                                        source_match = re.search(r'source[_\s]*(\d+)', tag_name, re.IGNORECASE)
                                        if source_match:
                                            source_num = source_match.group(1)
                                            # Add common bin flow rate tags
                                            for bin_code in ['21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '21A', '21B', '21C']:
                                                tag_names.add(f"FCL_Source_bin_{bin_code}")
                                                tag_names.add(f"FCL_source_bin_{bin_code}")
                                        
                                        logger.info(f"📋 [get_layout_tags] Added bin-related tags for {tag_name}")
                                        
                                        # Pattern 2: FCLSource1BinId -> FCLSource1Weight, etc.
                                        if 'BinId' in tag_name:
                                            base = tag_name.replace('BinId', '').replace('bin_id', '').replace('BIN_ID', '')
                                            tag_names.add(f"{base}Weight")
                                            tag_names.add(f"{base}QtyPercent")
                                            tag_names.add(f"{base}MaterialName")
                                        
                                        # Pattern 3: FCL_Source_bin_21 -> FCL_Source_bin_21_weight (for flow rate tags)
                                        if '_bin_' in tag_lower and tag_lower.endswith(('_21', '_22', '_23', '_24', '_25', '_26', '_27', '_28', '_29', '_30', '_31', '_32')):
                                            # This is a flow rate tag, keep it as is
                                            pass
                                        
                                        # Also add common FCL source patterns
                                        if 'fcl_source' in tag_lower:
                                            source_num = None
                                            # Extract source number (1-5)
                                            for i in range(1, 6):
                                                if f'_source_{i}_' in tag_lower or f'_source{i}_' in tag_lower or f'Source{i}' in tag_name:
                                                    source_num = i
                                                    break
                                            
                                            if source_num:
                                                # Add common FCL source tag patterns
                                                tag_names.add(f"FCL_source_{source_num}_weight")
                                                tag_names.add(f"FCL_source_{source_num}_Weight")
                                                tag_names.add(f"FCL_source_{source_num}_WEIGHT")
                                                tag_names.add(f"FCL_source_{source_num}_qty_percent")
                                                tag_names.add(f"FCL_source_{source_num}_QtyPercent")
                                                tag_names.add(f"FCL_source_{source_num}_QTY_PERCENT")
                                                tag_names.add(f"FCL_Source_{source_num}_weight")
                                                tag_names.add(f"FCL_Source_{source_num}_Weight")
                                                tag_names.add(f"FCL_Source_{source_num}_WEIGHT")
                                                
                                                # Add flow rate tags (FCL_Source_bin_X)
                                                tag_names.add(f"FCL_Source_bin_21")
                                                tag_names.add(f"FCL_Source_bin_22")
                                                tag_names.add(f"FCL_Source_bin_23")
                                                tag_names.add(f"FCL_source_bin_21")
                                                tag_names.add(f"FCL_source_bin_22")
                                                tag_names.add(f"FCL_source_bin_23")
                                                
                                                # Add 21A, 21B, 21C variants
                                                tag_names.add(f"FCL_Source_bin_21A")
                                                tag_names.add(f"FCL_Source_bin_21B")
                                                tag_names.add(f"FCL_Source_bin_21C")
                                                tag_names.add(f"FCL_source_bin_21A")
                                                tag_names.add(f"FCL_source_bin_21B")
                                                tag_names.add(f"FCL_source_bin_21C")
    
    except Exception as e:
        logger.error(f"Error extracting tags from layout {layout_id}: {e}", exc_info=True)
    
    logger.info(f"✅ [get_layout_tags] Total tags extracted for layout {layout_id}: {len(tag_names)} tags")
    if tag_names:
        sample_tags = list(tag_names)[:10]
        logger.info(f"   Sample tags: {sample_tags}")
    
    return tag_names


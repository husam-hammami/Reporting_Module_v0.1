"""
Dynamic Monitor Worker

Stores data every second for all published layouts.
Status codes are only used for order tracking (1=start, 0=stop).
Data is stored continuously regardless of status code.

Note: Historian recording is handled by historian_worker.py (independent).
"""

import logging
import eventlet
import datetime
import json
import time
from contextlib import closing
from psycopg2.extras import RealDictCursor
from utils.tag_reader import read_all_tags
from utils.order_tracker import DynamicOrderTracker
from utils.kpi_engine import get_kpi_tag_names_for_layout

logger = logging.getLogger(__name__)

# Store order trackers per layout
order_trackers = {}


def get_order_tracker(layout_id, layout_name, db_connection_func):
    """Get or create order tracker for a layout"""
    if layout_id not in order_trackers:
        # Get layout configuration
        with closing(db_connection_func()) as conn:
            cursor = conn.cursor(cursor_factory=RealDictCursor)
            cursor.execute("""
                SELECT order_status_tag_name, order_prefix, 
                       order_start_value, order_stop_value
                FROM live_monitor_layouts
                WHERE id = %s AND is_published = TRUE
            """, (layout_id,))
            
            layout = cursor.fetchone()
            if not layout:
                return None
            
            layout_dict = dict(layout)
            
            # Create order tracker if status tag is configured
            if layout_dict.get('order_status_tag_name'):
                order_trackers[layout_id] = DynamicOrderTracker(
                    layout_id=layout_id,
                    layout_name=layout_name,
                    status_tag_name=layout_dict['order_status_tag_name'],
                    order_prefix=layout_dict.get('order_prefix') or layout_name.upper().replace(' ', '-'),
                    start_value=layout_dict.get('order_start_value', 1),
                    stop_value=layout_dict.get('order_stop_value', 0),
                    db_connection_func=db_connection_func
                )
            else:
                # No order tracking configured
                order_trackers[layout_id] = None
    
    return order_trackers.get(layout_id)


def dynamic_monitor_worker():
    """Dynamic monitor worker - stores data every second for all published layouts"""
    logger.info("🟢 Starting dynamic monitor worker")
    
    # ✅ DEBUG: Log initial state
    try:
        from app import get_db_connection
        from utils.dynamic_tables import get_active_monitors
        
        initial_monitors = get_active_monitors(get_db_connection)
        logger.info(f"📊 Initial monitor check: Found {len(initial_monitors)} active monitor(s)")
        if initial_monitors:
            for m in initial_monitors:
                logger.info(f"  - {m['layout_name']} (ID: {m['layout_id']}, Table: {m['live_table_name']})")
    except Exception as e:
        logger.warning(f"⚠️ Could not check initial monitors: {e}")
    
    while True:
        try:
            from app import get_db_connection
            from utils.dynamic_tables import get_active_monitors
            
            # Get all active monitors
            monitors = get_active_monitors(get_db_connection)
            
            if not monitors:
                # Log every 60 seconds to avoid spam
                if int(time.time()) % 60 == 0:
                    logger.info("ℹ️ No active monitors found. Waiting...")
                    # ✅ DEBUG: Check if any monitors exist at all (even inactive)
                    with closing(get_db_connection()) as conn:
                        cursor = conn.cursor(cursor_factory=RealDictCursor)
                        cursor.execute("SELECT COUNT(*) as count FROM dynamic_monitor_registry")
                        total = cursor.fetchone()
                        if total and total.get('count', 0) > 0:
                            logger.warning(f"⚠️ Found {total.get('count')} monitor(s) in registry, but none are active. Check is_active flag.")
                            # Show all monitors for debugging
                            cursor.execute("SELECT layout_id, layout_name, is_active FROM dynamic_monitor_registry")
                            all_monitors = cursor.fetchall()
                            for m in all_monitors:
                                logger.warning(f"  - Layout {m.get('layout_id')}: {m.get('layout_name')} (is_active: {m.get('is_active')})")
                eventlet.sleep(5)  # Wait 5 seconds if no monitors
                continue
            
            # ✅ DEBUG: Log monitor detection more frequently
            if int(time.time()) % 10 == 0:  # Every 10 seconds
                logger.info(f"📊 Found {len(monitors)} active monitor(s): {[m['layout_name'] for m in monitors]}")
            
            loop_start_time = time.time()
            
            # Collect per-layout tags for Live Monitor section data processing
            from utils.layout_tag_extractor import get_layout_tags

            monitor_tag_map = {}  # Map layout_id to its required tags (for section data filtering)

            for monitor in monitors:
                layout_id = monitor['layout_id']
                try:
                    required_tags = get_layout_tags(layout_id, get_db_connection)
                    kpi_tags = get_kpi_tag_names_for_layout(get_db_connection, layout_id)
                    layout_and_kpi_tags = (required_tags or set()) | (kpi_tags or set())
                    if layout_and_kpi_tags:
                        monitor_tag_map[layout_id] = layout_and_kpi_tags
                except Exception as e:
                    logger.error(f"[DYNAMIC WORKER] Error extracting tags for layout {layout_id}: {e}", exc_info=True)
                    monitor_tag_map[layout_id] = None

            # Read ALL active tags from PLC (universal historian — records everything)
            tag_values = read_all_tags(tag_names=None, db_connection_func=get_db_connection)
            logger.info(f"📊 [DYNAMIC WORKER] Read {len(tag_values)} tag values from PLC")
            
            # Process each active monitor
            logger.info(f"🔄 [DYNAMIC WORKER] Processing {len(monitors)} monitor(s)...")
            for monitor in monitors:
                try:
                    layout_id = monitor['layout_id']
                    layout_name = monitor['layout_name']
                    live_table = monitor['live_table_name']
                    
                    logger.info(f"🔄 [DYNAMIC WORKER] Processing monitor: {layout_name} (ID: {layout_id}, Table: {live_table})")
                    
                    # Get layout configuration
                    with closing(get_db_connection()) as conn:
                        cursor = conn.cursor(cursor_factory=RealDictCursor)
                        
                        cursor.execute("""
                            SELECT id, layout_name, order_status_tag_name, order_prefix
                            FROM live_monitor_layouts
                            WHERE id = %s AND is_published = TRUE
                        """, (layout_id,))
                        
                        layout = cursor.fetchone()
                        if not layout:
                            continue
                        
                        layout_dict = dict(layout)
                        
                        # ✅ FIX: Filter tag_values to only include tags used by this layout
                        layout_tags = monitor_tag_map.get(layout_id)
                        if layout_tags:
                            # Only store tags that are used in this layout
                            filtered_tag_values = {
                                tag_name: tag_values.get(tag_name)
                                for tag_name in layout_tags
                                if tag_name in tag_values
                            }
                        else:
                            # Fallback: use all tags if extraction failed
                            filtered_tag_values = tag_values
                        
                        # Get order tracker
                        order_tracker = get_order_tracker(
                            layout_id, 
                            layout_dict['layout_name'],
                            get_db_connection
                        )
                        
                        # Check order trigger if tracker exists (ONLY for order tracking)
                        # Note: Order tracker needs full tag_values to check status tag
                        order_name = None
                        if order_tracker:
                            order_event = order_tracker.check_trigger(tag_values)  # Use full tag_values for order tracking
                            
                            if order_event == "START":
                                order_tracker.start_new_order()
                            elif order_event == "STOP":
                                order_tracker.complete_order()
                            
                            # Get current order name (if order is active)
                            order_name = order_tracker.get_current_order()
                        
                        # ✅ ALWAYS store data every second (regardless of status code)
                        # Status code is ONLY used for order tracking, not for data storage
                        # ✅ FIX: Store section-based data instead of raw tags
                        from utils.section_data_resolver import get_layout_sections_data
                        
                        # Get section-based data
                        sections_data = {}
                        try:
                            logger.info(f"🔍 [DYNAMIC WORKER] Resolving section data for layout {layout_dict['layout_name']} (ID: {layout_id})")
                            logger.info(f"🔍 [DYNAMIC WORKER] Tag values available: {len(tag_values)} tags")
                            if tag_values:
                                sample_tags = list(tag_values.keys())[:5]
                                logger.info(f"🔍 [DYNAMIC WORKER] Sample tags: {sample_tags}")
                            
                            sections_data = get_layout_sections_data(
                                layout_id, 
                                tag_values,  # Use full tag_values for resolving (includes all needed tags)
                                get_db_connection
                            )
                            
                            # Always log the result (for debugging)
                            if not sections_data:
                                logger.warning(f"⚠️ [DYNAMIC WORKER] No section data resolved for layout {layout_dict['layout_name']} (ID: {layout_id}). Sections: {sections_data}")
                            else:
                                logger.info(f"✅ [DYNAMIC WORKER] Resolved {len(sections_data)} section(s) for {layout_dict['layout_name']}: {list(sections_data.keys())}")
                                # Log sample data
                                for section_name, section_data in list(sections_data.items())[:1]:  # Log first section only
                                    if isinstance(section_data, list):
                                        logger.info(f"   [DYNAMIC WORKER] Section '{section_name}': {len(section_data)} row(s), sample: {section_data[0] if section_data else 'empty'}")
                                    else:
                                        logger.info(f"   [DYNAMIC WORKER] Section '{section_name}': {section_data}")
                        
                        except Exception as resolve_error:
                            logger.error(f"❌ [DYNAMIC WORKER] Error resolving section data for layout {layout_dict['layout_name']}: {resolve_error}", exc_info=True)
                            # Fallback: store empty object instead of failing completely
                            sections_data = {}
                        
                        # Store section-based data in JSONB format
                        # Format: {"sender": [{"id": 21, "material": "SEMI-115", "weight": 4.83}, ...]}
                        try:
                            cursor.execute(f"""
                                INSERT INTO {live_table} (
                                    layout_id, order_name, tag_values, 
                                    line_running, created_at
                                ) VALUES (%s, %s, %s::jsonb, %s, %s)
                            """, (
                                layout_id,
                                order_name,  # Will be NULL if no active order
                                json.dumps(sections_data),  # ✅ Section-based data structure
                                order_name is not None,  # line_running = True if order exists
                                datetime.datetime.now()
                            ))

                            conn.commit()
                            # Always log storage (for debugging)
                            data_size = len(json.dumps(sections_data))
                            logger.info(f"✅ [DYNAMIC WORKER] Stored data for {layout_dict['layout_name']} | Order: {order_name} | Sections: {len(sections_data)} | Size: {data_size} bytes | Table: {live_table}")
                            if sections_data:
                                logger.info(f"   [DYNAMIC WORKER] Data keys: {list(sections_data.keys())}")
                        except Exception as insert_error:
                            logger.error(f"❌ Error inserting data into {live_table} for layout {layout_dict['layout_name']}: {insert_error}", exc_info=True)
                            logger.error(f"   Sections data: {json.dumps(sections_data)[:200]}...")  # Log first 200 chars
                            conn.rollback()
                            raise  # Re-raise to be caught by outer exception handler
                
                except Exception as e:
                    logger.error(f"❌ Error processing monitor {monitor.get('layout_name')}: {e}", exc_info=True)
            
            # Dynamic sleep to ensure exactly 1 second per loop
            elapsed = time.time() - loop_start_time
            sleep_time = max(0, 1.0 - elapsed)
            if sleep_time < 0.5:
                logger.warning(f"[Dynamic Monitor] Loop took {elapsed:.3f}s, only sleeping {sleep_time:.3f}s")
            eventlet.sleep(sleep_time)
        
        except Exception as e:
            logger.error(f"❌ Dynamic monitor worker error: {e}", exc_info=True)
            eventlet.sleep(5)  # Wait on error


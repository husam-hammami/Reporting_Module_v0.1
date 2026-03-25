"""
Dynamic Order Tracker

Tracks orders for dynamic layouts based on status tag.
Only responds to status 1 (start) and 0 (stop), ignores other codes.
"""

import logging
from contextlib import closing
from psycopg2.extras import RealDictCursor

logger = logging.getLogger(__name__)


class DynamicOrderTracker:
    """Tracks orders for dynamic layouts based on status tag"""
    
    def __init__(self, layout_id, layout_name, status_tag_name, order_prefix, 
                 start_value=1, stop_value=0, db_connection_func=None):
        self.layout_id = layout_id
        self.layout_name = layout_name
        self.status_tag_name = status_tag_name
        self.order_prefix = order_prefix or layout_name.upper().replace(' ', '-')
        self.start_value = start_value
        self.stop_value = stop_value
        self.db_connection_func = db_connection_func
        
        # State
        self.current_order_name = None
        self.current_order_number = None
        self.is_running = False
        self.last_status_value = None
        self.session_started = None
        
        # Load last order counter from database
        self._load_order_counter()
    
    def _load_order_counter(self):
        """Load the current order counter from database"""
        if not self.db_connection_func:
            return
        
        try:
            with closing(self.db_connection_func()) as conn:
                cursor = conn.cursor(cursor_factory=RealDictCursor)
                cursor.execute("""
                    SELECT current_counter, last_order_name
                    FROM dynamic_order_counters
                    WHERE layout_id = %s
                """, (self.layout_id,))
                
                row = cursor.fetchone()
                if row:
                    # Get next order number by checking existing orders
                    self.current_order_number = self._get_next_order_number()
                else:
                    # Initialize counter
                    self.current_order_number = 1
                    cursor.execute("""
                        INSERT INTO dynamic_order_counters 
                        (layout_id, layout_name, current_counter)
                        VALUES (%s, %s, %s)
                        ON CONFLICT (layout_id) DO NOTHING
                    """, (self.layout_id, self.layout_name, 0))
                    conn.commit()
        except Exception as e:
            logger.error(f"Error loading order counter: {e}", exc_info=True)
            self.current_order_number = 1
    
    def _get_next_order_number(self):
        """Get next order number by checking both live and archive tables"""
        if not self.db_connection_func:
            return 1
        
        try:
            from utils.dynamic_tables import get_active_monitors
            
            monitors = get_active_monitors(self.db_connection_func)
            monitor = next((m for m in monitors if m['layout_id'] == self.layout_id), None)
            
            if not monitor:
                return 1
            
            live_table = monitor['live_table_name']
            archive_table = monitor['archive_table_name']
            
            with closing(self.db_connection_func()) as conn:
                cursor = conn.cursor()
                
                # Check live table
                cursor.execute(f"""
                    SELECT MAX(CAST(SUBSTRING(order_name FROM '[0-9]+') AS INTEGER))
                    FROM {live_table}
                    WHERE layout_id = %s AND order_name IS NOT NULL
                    AND order_name LIKE %s
                """, (self.layout_id, f'{self.order_prefix}%'))
                
                live_max = cursor.fetchone()[0] or 0
                
                # Check archive table
                cursor.execute(f"""
                    SELECT MAX(CAST(SUBSTRING(order_name FROM '[0-9]+') AS INTEGER))
                    FROM {archive_table}
                    WHERE layout_id = %s AND order_name IS NOT NULL
                    AND order_name LIKE %s
                """, (self.layout_id, f'{self.order_prefix}%'))
                
                archive_max = cursor.fetchone()[0] or 0
                
                # Also check dynamic_orders table
                cursor.execute("""
                    SELECT MAX(order_number)
                    FROM dynamic_orders
                    WHERE layout_id = %s
                """, (self.layout_id,))
                
                orders_max = cursor.fetchone()[0] or 0
                
                max_number = max(live_max, archive_max, orders_max)
                return max_number + 1
                
        except Exception as e:
            logger.error(f"Error getting next order number: {e}", exc_info=True)
            return 1
    
    def check_trigger(self, tag_values):
        """Check if order should start or stop based on status tag.
        Only responds to start_value (1) and stop_value (0).
        Ignores all other status codes (2, 3, 4, etc.)
        """
        if not self.status_tag_name:
            return None
        
        current_status = tag_values.get(self.status_tag_name)
        
        if current_status is None:
            return None
        
        # Convert to int for comparison
        try:
            current_status = int(float(current_status))
        except (ValueError, TypeError):
            return None
        
        # ✅ Only process start_value (1) and stop_value (0)
        # Ignore all other status codes (2, 3, 4, etc.)
        
        # Detect START: transition to start_value (1)
        if (self.last_status_value != self.start_value and 
            current_status == self.start_value):
            self.last_status_value = current_status
            return "START"
        
        # Detect STOP: transition to stop_value (0)
        if (self.last_status_value != self.stop_value and 
            current_status == self.stop_value):
            self.last_status_value = current_status
            return "STOP"
        
        # ✅ For any other status code (2, 3, 4, etc.), just update last_status_value
        # but don't trigger START or STOP
        if current_status not in [self.start_value, self.stop_value]:
            # Ignore this status code for order tracking
            # Don't update last_status_value to avoid false triggers
            return None
        
        self.last_status_value = current_status
        return None
    
    def start_new_order(self):
        """Start a new order"""
        import datetime
        
        if not self.db_connection_func:
            return
        
        try:
            # Get next order number
            self.current_order_number = self._get_next_order_number()
            self.current_order_name = f"{self.order_prefix}{self.current_order_number}"
            self.is_running = True
            self.session_started = datetime.datetime.now()
            
            with closing(self.db_connection_func()) as conn:
                cursor = conn.cursor()
                
                # Update order counter
                cursor.execute("""
                    INSERT INTO dynamic_order_counters 
                    (layout_id, layout_name, current_counter, last_order_name, last_updated)
                    VALUES (%s, %s, %s, %s, %s)
                    ON CONFLICT (layout_id) 
                    DO UPDATE SET 
                        current_counter = EXCLUDED.current_counter,
                        last_order_name = EXCLUDED.last_order_name,
                        last_updated = EXCLUDED.last_updated
                """, (
                    self.layout_id,
                    self.layout_name,
                    self.current_order_number,
                    self.current_order_name,
                    datetime.datetime.now()
                ))
                
                # Create order record
                cursor.execute("""
                    INSERT INTO dynamic_orders 
                    (layout_id, order_name, order_number, start_time, status)
                    VALUES (%s, %s, %s, %s, %s)
                """, (
                    self.layout_id,
                    self.current_order_name,
                    self.current_order_number,
                    self.session_started,
                    'running'
                ))
                
                conn.commit()
            
            logger.info(f"🆕 [{self.layout_name}] Order Started: {self.current_order_name}")
            
        except Exception as e:
            logger.error(f"Error starting order: {e}", exc_info=True)
    
    def complete_order(self):
        """Complete the current order"""
        import datetime
        
        if not self.current_order_name:
            return
        
        try:
            with closing(self.db_connection_func()) as conn:
                cursor = conn.cursor()
                
                # Update order record
                end_time = datetime.datetime.now()
                cursor.execute("""
                    UPDATE dynamic_orders 
                    SET end_time = %s,
                        status = 'completed',
                        duration_seconds = EXTRACT(EPOCH FROM (%s - start_time))
                    WHERE layout_id = %s 
                    AND order_name = %s
                    AND status = 'running'
                """, (end_time, end_time, self.layout_id, self.current_order_name))
                
                conn.commit()
            
            logger.info(f"✅ [{self.layout_name}] Order Completed: {self.current_order_name}")
            
            # Reset state
            self.current_order_name = None
            self.current_order_number = None
            self.is_running = False
            self.session_started = None
            
        except Exception as e:
            logger.error(f"Error completing order: {e}", exc_info=True)
    
    def get_current_order(self):
        """Get current order name"""
        return self.current_order_name


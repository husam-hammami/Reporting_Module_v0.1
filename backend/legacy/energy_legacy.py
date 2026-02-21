import os
import logging
import json
import psycopg2
import psycopg2.extras
from flask import Blueprint, jsonify, request
from contextlib import closing
from datetime import datetime, timedelta
from psycopg2.extras import RealDictCursor

# Import get_db_connection - will be imported at runtime to avoid circular dependency
# We'll import it directly in functions that need it

# =============================================================================
# Logging Configuration
# =============================================================================
logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

# =============================================================================
# Blueprint Initialization
# =============================================================================
energy_bp = Blueprint('energy', __name__)

# =============================================================================
# Error Handling Decorator
# =============================================================================
def handle_db_errors(f):
    """Decorator to handle database and general exceptions."""
    def wrapper_func(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except psycopg2.Error as e:
            logging.error(f"Database error: {e}")
            return jsonify({'error': 'A database error occurred.'}), 500
        except Exception as e:
            logging.error(f"Unexpected error: {e}")
            return jsonify({'error': 'An unexpected error occurred.'}), 500
    wrapper_func.__name__ = f.__name__
    return wrapper_func

# =============================================================================
# Energy Table Creation
# =============================================================================

def create_energy_table():
    """Create energy_readings table if it doesn't exist"""
    from app import get_db_connection
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS energy_readings (
                        id SERIAL PRIMARY KEY,
                        block_name VARCHAR(10) NOT NULL,
                        total_active_energy REAL NOT NULL,
                        total_reactive_energy REAL NOT NULL,
                        total_apparent_energy REAL NOT NULL,
                        voltage_l1_l2 REAL NOT NULL,
                        effective_power REAL NOT NULL,
                        timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
                        CONSTRAINT check_block_name CHECK (block_name IN ('C2', 'M20', 'M21', 'M22', 'M23', 'M24'))
                    );

                    CREATE INDEX IF NOT EXISTS idx_energy_timestamp ON energy_readings(timestamp DESC);
                    CREATE INDEX IF NOT EXISTS idx_energy_block_name ON energy_readings(block_name);
                    CREATE INDEX IF NOT EXISTS idx_energy_block_timestamp ON energy_readings(block_name, timestamp DESC);
                """)
                conn.commit()

        logger.info("✅ Energy readings table created/verified successfully")

    except Exception as e:
        logger.error(f"❌ Error creating energy_readings table: {e}")

def init_energy_summary_tables():
    """Create energy summary tables and indexes if they don't exist"""
    from app import get_db_connection
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor() as cursor:
                # Create hourly_energy_summary table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS hourly_energy_summary (
                        id SERIAL PRIMARY KEY,
                        block_name TEXT NOT NULL,
                        hour TIMESTAMP NOT NULL,
                        energy_used NUMERIC NOT NULL,
                        avg_voltage NUMERIC,
                        avg_power NUMERIC,
                        created_at TIMESTAMP DEFAULT NOW(),
                        UNIQUE(block_name, hour)
                    );
                """)
                
                # Create daily_energy_summary table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS daily_energy_summary (
                        id SERIAL PRIMARY KEY,
                        block_name TEXT NOT NULL,
                        date DATE NOT NULL,
                        energy_used NUMERIC NOT NULL,
                        peak_power NUMERIC,
                        avg_voltage NUMERIC,
                        created_at TIMESTAMP DEFAULT NOW(),
                        UNIQUE(block_name, date)
                    );
                """)
                
                # Create monthly_energy_summary table
                cursor.execute("""
                    CREATE TABLE IF NOT EXISTS monthly_energy_summary (
                        id SERIAL PRIMARY KEY,
                        block_name TEXT NOT NULL,
                        month DATE NOT NULL,
                        energy_used NUMERIC NOT NULL,
                        total_cost NUMERIC,
                        created_at TIMESTAMP DEFAULT NOW(),
                        UNIQUE(block_name, month)
                    );
                """)
                
                # Create indexes for energy_readings
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_energy_date 
                    ON energy_readings (DATE(timestamp), block_name);
                """)
                
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_energy_hour 
                    ON energy_readings (date_trunc('hour', timestamp), block_name);
                """)
                
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_energy_recent 
                    ON energy_readings (block_name, timestamp DESC)
                    WHERE timestamp > NOW() - INTERVAL '7 days';
                """)
                
                # Create indexes for summary tables
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_hourly_block_hour 
                    ON hourly_energy_summary(block_name, hour);
                """)
                
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_daily_block_date 
                    ON daily_energy_summary(block_name, date);
                """)
                
                cursor.execute("""
                    CREATE INDEX IF NOT EXISTS idx_monthly_block_month 
                    ON monthly_energy_summary(block_name, month);
                """)
                
                conn.commit()
        
        logger.info("✅ Energy summary tables created/verified successfully")
        
    except Exception as e:
        logger.error(f"❌ Error creating energy summary tables: {e}")

def init_db():
    """Initialize all energy-related tables"""
    create_energy_table()
    init_energy_summary_tables()

# Initialize tables when module is loaded
# init_db()


# =============================================================================
# Energy Calculation Functions
# =============================================================================

def get_start_reading(block_name, start_datetime):
    """Get first reading for a block_name at or after start_datetime"""
    from app import get_db_connection
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT * FROM energy_readings
                    WHERE block_name = %s AND timestamp >= %s
                    ORDER BY timestamp ASC
                    LIMIT 1
                """, (block_name, start_datetime))
                result = cursor.fetchone()
                return dict(result) if result else None
    except Exception as e:
        logger.error(f"Error getting start reading: {e}")
        return None

def get_end_reading(block_name, end_datetime):
    """Get last reading for a block_name at or before end_datetime"""
    from app import get_db_connection
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT * FROM energy_readings
                    WHERE block_name = %s AND timestamp <= %s
                    ORDER BY timestamp DESC
                    LIMIT 1
                """, (block_name, end_datetime))
                result = cursor.fetchone()
                return dict(result) if result else None
    except Exception as e:
        logger.error(f"Error getting end reading: {e}")
        return None

def calculate_energy_delta(start_reading, end_reading):
    """Calculate energy delta: End - Start"""
    if not start_reading or not end_reading:
        raise ValueError("Start and end readings are required")
    
    active_delta = float(end_reading.get('total_active_energy', 0)) - float(start_reading.get('total_active_energy', 0))
    reactive_delta = float(end_reading.get('total_reactive_energy', 0)) - float(start_reading.get('total_reactive_energy', 0))
    apparent_delta = float(end_reading.get('total_apparent_energy', 0)) - float(start_reading.get('total_apparent_energy', 0))
    
    # Check for negative energy (counter reset or data issue)
    if active_delta < 0 or reactive_delta < 0 or apparent_delta < 0:
        raise ValueError(f"Negative energy detected: active={active_delta}, reactive={reactive_delta}, apparent={apparent_delta}")
    
    return {
        'active_energy': round(active_delta, 3),
        'reactive_energy': round(reactive_delta, 3),
        'apparent_energy': round(apparent_delta, 3)
    }

def calculate_avg_voltage(block_name, start_datetime, end_datetime):
    """Calculate average voltage for time range"""
    from app import get_db_connection
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT AVG(voltage_l1_l2) as avg_voltage
                    FROM energy_readings
                    WHERE block_name = %s AND timestamp >= %s AND timestamp <= %s
                """, (block_name, start_datetime, end_datetime))
                result = cursor.fetchone()
                val = result['avg_voltage'] if result else None
                return round(float(val), 2) if val is not None else None
    except Exception as e:
        logger.error(f"Error calculating avg voltage: {e}")
        return None

def calculate_avg_power(block_name, start_datetime, end_datetime):
    """Calculate average power for time range"""
    from app import get_db_connection
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT AVG(effective_power) as avg_power
                    FROM energy_readings
                    WHERE block_name = %s AND timestamp >= %s AND timestamp <= %s
                """, (block_name, start_datetime, end_datetime))
                result = cursor.fetchone()
                val = result['avg_power'] if result else None
                return round(float(val), 2) if val is not None else None
    except Exception as e:
        logger.error(f"Error calculating avg power: {e}")
        return None

def get_hourly_energy_data(block_name, date):
    """Get hourly energy breakdown for a specific date using MAX - MIN delta"""
    from app import get_db_connection
    try:
        logger.info(f"Fetching hourly energy for {block_name} on {date}")
        with closing(get_db_connection()) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT 
                        date_trunc('hour', timestamp) as hour,
                        MAX(total_active_energy) - MIN(total_active_energy) as energy
                    FROM energy_readings
                    WHERE block_name = %s 
                    AND DATE(timestamp) = %s
                    GROUP BY date_trunc('hour', timestamp)
                    ORDER BY hour
                """, (block_name, date))
                results = cursor.fetchall()
                logger.info(f"Found {len(results)} hourly records")
                return [{'hour': str(row['hour']), 'energy': round(float(row['energy']), 3)} for row in results]
    except Exception as e:
        logger.error(f"Error getting hourly energy: {e}")
        return []

def get_daily_energy_data(block_name, start_date, end_date):
    """Get daily energy summary for date range using MAX - MIN delta"""
    from app import get_db_connection
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT 
                        DATE(timestamp) as date,
                        MAX(total_active_energy) - MIN(total_active_energy) as energy
                    FROM energy_readings
                    WHERE block_name = %s 
                    AND DATE(timestamp) >= %s 
                    AND DATE(timestamp) <= %s
                    GROUP BY DATE(timestamp)
                    ORDER BY date
                """, (block_name, start_date, end_date))
                results = cursor.fetchall()
                energy_rate = 0.35  # OMR per kWh
                return [{
                    'date': str(row['date']), 
                    'energy': round(float(row['energy']), 3),
                    'cost': round(float(row['energy']) * energy_rate, 2)
                } for row in results]
    except Exception as e:
        logger.error(f"Error getting daily energy: {e}")
        return []

def get_monthly_energy_data(block_name, start_month, end_month):
    """Get monthly energy summary for month range using MAX - MIN delta"""
    from app import get_db_connection
    try:
        logger.info(f"Fetching monthly data for {block_name} from {start_month} to {end_month}")
        with closing(get_db_connection()) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT 
                        date_trunc('month', timestamp)::date as month,
                        MAX(total_active_energy) - MIN(total_active_energy) as energy
                    FROM energy_readings
                    WHERE block_name = %s 
                    AND date_trunc('month', timestamp) >= date_trunc('month', %s::date)
                    AND date_trunc('month', timestamp) <= date_trunc('month', %s::date)
                    GROUP BY date_trunc('month', timestamp)
                    ORDER BY month
                """, (block_name, start_month, end_month))
                results = cursor.fetchall()
                logger.info(f"Found {len(results)} monthly records")
                energy_rate = 0.35  # OMR per kWh
                return [{
                    'month': str(row['month']), 
                    'energy': round(float(row['energy']), 3),
                    'cost': round(float(row['energy']) * energy_rate, 2)
                } for row in results]
    except Exception as e:
        logger.error(f"Error getting monthly energy: {e}")
        return []

def get_shift_energy(block_name, date, shift):
    """Get shift-wise energy for a specific date and shift"""
    shift_times = {
        'A': ('06:00:00', '14:00:00'),
        'B': ('14:00:00', '22:00:00'),
        'C': ('22:00:00', '06:00:00')
    }
    
    if shift not in shift_times:
        return None
    
    start_time, end_time = shift_times[shift]
    start_datetime = f"{date} {start_time}"
    
    # Handle shift C which spans two days
    if shift == 'C':
        date_obj = datetime.strptime(date, '%Y-%m-%d')
        end_datetime = (date_obj + timedelta(days=1)).strftime('%Y-%m-%d') + f" {end_time}"
    else:
        end_datetime = f"{date} {end_time}"
    
    try:
        start_reading = get_start_reading(block_name, start_datetime)
        end_reading = get_end_reading(block_name, end_datetime)
        
        if not start_reading or not end_reading:
            return None
        
        delta = calculate_energy_delta(start_reading, end_reading)
        
        return {
            'shift': shift,
            'energy': delta['active_energy'],
            'start_time': start_datetime,
            'end_time': end_datetime
        }
    except Exception as e:
        logger.error(f"Error getting shift energy: {e}")
        return None

def get_machines_comparison(start_date, end_date):
    """Get energy comparison for all machines in date range"""
    machines = ['M21', 'M22', 'M23', 'M24', 'C2']
    results = []
    total_energy = 0.0
    
    # First pass: calculate energy for each machine
    machine_energies = {}
    for machine in machines:
        from app import get_db_connection
        try:
            with closing(get_db_connection()) as conn:
                with conn.cursor() as cursor:
                    cursor.execute("""
                        SELECT MAX(total_active_energy) - MIN(total_active_energy) as energy
                        FROM energy_readings
                        WHERE block_name = %s 
                        AND DATE(timestamp) >= %s 
                        AND DATE(timestamp) <= %s
                    """, (machine, start_date, end_date))
                    result = cursor.fetchone()
                    if result and result[0]:
                        energy = float(result[0])
                        machine_energies[machine] = energy
                        total_energy += energy
        except Exception as e:
            logger.error(f"Error getting energy for {machine}: {e}")
    
    # Second pass: calculate percentages
    for machine, energy in machine_energies.items():
        percentage = (energy / total_energy * 100) if total_energy > 0 else 0
        results.append({
            'machine': machine,
            'energy': round(energy, 3),
            'percentage': round(percentage, 2)
        })
    
    return sorted(results, key=lambda x: x['energy'], reverse=True)

def validate_energy_readings(block_name, start_datetime, end_datetime):
    """Validate energy readings for negative energy or data issues"""
    errors = []
    warnings = []
    
    try:
        start_reading = get_start_reading(block_name, start_datetime)
        end_reading = get_end_reading(block_name, end_datetime)
        
        if not start_reading:
            errors.append(f"No start reading found for {block_name} at {start_datetime}")
        if not end_reading:
            errors.append(f"No end reading found for {block_name} at {end_datetime}")
        
        if start_reading and end_reading:
            try:
                delta = calculate_energy_delta(start_reading, end_reading)
            except ValueError as e:
                errors.append(str(e))
            
            # Check for data gaps
            gaps = detect_data_gaps(block_name, start_datetime, end_datetime)
            if gaps.get('has_gaps'):
                warnings.append(f"Data gaps detected: {gaps['gap_count']} gaps found")
        
        return {
            'valid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings
        }
    except Exception as e:
        logger.error(f"Error validating energy readings: {e}")
        return {
            'valid': False,
            'errors': [str(e)],
            'warnings': []
        }

def check_voltage_range(block_name, start_datetime, end_datetime):
    """Check if voltage is within valid range (200-250V)"""
    from app import get_db_connection
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    SELECT 
                        MIN(voltage_l1_l2) as min_voltage,
                        MAX(voltage_l1_l2) as max_voltage,
                        COUNT(*) FILTER (WHERE voltage_l1_l2 < 200 OR voltage_l1_l2 > 250) as out_of_range_count
                    FROM energy_readings
                    WHERE block_name = %s AND timestamp >= %s AND timestamp <= %s
                """, (block_name, start_datetime, end_datetime))
                result = cursor.fetchone()
                
                if result:
                    min_v = float(result['min_voltage']) if result['min_voltage'] else 0
                    max_v = float(result['max_voltage']) if result['max_voltage'] else 0
                    out_count = int(result['out_of_range_count']) if result['out_of_range_count'] else 0
                    
                    return {
                        'valid': min_v >= 200 and max_v <= 250,
                        'min_voltage': round(min_v, 2),
                        'max_voltage': round(max_v, 2),
                        'out_of_range_count': out_count
                    }
    except Exception as e:
        logger.error(f"Error checking voltage range: {e}")
        return {
            'valid': False,
            'min_voltage': None,
            'max_voltage': None,
            'out_of_range_count': 0
        }

def detect_data_gaps(block_name, start_datetime, end_datetime):
    """Detect data gaps > 10 seconds"""
    from app import get_db_connection
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                cursor.execute("""
                    WITH time_diffs AS (
                        SELECT 
                            timestamp,
                            LAG(timestamp) OVER (ORDER BY timestamp) as prev_timestamp,
                            EXTRACT(EPOCH FROM (timestamp - LAG(timestamp) OVER (ORDER BY timestamp))) as gap_seconds
                        FROM energy_readings
                        WHERE block_name = %s AND timestamp >= %s AND timestamp <= %s
                    )
                    SELECT 
                        COUNT(*) FILTER (WHERE gap_seconds > 10) as gap_count,
                        array_agg(
                            json_build_object(
                                'start', prev_timestamp,
                                'end', timestamp,
                                'gap_seconds', gap_seconds
                            )
                        ) FILTER (WHERE gap_seconds > 10) as gaps
                    FROM time_diffs
                """, (block_name, start_datetime, end_datetime))
                result = cursor.fetchone()
                
                gap_count = int(result['gap_count']) if result and result['gap_count'] else 0
                gaps = result['gaps'] if result and result['gaps'] else []
                
                return {
                    'has_gaps': gap_count > 0,
                    'gap_count': gap_count,
                    'gaps': gaps if isinstance(gaps, list) else []
                }
    except Exception as e:
        logger.error(f"Error detecting data gaps: {e}")
        return {
            'has_gaps': False,
            'gap_count': 0,
            'gaps': []
        }

# =============================================================================
# Energy Summary Background Jobs
# =============================================================================

def generate_hourly_summary():
    """Generate hourly energy summary for previous hour"""
    machines = ['M21', 'M22', 'M23', 'M24', 'C2']
    previous_hour = datetime.now().replace(minute=0, second=0, microsecond=0) - timedelta(hours=1)
    hour_start = previous_hour
    hour_end = previous_hour + timedelta(hours=1)
    
    for machine in machines:
        from app import get_db_connection
        try:
            with closing(get_db_connection()) as conn:
                with conn.cursor() as cursor:
                    # Calculate MAX - MIN for the hour
                    cursor.execute("""
                        SELECT 
                            MAX(total_active_energy) - MIN(total_active_energy) as energy,
                            AVG(voltage_l1_l2) as avg_voltage,
                            AVG(effective_power) as avg_power
                        FROM energy_readings
                        WHERE block_name = %s 
                        AND timestamp >= %s 
                        AND timestamp < %s
                    """, (machine, hour_start, hour_end))
                    
                    result = cursor.fetchone()
                    if result and result[0] is not None:
                        energy = float(result[0])
                        avg_voltage = float(result[1]) if result[1] else None
                        avg_power = float(result[2]) if result[2] else None
                        
                        # Insert or update hourly summary
                        cursor.execute("""
                            INSERT INTO hourly_energy_summary (block_name, hour, energy_used, avg_voltage, avg_power)
                            VALUES (%s, %s, %s, %s, %s)
                            ON CONFLICT (block_name, hour) 
                            DO UPDATE SET 
                                energy_used = EXCLUDED.energy_used,
                                avg_voltage = EXCLUDED.avg_voltage,
                                avg_power = EXCLUDED.avg_power
                        """, (machine, hour_start, energy, avg_voltage, avg_power))
                        
                        conn.commit()
                        logger.info(f"✅ Hourly summary generated for {machine} at {hour_start}")
        except Exception as e:
            logger.error(f"❌ Error generating hourly summary for {machine}: {e}")

def generate_daily_summary():
    """Generate daily energy summary for yesterday"""
    machines = ['M21', 'M22', 'M23', 'M24', 'C2']
    yesterday = (datetime.now() - timedelta(days=1)).date()
    day_start = datetime.combine(yesterday, datetime.min.time())
    day_end = datetime.combine(yesterday, datetime.max.time())
    
    for machine in machines:
        from app import get_db_connection
        try:
            with closing(get_db_connection()) as conn:
                with conn.cursor() as cursor:
                    # Calculate MAX - MIN for the day
                    cursor.execute("""
                        SELECT 
                            MAX(total_active_energy) - MIN(total_active_energy) as energy,
                            MAX(effective_power) as peak_power,
                            AVG(voltage_l1_l2) as avg_voltage
                        FROM energy_readings
                        WHERE block_name = %s 
                        AND DATE(timestamp) = %s
                    """, (machine, yesterday))
                    
                    result = cursor.fetchone()
                    if result and result[0] is not None:
                        energy = float(result[0])
                        peak_power = float(result[1]) if result[1] else None
                        avg_voltage = float(result[2]) if result[2] else None
                        
                        # Insert or update daily summary
                        cursor.execute("""
                            INSERT INTO daily_energy_summary (block_name, date, energy_used, peak_power, avg_voltage)
                            VALUES (%s, %s, %s, %s, %s)
                            ON CONFLICT (block_name, date) 
                            DO UPDATE SET 
                                energy_used = EXCLUDED.energy_used,
                                peak_power = EXCLUDED.peak_power,
                                avg_voltage = EXCLUDED.avg_voltage
                        """, (machine, yesterday, energy, peak_power, avg_voltage))
                        
                        conn.commit()
                        logger.info(f"✅ Daily summary generated for {machine} on {yesterday}")
        except Exception as e:
            logger.error(f"❌ Error generating daily summary for {machine}: {e}")

def generate_monthly_summary():
    """Generate monthly energy summary for previous month"""
    machines = ['M21', 'M22', 'M23', 'M24', 'C2']
    now = datetime.now()
    # Get first day of previous month
    if now.month == 1:
        prev_month = now.replace(year=now.year - 1, month=12, day=1)
    else:
        prev_month = now.replace(month=now.month - 1, day=1)
    
    month_start = prev_month.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    # Get last day of previous month
    if prev_month.month == 12:
        month_end = prev_month.replace(year=prev_month.year + 1, month=1, day=1) - timedelta(seconds=1)
    else:
        month_end = prev_month.replace(month=prev_month.month + 1, day=1) - timedelta(seconds=1)
    
    for machine in machines:
        from app import get_db_connection
        try:
            with closing(get_db_connection()) as conn:
                with conn.cursor() as cursor:
                    # Calculate MAX - MIN for the month
                    cursor.execute("""
                        SELECT 
                            MAX(total_active_energy) - MIN(total_active_energy) as energy
                        FROM energy_readings
                        WHERE block_name = %s 
                        AND timestamp >= %s 
                        AND timestamp <= %s
                    """, (machine, month_start, month_end))
                    
                    result = cursor.fetchone()
                    if result and result[0] is not None:
                        energy = float(result[0])
                        total_cost = energy * 0.35  # OMR per kWh
                        
                        # Insert or update monthly summary
                        cursor.execute("""
                            INSERT INTO monthly_energy_summary (block_name, month, energy_used, total_cost)
                            VALUES (%s, %s, %s, %s)
                            ON CONFLICT (block_name, month) 
                            DO UPDATE SET 
                                energy_used = EXCLUDED.energy_used,
                                total_cost = EXCLUDED.total_cost
                        """, (machine, prev_month.date(), energy, total_cost))
                        
                        conn.commit()
                        logger.info(f"✅ Monthly summary generated for {machine} for {prev_month.strftime('%Y-%m')}")
        except Exception as e:
            logger.error(f"❌ Error generating monthly summary for {machine}: {e}")

def cleanup_old_data():
    """Delete raw energy_readings data older than 30 days"""
    from app import get_db_connection
    try:
        cutoff_date = datetime.now() - timedelta(days=30)
        with closing(get_db_connection()) as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    DELETE FROM energy_readings
                    WHERE timestamp < %s
                """, (cutoff_date,))
                deleted_count = cursor.rowcount
                conn.commit()
                logger.info(f"✅ Cleaned up {deleted_count} old energy readings (older than 30 days)")
    except Exception as e:
        logger.error(f"❌ Error cleaning up old data: {e}")

# =============================================================================
# Energy API Routes
# =============================================================================

@energy_bp.route('/store-energy-reading', methods=['POST'])
@handle_db_errors
def store_energy_reading():
    """Store energy readings from frontend"""
    data = request.get_json()
    
    # Validate required fields
    required = ['block_name', 'total_active_energy', 'total_reactive_energy',
                'total_apparent_energy', 'voltage_l1_l2', 'effective_power']
    
    for field in required:
        if field not in data:
            logger.warning(f"Missing field in energy reading: {field}")
            return jsonify({'error': f'Missing field: {field}'}), 400
    
    # Validate block_name
    valid_blocks = ['C2', 'M20', 'M21', 'M22', 'M23', 'M24']
    block_name = data['block_name']
    if block_name not in valid_blocks:
        logger.warning(f"Invalid block_name: {block_name}")
        return jsonify({'error': f'Invalid block_name. Must be one of: {", ".join(valid_blocks)}'}), 400
    
    # Validate and convert numeric values
    try:
        total_active_energy = float(data['total_active_energy'])
        total_reactive_energy = float(data['total_reactive_energy'])
        total_apparent_energy = float(data['total_apparent_energy'])
        voltage_l1_l2 = float(data['voltage_l1_l2'])
        effective_power = float(data['effective_power'])
    except (ValueError, TypeError) as e:
        logger.error(f"Invalid numeric value in energy reading: {e}")
        return jsonify({'error': 'Invalid numeric value in energy reading'}), 400
    
    # Store in database
    from app import get_db_connection
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor() as cursor:
                cursor.execute("""
                    INSERT INTO energy_readings (
                        block_name, total_active_energy, total_reactive_energy,
                        total_apparent_energy, voltage_l1_l2, effective_power, timestamp
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, NOW())
                    RETURNING id
                """, (
                    block_name,
                    total_active_energy,
                    total_reactive_energy,
                    total_apparent_energy,
                    voltage_l1_l2,
                    effective_power
                ))
                reading_id = cursor.fetchone()[0]
                conn.commit()
        
        logger.info(f"✅ Energy reading stored for {block_name} (ID: {reading_id})")
        return jsonify({'message': 'Stored successfully', 'id': reading_id}), 201
    
    except Exception as e:
        logger.error(f"❌ Error storing energy reading for {block_name}: {e}", exc_info=True)
        return jsonify({'error': 'Failed to store energy reading'}), 500

@energy_bp.route('/store-energy-readings-batch', methods=['POST'])
@handle_db_errors
def store_energy_readings_batch():
    """Store multiple energy readings at once (optional batch endpoint)"""
    data = request.get_json()
    
    if not isinstance(data, dict) or 'readings' not in data:
        return jsonify({'error': 'Missing "readings" array in request body'}), 400
    
    readings = data['readings']
    if not isinstance(readings, list):
        return jsonify({'error': '"readings" must be an array'}), 400
    
    valid_blocks = ['C2', 'M20', 'M21', 'M22', 'M23', 'M24']
    required_fields = ['block_name', 'total_active_energy', 'total_reactive_energy',
                      'total_apparent_energy', 'voltage_l1_l2', 'effective_power']
    
    stored_count = 0
    errors = []
    
    from app import get_db_connection
    try:
        with closing(get_db_connection()) as conn:
            with conn.cursor() as cursor:
                for idx, reading in enumerate(readings):
                    try:
                        # Validate required fields
                        for field in required_fields:
                            if field not in reading:
                                errors.append(f"Reading {idx}: Missing field '{field}'")
                                continue
                        
                        # Validate block_name
                        block_name = reading['block_name']
                        if block_name not in valid_blocks:
                            errors.append(f"Reading {idx}: Invalid block_name '{block_name}'")
                            continue
                        
                        # Convert numeric values
                        try:
                            total_active_energy = float(reading['total_active_energy'])
                            total_reactive_energy = float(reading['total_reactive_energy'])
                            total_apparent_energy = float(reading['total_apparent_energy'])
                            voltage_l1_l2 = float(reading['voltage_l1_l2'])
                            effective_power = float(reading['effective_power'])
                        except (ValueError, TypeError):
                            errors.append(f"Reading {idx}: Invalid numeric values")
                            continue
                        
                        # Insert reading
                        cursor.execute("""
                            INSERT INTO energy_readings (
                                block_name, total_active_energy, total_reactive_energy,
                                total_apparent_energy, voltage_l1_l2, effective_power, timestamp
                            )
                            VALUES (%s, %s, %s, %s, %s, %s, NOW())
                        """, (
                            block_name,
                            total_active_energy,
                            total_reactive_energy,
                            total_apparent_energy,
                            voltage_l1_l2,
                            effective_power
                        ))
                        stored_count += 1
                        
                    except Exception as e:
                        errors.append(f"Reading {idx}: {str(e)}")
                        logger.error(f"Error processing reading {idx}: {e}")
                
                conn.commit()
        
        logger.info(f"✅ Batch stored: {stored_count} readings, {len(errors)} errors")
        return jsonify({
            'message': f'Stored {stored_count} readings',
            'stored_count': stored_count,
            'error_count': len(errors),
            'errors': errors if errors else None
        }), 201
    
    except Exception as e:
        logger.error(f"❌ Error in batch store: {e}", exc_info=True)
        return jsonify({'error': 'Failed to store energy readings'}), 500

@energy_bp.route('/get-energy-history', methods=['GET'])
@handle_db_errors
def get_energy_history():
    """Get energy reading history"""
    block_name = request.args.get('block_name')
    limit = request.args.get('limit', 100, type=int)
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    query = "SELECT * FROM energy_readings WHERE 1=1"
    params = []
    
    if block_name:
        query += " AND block_name = %s"
        params.append(block_name)
    
    if start_date:
        query += " AND timestamp >= %s"
        params.append(start_date)
    
    if end_date:
        query += " AND timestamp <= %s"
        params.append(end_date)
    
    query += " ORDER BY timestamp DESC LIMIT %s"
    params.append(limit)
    
    from app import get_db_connection
    with closing(get_db_connection()) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cursor:
            cursor.execute(query, params)
            readings = cursor.fetchall()
            
            for reading in readings:
                if reading.get('timestamp'):
                    reading['timestamp'] = reading['timestamp'].isoformat()
    
    return jsonify({'status': 'success', 'count': len(readings), 'data': readings}), 200

@energy_bp.route('/api/energy/historical', methods=['GET'])
@handle_db_errors
def get_historical_energy():
    """Get historical energy data for a time range"""
    block_name = request.args.get('block_name')
    start_datetime = request.args.get('start_datetime')
    end_datetime = request.args.get('end_datetime')
    
    if not block_name or not start_datetime or not end_datetime:
        return jsonify({'status': 'error', 'message': 'Missing required parameters: block_name, start_datetime, end_datetime'}), 400
    
    try:
        from app import get_db_connection
        logger.info(f"Fetching historical energy for {block_name} from {start_datetime} to {end_datetime}")
        start_reading = get_start_reading(block_name, start_datetime)
        end_reading = get_end_reading(block_name, end_datetime)
        
        if not start_reading:
            logger.warning(f"No start reading found for {block_name} >= {start_datetime}")
        if not end_reading:
            logger.warning(f"No end reading found for {block_name} <= {end_datetime}")
        
        if not start_reading or not end_reading:
            # Fallback: if user asked for today (e.g., starts at 00:00:00) and no start reading >= 00:00:00, 
            # try to find the last reading BEFORE start_datetime to use as a baseline.
            # This handles the case where the machine has been running since yesterday but no new reading happened exactly at 00:00:00 or after.
            if not start_reading and end_reading:
                 # Find the reading closest to start_datetime (even if before it)
                with closing(get_db_connection()) as conn:
                    with conn.cursor(cursor_factory=RealDictCursor) as cursor:
                         cursor.execute("""
                            SELECT * FROM energy_readings
                            WHERE block_name = %s AND timestamp < %s
                            ORDER BY timestamp DESC
                            LIMIT 1
                        """, (block_name, start_datetime))
                         result = cursor.fetchone()
                         if result:
                             start_reading = dict(result)
                             logger.info(f"Using fallback start reading from {start_reading['timestamp']} (before {start_datetime})")

        if not start_reading or not end_reading:
            error_msg = 'No readings found for the specified time range.'
            
            # Additional debug info
            with closing(get_db_connection()) as conn:
                with conn.cursor() as cursor:
                    # Check latest reading
                    cursor.execute("SELECT timestamp FROM energy_readings WHERE block_name = %s ORDER BY timestamp DESC LIMIT 1", (block_name,))
                    latest = cursor.fetchone()
                    latest_ts = latest[0] if latest else "None"
                    
                    # Check earliest reading
                    cursor.execute("SELECT timestamp FROM energy_readings WHERE block_name = %s ORDER BY timestamp ASC LIMIT 1", (block_name,))
                    earliest = cursor.fetchone()
                    earliest_ts = earliest[0] if earliest else "None"
                    
            error_msg += f" (DB Range: {earliest_ts} to {latest_ts})."

            if not start_reading:
                error_msg += f" No reading found at or after {start_datetime}."
            if not end_reading:
                error_msg += f" No reading found at or before {end_datetime}."
            
            logger.warning(f"Historical energy 404: {error_msg} (Block: {block_name})")
            return jsonify({'status': 'error', 'message': error_msg}), 404
            
        logger.info(f"Start Reading: {start_reading.get('timestamp')} - {start_reading.get('total_active_energy')}")
        logger.info(f"End Reading: {end_reading.get('timestamp')} - {end_reading.get('total_active_energy')}")
        
        try:
            delta = calculate_energy_delta(start_reading, end_reading)
        except ValueError as e:
            logger.warning(f"Negative or invalid energy delta (showing zeros): {e}")
            delta = {'active_energy': 0, 'reactive_energy': 0, 'apparent_energy': 0}
        logger.info(f"Calculated Delta: {delta}")
        
        avg_voltage = calculate_avg_voltage(block_name, start_datetime, end_datetime)
        avg_power = calculate_avg_power(block_name, start_datetime, end_datetime)
        
        return jsonify({
            'status': 'success',
            'data': {
                'block_name': block_name,
                'start_time': start_datetime,
                'end_time': end_datetime,
                'active_energy': delta['active_energy'],
                'reactive_energy': delta['reactive_energy'],
                'apparent_energy': delta['apparent_energy'],
                'avg_voltage': avg_voltage or 0,
                'avg_power': avg_power or 0
            }
        }), 200
    except Exception as e:
        logger.error(f"Error in get_historical_energy: {e}", exc_info=True)
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

@energy_bp.route('/api/energy/hourly', methods=['GET'])
@handle_db_errors
def get_hourly_energy():
    """Get hourly energy breakdown for a specific date"""
    block_name = request.args.get('block_name')
    date = request.args.get('date')
    
    if not block_name or not date:
        return jsonify({'status': 'error', 'message': 'Missing required parameters: block_name, date'}), 400
    
    try:
        data = get_hourly_energy_data(block_name, date)
        return jsonify({
            'status': 'success',
            'data': data
        }), 200
    except Exception as e:
        logger.error(f"Error in get_hourly_energy: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

@energy_bp.route('/api/energy/daily', methods=['GET'])
@handle_db_errors
def get_daily_energy():
    """Get daily energy summary for date range"""
    block_name = request.args.get('block_name')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    if not block_name or not start_date or not end_date:
        return jsonify({'status': 'error', 'message': 'Missing required parameters: block_name, start_date, end_date'}), 400
    
    try:
        data = get_daily_energy_data(block_name, start_date, end_date)
        return jsonify({
            'status': 'success',
            'data': data
        }), 200
    except Exception as e:
        logger.error(f"Error in get_daily_energy: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

@energy_bp.route('/api/energy/monthly', methods=['GET'])
@handle_db_errors
def get_monthly_energy():
    """Get monthly energy summary for month range"""
    block_name = request.args.get('block_name')
    start_month = request.args.get('start_month')
    end_month = request.args.get('end_month')
    
    if not block_name or not start_month or not end_month:
        return jsonify({'status': 'error', 'message': 'Missing required parameters: block_name, start_month, end_month'}), 400
    
    try:
        data = get_monthly_energy_data(block_name, start_month, end_month)
        return jsonify({
            'status': 'success',
            'data': data
        }), 200
    except Exception as e:
        logger.error(f"Error in get_monthly_energy: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

@energy_bp.route('/api/energy/machines-comparison', methods=['GET'])
@handle_db_errors
def get_machines_comparison_api():
    """Get energy comparison for all machines in date range"""
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    if not start_date or not end_date:
        return jsonify({'status': 'error', 'message': 'Missing required parameters: start_date, end_date'}), 400
    
    try:
        data = get_machines_comparison(start_date, end_date)
        return jsonify({
            'status': 'success',
            'data': data
        }), 200
    except Exception as e:
        logger.error(f"Error in get_machines_comparison: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

@energy_bp.route('/api/energy/shift', methods=['GET'])
@handle_db_errors
def get_shift_energy_api():
    """Get shift-wise energy for a specific date and shift"""
    block_name = request.args.get('block_name')
    date = request.args.get('date')
    shift = request.args.get('shift')
    
    if not block_name or not date or not shift:
        return jsonify({'status': 'error', 'message': 'Missing required parameters: block_name, date, shift'}), 400
    
    if shift not in ['A', 'B', 'C']:
        return jsonify({'status': 'error', 'message': 'Invalid shift. Must be A, B, or C'}), 400
    
    try:
        data = get_shift_energy(block_name, date, shift)
        if not data:
            return jsonify({'status': 'error', 'message': 'No data found for the specified shift'}), 404
        
        return jsonify({
            'status': 'success',
            'data': data
        }), 200
    except Exception as e:
        logger.error(f"Error in get_shift_energy: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

@energy_bp.route('/api/energy/validate', methods=['GET'])
@handle_db_errors
def validate_energy_readings_api():
    """Validate energy readings for a time range"""
    block_name = request.args.get('block_name')
    start_datetime = request.args.get('start_datetime')
    end_datetime = request.args.get('end_datetime')
    
    if not block_name or not start_datetime or not end_datetime:
        return jsonify({'status': 'error', 'message': 'Missing required parameters: block_name, start_datetime, end_datetime'}), 400
    
    try:
        validation = validate_energy_readings(block_name, start_datetime, end_datetime)
        voltage_check = check_voltage_range(block_name, start_datetime, end_datetime)
        
        return jsonify({
            'status': 'success',
            'data': {
                'validation': validation,
                'voltage_check': voltage_check
            }
        }), 200
    except Exception as e:
        logger.error(f"Error in validate_energy_readings: {e}")
        return jsonify({'status': 'error', 'message': 'Internal server error'}), 500

@energy_bp.route('/api/energy/generate-report', methods=['POST'])
@handle_db_errors
def generate_report():
    """Generate energy report (PDF, Excel, or CSV)"""
    data = request.get_json()
    
    if not data:
        return jsonify({'status': 'error', 'message': 'Missing request body'}), 400
    
    report_type = data.get('report_type')
    block_name = data.get('block_name')
    start_date = data.get('start_date')
    end_date = data.get('end_date')
    format_type = data.get('format', 'pdf')
    
    if not report_type or not block_name or not start_date or not end_date:
        return jsonify({'status': 'error', 'message': 'Missing required fields: report_type, block_name, start_date, end_date'}), 400
    
    if report_type not in ['daily', 'monthly', 'shift']:
        return jsonify({'status': 'error', 'message': 'Invalid report_type. Must be daily, monthly, or shift'}), 400
    
    if format_type not in ['pdf', 'excel', 'csv']:
        return jsonify({'status': 'error', 'message': 'Invalid format. Must be pdf, excel, or csv'}), 400
    
    try:
        # For now, return a placeholder response
        # Full report generation can be implemented later
        report_url = f"/downloads/energy_report_{block_name}_{start_date}_{end_date}.{format_type}"
        
        return jsonify({
            'status': 'success',
            'message': 'Report generation initiated',
            'report_url': report_url
        }), 200
    except Exception as e:
        logger.error(f"Error generating report: {e}")
        return jsonify({'status': 'error', 'message': 'Failed to generate report'}), 500


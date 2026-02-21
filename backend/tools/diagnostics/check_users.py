#!/usr/bin/env python3
"""
Script to check and display all user records from the users table.
"""

import os
import sys
import psycopg2
from psycopg2.extras import RealDictCursor
from datetime import datetime

def get_db_connection():
    """Create database connection using same config as app.py"""
    try:
        conn = psycopg2.connect(
            dbname=os.getenv('POSTGRES_DB', 'Dynamic_DB_Hercules'),
            user=os.getenv('POSTGRES_USER', 'postgres'),
            password=os.getenv('POSTGRES_PASSWORD', 'Admin@123'),
            host=os.getenv('DB_HOST', '127.0.0.1'),
            port=os.getenv('DB_PORT', 5433),
            cursor_factory=RealDictCursor
        )
        return conn
    except psycopg2.Error as e:
        print(f"❌ Database connection error: {e}")
        sys.exit(1)

def check_users():
    """Query and display all users from the users table"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Query all users
        cursor.execute("""
            SELECT id, username, role, 
                   CASE 
                       WHEN password_hash IS NOT NULL THEN '***' 
                       ELSE 'NULL' 
                   END as password_status
            FROM users
            ORDER BY id
        """)
        
        users = cursor.fetchall()
        
        if not users:
            print("📭 No users found in the database.")
            return
        
        # Display results
        print("\n" + "="*70)
        print(f"👥 USER TABLE RECORDS - {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        print("="*70)
        print(f"\nTotal users: {len(users)}\n")
        
        # Table header
        print(f"{'ID':<5} {'Username':<20} {'Role':<15} {'Password':<10}")
        print("-" * 70)
        
        # Display each user
        for user in users:
            print(f"{user['id']:<5} {user['username']:<20} {user['role']:<15} {user['password_status']:<10}")
        
        print("\n" + "="*70)
        
        # Summary by role
        cursor.execute("""
            SELECT role, COUNT(*) as count
            FROM users
            GROUP BY role
            ORDER BY role
        """)
        
        role_counts = cursor.fetchall()
        
        if role_counts:
            print("\n📊 Summary by Role:")
            print("-" * 30)
            for role_count in role_counts:
                print(f"  {role_count['role']:<15} : {role_count['count']} user(s)")
        
        print("\n" + "="*70 + "\n")
        
        cursor.close()
        conn.close()
        
    except psycopg2.Error as e:
        print(f"❌ Database error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Unexpected error: {e}")
        sys.exit(1)

if __name__ == '__main__':
    print("🔍 Checking user table records...")
    check_users()
    print("✅ Done!")


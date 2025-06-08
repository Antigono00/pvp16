import sqlite3
import os
import sys

# Add the parent directory to the path so we can import from backend
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the DATABASE_PATH from your config
from backend.config import DATABASE_PATH

def test_connection():
    try:
        print(f"Attempting to connect to: {DATABASE_PATH}")
        
        conn = sqlite3.connect(DATABASE_PATH)
        cur = conn.cursor()
        
        # Test if we can read from users table
        cur.execute("SELECT COUNT(*) FROM users")
        user_count = cur.fetchone()[0]
        print(f"✓ Connected successfully! Found {user_count} users.")
        
        # Check if any PvP tables already exist
        cur.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name LIKE 'pvp_%'
        """)
        pvp_tables = cur.fetchall()
        
        if pvp_tables:
            print(f"\n⚠️  Found existing PvP tables:")
            for table in pvp_tables:
                print(f"  - {table[0]}")
        else:
            print("\n✓ No PvP tables found. Safe to add them.")
            
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"❌ Error: {e}")

if __name__ == "__main__":
    test_connection()

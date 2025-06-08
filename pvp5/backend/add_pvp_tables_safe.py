import sqlite3
import os
import sys
import traceback
from datetime import datetime

# Add the parent directory to the path so we can import from backend
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Import the DATABASE_PATH from your config
from backend.config import DATABASE_PATH

def check_table_exists(cursor, table_name):
    """Check if a table already exists in the database"""
    cursor.execute("""
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name=?
    """, (table_name,))
    return cursor.fetchone() is not None

def backup_database():
    """Create a backup of the database"""
    backup_path = DATABASE_PATH + f'.backup_{datetime.now().strftime("%Y%m%d_%H%M%S")}'
    import shutil
    shutil.copy2(DATABASE_PATH, backup_path)
    print(f"Created backup at: {backup_path}")
    return backup_path

def add_pvp_tables_safely():
    """Safely add PvP tables to existing database"""
    
    # Create backup first
    print("Creating database backup...")
    backup_path = backup_database()
    
    try:
        conn = sqlite3.connect(DATABASE_PATH)
        cur = conn.cursor()
        
        # List of PvP tables we want to add
        pvp_tables = [
            'pvp_battles',
            'pvp_matchmaking', 
            'pvp_history',
            'pvp_stats'
        ]
        
        # Check which tables already exist
        existing_tables = []
        for table in pvp_tables:
            if check_table_exists(cur, table):
                existing_tables.append(table)
                print(f"⚠️  Table '{table}' already exists - skipping")
        
        if existing_tables:
            response = input(f"\nFound {len(existing_tables)} existing PvP tables. Continue with adding missing tables? (y/n): ")
            if response.lower() != 'y':
                print("Aborted.")
                return
        
        # Add tables one by one
        print("\nAdding PvP tables...")
        
        # 1. PvP Battles table
        if not check_table_exists(cur, 'pvp_battles'):
            print("Creating pvp_battles table...")
            cur.execute("""
                CREATE TABLE pvp_battles (
                    battle_id TEXT PRIMARY KEY,
                    player1_id INTEGER NOT NULL,
                    player2_id INTEGER NOT NULL,
                    current_turn INTEGER NOT NULL,
                    turn_number INTEGER DEFAULT 1,
                    battle_state TEXT NOT NULL,
                    status TEXT DEFAULT 'active',
                    winner_id INTEGER,
                    created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                    updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                    last_action_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                    FOREIGN KEY (player1_id) REFERENCES users(user_id),
                    FOREIGN KEY (player2_id) REFERENCES users(user_id)
                )
            """)
            print("✓ pvp_battles table created")
        
        # 2. Matchmaking table
        if not check_table_exists(cur, 'pvp_matchmaking'):
            print("Creating pvp_matchmaking table...")
            cur.execute("""
                CREATE TABLE pvp_matchmaking (
                    queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    user_id INTEGER NOT NULL UNIQUE,
                    rating INTEGER DEFAULT 1000,
                    deck_power INTEGER NOT NULL,
                    queue_time INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                    status TEXT DEFAULT 'waiting',
                    FOREIGN KEY (user_id) REFERENCES users(user_id)
                )
            """)
            print("✓ pvp_matchmaking table created")
        
        # 3. History table
        if not check_table_exists(cur, 'pvp_history'):
            print("Creating pvp_history table...")
            cur.execute("""
                CREATE TABLE pvp_history (
                    history_id INTEGER PRIMARY KEY AUTOINCREMENT,
                    battle_id TEXT NOT NULL,
                    player1_id INTEGER NOT NULL,
                    player2_id INTEGER NOT NULL,
                    winner_id INTEGER NOT NULL,
                    loser_id INTEGER NOT NULL,
                    player1_rating_change INTEGER DEFAULT 0,
                    player2_rating_change INTEGER DEFAULT 0,
                    total_turns INTEGER NOT NULL,
                    battle_duration INTEGER NOT NULL,
                    completed_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
                    battle_replay TEXT,
                    FOREIGN KEY (player1_id) REFERENCES users(user_id),
                    FOREIGN KEY (player2_id) REFERENCES users(user_id),
                    FOREIGN KEY (winner_id) REFERENCES users(user_id),
                    FOREIGN KEY (loser_id) REFERENCES users(user_id)
                )
            """)
            print("✓ pvp_history table created")
        
        # 4. Stats table
        if not check_table_exists(cur, 'pvp_stats'):
            print("Creating pvp_stats table...")
            cur.execute("""
                CREATE TABLE pvp_stats (
                    user_id INTEGER PRIMARY KEY,
                    rating INTEGER DEFAULT 1000,
                    wins INTEGER DEFAULT 0,
                    losses INTEGER DEFAULT 0,
                    draws INTEGER DEFAULT 0,
                    win_streak INTEGER DEFAULT 0,
                    best_win_streak INTEGER DEFAULT 0,
                    total_damage_dealt INTEGER DEFAULT 0,
                    total_damage_taken INTEGER DEFAULT 0,
                    favorite_creature_id TEXT,
                    last_battle_at INTEGER,
                    FOREIGN KEY (user_id) REFERENCES users(user_id)
                )
            """)
            print("✓ pvp_stats table created")
        
        # Add indexes
        print("\nAdding indexes...")
        
        indexes = [
            ("idx_pvp_battles_players", "pvp_battles(player1_id, player2_id)"),
            ("idx_pvp_battles_status", "pvp_battles(status)"),
            ("idx_pvp_matchmaking_status", "pvp_matchmaking(status, rating)"),
            ("idx_pvp_history_players", "pvp_history(player1_id, player2_id)"),
            ("idx_pvp_stats_rating", "pvp_stats(rating DESC)")
        ]
        
        for index_name, index_def in indexes:
            try:
                cur.execute(f"CREATE INDEX IF NOT EXISTS {index_name} ON {index_def}")
                print(f"✓ Index {index_name} created")
            except sqlite3.Error as e:
                print(f"⚠️  Could not create index {index_name}: {e}")
        
        # Commit changes
        conn.commit()
        print("\n✅ PvP tables added successfully!")
        
        # Verify tables were created
        print("\nVerifying tables...")
        cur.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name LIKE 'pvp_%'
            ORDER BY name
        """)
        
        created_tables = cur.fetchall()
        print(f"Found {len(created_tables)} PvP tables:")
        for table in created_tables:
            print(f"  - {table[0]}")
            
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"\n❌ Error occurred: {e}")
        traceback.print_exc()
        print(f"\nYour database backup is at: {backup_path}")
        print("No changes were committed. You can restore from backup if needed.")
        
        if 'conn' in locals():
            conn.rollback()
            conn.close()

def show_existing_tables():
    """Show all tables in the database"""
    try:
        conn = sqlite3.connect(DATABASE_PATH)
        cur = conn.cursor()
        
        print("\nExisting tables in database:")
        cur.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' 
            ORDER BY name
        """)
        
        tables = cur.fetchall()
        for table in tables:
            # Get row count
            cur.execute(f"SELECT COUNT(*) FROM {table[0]}")
            count = cur.fetchone()[0]
            print(f"  - {table[0]} ({count} rows)")
            
        cur.close()
        conn.close()
        
    except Exception as e:
        print(f"Error showing tables: {e}")

if __name__ == "__main__":
    print("=== PvP Tables Installation ===")
    print(f"Database: {DATABASE_PATH}")
    
    # Show existing tables first
    show_existing_tables()
    
    print("\nThis script will:")
    print("1. Create a backup of your database")
    print("2. Add 4 new PvP tables")
    print("3. NOT modify any existing tables")
    print("4. Create indexes for performance")
    
    response = input("\nProceed with adding PvP tables? (y/n): ")
    if response.lower() == 'y':
        add_pvp_tables_safely()
    else:
        print("Aborted.")

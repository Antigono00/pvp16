from flask import Blueprint, request, jsonify, session
import sqlite3
import json
import time
import traceback
from datetime import datetime
import random
from pvp_battle_state import PvPBattleState, compress_battle_state, decompress_battle_state
from config import DATABASE_PATH

# Database helper functions (moved here to avoid circular import)
def get_db_connection():
    conn = sqlite3.connect(DATABASE_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def get_or_create_resource(cursor, user_id, resource_name):
    try:
        cursor.execute("SELECT amount FROM resources WHERE user_id=? AND resource_name=?", (user_id, resource_name))
        row = cursor.fetchone()
        if row is None:
            cursor.execute("INSERT INTO resources (user_id, resource_name, amount) VALUES (?, ?, 0)",
                        (user_id, resource_name))
            return 0
        else:
            return row[0]
    except Exception as e:
        print(f"Error in get_or_create_resource: {e}")
        return 0

pvp_bp = Blueprint('pvp', __name__, url_prefix='/api/pvp')

# Database initialization for PvP tables
def init_pvp_tables():
    conn = get_db_connection()
    cur = conn.cursor()
    
    # Create PvP tables if they don't exist
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pvp_battles (
            battle_id INTEGER PRIMARY KEY AUTOINCREMENT,
            player1_id INTEGER NOT NULL,
            player2_id INTEGER NOT NULL,
            battle_state TEXT NOT NULL,
            status TEXT DEFAULT 'active',
            turn_count INTEGER DEFAULT 1,
            winner_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            completed_at TIMESTAMP
        )
    """)
    
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pvp_stats (
            user_id INTEGER PRIMARY KEY,
            rating INTEGER DEFAULT 1000,
            wins INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            draws INTEGER DEFAULT 0,
            win_streak INTEGER DEFAULT 0,
            best_win_streak INTEGER DEFAULT 0,
            total_damage_dealt INTEGER DEFAULT 0,
            total_damage_taken INTEGER DEFAULT 0,
            last_battle_at TIMESTAMP
        )
    """)
    
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pvp_battle_history (
            history_id INTEGER PRIMARY KEY AUTOINCREMENT,
            battle_id INTEGER NOT NULL,
            player1_id INTEGER NOT NULL,
            player2_id INTEGER NOT NULL,
            winner_id INTEGER,
            player1_rating_change INTEGER DEFAULT 0,
            player2_rating_change INTEGER DEFAULT 0,
            total_turns INTEGER DEFAULT 0,
            battle_duration INTEGER DEFAULT 0,
            completed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (battle_id) REFERENCES pvp_battles(battle_id)
        )
    """)
    
    cur.execute("""
        CREATE TABLE IF NOT EXISTS pvp_queue (
            queue_id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL UNIQUE,
            rating INTEGER DEFAULT 1000,
            selected_creatures TEXT NOT NULL,
            selected_tools TEXT,
            selected_spells TEXT,
            joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    
    conn.commit()
    conn.close()

# Initialize tables on module load
try:
    init_pvp_tables()
except Exception as e:
    print(f"Error initializing PvP tables: {e}")
    traceback.print_exc()

# Helper functions
def get_or_create_pvp_stats(user_id):
    """Get or create PvP stats for a user"""
    conn = get_db_connection()
    cur = conn.cursor()
    
    cur.execute("SELECT * FROM pvp_stats WHERE user_id = ?", (user_id,))
    stats = cur.fetchone()
    
    if not stats:
        # Create new stats entry
        cur.execute("""
            INSERT INTO pvp_stats (user_id) VALUES (?)
        """, (user_id,))
        conn.commit()
        
        cur.execute("SELECT * FROM pvp_stats WHERE user_id = ?", (user_id,))
        stats = cur.fetchone()
    
    cur.close()
    conn.close()
    
    return dict(stats) if stats else None

def calculate_rating_change(winner_rating, loser_rating):
    """Calculate ELO rating change"""
    K = 32  # K-factor
    expected_win = 1 / (1 + 10 ** ((loser_rating - winner_rating) / 400))
    winner_change = int(K * (1 - expected_win))
    loser_change = -int(K * expected_win)
    return winner_change, loser_change

def create_initial_battle_state(player1_data, player2_data):
    """Create initial battle state from player data"""
    # Initialize battle state structure
    battle_state = {
        "turn": 1,
        "activePlayer": player1_data['user_id'],
        "player1": {
            "id": player1_data['user_id'],
            "name": player1_data.get('name', f"Player {player1_data['user_id']}"),
            "hand": [],
            "field": [],
            "deck": player1_data['selected_creatures'].copy(),
            "energy": 10,
            "tools": player1_data.get('selected_tools', []),
            "spells": player1_data.get('selected_spells', [])
        },
        "player2": {
            "id": player2_data['user_id'],
            "name": player2_data.get('name', f"Player {player2_data['user_id']}"),
            "hand": [],
            "field": [],
            "deck": player2_data['selected_creatures'].copy(),
            "energy": 10,
            "tools": player2_data.get('selected_tools', []),
            "spells": player2_data.get('selected_spells', [])
        },
        "battleLog": []
    }
    
    # Draw initial hands (3 cards each)
    for _ in range(3):
        if battle_state["player1"]["deck"]:
            battle_state["player1"]["hand"].append(battle_state["player1"]["deck"].pop(0))
        if battle_state["player2"]["deck"]:
            battle_state["player2"]["hand"].append(battle_state["player2"]["deck"].pop(0))
    
    return battle_state

# Routes
@pvp_bp.route('/queue', methods=['POST'])
def join_queue():
    """Join PvP matchmaking queue"""
    try:
        if 'telegram_id' not in session:
            return jsonify({"error": "Not logged in"}), 401
        
        user_id = int(session['telegram_id'])
        data = request.json or {}
        
        # Get selected creatures, tools, and spells
        selected_creatures = data.get('selectedCreatures', [])
        selected_tools = data.get('tools', [])
        selected_spells = data.get('spells', [])
        
        if not selected_creatures:
            return jsonify({"error": "No creatures selected"}), 400
        
        # Get user stats
        stats = get_or_create_pvp_stats(user_id)
        rating = stats['rating']
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Remove from queue if already in it
        cur.execute("DELETE FROM pvp_queue WHERE user_id = ?", (user_id,))
        
        # Check if there's a suitable opponent in queue
        cur.execute("""
            SELECT * FROM pvp_queue 
            WHERE user_id != ? 
            AND ABS(rating - ?) <= 200
            ORDER BY joined_at ASC
            LIMIT 1
        """, (user_id, rating))
        
        opponent = cur.fetchone()
        
        if opponent:
            # Match found! Create battle
            opponent_data = dict(opponent)
            
            # Parse opponent's selections
            opponent_data['selected_creatures'] = json.loads(opponent_data['selected_creatures'])
            opponent_data['selected_tools'] = json.loads(opponent_data['selected_tools'] or '[]')
            opponent_data['selected_spells'] = json.loads(opponent_data['selected_spells'] or '[]')
            
            # Get opponent's name
            cur.execute("SELECT first_name FROM users WHERE user_id = ?", (opponent_data['user_id'],))
            opponent_user = cur.fetchone()
            opponent_data['name'] = opponent_user['first_name'] if opponent_user else f"Player {opponent_data['user_id']}"
            
            # Get current user's name
            cur.execute("SELECT first_name FROM users WHERE user_id = ?", (user_id,))
            current_user = cur.fetchone()
            player_data = {
                'user_id': user_id,
                'name': current_user['first_name'] if current_user else f"Player {user_id}",
                'selected_creatures': selected_creatures,
                'selected_tools': selected_tools,
                'selected_spells': selected_spells
            }
            
            # Create battle state
            initial_state = create_initial_battle_state(player_data, opponent_data)
            compressed_state = compress_battle_state(initial_state)
            
            # Insert battle record
            cur.execute("""
                INSERT INTO pvp_battles (player1_id, player2_id, battle_state)
                VALUES (?, ?, ?)
            """, (user_id, opponent_data['user_id'], compressed_state))
            
            battle_id = cur.lastrowid
            
            # Remove opponent from queue
            cur.execute("DELETE FROM pvp_queue WHERE user_id = ?", (opponent_data['user_id'],))
            
            conn.commit()
            cur.close()
            conn.close()
            
            return jsonify({
                "matched": True,
                "battleId": battle_id,
                "opponentName": opponent_data['name'],
                "opponentRating": opponent_data['rating']
            })
        
        else:
            # No match found, add to queue
            cur.execute("""
                INSERT INTO pvp_queue (user_id, rating, selected_creatures, selected_tools, selected_spells)
                VALUES (?, ?, ?, ?, ?)
            """, (
                user_id,
                rating,
                json.dumps(selected_creatures),
                json.dumps(selected_tools) if selected_tools else None,
                json.dumps(selected_spells) if selected_spells else None
            ))
            
            conn.commit()
            cur.close()
            conn.close()
            
            return jsonify({
                "matched": False,
                "estimatedWaitTime": 30,
                "message": "Added to matchmaking queue"
            })
        
    except Exception as e:
        print(f"Error in join_queue: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@pvp_bp.route('/queue/status', methods=['GET'])
def queue_status():
    """Check if still in queue or matched"""
    try:
        if 'telegram_id' not in session:
            return jsonify({"error": "Not logged in"}), 401
        
        user_id = int(session['telegram_id'])
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Check if in queue
        cur.execute("SELECT * FROM pvp_queue WHERE user_id = ?", (user_id,))
        queue_entry = cur.fetchone()
        
        if not queue_entry:
            # Not in queue, check if in active battle
            cur.execute("""
                SELECT battle_id FROM pvp_battles 
                WHERE (player1_id = ? OR player2_id = ?)
                AND status = 'active'
                ORDER BY created_at DESC
                LIMIT 1
            """, (user_id, user_id))
            
            battle = cur.fetchone()
            
            if battle:
                cur.close()
                conn.close()
                return jsonify({
                    "inQueue": False,
                    "matched": True,
                    "battleId": battle['battle_id']
                })
            else:
                cur.close()
                conn.close()
                return jsonify({
                    "inQueue": False,
                    "matched": False
                })
        
        # Still in queue
        wait_time = int((datetime.now() - datetime.fromisoformat(queue_entry['joined_at'])).total_seconds())
        
        cur.close()
        conn.close()
        
        return jsonify({
            "inQueue": True,
            "matched": False,
            "waitTime": wait_time
        })
        
    except Exception as e:
        print(f"Error in queue_status: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@pvp_bp.route('/queue/cancel', methods=['POST'])
def cancel_queue():
    """Cancel queue or forfeit active battle"""
    try:
        if 'telegram_id' not in session:
            return jsonify({"error": "Not logged in"}), 401
        
        user_id = int(session['telegram_id'])
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Remove from queue
        cur.execute("DELETE FROM pvp_queue WHERE user_id = ?", (user_id,))
        
        conn.commit()
        cur.close()
        conn.close()
        
        return jsonify({"status": "ok", "message": "Removed from queue"})
        
    except Exception as e:
        print(f"Error in cancel_queue: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@pvp_bp.route('/battle/<int:battle_id>', methods=['GET'])
def get_battle_state(battle_id):
    """Get current battle state"""
    try:
        if 'telegram_id' not in session:
            return jsonify({"error": "Not logged in"}), 401
        
        user_id = int(session['telegram_id'])
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get battle
        cur.execute("""
            SELECT * FROM pvp_battles
            WHERE battle_id = ?
            AND (player1_id = ? OR player2_id = ?)
        """, (battle_id, user_id, user_id))
        
        battle = cur.fetchone()
        
        if not battle:
            cur.close()
            conn.close()
            return jsonify({"error": "Battle not found"}), 404
        
        battle_dict = dict(battle)
        
        # Decompress battle state
        battle_state = decompress_battle_state(battle_dict['battle_state'])
        
        # Determine if player is player1 or player2
        is_player1 = battle_dict['player1_id'] == user_id
        
        # Get opponent info
        opponent_id = battle_dict['player2_id'] if is_player1 else battle_dict['player1_id']
        cur.execute("SELECT first_name FROM users WHERE user_id = ?", (opponent_id,))
        opponent = cur.fetchone()
        opponent_name = opponent['first_name'] if opponent else f"Player {opponent_id}"
        
        # Calculate turn time remaining (60 seconds per turn)
        if battle_dict['status'] == 'active':
            # Simple timer - in production you'd track actual turn start time
            time_remaining = 60000  # 60 seconds in milliseconds
        else:
            time_remaining = 0
        
        cur.close()
        conn.close()
        
        return jsonify({
            "status": battle_dict['status'],
            "battleState": battle_state,
            "isPlayer1": is_player1,
            "yourTurn": battle_state['activePlayer'] == user_id,
            "turnNumber": battle_state['turn'],
            "opponentInfo": {
                "id": opponent_id,
                "name": opponent_name
            },
            "timeRemaining": time_remaining
        })
        
    except Exception as e:
        print(f"Error in get_battle_state: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@pvp_bp.route('/battle/<int:battle_id>/action', methods=['POST'])
def submit_action(battle_id):
    """Submit battle action"""
    try:
        if 'telegram_id' not in session:
            return jsonify({"error": "Not logged in"}), 401
        
        user_id = int(session['telegram_id'])
        data = request.json or {}
        action = data.get('action', {})
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Get battle
        cur.execute("""
            SELECT * FROM pvp_battles
            WHERE battle_id = ?
            AND (player1_id = ? OR player2_id = ?)
            AND status = 'active'
        """, (battle_id, user_id, user_id))
        
        battle = cur.fetchone()
        
        if not battle:
            cur.close()
            conn.close()
            return jsonify({"error": "Battle not found or not active"}), 404
        
        battle_dict = dict(battle)
        
        # Decompress battle state
        battle_state = decompress_battle_state(battle_dict['battle_state'])
        
        # Create battle state handler
        battle_handler = PvPBattleState(battle_state)
        
        # Process action
        result = battle_handler.process_action(user_id, action)
        
        if not result['success']:
            cur.close()
            conn.close()
            return jsonify({"error": result['error']}), 400
        
        # Get updated state
        updated_state = battle_handler.get_state()
        
        # Check if battle ended
        is_ended, winner_id = battle_handler.check_battle_end()
        
        if is_ended:
            # Battle ended
            loser_id = battle_dict['player1_id'] if winner_id == battle_dict['player2_id'] else battle_dict['player2_id']
            
            # Get current ratings
            winner_stats = get_or_create_pvp_stats(winner_id)
            loser_stats = get_or_create_pvp_stats(loser_id)
            
            # Calculate rating changes
            winner_change, loser_change = calculate_rating_change(
                winner_stats['rating'], 
                loser_stats['rating']
            )
            
            # Update battle record
            cur.execute("""
                UPDATE pvp_battles
                SET status = 'completed',
                    winner_id = ?,
                    turn_count = ?,
                    completed_at = CURRENT_TIMESTAMP,
                    battle_state = ?
                WHERE battle_id = ?
            """, (winner_id, updated_state['turn'], compress_battle_state(updated_state), battle_id))
            
            # Update stats
            cur.execute("""
                UPDATE pvp_stats
                SET rating = rating + ?,
                    wins = wins + 1,
                    win_streak = win_streak + 1,
                    best_win_streak = MAX(best_win_streak, win_streak + 1),
                    last_battle_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            """, (winner_change, winner_id))
            
            cur.execute("""
                UPDATE pvp_stats
                SET rating = rating + ?,
                    losses = losses + 1,
                    win_streak = 0,
                    last_battle_at = CURRENT_TIMESTAMP
                WHERE user_id = ?
            """, (loser_change, loser_id))
            
            # Add to battle history
            battle_duration = int((datetime.now() - datetime.fromisoformat(battle_dict['created_at'])).total_seconds())
            
            cur.execute("""
                INSERT INTO pvp_battle_history
                (battle_id, player1_id, player2_id, winner_id, 
                 player1_rating_change, player2_rating_change,
                 total_turns, battle_duration)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                battle_id, 
                battle_dict['player1_id'], 
                battle_dict['player2_id'],
                winner_id,
                winner_change if winner_id == battle_dict['player1_id'] else loser_change,
                loser_change if winner_id == battle_dict['player1_id'] else winner_change,
                updated_state['turn'],
                battle_duration
            ))
            
            conn.commit()
            cur.close()
            conn.close()
            
            return jsonify({
                "status": "completed",
                "isWinner": winner_id == user_id,
                "ratingChange": winner_change if winner_id == user_id else loser_change,
                "updatedState": updated_state,
                "yourTurn": False
            })
        
        else:
            # Battle continues
            compressed_state = compress_battle_state(updated_state)
            
            cur.execute("""
                UPDATE pvp_battles
                SET battle_state = ?,
                    turn_count = ?
                WHERE battle_id = ?
            """, (compressed_state, updated_state['turn'], battle_id))
            
            conn.commit()
            cur.close()
            conn.close()
            
            return jsonify({
                "status": "ok",
                "updatedState": updated_state,
                "yourTurn": updated_state['activePlayer'] == user_id
            })
        
    except Exception as e:
        print(f"Error in submit_action: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@pvp_bp.route('/stats', methods=['GET'])
def get_stats():
    """Get player's PvP statistics"""
    try:
        if 'telegram_id' not in session:
            return jsonify({"error": "Not logged in"}), 401
        
        user_id = int(session['telegram_id'])
        
        # Get stats
        stats = get_or_create_pvp_stats(user_id)
        
        # Get recent battles
        conn = get_db_connection()
        cur = conn.cursor()
        
        cur.execute("""
            SELECT h.*, u1.first_name as player1_name, u2.first_name as player2_name
            FROM pvp_battle_history h
            JOIN users u1 ON h.player1_id = u1.user_id
            JOIN users u2 ON h.player2_id = u2.user_id
            WHERE h.player1_id = ? OR h.player2_id = ?
            ORDER BY h.completed_at DESC
            LIMIT 10
        """, (user_id, user_id))
        
        recent_battles = []
        for row in cur.fetchall():
            battle = dict(row)
            battle['isPlayer1'] = battle['player1_id'] == user_id
            battle['won'] = battle['winner_id'] == user_id
            recent_battles.append(battle)
        
        # Get player rank
        cur.execute("""
            SELECT COUNT(*) + 1 as rank
            FROM pvp_stats
            WHERE rating > (SELECT rating FROM pvp_stats WHERE user_id = ?)
        """, (user_id,))
        
        rank_row = cur.fetchone()
        rank = rank_row['rank'] if rank_row else 0
        
        cur.close()
        conn.close()
        
        return jsonify({
            "stats": stats,
            "recentBattles": recent_battles,
            "rank": rank
        })
        
    except Exception as e:
        print(f"Error in get_stats: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

@pvp_bp.route('/leaderboard', methods=['GET'])
def get_leaderboard():
    """Get PvP leaderboard"""
    try:
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('perPage', 20))
        time_filter = request.args.get('filter', 'all')
        
        conn = get_db_connection()
        cur = conn.cursor()
        
        # Base query
        query = """
            SELECT s.*, u.first_name,
                   ROW_NUMBER() OVER (ORDER BY s.rating DESC) as rank
            FROM pvp_stats s
            JOIN users u ON s.user_id = u.user_id
        """
        
        # Add time filter if needed
        if time_filter == 'week':
            query += " WHERE s.last_battle_at >= datetime('now', '-7 days')"
        elif time_filter == 'month':
            query += " WHERE s.last_battle_at >= datetime('now', '-30 days')"
        
        # Add pagination
        query += f" ORDER BY s.rating DESC LIMIT {per_page} OFFSET {(page - 1) * per_page}"
        
        cur.execute(query)
        
        players = []
        for row in cur.fetchall():
            player = dict(row)
            players.append(player)
        
        # Get total count
        count_query = "SELECT COUNT(*) as total FROM pvp_stats"
        if time_filter == 'week':
            count_query += " WHERE last_battle_at >= datetime('now', '-7 days')"
        elif time_filter == 'month':
            count_query += " WHERE last_battle_at >= datetime('now', '-30 days')"
        
        cur.execute(count_query)
        total = cur.fetchone()['total']
        total_pages = (total + per_page - 1) // per_page
        
        cur.close()
        conn.close()
        
        return jsonify({
            "players": players,
            "totalPages": total_pages,
            "currentPage": page,
            "totalPlayers": total
        })
        
    except Exception as e:
        print(f"Error in get_leaderboard: {e}")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

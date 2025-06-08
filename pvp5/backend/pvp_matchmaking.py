import time
from typing import Dict, Optional, List

def find_match(user_id: int, rating: int, deck_power: int, cursor) -> Optional[Dict]:
    """
    Find a suitable opponent for matchmaking
    Returns opponent info or None if no match found
    """
    
    # Define matchmaking parameters
    INITIAL_RATING_RANGE = 100
    MAX_RATING_RANGE = 500
    RATING_RANGE_INCREMENT = 50
    
    INITIAL_POWER_RANGE = 200
    MAX_POWER_RANGE = 1000
    POWER_RANGE_INCREMENT = 100
    
    MAX_WAIT_TIME = 300000  # 5 minutes in milliseconds
    
    current_time = int(time.time() * 1000)
    rating_range = INITIAL_RATING_RANGE
    power_range = INITIAL_POWER_RANGE
    
    while rating_range <= MAX_RATING_RANGE:
        # Query for potential matches
        cursor.execute("""
            SELECT 
                m.user_id,
                m.rating,
                m.deck_power,
                m.queue_time,
                u.first_name
            FROM pvp_matchmaking m
            JOIN users u ON m.user_id = u.user_id
            WHERE m.status = 'waiting'
            AND m.user_id != ?
            AND ABS(m.rating - ?) <= ?
            AND ABS(m.deck_power - ?) <= ?
            AND (? - m.queue_time) < ?
            ORDER BY 
                ABS(m.rating - ?) ASC,
                m.queue_time ASC
            LIMIT 10
        """, (
            user_id,
            rating, rating_range,
            deck_power, power_range,
            current_time, MAX_WAIT_TIME,
            rating
        ))
        
        potential_matches = cursor.fetchall()
        
        if potential_matches:
            # Score each match
            best_match = None
            best_score = float('inf')
            
            for match in potential_matches:
                # Calculate match score (lower is better)
                rating_diff = abs(match['rating'] - rating)
                power_diff = abs(match['deck_power'] - deck_power)
                wait_time = (current_time - match['queue_time']) / 1000  # Convert to seconds
                
                # Weighted score calculation
                score = (
                    rating_diff * 1.0 +  # Rating is most important
                    power_diff * 0.5 +   # Deck power is secondary
                    -wait_time * 0.1     # Prefer players waiting longer
                )
                
                if score < best_score:
                    best_score = score
                    best_match = match
                    
            if best_match:
                # Get opponent's deck and items
                opponent_id = best_match['user_id']
                
                # Note: In production, you'd fetch the actual deck from where it's stored
                # For now, we'll assume it's stored in the matchmaking request
                
                return {
                    'opponent_id': opponent_id,
                    'opponent_name': best_match['first_name'],
                    'opponent_rating': best_match['rating'],
                    'opponent_deck': [],  # Would be fetched from storage
                    'opponent_tools': [],  # Would be fetched from storage
                    'opponent_spells': [],  # Would be fetched from storage
                    'match_score': best_score
                }
                
        # Expand search range
        rating_range += RATING_RANGE_INCREMENT
        power_range += POWER_RANGE_INCREMENT
        
    return None

def calculate_deck_power(creatures: List[Dict]) -> int:
    """
    Calculate the total power of a deck for matchmaking
    """
    total_power = 0
    
    for creature in creatures:
        # Base power from stats
        stats = creature.get('stats', {})
        stat_total = sum([
            stats.get('energy', 0),
            stats.get('strength', 0),
            stats.get('magic', 0),
            stats.get('stamina', 0),
            stats.get('speed', 0)
        ])
        
        # Form multiplier
        form = creature.get('form', 0)
        form_multiplier = 1 + (form * 0.3)
        
        # Rarity multiplier
        rarity = creature.get('rarity', 'Common')
        rarity_multipliers = {
            'Common': 1.0,
            'Rare': 1.3,
            'Epic': 1.6,
            'Legendary': 2.0
        }
        rarity_multiplier = rarity_multipliers.get(rarity, 1.0)
        
        # Combination level bonus
        combination_level = creature.get('combination_level', 0)
        combination_bonus = 1 + (combination_level * 0.15)
        
        # Calculate creature power
        creature_power = stat_total * form_multiplier * rarity_multiplier * combination_bonus
        total_power += int(creature_power)
        
    return total_power

def calculate_rating_change(winner_rating: int, loser_rating: int, 
                           winner_won: bool, is_forfeit: bool = False) -> int:
    """
    Calculate ELO rating change
    Returns the amount to add to winner and subtract from loser
    """
    K_FACTOR = 32  # Standard K-factor
    
    if is_forfeit:
        # Reduced rating change for forfeits
        K_FACTOR = 16
        
    # Expected scores
    expected_winner = 1 / (1 + 10 ** ((loser_rating - winner_rating) / 400))
    
    # Actual score (1 for win, 0 for loss)
    actual_winner = 1 if winner_won else 0
    
    # Rating change
    rating_change = int(K_FACTOR * (actual_winner - expected_winner))
    
    # Ensure minimum change
    if winner_won:
        rating_change = max(1, rating_change)
    else:
        rating_change = min(-1, rating_change)
        
    return abs(rating_change)

def get_rank_title(rating: int) -> str:
    """Get rank title based on rating"""
    if rating < 800:
        return "Bronze"
    elif rating < 1000:
        return "Silver"
    elif rating < 1200:
        return "Gold"
    elif rating < 1500:
        return "Platinum"
    elif rating < 1800:
        return "Diamond"
    elif rating < 2200:
        return "Master"
    else:
        return "Grandmaster"

def get_rank_color(rating: int) -> str:
    """Get rank color based on rating"""
    if rating < 800:
        return "#CD7F32"  # Bronze
    elif rating < 1000:
        return "#C0C0C0"  # Silver
    elif rating < 1200:
        return "#FFD700"  # Gold
    elif rating < 1500:
        return "#E5E4E2"  # Platinum
    elif rating < 1800:
        return "#B9F2FF"  # Diamond
    elif rating < 2200:
        return "#9966CC"  # Master
    else:
        return "#FF4500"  # Grandmaster

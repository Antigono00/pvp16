import json
import traceback
from typing import Dict, List, Tuple, Optional

class PvPBattleState:
    """Handles PvP battle state management and action processing"""
    
    def __init__(self, battle_state: Dict):
        self.state = battle_state
        self.player1 = battle_state['player1']
        self.player2 = battle_state['player2']
        self.turn = battle_state['turn']
        self.active_player_id = battle_state['activePlayer']
        self.battle_log = battle_state.get('battleLog', [])
        
    def get_state(self) -> Dict:
        """Get current battle state"""
        return self.state
        
    def get_player_state(self, player_id: int) -> Dict:
        """Get state for specific player"""
        if self.player1['id'] == player_id:
            return self.player1
        elif self.player2['id'] == player_id:
            return self.player2
        else:
            raise ValueError(f"Player {player_id} not in battle")
            
    def get_opponent_state(self, player_id: int) -> Dict:
        """Get opponent state for a player"""
        if self.player1['id'] == player_id:
            return self.player2
        elif self.player2['id'] == player_id:
            return self.player1
        else:
            raise ValueError(f"Player {player_id} not in battle")
            
    def process_action(self, player_id: int, action: Dict) -> Dict:
        """Process a player action and update state"""
        try:
            # Verify it's player's turn
            if self.active_player_id != player_id:
                return {"success": False, "error": "Not your turn"}
                
            player_state = self.get_player_state(player_id)
            opponent_state = self.get_opponent_state(player_id)
            
            action_type = action.get('type')
            
            if action_type == 'deploy':
                return self._process_deploy(player_state, action)
            elif action_type == 'attack':
                return self._process_attack(player_state, opponent_state, action)
            elif action_type == 'defend':
                return self._process_defend(player_state, action)
            elif action_type == 'useTool':
                return self._process_tool(player_state, opponent_state, action)
            elif action_type == 'useSpell':
                return self._process_spell(player_state, opponent_state, action)
            elif action_type == 'endTurn':
                return self._process_end_turn(player_id)
            else:
                return {"success": False, "error": f"Unknown action type: {action_type}"}
                
        except Exception as e:
            print(f"Error processing action: {e}")
            traceback.print_exc()
            return {"success": False, "error": str(e)}
            
    def _process_deploy(self, player_state: Dict, action: Dict) -> Dict:
        """Process creature deployment"""
        creature_id = action.get('creatureId')
        if not creature_id:
            return {"success": False, "error": "No creature ID provided"}
            
        # Find creature in hand
        creature = None
        hand_index = -1
        for i, c in enumerate(player_state['hand']):
            if c['id'] == creature_id:
                creature = c
                hand_index = i
                break
                
        if not creature:
            return {"success": False, "error": "Creature not in hand"}
            
        # Check energy cost
        energy_cost = self._calculate_energy_cost(creature)
        if player_state['energy'] < energy_cost:
            return {"success": False, "error": f"Not enough energy. Need {energy_cost}"}
            
        # Check field limit
        if len(player_state['field']) >= 4:
            return {"success": False, "error": "Field is full"}
            
        # Deploy creature
        player_state['hand'].pop(hand_index)
        player_state['field'].append(creature)
        player_state['energy'] -= energy_cost
        
        # Add to battle log
        self._add_log(f"Player deployed {creature['species_name']} (-{energy_cost} energy)")
        
        return {"success": True, "energyCost": energy_cost}
        
    def _process_attack(self, player_state: Dict, opponent_state: Dict, action: Dict) -> Dict:
        """Process attack action"""
        attacker_id = action.get('attackerId')
        target_id = action.get('targetId')
        
        if not attacker_id or not target_id:
            return {"success": False, "error": "Missing attacker or target"}
            
        # Find attacker
        attacker = None
        for c in player_state['field']:
            if c['id'] == attacker_id:
                attacker = c
                break
                
        if not attacker:
            return {"success": False, "error": "Attacker not on field"}
            
        # Find target
        target = None
        target_index = -1
        for i, c in enumerate(opponent_state['field']):
            if c['id'] == target_id:
                target = c
                target_index = i
                break
                
        if not target:
            return {"success": False, "error": "Target not on field"}
            
        # Check energy
        if player_state['energy'] < 2:
            return {"success": False, "error": "Not enough energy to attack"}
            
        # Calculate damage
        damage = self._calculate_damage(attacker, target)
        
        # Apply damage
        target['currentHealth'] -= damage
        player_state['energy'] -= 2
        
        # Check if target defeated
        if target['currentHealth'] <= 0:
            opponent_state['field'].pop(target_index)
            self._add_log(f"{attacker['species_name']} defeated {target['species_name']}!")
        else:
            self._add_log(f"{attacker['species_name']} dealt {damage} damage to {target['species_name']}")
            
        return {"success": True, "damage": damage, "targetDefeated": target['currentHealth'] <= 0}
        
    def _process_defend(self, player_state: Dict, action: Dict) -> Dict:
        """Process defend action"""
        creature_id = action.get('creatureId')
        if not creature_id:
            return {"success": False, "error": "No creature ID provided"}
            
        # Find creature
        creature = None
        for c in player_state['field']:
            if c['id'] == creature_id:
                creature = c
                break
                
        if not creature:
            return {"success": False, "error": "Creature not on field"}
            
        # Check energy
        if player_state['energy'] < 1:
            return {"success": False, "error": "Not enough energy to defend"}
            
        # Apply defend status
        creature['isDefending'] = True
        creature['defenseBonus'] = 0.5  # 50% damage reduction
        player_state['energy'] -= 1
        
        self._add_log(f"{creature['species_name']} took a defensive stance")
        
        return {"success": True}
        
    def _process_tool(self, player_state: Dict, opponent_state: Dict, action: Dict) -> Dict:
        """Process tool usage"""
        tool_id = action.get('toolId')
        target_id = action.get('targetId')
        
        if not tool_id or not target_id:
            return {"success": False, "error": "Missing tool or target"}
            
        # Find tool
        tool = None
        tool_index = -1
        for i, t in enumerate(player_state['tools']):
            if t['id'] == tool_id:
                tool = t
                tool_index = i
                break
                
        if not tool:
            return {"success": False, "error": "Tool not available"}
            
        # Find target (can be on either field)
        target = None
        is_friendly = False
        
        for c in player_state['field']:
            if c['id'] == target_id:
                target = c
                is_friendly = True
                break
                
        if not target:
            for c in opponent_state['field']:
                if c['id'] == target_id:
                    target = c
                    break
                    
        if not target:
            return {"success": False, "error": "Target not found"}
            
        # Apply tool effect
        effect = self._apply_tool_effect(tool, target)
        
        # Remove tool
        player_state['tools'].pop(tool_index)
        
        self._add_log(f"Used {tool['name']} on {target['species_name']}")
        
        return {"success": True, "effect": effect}
        
    def _process_spell(self, player_state: Dict, opponent_state: Dict, action: Dict) -> Dict:
        """Process spell usage"""
        spell_id = action.get('spellId')
        caster_id = action.get('casterId')
        target_id = action.get('targetId')
        
        if not spell_id or not caster_id:
            return {"success": False, "error": "Missing spell or caster"}
            
        # Check energy
        if player_state['energy'] < 4:
            return {"success": False, "error": "Not enough energy for spell"}
            
        # Find spell
        spell = None
        spell_index = -1
        for i, s in enumerate(player_state['spells']):
            if s['id'] == spell_id:
                spell = s
                spell_index = i
                break
                
        if not spell:
            return {"success": False, "error": "Spell not available"}
            
        # Find caster
        caster = None
        for c in player_state['field']:
            if c['id'] == caster_id:
                caster = c
                break
                
        if not caster:
            return {"success": False, "error": "Caster not on field"}
            
        # Apply spell effect
        effect = self._apply_spell_effect(spell, caster, target_id, player_state, opponent_state)
        
        # Remove spell and deduct energy
        player_state['spells'].pop(spell_index)
        player_state['energy'] -= 4
        
        self._add_log(f"{caster['species_name']} cast {spell['name']}")
        
        return {"success": True, "effect": effect}
        
    def _process_end_turn(self, player_id: int) -> Dict:
        """Process end turn"""
        # Apply end of turn effects
        player_state = self.get_player_state(player_id)
        opponent_state = self.get_opponent_state(player_id)
        
        # Reset defend status
        for creature in player_state['field']:
            if creature.get('isDefending'):
                creature['isDefending'] = False
                creature.pop('defenseBonus', None)
                
        # Process ongoing effects
        self._process_ongoing_effects(player_state)
        self._process_ongoing_effects(opponent_state)
        
        # Switch active player
        self.active_player_id = self.player2['id'] if self.active_player_id == self.player1['id'] else self.player1['id']
        
        # Increment turn if switching back to player 1
        if self.active_player_id == self.player1['id']:
            self.turn += 1
            
        # Regenerate energy
        player_state['energy'] = min(25, player_state['energy'] + 3)
        opponent_state['energy'] = min(25, opponent_state['energy'] + 3)
        
        # Draw cards
        if len(player_state['deck']) > 0 and len(player_state['hand']) < 5:
            player_state['hand'].append(player_state['deck'].pop(0))
            
        self._add_log(f"Turn {self.turn} - Player {self.active_player_id}'s turn")
        
        # Update state
        self.state['turn'] = self.turn
        self.state['activePlayer'] = self.active_player_id
        
        return {"success": True, "newTurn": self.turn, "activePlayer": self.active_player_id}
        
    def check_battle_end(self) -> Tuple[bool, Optional[int]]:
        """Check if battle has ended and return (is_ended, winner_id)"""
        # Check if either player has no creatures left
        player1_defeated = (
            len(self.player1['field']) == 0 and 
            len(self.player1['hand']) == 0 and 
            len(self.player1['deck']) == 0
        )
        
        player2_defeated = (
            len(self.player2['field']) == 0 and 
            len(self.player2['hand']) == 0 and 
            len(self.player2['deck']) == 0
        )
        
        if player1_defeated and player2_defeated:
            # Draw - both defeated
            return True, None
        elif player1_defeated:
            return True, self.player2['id']
        elif player2_defeated:
            return True, self.player1['id']
        else:
            return False, None
            
    def _calculate_energy_cost(self, creature: Dict) -> int:
        """Calculate energy cost for creature deployment"""
        form = creature.get('form', 0)
        return 5 + int(form)  # Form 0=5, Form 1=6, Form 2=7, Form 3=8
        
    def _calculate_damage(self, attacker: Dict, defender: Dict) -> int:
        """Calculate attack damage"""
        # Simplified damage calculation
        attack_stat = max(
            attacker.get('battleStats', {}).get('physicalAttack', 10),
            attacker.get('battleStats', {}).get('magicalAttack', 10)
        )
        
        defense_stat = max(
            defender.get('battleStats', {}).get('physicalDefense', 5),
            defender.get('battleStats', {}).get('magicalDefense', 5)
        )
        
        # Base damage
        damage = max(1, attack_stat - defense_stat // 2)
        
        # Apply defense bonus if defending
        if defender.get('isDefending'):
            damage = int(damage * (1 - defender.get('defenseBonus', 0)))
            
        return max(1, damage)
        
    def _apply_tool_effect(self, tool: Dict, target: Dict) -> Dict:
        """Apply tool effect to target"""
        effect = {}
        tool_type = tool.get('tool_type', '')
        tool_effect = tool.get('tool_effect', '')
        
        if tool_effect == 'Shield':
            target['battleStats']['physicalDefense'] += 10
            target['battleStats']['magicalDefense'] += 10
            effect['defenseBoost'] = 10
        elif tool_effect == 'Surge':
            target['battleStats']['physicalAttack'] += 15
            target['battleStats']['magicalAttack'] += 15
            effect['attackBoost'] = 15
        elif tool_type == 'stamina':
            heal_amount = min(30, target['battleStats']['maxHealth'] - target['currentHealth'])
            target['currentHealth'] += heal_amount
            effect['healing'] = heal_amount
            
        return effect
        
    def _apply_spell_effect(self, spell: Dict, caster: Dict, target_id: Optional[str], 
                          player_state: Dict, opponent_state: Dict) -> Dict:
        """Apply spell effect"""
        effect = {}
        spell_type = spell.get('spell_type', '')
        spell_effect = spell.get('spell_effect', '')
        
        # Find target if specified
        target = None
        if target_id:
            for c in player_state['field'] + opponent_state['field']:
                if c['id'] == target_id:
                    target = c
                    break
                    
        if spell_effect == 'Surge' and target:
            # Damage spell
            magic_power = caster.get('stats', {}).get('magic', 5)
            damage = 20 + magic_power * 2
            target['currentHealth'] -= damage
            effect['damage'] = damage
        elif spell_type == 'energy':
            # AOE effect
            damage = 15
            for c in opponent_state['field']:
                c['currentHealth'] -= damage
            effect['aoeDamage'] = damage
            
        return effect
        
    def _process_ongoing_effects(self, player_state: Dict):
        """Process ongoing effects for a player"""
        for creature in player_state['field']:
            # Process active effects
            if 'activeEffects' in creature:
                remaining_effects = []
                for effect in creature['activeEffects']:
                    effect['duration'] -= 1
                    if effect['duration'] > 0:
                        remaining_effects.append(effect)
                creature['activeEffects'] = remaining_effects
                
    def _add_log(self, message: str):
        """Add message to battle log"""
        self.battle_log.append({
            'id': len(self.battle_log) + 1,
            'turn': self.turn,
            'message': message
        })
        self.state['battleLog'] = self.battle_log

def compress_battle_state(state):
    """Compress battle state for storage"""
    import gzip
    import base64
    json_str = json.dumps(state)
    compressed = gzip.compress(json_str.encode('utf-8'))
    return base64.b64encode(compressed).decode('utf-8')

def decompress_battle_state(compressed_state):
    """Decompress battle state from storage"""
    import gzip
    import base64
    try:
        compressed = base64.b64decode(compressed_state.encode('utf-8'))
        json_str = gzip.decompress(compressed).decode('utf-8')
        return json.loads(json_str)
    except:
        # Fallback for uncompressed states
        return json.loads(compressed_state)

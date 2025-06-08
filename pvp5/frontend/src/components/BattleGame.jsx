// src/components/BattleGame.jsx - ENHANCED VERSION WITH TEAM SELECTION
import React, { useState, useEffect, useContext, useCallback, useReducer, useRef } from 'react';
import { GameContext } from '../context/GameContext';
import { useRadixConnect } from '../context/RadixConnectContext';
import Battlefield from './battle/Battlefield';
import PlayerHand from './battle/PlayerHand';
import ActionPanel from './battle/ActionPanel';
import BattleLog from './battle/BattleLog';
import BattleHeader from './battle/BattleHeader';
import DifficultySelector from './battle/DifficultySelector';
import TeamSelector from './battle/TeamSelector';
import BattleResult from './battle/BattleResult';
import { calculateDerivedStats } from '../utils/battleCalculations';
import { determineAIAction, determineAIStrategy } from '../utils/battleAI';
import { 
  processAttack, 
  applyTool, 
  applySpell, 
  defendCreature,
  applyFieldSynergies,
  createSynergyEffectData,
  processEnergyMomentum,
  getActionEfficiency,
  updateChargeEffects,
  checkFieldSynergies
} from '../utils/battleCore';
import { generateEnemyCreatures, getDifficultySettings, generateEnemyItems } from '../utils/difficultySettings';
import { processTimedEffect } from '../utils/itemEffects';

// Import enhanced animation utilities
import {
  animateAttack,
  animateDefend,
  animateSpell,
  animateTool,
  animateTurnTransition,
  showAIThinking,
  showDamageNumber,
  showBlockEffect,
  showComboIndicator,
  generateComboBurst,
  screenFlash,
  shakeScreen,
  generateParticles,
  getCreatureElementWithRetry,
  waitForElement,
  animateStatusEffect,
  animateEnergyRegen,
  animateSynergyActivation,
  ANIMATION_DURATIONS
} from '../utils/battleAnimations';

// Import animation CSS
import '../BattleAnimations.css';

// Browser detection utility for targeted fixes
const getBrowserInfo = () => {
  const userAgent = navigator.userAgent;
  let browserName = "unknown";
  
  if (userAgent.match(/chrome|chromium|crios/i)) {
    browserName = "chrome";
  } else if (userAgent.match(/firefox|fxios/i)) {
    browserName = "firefox";
  } else if (userAgent.match(/safari/i) && !userAgent.match(/chrome|chromium|crios/i)) {
    browserName = "safari";
  } else if (userAgent.match(/edg/i)) {
    browserName = "edge";
  }
  
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
  
  return {
    browser: browserName,
    isMobile: isMobile
  };
};

// BALANCED CONSTANTS for strategic gameplay
const ATTACK_ENERGY_COST = 2;           
const DEFEND_ENERGY_COST = 1;           
const BASE_ENERGY_REGEN = 3;            
const SPELL_ENERGY_COST = 4;            
const TOOL_ENERGY_COST = 0;             
const MAX_ENERGY = 25;                  
const ENERGY_DECAY_RATE = 0.1;          

// Action types for our reducer
const ACTIONS = {
  SET_DIFFICULTY: 'SET_DIFFICULTY',
  SET_TEAM: 'SET_TEAM',
  START_BATTLE: 'START_BATTLE',
  DEPLOY_CREATURE: 'DEPLOY_CREATURE',
  ENEMY_DEPLOY_CREATURE: 'ENEMY_DEPLOY_CREATURE',
  UPDATE_CREATURE: 'UPDATE_CREATURE',
  ATTACK: 'ATTACK',
  USE_TOOL: 'USE_TOOL',
  USE_SPELL: 'USE_SPELL',
  DEFEND: 'DEFEND',
  DRAW_CARD: 'DRAW_CARD',
  REGENERATE_ENERGY: 'REGENERATE_ENERGY',
  APPLY_ENERGY_DECAY: 'APPLY_ENERGY_DECAY',
  SET_ACTIVE_PLAYER: 'SET_ACTIVE_PLAYER',
  INCREMENT_TURN: 'INCREMENT_TURN',
  SET_GAME_STATE: 'SET_GAME_STATE',
  APPLY_ONGOING_EFFECTS: 'APPLY_ONGOING_EFFECTS',
  ADD_LOG: 'ADD_LOG',
  SPEND_ENERGY: 'SPEND_ENERGY',
  EXECUTE_AI_ACTION: 'EXECUTE_AI_ACTION',
  EXECUTE_AI_ACTION_SEQUENCE: 'EXECUTE_AI_ACTION_SEQUENCE',
  COMBO_BONUS: 'COMBO_BONUS',
  SET_ENEMY_ENERGY: 'SET_ENEMY_ENERGY',
  
  // New action types for animation states
  SET_ANIMATION_IN_PROGRESS: 'SET_ANIMATION_IN_PROGRESS',
  QUEUE_ANIMATION: 'QUEUE_ANIMATION',
  DEQUEUE_ANIMATION: 'DEQUEUE_ANIMATION',
  
  // New action types for synergies and momentum
  APPLY_SYNERGIES: 'APPLY_SYNERGIES',
  UPDATE_ENERGY_MOMENTUM: 'UPDATE_ENERGY_MOMENTUM',
  SHOW_AI_STRATEGY: 'SHOW_AI_STRATEGY',
  UPDATE_CHARGE_EFFECTS: 'UPDATE_CHARGE_EFFECTS',
};

// FIXED: Calculate energy cost for a creature
const calculateCreatureEnergyCost = (creature) => {
  let energyCost = 5;
  
  if (creature.form !== undefined && creature.form !== null) {
    energyCost += parseInt(creature.form) || 0;
  }
  
  return energyCost;
};

// ENHANCED Battle state reducer with team selection and better energy management
const battleReducer = (state, action) => {
  switch (action.type) {
    case ACTIONS.SET_DIFFICULTY:
      return {
        ...state,
        difficulty: action.difficulty
      };
      
    case ACTIONS.SET_TEAM:
      return {
        ...state,
        selectedTeam: action.team,
        gameState: 'battle'
      };
      
    case ACTIONS.START_BATTLE:
      return {
        ...state,
        gameState: 'battle',
        playerDeck: action.playerDeck,
        playerHand: action.playerHand,
        playerField: [],
        enemyDeck: action.enemyDeck,
        enemyHand: action.enemyHand,
        enemyField: [],
        playerEnergy: action.playerStartingEnergy || 10,
        enemyEnergy: action.enemyStartingEnergy || 10,       
        turn: 1,
        activePlayer: 'player',
        battleLog: [{
          id: Date.now(),
          turn: 1,
          message: `Battle started! Difficulty: ${action.difficulty.charAt(0).toUpperCase() + action.difficulty.slice(1)} - Enemy starts with ${action.enemyStartingEnergy || 10} energy!`
        }],
        playerTools: action.playerTools,
        playerSpells: action.playerSpells,
        enemyTools: action.enemyTools || [],
        enemySpells: action.enemySpells || [],
        difficulty: action.difficulty,
        consecutiveActions: { player: 0, enemy: 0 },
        energyMomentum: { player: 0, enemy: 0 },
        // Initialize animation state
        animationInProgress: false,
        animationQueue: [],
        lastAttack: null,
        lastSpellCast: null,
        lastToolUse: null,
        lastDefend: null,
        // Initialize synergy and momentum state
        activeSynergies: [],
        energyMomentumDetails: { player: null, enemy: null },
        currentAIStrategy: null,
      };
    
    case ACTIONS.DEPLOY_CREATURE:
      console.log("=== DEPLOY_CREATURE ACTION ===");
      console.log("Creature being deployed:", action.creature);
      console.log("Creature form:", action.creature.form);
      console.log("Creature battleStats:", action.creature.battleStats);
      console.log("Energy cost from action:", action.energyCost);
      console.log("Energy cost from battleStats:", action.creature.battleStats?.energyCost);
      
      const formLevel = parseInt(action.creature.form) || 0;
      const correctCost = 5 + formLevel;
      const deployEnergyCost = action.energyCost || action.creature.battleStats?.energyCost || correctCost;
      console.log("Final deploy energy cost:", deployEnergyCost);
      
      if (state.playerEnergy < deployEnergyCost) {
        console.error("Not enough energy to deploy creature");
        return state;
      }
      
      const newPlayerField = [...state.playerField, action.creature];
      
      // FIXED: Apply synergies after deployment
      const playerSynergies = checkFieldSynergies(newPlayerField);
      const synergizedPlayerField = applyFieldSynergies(newPlayerField);
      
      return {
        ...state,
        playerHand: state.playerHand.filter(c => c.id !== action.creature.id),
        playerField: synergizedPlayerField,
        playerEnergy: Math.max(0, state.playerEnergy - deployEnergyCost),
        consecutiveActions: { ...state.consecutiveActions, player: state.consecutiveActions.player + 1 },
        energyMomentum: { ...state.energyMomentum, player: state.energyMomentum.player + deployEnergyCost },
        activeSynergies: playerSynergies
      };
    
    case ACTIONS.ENEMY_DEPLOY_CREATURE:
      console.log(`REDUCER: Deploying enemy creature ${action.creature.species_name} to field`);
      
      const enemyDeployCost = action.energyCost || action.creature.battleStats.energyCost || 3;
      
      if (state.enemyEnergy < enemyDeployCost) {
        console.error("Enemy doesn't have enough energy to deploy");
        return state;
      }
      
      if (state.enemyField.some(c => c.id === action.creature.id)) {
        console.error("Creature already deployed!");
        return state;
      }
      
      const newEnemyFieldDeploy = [...state.enemyField, action.creature];
      
      // FIXED: Apply enemy synergies
      const enemySynergies = checkFieldSynergies(newEnemyFieldDeploy);
      const synergizedEnemyField = applyFieldSynergies(newEnemyFieldDeploy);
      
      return {
        ...state,
        enemyHand: state.enemyHand.filter(c => c.id !== action.creature.id),
        enemyField: synergizedEnemyField,
        enemyEnergy: Math.max(0, state.enemyEnergy - enemyDeployCost),
        consecutiveActions: { ...state.consecutiveActions, enemy: state.consecutiveActions.enemy + 1 },
        energyMomentum: { ...state.energyMomentum, enemy: state.energyMomentum.enemy + enemyDeployCost }
      };
    
    case ACTIONS.UPDATE_CREATURE:
      if (action.isPlayer) {
        return {
          ...state,
          playerField: state.playerField.map(c => 
            c.id === action.creature.id ? action.creature : c
          )
        };
      } else {
        return {
          ...state,
          enemyField: state.enemyField.map(c => 
            c.id === action.creature.id ? action.creature : c
          )
        };
      }
    
    case ACTIONS.ATTACK:
      const { attackResult } = action;
      const isPlayerAttacker = state.playerField.some(c => c.id === attackResult.updatedAttacker.id);
      const isPlayerDefender = state.playerField.some(c => c.id === attackResult.updatedDefender.id);
      
      // Extract damage from attackResult with multiple fallbacks
      let attackDamage = attackResult.damage ?? 
                          attackResult.finalDamage ?? 
                          attackResult.totalDamage ??
                          attackResult.damageDealt ??
                          null;
      
      // If no damage property found, try to find it from the action
      if (attackDamage === null && action.attackResult && action.attackResult.damage !== undefined) {
        attackDamage = action.attackResult.damage;
      }
      
      // Final fallback to 0
      if (attackDamage === null || attackDamage === undefined) {
        attackDamage = 0;
      }
      
      console.log('REDUCER: Attack damage extracted:', attackDamage, 'from result:', attackResult);
      
      let comboMultiplier = 1.0;
      if (isPlayerAttacker && state.consecutiveActions.player > 1) {
        comboMultiplier = 1 + (state.consecutiveActions.player * 0.05);
      } else if (!isPlayerAttacker && state.consecutiveActions.enemy > 1) {
        comboMultiplier = 1 + (state.consecutiveActions.enemy * 0.05);
      }
      
      if (isPlayerAttacker && state.playerEnergy < action.energyCost) {
        console.error("Not enough energy for attack");
        return state;
      }
      if (!isPlayerAttacker && state.enemyEnergy < action.energyCost) {
        console.error("Enemy doesn't have enough energy for attack");
        return state;
      }
      
      const updatedPlayerEnergy = isPlayerAttacker 
        ? Math.max(0, state.playerEnergy - action.energyCost)
        : state.playerEnergy;
        
      const updatedEnemyEnergy = !isPlayerAttacker 
        ? Math.max(0, state.enemyEnergy - action.energyCost)
        : state.enemyEnergy;
      
      // FIXED: Remove defeated creatures and reapply synergies
      const updatedPlayerFieldAfterAttack = state.playerField.map(c => {
        if (isPlayerAttacker && c.id === attackResult.updatedAttacker.id) {
          return attackResult.updatedAttacker;
        }
        if (isPlayerDefender && c.id === attackResult.updatedDefender.id) {
          return attackResult.updatedDefender;
        }
        return c;
      }).filter(c => c.currentHealth > 0);
      
      const updatedEnemyFieldAfterAttack = state.enemyField.map(c => {
        if (!isPlayerAttacker && c.id === attackResult.updatedAttacker.id) {
          return attackResult.updatedAttacker;
        }
        if (!isPlayerDefender && c.id === attackResult.updatedDefender.id) {
          return attackResult.updatedDefender;
        }
        return c;
      }).filter(c => c.currentHealth > 0);
      
      // Reapply synergies if field changed
      const resynergizedPlayerField = applyFieldSynergies(updatedPlayerFieldAfterAttack);
      const resynergizedEnemyField = applyFieldSynergies(updatedEnemyFieldAfterAttack);
      const newActiveSynergies = checkFieldSynergies(resynergizedPlayerField);
      
      return {
        ...state,
        playerEnergy: updatedPlayerEnergy,
        enemyEnergy: updatedEnemyEnergy,
        playerField: resynergizedPlayerField,
        enemyField: resynergizedEnemyField,
        activeSynergies: newActiveSynergies,
        consecutiveActions: isPlayerAttacker 
          ? { ...state.consecutiveActions, player: state.consecutiveActions.player + 1 }
          : { ...state.consecutiveActions, enemy: state.consecutiveActions.enemy + 1 },
        energyMomentum: isPlayerAttacker
          ? { ...state.energyMomentum, player: state.energyMomentum.player + action.energyCost }
          : { ...state.energyMomentum, enemy: state.energyMomentum.enemy + action.energyCost },
        // Track the last attack for animation with the correct damage value
        lastAttack: {
          attackerId: attackResult.updatedAttacker.id,
          targetId: attackResult.updatedDefender.id,
          damage: attackDamage,
          isCritical: attackResult.isCritical || false,
          attackType: attackResult.attackType || 'physical',
          isBlocked: attackResult.isBlocked || false,
          damageType: attackResult.damageResult?.damageType || 'normal'
        }
      };
    
    case ACTIONS.USE_TOOL:
      const isPlayerToolTarget = state.playerField.some(c => c.id === action.result.updatedCreature.id);
      
      if (!action.result || !action.result.updatedCreature) {
        console.error("Invalid tool result:", action.result);
        return state;
      }
      
      return {
        ...state,
        playerField: isPlayerToolTarget
          ? state.playerField.map(c => c.id === action.result.updatedCreature.id ? action.result.updatedCreature : c)
          : state.playerField,
        enemyField: !isPlayerToolTarget
          ? state.enemyField.map(c => c.id === action.result.updatedCreature.id ? action.result.updatedCreature : c)
          : state.enemyField,
        playerTools: action.isPlayerTool ? state.playerTools.filter(t => t.id !== action.tool.id) : state.playerTools,
        enemyTools: action.isEnemyTool ? state.enemyTools.filter(t => t.id !== action.tool.id) : state.enemyTools,
        consecutiveActions: action.isPlayerTool
          ? { ...state.consecutiveActions, player: state.consecutiveActions.player + 1 }
          : { ...state.consecutiveActions, enemy: state.consecutiveActions.enemy + 1 },
        // Add animation tracking for tools
        lastToolUse: {
          toolId: action.tool.id,
          targetId: action.result.updatedCreature.id,
          tool: action.tool
        }
      };
    
    case ACTIONS.USE_SPELL:
      const { spellResult, spell } = action;
      
      if (!spellResult || !spellResult.updatedCaster || !spellResult.updatedTarget) {
        console.error("Invalid spell result:", spellResult);
        return state;
      }
      
      const isPlayerCaster = state.playerField.some(c => c.id === spellResult.updatedCaster.id);
      const isPlayerTarget = state.playerField.some(c => c.id === spellResult.updatedTarget.id);
      
      if (isPlayerCaster && state.playerEnergy < (action.energyCost || SPELL_ENERGY_COST)) {
        console.error("Not enough energy for spell");
        return state;
      }
      if (!isPlayerCaster && state.enemyEnergy < (action.energyCost || SPELL_ENERGY_COST)) {
        console.error("Enemy doesn't have enough energy for spell");
        return state;
      }
      
      return {
        ...state,
        playerField: state.playerField.map(c => {
          if (isPlayerCaster && c.id === spellResult.updatedCaster.id) {
            return spellResult.updatedCaster;
          }
          if (isPlayerTarget && c.id === spellResult.updatedTarget.id) {
            return spellResult.updatedTarget;
          }
          return c;
        }).filter(c => c.currentHealth > 0),
        enemyField: state.enemyField.map(c => {
          if (!isPlayerCaster && c.id === spellResult.updatedCaster.id) {
            return spellResult.updatedCaster;
          }
          if (!isPlayerTarget && c.id === spellResult.updatedTarget.id) {
            return spellResult.updatedTarget;
          }
          return c;
        }).filter(c => c.currentHealth > 0),
        playerEnergy: isPlayerCaster ? Math.max(0, state.playerEnergy - (action.energyCost || SPELL_ENERGY_COST)) : state.playerEnergy,
        enemyEnergy: !isPlayerCaster ? Math.max(0, state.enemyEnergy - (action.energyCost || SPELL_ENERGY_COST)) : state.enemyEnergy,
        playerSpells: isPlayerCaster ? state.playerSpells.filter(s => s.id !== spell.id) : state.playerSpells,
        enemySpells: action.isEnemySpell ? state.enemySpells.filter(s => s.id !== spell.id) : state.enemySpells,
        consecutiveActions: isPlayerCaster
          ? { ...state.consecutiveActions, player: state.consecutiveActions.player + 1 }
          : { ...state.consecutiveActions, enemy: state.consecutiveActions.enemy + 1 },
        energyMomentum: isPlayerCaster
          ? { ...state.energyMomentum, player: state.energyMomentum.player + (action.energyCost || SPELL_ENERGY_COST) }
          : { ...state.energyMomentum, enemy: state.energyMomentum.enemy + (action.energyCost || SPELL_ENERGY_COST) },
        // Add animation tracking for spells
        lastSpellCast: {
          spellId: action.spell.id,
          casterId: spellResult.updatedCaster.id,
          targetId: spellResult.updatedTarget.id,
          spell: action.spell,
          damage: spellResult.spellEffect?.damage || spellResult.spellEffect?.healing || 0
        }
      };
    
    case ACTIONS.DEFEND:
      const isPlayerDefending = state.playerField.some(c => c.id === action.updatedCreature.id);
      
      if (isPlayerDefending && state.playerEnergy < DEFEND_ENERGY_COST) {
        console.error("Not enough energy to defend");
        return state;
      }
      if (!isPlayerDefending && state.enemyEnergy < DEFEND_ENERGY_COST) {
        console.error("Enemy doesn't have enough energy to defend");
        return state;
      }
      
      const playerEnergyAfterDefend = isPlayerDefending 
        ? Math.max(0, state.playerEnergy - DEFEND_ENERGY_COST)
        : state.playerEnergy;
        
      const enemyEnergyAfterDefend = !isPlayerDefending 
        ? Math.max(0, state.enemyEnergy - DEFEND_ENERGY_COST)
        : state.enemyEnergy;
      
      return {
        ...state,
        playerEnergy: playerEnergyAfterDefend,
        enemyEnergy: enemyEnergyAfterDefend,
        playerField: isPlayerDefending
          ? state.playerField.map(c => c.id === action.updatedCreature.id ? action.updatedCreature : c)
          : state.playerField,
        enemyField: !isPlayerDefending
          ? state.enemyField.map(c => c.id === action.updatedCreature.id ? action.updatedCreature : c)
          : state.enemyField,
        consecutiveActions: isPlayerDefending
          ? { ...state.consecutiveActions, player: state.consecutiveActions.player + 1 }
          : { ...state.consecutiveActions, enemy: state.consecutiveActions.enemy + 1 },
        // Add animation tracking for defend
        lastDefend: {
          defenderId: action.updatedCreature.id
        }
      };
    
    case ACTIONS.SPEND_ENERGY:
      if (action.player === 'player') {
        return {
          ...state,
          playerEnergy: Math.max(0, state.playerEnergy - action.amount)
        };
      } else {
        return {
          ...state,
          enemyEnergy: Math.max(0, state.enemyEnergy - action.amount)
        };
      }
    
    case ACTIONS.SET_ENEMY_ENERGY:
      return {
        ...state,
        enemyEnergy: action.energy
      };
    
    case ACTIONS.DRAW_CARD:
      if (action.player === 'player') {
        if (state.playerDeck.length === 0) return state;
        const drawnCard = state.playerDeck[0];
        return {
          ...state,
          playerHand: [...state.playerHand, drawnCard],
          playerDeck: state.playerDeck.slice(1)
        };
      } else {
        if (state.enemyDeck.length === 0) return state;
        const drawnCard = state.enemyDeck[0];
        return {
          ...state,
          enemyHand: [...state.enemyHand, drawnCard],
          enemyDeck: state.enemyDeck.slice(1)
        };
      }
    
    case ACTIONS.REGENERATE_ENERGY:
      // FIXED: Apply energy momentum bonuses
      const playerMomentumData = processEnergyMomentum(state.energyMomentum.player);
      const enemyMomentumData = processEnergyMomentum(state.energyMomentum.enemy);
      
      return {
        ...state,
        playerEnergy: Math.min(MAX_ENERGY, state.playerEnergy + action.playerRegen + playerMomentumData.bonusRegen),
        enemyEnergy: Math.min(MAX_ENERGY, state.enemyEnergy + action.enemyRegen + enemyMomentumData.bonusRegen),
        energyMomentum: { player: 0, enemy: 0 }, // Reset momentum after applying
        energyMomentumDetails: { 
          player: playerMomentumData, 
          enemy: enemyMomentumData 
        }
      };
    
    case ACTIONS.APPLY_ENERGY_DECAY:
      const playerDecay = Math.floor(state.playerEnergy * ENERGY_DECAY_RATE);
      const enemyDecay = Math.floor(state.enemyEnergy * ENERGY_DECAY_RATE);
      
      return {
        ...state,
        playerEnergy: Math.max(0, state.playerEnergy - playerDecay),
        enemyEnergy: Math.max(0, state.enemyEnergy - enemyDecay)
      };
    
    case ACTIONS.SET_ACTIVE_PLAYER:
      return {
        ...state,
        activePlayer: action.player,
        consecutiveActions: { player: 0, enemy: 0 }
      };
    
    case ACTIONS.INCREMENT_TURN:
      return {
        ...state,
        turn: state.turn + 1
      };
    
    case ACTIONS.SET_GAME_STATE:
      return {
        ...state,
        gameState: action.gameState
      };
    
    case ACTIONS.APPLY_ONGOING_EFFECTS: {
      const processedPlayerField = state.playerField.map(creature => {
        let updatedCreature = { ...creature };
        
        // Pass current turn to applyOngoingEffects
        updatedCreature.currentTurn = state.turn;
        
        const activeEffects = updatedCreature.activeEffects || [];
        if (activeEffects.length > 0) {
          const remainingEffects = [];
          let effectLog = [];
          
          activeEffects.forEach(effect => {
            if (!effect) return;
            
            // Use processTimedEffect for special effects
            const processedEffect = processTimedEffect(effect, state.turn, effect.startTurn || 0);
            
            // Apply stat modifications
            if (processedEffect.statModifications) {
              Object.entries(processedEffect.statModifications).forEach(([stat, value]) => {
                if (updatedCreature.battleStats[stat] !== undefined) {
                  updatedCreature.battleStats[stat] += value;
                }
              });
            }
            
            // Apply health over time
            if (processedEffect.healthOverTime !== undefined && processedEffect.healthOverTime !== 0) {
              const previousHealth = updatedCreature.currentHealth;
              updatedCreature.currentHealth = Math.min(
                updatedCreature.battleStats.maxHealth,
                Math.max(0, updatedCreature.currentHealth + processedEffect.healthOverTime)
              );
              
              const healthChange = updatedCreature.currentHealth - previousHealth;
              if (healthChange !== 0) {
                const changeType = healthChange > 0 ? 'healed' : 'damaged';
                const amount = Math.abs(healthChange);
                effectLog.push(`${updatedCreature.species_name} ${changeType} for ${amount} from ${effect.name}`);
              }
            }
            
            // Handle charge effect completion
            if (effect.effectType === 'Charge' && effect.chargeEffect) {
              const turnsActive = state.turn - (effect.startTurn || 0);
              if (turnsActive >= (effect.chargeEffect.maxTurns || 3)) {
                updatedCreature.nextAttackBonus = (updatedCreature.nextAttackBonus || 0) + effect.chargeEffect.finalBurst;
                effectLog.push(`${updatedCreature.species_name}'s charge is complete! Next attack +${effect.chargeEffect.finalBurst} damage!`);
                // Don't add to remaining effects
                return;
              }
            }
            
            const updatedEffect = { ...processedEffect, duration: effect.duration - 1 };
            
            if (updatedEffect.duration > 0) {
              remainingEffects.push(updatedEffect);
            } else {
              effectLog.push(`${effect.name} effect has expired on ${updatedCreature.species_name}`);
            }
          });
          
          updatedCreature.activeEffects = remainingEffects;
          
          if (effectLog.length > 0 && action.addLog) {
            action.addLog(effectLog.join('. '));
          }
        }
        
        if (updatedCreature.isDefending) {
          updatedCreature.isDefending = false;
        }
        
        return updatedCreature;
      });
      
      // Same logic for enemy field
      const processedEnemyField = state.enemyField.map(creature => {
        let updatedCreature = { ...creature };
        updatedCreature.currentTurn = state.turn;
        
        const activeEffects = updatedCreature.activeEffects || [];
        if (activeEffects.length > 0) {
          const remainingEffects = [];
          let effectLog = [];
          
          activeEffects.forEach(effect => {
            if (!effect) return;
            
            // Use processTimedEffect for special effects
            const processedEffect = processTimedEffect(effect, state.turn, effect.startTurn || 0);
            
            // Apply stat modifications
            if (processedEffect.statModifications) {
              Object.entries(processedEffect.statModifications).forEach(([stat, value]) => {
                if (updatedCreature.battleStats[stat] !== undefined) {
                  updatedCreature.battleStats[stat] += value;
                }
              });
            }
            
            // Apply health over time
            if (processedEffect.healthOverTime !== undefined && processedEffect.healthOverTime !== 0) {
              const previousHealth = updatedCreature.currentHealth;
              updatedCreature.currentHealth = Math.min(
                updatedCreature.battleStats.maxHealth,
                Math.max(0, updatedCreature.currentHealth + processedEffect.healthOverTime)
              );
              
              const healthChange = updatedCreature.currentHealth - previousHealth;
              if (healthChange !== 0) {
                const changeType = healthChange > 0 ? 'healed' : 'damaged';
                const amount = Math.abs(healthChange);
                effectLog.push(`Enemy ${updatedCreature.species_name} ${changeType} for ${amount} from ${effect.name}`);
              }
            }
            
            // Handle charge effect completion
            if (effect.effectType === 'Charge' && effect.chargeEffect) {
              const turnsActive = state.turn - (effect.startTurn || 0);
              if (turnsActive >= (effect.chargeEffect.maxTurns || 3)) {
                updatedCreature.nextAttackBonus = (updatedCreature.nextAttackBonus || 0) + effect.chargeEffect.finalBurst;
                effectLog.push(`Enemy ${updatedCreature.species_name}'s charge is complete! Next attack +${effect.chargeEffect.finalBurst} damage!`);
                // Don't add to remaining effects
                return;
              }
            }
            
            const updatedEffect = { ...processedEffect, duration: effect.duration - 1 };
            
            if (updatedEffect.duration > 0) {
              remainingEffects.push(updatedEffect);
            } else {
              effectLog.push(`${effect.name} effect has expired on Enemy ${updatedCreature.species_name}`);
            }
          });
          
          updatedCreature.activeEffects = remainingEffects;
          
          if (effectLog.length > 0 && action.addLog) {
            action.addLog(effectLog.join('. '));
          }
        }
        
        if (updatedCreature.isDefending) {
          updatedCreature.isDefending = false;
        }
        
        return updatedCreature;
      });
      
      const updatedPlayerField = action.updatedPlayerField || 
        processedPlayerField.filter(c => c.currentHealth > 0);
      
      const updatedEnemyField = action.updatedEnemyField || 
        processedEnemyField.filter(c => c.currentHealth > 0);
      
      return {
        ...state,
        playerField: updatedPlayerField,
        enemyField: updatedEnemyField
      };
    }
    
    case ACTIONS.ADD_LOG:
      return {
        ...state,
        battleLog: [...state.battleLog, {
          id: Date.now() + Math.random(),
          turn: state.turn,
          message: action.message
        }]
      };
    
    case ACTIONS.EXECUTE_AI_ACTION:
      const { aiAction } = action;
      let updatedState = { ...state };
      
      switch (aiAction.type) {
        case 'deploy':
          if (aiAction.creature) {
            const deployCost = aiAction.energyCost || 3;
            if (updatedState.enemyEnergy < deployCost) {
              console.error("AI tried to deploy without enough energy");
              break;
            }
            if (updatedState.enemyField.some(c => c.id === aiAction.creature.id)) {
              console.error("AI tried to deploy duplicate creature");
              break;
            }
            
            updatedState.enemyHand = updatedState.enemyHand.filter(c => c.id !== aiAction.creature.id);
            updatedState.enemyField = [...updatedState.enemyField, aiAction.creature];
            updatedState.enemyEnergy = Math.max(0, updatedState.enemyEnergy - deployCost);
            updatedState.consecutiveActions.enemy += 1;
            updatedState.energyMomentum.enemy += deployCost;
          }
          break;
          
        case 'attack':
          if (aiAction.attacker && aiAction.target) {
            const attackCost = aiAction.energyCost || 2;
            if (updatedState.enemyEnergy < attackCost) {
              console.error("AI tried to attack without enough energy");
              break;
            }
            
            const attackResult = processAttack(aiAction.attacker, aiAction.target);
            
            // Extract damage from attackResult with multiple fallbacks
            let actualDamage = attackResult.damage ?? 
                                attackResult.finalDamage ?? 
                                attackResult.totalDamage ??
                                attackResult.damageDealt ??
                                null;
            
            // If no damage property found, calculate it from health difference
            if (actualDamage === null && attackResult.updatedDefender && aiAction.target) {
              const healthBefore = aiAction.target.currentHealth || 0;
              const healthAfter = attackResult.updatedDefender.currentHealth || 0;
              actualDamage = Math.max(0, healthBefore - healthAfter);
              console.log('EXECUTE_AI_ACTION: Calculated damage from health difference:', healthBefore, '-', healthAfter, '=', actualDamage);
            }
            
            // Final fallback to 0
            if (actualDamage === null || actualDamage === undefined) {
              actualDamage = 0;
            }
            
            console.log('EXECUTE_AI_ACTION: Attack damage extracted:', actualDamage);
            
            updatedState.enemyEnergy = Math.max(0, updatedState.enemyEnergy - attackCost);
            updatedState.consecutiveActions.enemy += 1;
            updatedState.energyMomentum.enemy += attackCost;
            
            updatedState.playerField = updatedState.playerField.map(c => 
              c.id === attackResult.updatedDefender.id ? attackResult.updatedDefender : c
            ).filter(c => c.currentHealth > 0);
            
            updatedState.enemyField = updatedState.enemyField.map(c => 
              c.id === attackResult.updatedAttacker.id ? attackResult.updatedAttacker : c
            );
            
            // Track last attack for animations with correct damage
            updatedState.lastAttack = {
              attackerId: aiAction.attacker.id,
              targetId: aiAction.target.id,
              damage: actualDamage,
              isCritical: attackResult.isCritical || false,
              attackType: attackResult.attackType || 'physical',
              isBlocked: attackResult.isBlocked || (actualDamage === 0 && aiAction.target.isDefending)
            };
          }
          break;
          
        case 'defend':
          if (aiAction.creature) {
            const defendCost = aiAction.energyCost || 1;
            if (updatedState.enemyEnergy < defendCost) {
              console.error("AI tried to defend without enough energy");
              break;
            }
            
            const updatedDefender = defendCreature(aiAction.creature, state.difficulty);
            updatedState.enemyEnergy = Math.max(0, updatedState.enemyEnergy - defendCost);
            updatedState.consecutiveActions.enemy += 1;
            
            updatedState.enemyField = updatedState.enemyField.map(c => 
              c.id === updatedDefender.id ? updatedDefender : c
            );
            
            // Track last defend for animations
            updatedState.lastDefend = {
              defenderId: aiAction.creature.id
            };
          }
          break;
          
        case 'useTool':
          if (aiAction.tool && aiAction.target) {
            const result = applyTool(aiAction.target, aiAction.tool, state.difficulty, state.turn);
            
            if (result && result.updatedCreature) {
              const isEnemyTarget = updatedState.enemyField.some(c => c.id === aiAction.target.id);
              
              if (isEnemyTarget) {
                updatedState.enemyField = updatedState.enemyField.map(c => 
                  c.id === result.updatedCreature.id ? result.updatedCreature : c
                );
              } else {
                updatedState.playerField = updatedState.playerField.map(c => 
                  c.id === result.updatedCreature.id ? result.updatedCreature : c
                );
              }
              
              updatedState.enemyTools = updatedState.enemyTools.filter(t => t.id !== aiAction.tool.id);
              updatedState.consecutiveActions.enemy += 1;
              
              // Track last tool use for animations
              updatedState.lastToolUse = {
                toolId: aiAction.tool.id,
                targetId: aiAction.target.id,
                tool: aiAction.tool
              };
            }
          }
          break;
          
        case 'useSpell':
          if (aiAction.spell && aiAction.caster && aiAction.target) {
            const spellCost = aiAction.energyCost || SPELL_ENERGY_COST;
            if (updatedState.enemyEnergy < spellCost) {
              console.error("AI tried to cast spell without enough energy");
              break;
            }
            
            const spellResult = applySpell(aiAction.caster, aiAction.target, aiAction.spell, state.difficulty, state.turn);
            
            if (spellResult) {
              updatedState.enemyEnergy = Math.max(0, updatedState.enemyEnergy - spellCost);
              updatedState.consecutiveActions.enemy += 1;
              updatedState.energyMomentum.enemy += spellCost;
              
              updatedState.enemyField = updatedState.enemyField.map(c => {
                if (c.id === spellResult.updatedCaster.id) return spellResult.updatedCaster;
                if (c.id === spellResult.updatedTarget.id) return spellResult.updatedTarget;
                return c;
              }).filter(c => c.currentHealth > 0);
              
              updatedState.playerField = updatedState.playerField.map(c => {
                if (c.id === spellResult.updatedTarget.id) return spellResult.updatedTarget;
                return c;
              }).filter(c => c.currentHealth > 0);
              
              updatedState.enemySpells = updatedState.enemySpells.filter(s => s.id !== aiAction.spell.id);
              
              // Track last spell cast for animations
              updatedState.lastSpellCast = {
                spellId: aiAction.spell.id,
                casterId: aiAction.caster.id,
                targetId: aiAction.target.id,
                spell: aiAction.spell,
                damage: spellResult.spellEffect?.damage || spellResult.spellEffect?.healing || 0
              };
            }
          }
          break;
      }
      
      return updatedState;
    
    case ACTIONS.EXECUTE_AI_ACTION_SEQUENCE:
      let newState = { ...state };
      
      for (const aiAction of action.actionSequence) {
        const actionCost = aiAction.energyCost || 0;
        if (newState.enemyEnergy < actionCost) {
          console.log(`Skipping AI action ${aiAction.type} - not enough energy`);
          continue;
        }
        
        switch (aiAction.type) {
          case 'deploy':
            if (newState.enemyField.some(c => c.id === aiAction.creature.id)) {
              console.log("Skipping duplicate deployment");
              continue;
            }
            newState.enemyHand = newState.enemyHand.filter(c => c.id !== aiAction.creature.id);
            newState.enemyField = [...newState.enemyField, aiAction.creature];
            newState.enemyEnergy = Math.max(0, newState.enemyEnergy - aiAction.energyCost);
            break;
            
          case 'attack':
            const attackResult = processAttack(aiAction.attacker, aiAction.target);
            
            // Extract damage from attackResult with multiple fallbacks
            let actualDamage = attackResult.damage ?? 
                                attackResult.finalDamage ?? 
                                attackResult.totalDamage ??
                                attackResult.damageDealt ??
                                null;
            
            // If no damage property found, calculate it from health difference
            if (actualDamage === null && attackResult.updatedDefender && aiAction.target) {
              const healthBefore = aiAction.target.currentHealth || 0;
              const healthAfter = attackResult.updatedDefender.currentHealth || 0;
              actualDamage = Math.max(0, healthBefore - healthAfter);
              console.log('EXECUTE_AI_ACTION_SEQUENCE: Calculated damage from health difference:', healthBefore, '-', healthAfter, '=', actualDamage);
            }
            
            // Final fallback to 0
            if (actualDamage === null || actualDamage === undefined) {
              actualDamage = 0;
            }
            
            console.log('EXECUTE_AI_ACTION_SEQUENCE: Attack damage extracted:', actualDamage);
            
            newState.enemyEnergy = Math.max(0, newState.enemyEnergy - aiAction.energyCost);
            
            newState.playerField = newState.playerField.map(c => 
              c.id === attackResult.updatedDefender.id ? attackResult.updatedDefender : c
            ).filter(c => c.currentHealth > 0);
            
            newState.enemyField = newState.enemyField.map(c => 
              c.id === attackResult.updatedAttacker.id ? attackResult.updatedAttacker : c
            );
            
            // Track for animations with correct damage
            newState.lastAttack = {
              attackerId: aiAction.attacker.id,
              targetId: aiAction.target.id,
              damage: actualDamage,
              isCritical: attackResult.isCritical || false,
              attackType: attackResult.attackType || 'physical',
              isBlocked: attackResult.isBlocked || (actualDamage === 0 && aiAction.target.isDefending)
            };
            break;
            
          case 'defend':
            const updatedDefender = defendCreature(aiAction.creature);
            newState.enemyEnergy = Math.max(0, newState.enemyEnergy - aiAction.energyCost);
            
            newState.enemyField = newState.enemyField.map(c => 
              c.id === updatedDefender.id ? updatedDefender : c
            );
            
            // Track for animations
            newState.lastDefend = {
              defenderId: aiAction.creature.id
            };
            break;
        }
      }
      
      return newState;
    
    case ACTIONS.COMBO_BONUS:
      const comboLevel = action.player === 'player' 
        ? state.consecutiveActions.player 
        : state.consecutiveActions.enemy;
      
      if (comboLevel >= 3) {
        const field = action.player === 'player' ? 'playerField' : 'enemyField';
        
        return {
          ...state,
          [field]: state[field].map(creature => ({
            ...creature,
            battleStats: {
              ...creature.battleStats,
              physicalAttack: creature.battleStats.physicalAttack + 2,
              magicalAttack: creature.battleStats.magicalAttack + 2
            }
          }))
        };
      }
      
      return state;
      
    // Animation state management
    case ACTIONS.SET_ANIMATION_IN_PROGRESS:
      return {
        ...state,
        animationInProgress: action.inProgress
      };
    
    case ACTIONS.QUEUE_ANIMATION:
      return {
        ...state,
        animationQueue: [...state.animationQueue, action.animation]
      };
    
    case ACTIONS.DEQUEUE_ANIMATION:
      return {
        ...state,
        animationQueue: state.animationQueue.slice(1)
      };
    
    // New cases for synergies and momentum
    case ACTIONS.APPLY_SYNERGIES:
      return {
        ...state,
        playerField: action.playerField || state.playerField,
        enemyField: action.enemyField || state.enemyField,
        activeSynergies: action.synergies || state.activeSynergies
      };
    
    case ACTIONS.SHOW_AI_STRATEGY:
      return {
        ...state,
        currentAIStrategy: action.strategy
      };
    
    case ACTIONS.UPDATE_CHARGE_EFFECTS:
      return {
        ...state,
        playerField: state.playerField.map(creature => updateChargeEffects(creature, state.turn)),
        enemyField: state.enemyField.map(creature => updateChargeEffects(creature, state.turn))
      };
    
    default:
      return state;
  }
};

const BattleGame = ({ onClose }) => {
  const { creatureNfts, toolNfts, spellNfts, addNotification } = useContext(GameContext);
  const { connected, accounts } = useRadixConnect();
  
  // Use ref to track current enemy energy for AI
  const currentEnemyEnergyRef = useRef(10);
  
  // UI STATE
  const [selectedCreature, setSelectedCreature] = useState(null);
  const [targetCreature, setTargetCreature] = useState(null);
  const [difficulty, setDifficulty] = useState('easy');
  const [actionInProgress, setActionInProgress] = useState(false);
  const [isProcessingAnimation, setIsProcessingAnimation] = useState(false);
  const [animationQueue, setAnimationQueue] = useState([]);
  
  // New animation reference to track DOM elements
  const creatureElementsRef = useRef({
    player: {},
    enemy: {}
  });
  
  // BATTLE STATE
  const [state, dispatch] = useReducer(battleReducer, {
    gameState: 'setup',
    turn: 1,
    activePlayer: 'player',
    difficulty: 'easy',
    selectedTeam: null,
    
    playerDeck: [],
    playerHand: [],
    playerField: [],
    playerEnergy: 10,
    playerTools: [],
    playerSpells: [],
    
    enemyDeck: [],
    enemyHand: [],
    enemyField: [],
    enemyEnergy: 10,
    enemyTools: [],
    enemySpells: [],
    
    battleLog: [],
    
    consecutiveActions: { player: 0, enemy: 0 },
    energyMomentum: { player: 0, enemy: 0 },
    
    // Animation state
    animationInProgress: false,
    animationQueue: [],
    lastAttack: null,
    lastSpellCast: null,
    lastToolUse: null,
    lastDefend: null,
    
    // Synergy and momentum state
    activeSynergies: [],
    energyMomentumDetails: { player: null, enemy: null },
    currentAIStrategy: null,
  });
  
  // Update ref when enemyEnergy changes
  useEffect(() => {
    currentEnemyEnergyRef.current = state.enemyEnergy;
  }, [state.enemyEnergy]);
  
  // Destructure state for easier access
  const {
    gameState,
    turn,
    activePlayer,
    selectedTeam,
    playerDeck,
    playerHand,
    playerField,
    playerEnergy,
    playerTools,
    playerSpells,
    enemyDeck,
    enemyHand,
    enemyField,
    enemyEnergy,
    enemyTools,
    enemySpells,
    battleLog,
    consecutiveActions,
    energyMomentum,
    
    // Animation state
    animationInProgress,
    lastAttack,
    lastSpellCast,
    lastToolUse,
    lastDefend,
    
    // Synergy and momentum state
    activeSynergies,
    energyMomentumDetails,
    currentAIStrategy,
  } = state;
  
  // ===== START OF REF-BASED ANIMATION FIX =====
  // Use refs to store animation functions to break circular dependencies
  const animationFunctionsRef = useRef({});

  // Store animation queue processor functions in refs
  const executeAnimationRef = useRef();
  const queueAnimationRef = useRef();

  // Define queueAnimation using ref to avoid circular dependency
  queueAnimationRef.current = (animation) => {
    // Validate animation object
    if (!animation || !animation.type) {
      console.error('Invalid animation queued:', animation);
      return;
    }
    
    // Add timestamp for debugging
    animation.timestamp = Date.now();
    
    setAnimationQueue(prev => [...prev, animation]);
  };

  // Define a stable queueAnimation function that uses the ref
  const queueAnimation = useCallback((animation) => {
    queueAnimationRef.current(animation);
  }, []);

  // Add helper functions for queueing specific animations
  const queueComboAnimation = useCallback((comboLevel, isPlayer) => {
    if (comboLevel >= 2) {
      queueAnimation({
        type: 'combo',
        comboLevel,
        isPlayer,
        delay: 300
      });
    }
  }, [queueAnimation]);

  const queueStatusEffectAnimation = useCallback((targetId, effect, isPositive = true) => {
    queueAnimation({
      type: 'status-effect',
      targetId,
      effect,
      isPositive
    });
  }, [queueAnimation]);

  const queueEnergyRegenAnimation = useCallback((isPlayer, amount, hasBonus = false) => {
    queueAnimation({
      type: 'energy-regen',
      isPlayer,
      amount,
      hasBonus
    });
  }, [queueAnimation]);

  const queueSynergyAnimation = useCallback((synergies) => {
    if (synergies && synergies.length > 0) {
      queueAnimation({
        type: 'synergy-activation',
        synergies
      });
    }
  }, [queueAnimation]);

  const queueScreenEffect = useCallback((effect, params) => {
    queueAnimation({
      type: 'screen-effect',
      effect,
      params
    });
  }, [queueAnimation]);

  // Helper to get creature element with retry logic
  const getCreatureElement = useCallback(async (creatureId, isEnemy) => {
    // Try to get element with retry logic
    const element = await getCreatureElementWithRetry(creatureId, isEnemy);
    if (element) {
      // Update ref cache
      if (isEnemy) {
        creatureElementsRef.current.enemy[creatureId] = element;
      } else {
        creatureElementsRef.current.player[creatureId] = element;
      }
    }
    return element;
  }, []);

  // Helper for animation timing
  const animateWithTiming = async (animationFn) => {
    return new Promise((resolve) => {
      animationFn(() => resolve());
    });
  };

  // Define all animation execution functions and store them in ref
  animationFunctionsRef.current = {
    executeAttackAnimation: async (animation) => {
      const { attackerId, targetId, damage, isCritical, attackType, isBlocked, damageType } = animation;
      
      // VALIDATION: Ensure damage is a number
      const validatedDamage = typeof damage === 'number' ? damage : 0;
      
      console.log('Executing attack animation with damage:', validatedDamage, 'original:', damage);
      
      const isEnemyAttacker = enemyField.some(c => c.id === attackerId);
      const isEnemyTarget = enemyField.some(c => c.id === targetId);
      
      const attackerElement = await getCreatureElement(attackerId, isEnemyAttacker);
      const targetElement = await getCreatureElement(targetId, isEnemyTarget);
      
      if (!attackerElement || !targetElement) {
        console.log("Missing elements for attack animation");
        return;
      }
      
      return new Promise(resolve => {
        animateAttack(
          attackerElement,
          targetElement,
          attackType || 'physical',
          isCritical || false,
          validatedDamage,
          isBlocked || false,
          damageType || 'normal',
          () => {
            // Additional effects based on damage
            if (isCritical && validatedDamage && validatedDamage > 0) {
              screenFlash('rgba(255, 215, 0, 0.3)', 400, 0.5);
            }
            
            if (validatedDamage && validatedDamage > 20) {
              const intensity = Math.min(10, Math.max(1, validatedDamage / 10));
              shakeScreen(intensity, 400);
            }
            
            if (validatedDamage && validatedDamage > 0) {
              generateParticles(targetElement, 'damage', Math.min(20, validatedDamage / 3));
            }
            
            resolve();
          }
        );
      });
    },
    
    executeDefendAnimation: async (animation) => {
      const { defenderId } = animation;
      const isEnemyDefender = enemyField.some(c => c.id === defenderId);
      
      const defenderElement = await getCreatureElement(defenderId, isEnemyDefender);
      
      if (!defenderElement) {
        console.log("Missing element for defend animation");
        return;
      }
      
      return new Promise(resolve => {
        animateDefend(defenderElement, resolve);
      });
    },
    
    executeSpellAnimation: async (animation) => {
      const { casterId, targetId, spell, damage } = animation;
      
      // VALIDATION: Ensure damage is a number
      const validatedDamage = typeof damage === 'number' ? damage : 0;
      
      const isEnemyCaster = enemyField.some(c => c.id === casterId);
      const isEnemyTarget = enemyField.some(c => c.id === targetId);
      
      const casterElement = await getCreatureElement(casterId, isEnemyCaster);
      const targetElement = await getCreatureElement(targetId, isEnemyTarget);
      
      if (!casterElement || !targetElement) {
        console.log("Missing elements for spell animation");
        return;
      }
      
      return new Promise(resolve => {
        animateSpell(
          casterElement,
          targetElement,
          spell,
          validatedDamage,
          () => {
            if (validatedDamage && Math.abs(validatedDamage) > 25) {
              let flashColor;
              if (validatedDamage < 0) {
                flashColor = 'rgba(0, 255, 0, 0.2)';
              } else {
                flashColor = 'rgba(255, 0, 255, 0.2)';
              }
              screenFlash(flashColor);
            }
            
            if (validatedDamage) {
              if (validatedDamage < 0) {
                generateParticles(targetElement, 'heal', Math.min(20, Math.abs(validatedDamage) / 2));
              } else {
                generateParticles(targetElement, 'magic', Math.min(20, validatedDamage / 3));
              }
            }
            
            resolve();
          }
        );
      });
    },
    
    executeToolAnimation: async (animation) => {
      const { userId, targetId, tool } = animation;
      const isEnemyUser = enemyField.some(c => c.id === userId);
      const isEnemyTarget = enemyField.some(c => c.id === targetId);
      
      const userElement = await getCreatureElement(userId, isEnemyUser);
      const targetElement = await getCreatureElement(targetId, isEnemyTarget);
      
      if (!userElement || !targetElement) {
        console.log("Missing elements for tool animation");
        return;
      }
      
      return new Promise(resolve => {
        animateTool(userElement, targetElement, tool, resolve);
      });
    },
    
    executeTurnTransitionAnimation: async (animation) => {
      const { player, turnNumber } = animation;
      
      animateTurnTransition(player, turnNumber);
      
      return new Promise(resolve => {
        setTimeout(resolve, ANIMATION_DURATIONS.TURN_TRANSITION);
      });
    },
    
    executeAIThinkingAnimation: async (animation) => {
      const { enemyId, isComplex } = animation;
      const enemyElement = await getCreatureElement(enemyId, true);
      
      if (!enemyElement) {
        console.log("Missing element for AI thinking animation");
        return Promise.resolve();
      }
      
      return new Promise(resolve => {
        showAIThinking(enemyElement, isComplex, resolve);
      });
    },
    
    executeComboAnimation: async (animation) => {
      const { comboLevel, isPlayer } = animation;
      
      showComboIndicator(comboLevel, isPlayer);
      
      if (comboLevel >= 3) {
        setTimeout(() => {
          generateComboBurst(
            window.innerWidth / 2,
            window.innerHeight / 2,
            isPlayer ? 'combo-player' : 'combo-enemy'
          );
        }, 100);
      }
      
      return new Promise(resolve => {
        setTimeout(resolve, ANIMATION_DURATIONS.COMBO_INDICATOR);
      });
    },
    
    executeScreenEffectAnimation: async (animation) => {
      const { effect, params } = animation;
      
      switch (effect) {
        case 'flash':
          screenFlash(params.color, params.duration, params.intensity);
          break;
        case 'shake':
          shakeScreen(params.intensity, params.duration);
          break;
        case 'particles':
          const targetElement = document.querySelector(params.selector);
          if (targetElement) {
            generateParticles(targetElement, params.particleType, params.count);
          }
          break;
      }
      
      return new Promise(resolve => {
        setTimeout(resolve, params.duration || 500);
      });
    },
    
    executeStatusEffectAnimation: async (animation) => {
      const { targetId, effect, isPositive } = animation;
      const isEnemy = enemyField.some(c => c.id === targetId);
      const targetElement = await getCreatureElement(targetId, isEnemy);
      
      if (!targetElement) {
        console.log("Missing element for status effect animation");
        return;
      }
      
      return new Promise(resolve => {
        animateStatusEffect(targetElement, effect, isPositive, resolve);
      });
    },
    
    executeEnergyRegenAnimation: async (animation) => {
      const { isPlayer, amount, hasBonus } = animation;
      
      return new Promise(resolve => {
        animateEnergyRegen(isPlayer, amount, hasBonus, resolve);
      });
    },
    
    executeSynergyActivationAnimation: async (animation) => {
      const { synergies } = animation;
      
      animateSynergyActivation(synergies);
      
      return new Promise(resolve => {
        setTimeout(resolve, synergies.length * 300 + 500);
      });
    },
    
    executeDamageNumberAnimation: async (animation) => {
      const { targetId, amount, type, isCritical, isBlocked, damageType } = animation;
      const isEnemy = enemyField.some(c => c.id === targetId);
      const targetElement = await getCreatureElement(targetId, isEnemy);
      
      if (!targetElement) {
        console.log("Missing element for damage number animation");
        return;
      }
      
      showDamageNumber(
        targetElement,
        amount,
        type || 'physical',
        isCritical || false,
        isBlocked || false,
        damageType || 'normal'
      );
      
      return Promise.resolve();
    }
  };

  // Main execute animation function using ref
  executeAnimationRef.current = async (animation) => {
    if (!animation) return;
    
    if (animation.delay) {
      await new Promise(resolve => setTimeout(resolve, animation.delay));
    }
    
    const animationFunctions = animationFunctionsRef.current;
    
    switch (animation.type) {
      case 'attack':
        await animationFunctions.executeAttackAnimation(animation);
        break;
      case 'defend':
        await animationFunctions.executeDefendAnimation(animation);
        break;
      case 'spell':
        await animationFunctions.executeSpellAnimation(animation);
        break;
      case 'tool':
        await animationFunctions.executeToolAnimation(animation);
        break;
      case 'turn-transition':
        await animationFunctions.executeTurnTransitionAnimation(animation);
        break;
      case 'ai-thinking':
        await animationFunctions.executeAIThinkingAnimation(animation);
        break;
      case 'combo':
        await animationFunctions.executeComboAnimation(animation);
        break;
      case 'screen-effect':
        await animationFunctions.executeScreenEffectAnimation(animation);
        break;
      case 'status-effect':
        await animationFunctions.executeStatusEffectAnimation(animation);
        break;
      case 'energy-regen':
        await animationFunctions.executeEnergyRegenAnimation(animation);
        break;
      case 'synergy-activation':
        await animationFunctions.executeSynergyActivationAnimation(animation);
        break;
      case 'damage-number':
        await animationFunctions.executeDamageNumberAnimation(animation);
        break;
      default:
        console.log(`Unknown animation type: ${animation.type}`);
    }
    
    if (animation.onComplete) {
      animation.onComplete();
    }
  };

  // Enhanced animation queue processor
  const processAnimationQueue = useCallback(async () => {
    if (animationQueue.length === 0 || isProcessingAnimation) return;
    
    setIsProcessingAnimation(true);
    const animation = animationQueue[0];
    
    console.log('Processing animation:', animation.type);
    
    try {
      await executeAnimationRef.current(animation);
      
      // Add a small delay between animations for better visibility
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (error) {
      console.error('Error processing animation:', error);
    }
    
    // Remove processed animation and continue
    setAnimationQueue(prev => prev.slice(1));
    setIsProcessingAnimation(false);
  }, [animationQueue, isProcessingAnimation, enemyField, playerField]);

  // Process animation queue when it changes
  useEffect(() => {
    processAnimationQueue();
  }, [processAnimationQueue]);
  // ===== END OF REF-BASED ANIMATION FIX =====
  
  // Add CSS for AI stances
  useEffect(() => {
    const styleSheet = document.createElement('style');
    styleSheet.textContent = `
      .aggressive-stance {
        animation: aggressive-pulse 2s ease-in-out infinite;
        box-shadow: 0 0 20px rgba(255, 0, 0, 0.6) !important;
      }
      
      .defensive-stance {
        animation: defensive-pulse 2s ease-in-out infinite;
        box-shadow: 0 0 20px rgba(33, 150, 243, 0.6) !important;
      }
      
      @keyframes aggressive-pulse {
        0%, 100% { filter: brightness(1) saturate(1); }
        50% { filter: brightness(1.2) saturate(1.5); }
      }
      
      @keyframes defensive-pulse {
        0%, 100% { filter: brightness(1) saturate(1); }
        50% { filter: brightness(1.1) saturate(1.2); }
      }
      
      @keyframes battle-animation-synergy-appear {
        0% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
        20% { opacity: 1; transform: translateX(-50%) translateY(0); }
        80% { opacity: 1; transform: translateX(-50%) translateY(0); }
        100% { opacity: 0; transform: translateX(-50%) translateY(-20px); }
      }
    `;
    document.head.appendChild(styleSheet);
    
    return () => {
      document.head.removeChild(styleSheet);
    };
  }, []);
  
  // Browser compatibility fixes
  useEffect(() => {
    const { browser, isMobile } = getBrowserInfo();
    
    if (isMobile && (browser === 'chrome' || browser === 'firefox')) {
      console.log(`Applying mobile ${browser} fixes for enemy-only scrolling`);
      
      // Apply browser-specific CSS fixes
      const applyBrowserFixes = () => {
        // Root battle game element
        const battleGameEl = document.querySelector('.battle-game');
        if (battleGameEl) {
          battleGameEl.style.width = '100%';
          battleGameEl.style.maxWidth = '100vw';
          battleGameEl.style.overflowX = 'hidden';
        }
        
        // Battlefield container
        const battlefieldContainer = document.querySelector('.battlefield-container');
        if (battlefieldContainer) {
          battlefieldContainer.style.width = '100%';
          battlefieldContainer.style.maxWidth = '100vw';
          battlefieldContainer.style.overflowX = 'hidden';
        }
        
        // Battlefield itself
        const battlefield = document.querySelector('.battlefield');
        if (battlefield) {
          battlefield.style.width = '100%';
          battlefield.style.maxWidth = '100vw';
          battlefield.style.overflowX = 'hidden';
        }
        
        // Enemy field - SCROLLABLE
        const enemyField = document.querySelector('.battlefield-enemy');
        if (enemyField) {
          enemyField.style.width = '100%';
          enemyField.style.maxWidth = '100vw';
          enemyField.style.overflowX = 'auto';
          enemyField.style.justifyContent = 'flex-start';
          enemyField.style.padding = '5px 0';
        }
        
        // Player field - FIXED
        const playerField = document.querySelector('.battlefield-player');
        if (playerField) {
          playerField.style.width = '100%';
          playerField.style.maxWidth = '100vw';
          playerField.style.overflowX = 'hidden';
          playerField.style.justifyContent = 'center';
          playerField.style.padding = '5px 0';
        }
        
        // Battle log - FIXED
        const battleLog = document.querySelector('.battle-log.mobile');
        if (battleLog) {
          battleLog.style.width = '100%';
          battleLog.style.maxWidth = '100vw';
          battleLog.style.overflowX = 'hidden';
        }
        
        // Action panel - FIXED
        const actionPanel = document.querySelector('.action-panel');
        if (actionPanel) {
          actionPanel.style.width = '100%';
          actionPanel.style.maxWidth = '100vw';
          actionPanel.style.overflowX = 'hidden';
        }
        
        // Ensure hand cards can overflow properly in desktop mode
        const playerHand = document.querySelector('.player-hand');
        if (playerHand) {
          playerHand.style.overflow = 'visible';
        }
        
        const handCards = document.querySelectorAll('.hand-card-wrapper');
        handCards.forEach(card => {
          card.style.overflow = 'visible';
          const creatureCard = card.querySelector('.creature-card');
          if (creatureCard) {
            creatureCard.style.overflow = 'visible';
            creatureCard.style.visibility = 'visible';
          }
        });
        
        // Firefox-specific fixes
        if (browser === 'firefox') {
          document.body.classList.add('firefox-mobile');
          
          if (enemyField) {
            enemyField.style.scrollSnapType = 'x mandatory';
          }
        } 
        
        // Chrome-specific fixes
        if (browser === 'chrome') {
          document.body.classList.add('chrome-mobile');
          
          // Chrome needs extra help with overflow containment
          document.querySelector('.battle-game-overlay')?.style.setProperty('overflow-x', 'hidden', 'important');
        }
      };
      
      // Apply fixes and set up a resize handler to reapply them
      applyBrowserFixes();
      
      const handleResize = () => {
        setTimeout(applyBrowserFixes, 100);
      };
      
      window.addEventListener('resize', handleResize);
      
      // Cleanup
      return () => {
        window.removeEventListener('resize', handleResize);
        document.body.classList.remove('firefox-mobile', 'chrome-mobile');
      };
    }
  }, []);
  
  // INITIALIZATION
  useEffect(() => {
    if (creatureNfts && creatureNfts.length > 0) {
      const battleCreatures = creatureNfts.map(creature => {
        const derivedStats = calculateDerivedStats(creature);
        
        return {
          ...creature,
          battleStats: derivedStats,
          currentHealth: derivedStats.maxHealth,
          activeEffects: [],
          isDefending: false
        };
      });
    }
  }, [creatureNfts]);
  
  // BATTLE LOG
  const addToBattleLog = useCallback((message) => {
    dispatch({ type: ACTIONS.ADD_LOG, message });
  }, []);
  
  // Add synergy effect display when synergies activate
  const displaySynergyEffects = useCallback((synergies) => {
    if (!synergies || synergies.length === 0) return;
    
    const synergyData = createSynergyEffectData(synergies);
    
    synergyData.forEach((synergy, index) => {
      setTimeout(() => {
        // Create synergy notification
        const notification = document.createElement('div');
        notification.className = 'battle-synergy-notification';
        notification.style.cssText = `
          position: fixed;
          top: ${150 + (index * 60)}px;
          left: 50%;
          transform: translateX(-50%);
          background: ${synergy.color};
          color: white;
          padding: 10px 20px;
          border-radius: 20px;
          font-weight: bold;
          font-size: 16px;
          z-index: 9999;
          animation: battle-animation-synergy-appear 2s forwards;
        `;
        notification.textContent = synergy.message;
        document.body.appendChild(notification);
        
        setTimeout(() => notification.remove(), 2000);
      }, index * 200);
    });
  }, []);
  
  // TEAM SELECTION HANDLERS
  const handleDifficultySelect = useCallback((selectedDifficulty) => {
    dispatch({ type: ACTIONS.SET_DIFFICULTY, difficulty: selectedDifficulty });
  }, []);
  
  const handleMoveToTeamSelect = useCallback(() => {
    dispatch({ type: ACTIONS.SET_GAME_STATE, gameState: 'teamSelect' });
  }, []);
  
  const handleTeamConfirm = useCallback((team) => {
    console.log("Team confirmed:", team);
    dispatch({ type: ACTIONS.SET_TEAM, team });
    
    // Initialize battle with the selected team
    const battleCreatures = team.creatures.map(creature => {
      console.log("=== INITIALIZING TEAM CREATURE ===");
      console.log("Original creature:", creature);
      
      if (!creature.specialty_stats) {
        creature.specialty_stats = [];
      }
      
      const derivedStats = calculateDerivedStats(creature);
      console.log("Derived stats from calculateDerivedStats:", derivedStats);
      console.log("Energy cost from derivedStats:", derivedStats.energyCost);
      
      const formLevel = parseInt(creature.form) || 0;
      const correctEnergyCost = 5 + formLevel;
      console.log(`Form: ${creature.form} (type: ${typeof creature.form}), parsed as: ${formLevel}`);
      console.log(`Correct energy cost should be: ${correctEnergyCost}`);
      
      if (derivedStats.energyCost !== correctEnergyCost) {
        console.error(`ENERGY COST MISMATCH! Got ${derivedStats.energyCost}, expected ${correctEnergyCost}`);
      }
      
      const battleCreature = {
        ...creature,
        battleStats: {
          ...derivedStats,
          energyCost: correctEnergyCost
        },
        currentHealth: derivedStats.maxHealth,
        activeEffects: [],
        isDefending: false
      };
      
      console.log("Final battle creature:", battleCreature);
      console.log("Final energy cost:", battleCreature.battleStats.energyCost);
      console.log("=== END CREATURE INIT ===\n");
      
      return battleCreature;
    });
    
    const diffSettings = getDifficultySettings(state.difficulty);
    
    const enemyCreatures = generateEnemyCreatures(state.difficulty, diffSettings.enemyDeckSize, battleCreatures);
    
    const enemyWithStats = enemyCreatures.map((creature, index) => {
      const derivedStats = calculateDerivedStats(creature);
      const formLevel = parseInt(creature.form) || 0;
      const energyCost = 5 + formLevel;
      
      console.log(`Enemy ${creature.species_name} (${creature.rarity}, Form ${creature.form}):`);
      console.log(`Base stats:`, creature.stats);
      console.log(`Derived stats:`, derivedStats);
      console.log(`Energy cost:`, energyCost);
      
      return {
        ...creature,
        battleStats: {
          ...derivedStats,
          energyCost: energyCost
        },
        currentHealth: derivedStats.maxHealth,
        activeEffects: [],
        isDefending: false
      };
    });
    
    const playerInitialHandSize = Math.min(3, battleCreatures.length);
    const playerInitialHand = battleCreatures.slice(0, playerInitialHandSize);
    const remainingDeck = battleCreatures.slice(playerInitialHandSize);
    
    const enemyInitialHandSize = diffSettings.initialHandSize;
    const enemyInitialHand = enemyWithStats.slice(0, enemyInitialHandSize);
    const remainingEnemyDeck = enemyWithStats.slice(enemyInitialHandSize);
    
    const enemyItems = generateEnemyItems(state.difficulty);
    const enemyTools = enemyItems.tools || [];
    const enemySpells = enemyItems.spells || [];
    
    console.log(`Generated ${enemyTools.length} enemy tools and ${enemySpells.length} enemy spells for ${state.difficulty} difficulty`);
    
    // ENHANCED: Use starting energy from difficulty settings
    const playerStartingEnergy = 10; // Player always starts with 10
    const enemyStartingEnergy = diffSettings.startingEnergy || 10;
    
    console.log(`Starting energy - Player: ${playerStartingEnergy}, Enemy: ${enemyStartingEnergy} (${state.difficulty} difficulty)`);
    
    // Reset energy ref
    currentEnemyEnergyRef.current = enemyStartingEnergy;
    
    dispatch({
      type: ACTIONS.START_BATTLE,
      playerDeck: remainingDeck,
      playerHand: playerInitialHand,
      playerTools: team.tools || [],
      playerSpells: team.spells || [],
      enemyDeck: remainingEnemyDeck,
      enemyHand: enemyInitialHand,
      enemyTools: enemyTools,
      enemySpells: enemySpells,
      difficulty: state.difficulty,
      // Pass starting energy values
      playerStartingEnergy: playerStartingEnergy,
      enemyStartingEnergy: enemyStartingEnergy
    });
    
    addToBattleLog(`Battle started! Enemy has ${enemyTools.length + enemySpells.length} special items and ${enemyStartingEnergy} starting energy!`);
  }, [state.difficulty, addToBattleLog]);
  
  const handleBackFromTeamSelect = useCallback(() => {
    dispatch({ type: ACTIONS.SET_GAME_STATE, gameState: 'setup' });
  }, []);
  
  // BATTLE MECHANICS
  const regenerateEnergy = useCallback(() => {
    let playerTotalEnergy = 0;
    playerField.forEach(creature => {
      if (creature.stats && creature.stats.energy) {
        playerTotalEnergy += creature.stats.energy;
      }
    });
    const playerBonus = Math.floor(playerTotalEnergy / 10);
    
    let enemyTotalEnergy = 0;
    enemyField.forEach(creature => {
      if (creature.stats && creature.stats.energy) {
        enemyTotalEnergy += creature.stats.energy;
      }
    });
    const enemyBonus = Math.floor(enemyTotalEnergy / 10);
    
    const difficultySettings = getDifficultySettings(difficulty);
    const enemyDifficultyBonus = Math.floor(difficultySettings.enemyEnergyRegen || 0) - 2;
    
    const playerRegen = BASE_ENERGY_REGEN + playerBonus;
    const enemyRegen = BASE_ENERGY_REGEN + enemyBonus + enemyDifficultyBonus;
    
    console.log(`Energy Regen - Player: +${playerRegen} (${playerTotalEnergy} total energy), Enemy: +${enemyRegen} (${enemyTotalEnergy} total energy)`);
    
    dispatch({ type: ACTIONS.REGENERATE_ENERGY, playerRegen, enemyRegen });
    
    // Show momentum bonus notifications
    const playerMomentumData = processEnergyMomentum(energyMomentum.player);
    const enemyMomentumData = processEnergyMomentum(energyMomentum.enemy);
    
    if (playerMomentumData.bonusRegen > 0) {
      addToBattleLog(`Energy Momentum bonus! +${playerMomentumData.bonusRegen} extra energy!`);
      
      // Visual effect for momentum bonus
      queueAnimation({
        type: 'screen-effect',
        effect: 'particles',
        params: {
          selector: '.player-energy',
          particleType: 'gold',
          count: playerMomentumData.bonusRegen * 5
        }
      });
    }
    
    if (enemyMomentumData.bonusRegen > 0) {
      addToBattleLog(`Enemy Energy Momentum bonus! +${enemyMomentumData.bonusRegen} extra energy!`);
    }
    
    if (activePlayer === 'player') {
      addToBattleLog(`You gained +${playerRegen} energy. (${playerTotalEnergy} total creature energy)`);
      
      // Queue energy regeneration animation
      queueEnergyRegenAnimation(true, playerRegen, playerMomentumData.bonusRegen > 0);
    } else {
      addToBattleLog(`Enemy gained +${enemyRegen} energy. (${enemyTotalEnergy} total creature energy)`);
      
      // Queue energy regeneration animation
      queueEnergyRegenAnimation(false, enemyRegen, enemyMomentumData.bonusRegen > 0);
    }
  }, [activePlayer, playerField, enemyField, difficulty, energyMomentum, addToBattleLog, queueAnimation, queueEnergyRegenAnimation]);
  
  const applyEnergyDecay = useCallback(() => {
    if (playerEnergy > 10 || enemyEnergy > 10) {
      dispatch({ type: ACTIONS.APPLY_ENERGY_DECAY });
      console.log("Applied energy decay to prevent hoarding");
    }
  }, [playerEnergy, enemyEnergy]);
  
  const applyOngoingEffects = useCallback(() => {
    console.log("Applying ongoing effects...");
    
    dispatch({ 
      type: ACTIONS.APPLY_ONGOING_EFFECTS,
      addLog: addToBattleLog
    });
  }, [dispatch, addToBattleLog]);
  
  const checkWinCondition = useCallback(() => {
    const result = enemyField.length === 0 && enemyHand.length === 0 && enemyDeck.length === 0;
    return result;
  }, [enemyField, enemyHand, enemyDeck]);
  
  const checkLossCondition = useCallback(() => {
    const result = playerField.length === 0 && playerHand.length === 0 && playerDeck.length === 0;
    return result;
  }, [playerField, playerHand, playerDeck]);
  
  // ENHANCED PLAYER ACTIONS WITH DAMAGE VALIDATION
  const deployCreature = useCallback((creature) => {
    if (!creature) return;
    
    console.log("=== DEPLOY CREATURE CALLED ===");
    console.log("Full creature object:", JSON.stringify(creature, null, 2));
    console.log("Creature stats:", creature.stats);
    console.log("Creature battleStats:", creature.battleStats);
    
    const maxPlayerFieldSize = 4;
    
    if (playerField.length >= maxPlayerFieldSize) {
      addToBattleLog("Your battlefield is full! Cannot deploy more creatures.");
      return;
    }
    
    console.log("Checking energy cost sources:");
    console.log("1. battleStats.energyCost:", creature.battleStats?.energyCost);
    console.log("2. Direct energyCost:", creature.energyCost);
    
    const formLevel = parseInt(creature.form) || 0;
    const correctCost = 5 + formLevel;
    console.log("3. Form-based calculation: 5 + " + creature.form + " (parsed: " + formLevel + ") = " + correctCost);
    
    const energyCost = creature.battleStats?.energyCost || correctCost;
    
    console.log(`FINAL: Deploying ${creature.species_name} - Form: ${creature.form}, Energy Cost: ${energyCost}`);
    
    if (energyCost > MAX_ENERGY) {
      console.error(`ERROR: Energy cost ${energyCost} is way too high! Maximum energy is ${MAX_ENERGY}!`);
      console.log(`Using correct cost instead: ${correctCost}`);
      const actualCost = correctCost;
      
      if (playerEnergy < actualCost) {
        addToBattleLog(`Not enough energy to deploy ${creature.species_name}. Needs ${actualCost} energy.`);
        return;
      }
      
      dispatch({ type: ACTIONS.DEPLOY_CREATURE, creature, energyCost: actualCost });
      addToBattleLog(`You deployed ${creature.species_name} to the battlefield! (-${actualCost} energy)`);
    } else {
      if (playerEnergy < energyCost) {
        addToBattleLog(`Not enough energy to deploy ${creature.species_name}. Needs ${energyCost} energy.`);
        return;
      }
      
      dispatch({ type: ACTIONS.DEPLOY_CREATURE, creature, energyCost });
      
      let comboMessage = '';
      if (consecutiveActions.player > 0) {
        comboMessage = ` Combo x${consecutiveActions.player + 1}!`;
      }
      
      addToBattleLog(`You deployed ${creature.species_name} to the battlefield! (-${energyCost} energy)${comboMessage}`);
    }
    
    console.log(`Deployed ${creature.species_name} to player field`);
    
    // Add a screen effect animation for deployment
    queueAnimation({
      type: 'screen-effect',
      effect: 'flash',
      params: {
        color: 'rgba(76, 175, 80, 0.2)', // Green flash for deployment
        duration: 300,
        intensity: 0.3
      }
    });
    
    // Add particles around the new creature (delayed slightly to ensure DOM element exists)
    setTimeout(() => {
      const deployedElement = document.querySelector(`.battlefield-player .creature-card[data-id="${creature.id}"]`);
      if (deployedElement) {
        generateParticles(deployedElement, 'gold', 15);
      }
    }, 300);
    
  }, [playerField, playerEnergy, consecutiveActions, addToBattleLog, queueAnimation]);
  
  const attackCreature = useCallback((attacker, defender) => {
    if (!attacker || !defender) {
      addToBattleLog("Invalid attack - missing attacker or defender");
      return;
    }
    
    const isPlayerAttacker = playerField.some(c => c.id === attacker.id);
    if (isPlayerAttacker && playerEnergy < ATTACK_ENERGY_COST) {
      addToBattleLog(`Not enough energy to attack. Needs ${ATTACK_ENERGY_COST} energy.`);
      return;
    }
    
    const attackType = attacker.battleStats.physicalAttack > attacker.battleStats.magicalAttack 
      ? 'physical' 
      : 'magical';
    
    // FIXED: Pass combo level to processAttack
    const comboLevel = isPlayerAttacker ? consecutiveActions.player : consecutiveActions.enemy;
    const attackResult = processAttack(attacker, defender, attackType, comboLevel);
    
    // Debug log to see actual structure
    console.log('Full attack result object:', JSON.stringify(attackResult, null, 2));
    console.log('Attack result keys:', Object.keys(attackResult || {}));
    
    // Try multiple possible property names for damage
    let actualDamage = attackResult.damage ?? 
                        attackResult.finalDamage ?? 
                        attackResult.totalDamage ??
                        attackResult.damageDealt ??
                        null;
    
    // If no damage property found, calculate it from health difference
    if (actualDamage === null && attackResult.updatedDefender && defender) {
      const healthBefore = defender.currentHealth || 0;
      const healthAfter = attackResult.updatedDefender.currentHealth || 0;
      actualDamage = Math.max(0, healthBefore - healthAfter);
      console.log('Calculated damage from health difference:', healthBefore, '-', healthAfter, '=', actualDamage);
    }
    
    // Final fallback to 0
    if (actualDamage === null || actualDamage === undefined) {
      actualDamage = 0;
    }
    
    // Determine if attack was blocked
    const isBlocked = actualDamage === 0 && defender.isDefending;
    
    // VALIDATION: Ensure damage is a number before dispatching
    const validatedDamage = typeof actualDamage === 'number' ? actualDamage : 0;
    
    console.log('Attack result - actual damage found:', actualDamage, 'validated:', validatedDamage);
    
    // Ensure we pass the damage in the expected format
    const normalizedAttackResult = {
      ...attackResult,
      damage: validatedDamage
    };
    
    dispatch({ 
      type: ACTIONS.ATTACK, 
      attackResult: {
        ...normalizedAttackResult,
        damage: validatedDamage,
        isBlocked
      },
      energyCost: ATTACK_ENERGY_COST
    });
    
    let comboMessage = '';
    if (isPlayerAttacker && consecutiveActions.player > 0) {
      comboMessage = ` Combo x${consecutiveActions.player + 1}!`;
    }
    
    const energyMessage = isPlayerAttacker ? ` (-${ATTACK_ENERGY_COST} energy)` : '';
    addToBattleLog(attackResult.battleLog + energyMessage + comboMessage);
    
    // Queue attack animation with damage type
    queueAnimation({
      type: 'attack',
      attackerId: attacker.id,
      targetId: defender.id,
      damage: validatedDamage,
      isCritical: attackResult.isCritical,
      attackType: attackType,
      isBlocked: isBlocked,
      damageType: attackResult.damageResult?.damageType || 'normal'
    });
    
    // FIXED: Show combo animation with burst effect
    if (isPlayerAttacker && consecutiveActions.player >= 2) {
      queueAnimation({
        type: 'combo',
        comboLevel: consecutiveActions.player + 1,
        isPlayer: true,
        delay: 300
      });
    }
    
  }, [playerField, playerEnergy, consecutiveActions, addToBattleLog, queueAnimation]);
  
  const useTool = useCallback((tool, targetCreature, isPlayerTool = true) => {
    if (!tool || !targetCreature) {
      addToBattleLog("Invalid tool use - missing tool or target");
      return;
    }
    
    console.log("Using tool:", tool);
    console.log("Target creature:", targetCreature);
    
    // Pass current turn to applyTool
    const result = applyTool(targetCreature, tool, difficulty, turn);
    
    if (!result || !result.updatedCreature) {
      addToBattleLog(`Failed to use ${tool.name || "tool"}.`);
      return;
    }
    
    // Find user creature - for player tools, use the selected creature
    const userCreature = isPlayerTool && selectedCreature ? selectedCreature : targetCreature;
    
    dispatch({ 
      type: ACTIONS.USE_TOOL, 
      result, 
      tool,
      isPlayerTool,
      isEnemyTool: !isPlayerTool
    });
    
    const isPlayerTarget = playerField.some(c => c.id === targetCreature.id);
    const targetDescription = isPlayerTarget ? targetCreature.species_name : `enemy ${targetCreature.species_name}`;
    
    addToBattleLog(`${tool.name || "Tool"} was used on ${targetDescription}.`);
    
    if (result.toolEffect) {
      if (result.toolEffect.statChanges) {
        const statChanges = Object.entries(result.toolEffect.statChanges)
          .map(([stat, value]) => `${stat} ${value > 0 ? '+' : ''}${value}`)
          .join(', ');
        
        if (statChanges) {
          addToBattleLog(`Effect: ${statChanges}`);
        }
      }
      
      if (result.toolEffect.healthChange && result.toolEffect.healthChange > 0) {
        addToBattleLog(`Healed for ${result.toolEffect.healthChange} health.`);
      }
    }
    
    // Queue tool animation
    queueAnimation({
      type: 'tool',
      userId: userCreature.id,
      targetId: targetCreature.id,
      tool: tool
    });
    
    // Add status effect animation if the tool applies effects
    if (result.toolEffect && result.toolEffect.statChanges) {
      const isPositive = Object.values(result.toolEffect.statChanges).some(v => v > 0);
      queueStatusEffectAnimation(targetCreature.id, tool.name, isPositive);
    }
    
  }, [playerField, difficulty, turn, selectedCreature, addToBattleLog, queueAnimation, queueStatusEffectAnimation]);
  
  const useSpell = useCallback((spell, caster, target, isPlayerSpell = true) => {
    if (!spell || !caster) {
      addToBattleLog("Invalid spell cast - missing spell or caster");
      return;
    }
    
    const energyCost = SPELL_ENERGY_COST;
    
    if (isPlayerSpell && playerEnergy < energyCost) {
      addToBattleLog(`Not enough energy to cast ${spell.name}. Needs ${energyCost} energy.`);
      return;
    }
    
    const effectiveTarget = target || caster;
    
    // Pass current turn to applySpell
    const spellResult = applySpell(caster, effectiveTarget, spell, difficulty, turn);
    
    if (!spellResult) {
      addToBattleLog(`Failed to cast ${spell.name}.`);
      return;
    }
    
    // VALIDATION: Ensure damage is a number
    const spellDamage = spellResult.spellEffect?.damage || spellResult.spellEffect?.healing || 0;
    const validatedDamage = typeof spellDamage === 'number' ? spellDamage : 0;
    
    dispatch({ 
      type: ACTIONS.USE_SPELL, 
      spellResult: {
        ...spellResult,
        spellEffect: {
          ...spellResult.spellEffect,
          damage: spellResult.spellEffect?.damage !== undefined ? validatedDamage : undefined,
          healing: spellResult.spellEffect?.healing !== undefined ? validatedDamage : undefined
        }
      }, 
      spell, 
      energyCost,
      isEnemySpell: !isPlayerSpell
    });
    
    const targetText = target && target.id !== caster.id 
      ? `on ${playerField.some(c => c.id === target.id) ? '' : 'enemy '}${target.species_name}` 
      : 'on self';
      
    addToBattleLog(`${caster.species_name} cast ${spell.name} ${targetText}. (-${energyCost} energy)`);
    
    if (spellResult.spellEffect && spellResult.spellEffect.damage) {
      addToBattleLog(`The spell dealt ${spellResult.spellEffect.damage} damage!`);
    }
    
    if (spellResult.spellEffect && spellResult.spellEffect.healing) {
      addToBattleLog(`The spell healed for ${spellResult.spellEffect.healing} health!`);
    }
    
    // Queue spell animation with VALIDATED damage
    queueAnimation({
      type: 'spell',
      casterId: caster.id,
      targetId: effectiveTarget.id,
      spell: spell,
      damage: validatedDamage
    });
    
  }, [playerEnergy, playerField, difficulty, turn, addToBattleLog, queueAnimation]);
  
  const defendCreatureAction = useCallback((creature) => {
    if (!creature) {
      addToBattleLog("Invalid defend action - no creature selected");
      return;
    }
    
    const isPlayerCreature = playerField.some(c => c.id === creature.id);
    if (isPlayerCreature && playerEnergy < DEFEND_ENERGY_COST) {
      addToBattleLog(`Not enough energy to defend. Needs ${DEFEND_ENERGY_COST} energy.`);
      return;
    }
    
    const updatedCreature = defendCreature(creature, difficulty);
    
    dispatch({ type: ACTIONS.DEFEND, updatedCreature });
    
    const energyCost = isPlayerCreature ? ` (-${DEFEND_ENERGY_COST} energy)` : '';
    addToBattleLog(
      `${isPlayerCreature ? '' : 'Enemy '}${creature.species_name} took a defensive stance!${energyCost}`
    );
    
    // Queue defend animation
    queueAnimation({
      type: 'defend',
      defenderId: creature.id
    });
    
  }, [playerField, playerEnergy, difficulty, addToBattleLog, queueAnimation]);
  
  // ENHANCED AI TURN HANDLING WITH DAMAGE VALIDATION
  const handleEnemyTurn = useCallback(() => {
    const currentEnergy = currentEnemyEnergyRef.current;
    console.log("Enemy turn. Energy:", currentEnergy, "Hand:", enemyHand.length, "Field:", enemyField.length);
    console.log("Enemy tools:", enemyTools.length, "Enemy spells:", enemySpells.length);
    
    setActionInProgress(true);
    
    // Add a safety timeout to prevent infinite hang
    const safetyTimeout = setTimeout(() => {
      console.error("Enemy turn timeout - forcing turn completion");
      setActionInProgress(false);
      finishEnemyTurn();
    }, 10000); // 10 second safety timeout
    
    // Create gameState object for enhanced AI
    const gameState = {
      turn: turn,
      playerFieldCount: playerField.length,
      enemyFieldCount: enemyField.length,
      playerHandCount: playerHand.length,
      enemyHandCount: enemyHand.length,
      playerTotalHealth: playerField.reduce((sum, c) => sum + c.currentHealth, 0),
      enemyTotalHealth: enemyField.reduce((sum, c) => sum + c.currentHealth, 0),
      consecutiveActions: consecutiveActions,
      energyMomentum: energyMomentum
    };
    
    // Determine strategy before showing thinking
    const strategy = determineAIStrategy(difficulty, enemyHand, enemyField, playerField, enemyTools, enemySpells, currentEnergy, gameState);
    
    // Show strategy hint
    if (strategy && strategy.name) {
      dispatch({ type: ACTIONS.SHOW_AI_STRATEGY, strategy });
      
      let strategyMessage = '';
      let stanceAnimation = null;
      
      switch (strategy.name) {
        case 'maximum-aggression':
          strategyMessage = "The enemy takes an aggressive stance!";
          stanceAnimation = 'aggressive-stance';
          // Add red aura to enemy creatures
          enemyField.forEach(creature => {
            const element = document.querySelector(`.battlefield-enemy .creature-card[data-id="${creature.id}"]`);
            if (element) {
              element.classList.add('aggressive-stance');
              setTimeout(() => element.classList.remove('aggressive-stance'), 3000);
            }
          });
          break;
          
        case 'defensive-setup':
          strategyMessage = "The enemy assumes a defensive posture...";
          stanceAnimation = 'defensive-stance';
          // Add blue aura to enemy creatures
          enemyField.forEach(creature => {
            const element = document.querySelector(`.battlefield-enemy .creature-card[data-id="${creature.id}"]`);
            if (element) {
              element.classList.add('defensive-stance');
              setTimeout(() => element.classList.remove('defensive-stance'), 3000);
            }
          });
          break;
          
        case 'combo-setup':
          strategyMessage = "The enemy seems to be planning something...";
          // Subtle purple glow
          queueAnimation({
            type: 'screen-effect',
            effect: 'flash',
            params: {
              color: 'rgba(128, 0, 128, 0.1)',
              duration: 500,
              intensity: 0.2
            }
          });
          break;
          
        case 'resource-efficiency':
          strategyMessage = "The enemy carefully considers their options...";
          break;
      }
      
      if (strategyMessage) {
        addToBattleLog(strategyMessage);
      }
    }
    
    // First, queue AI thinking animation if there's an active enemy
    if (enemyField.length > 0) {
      const activeEnemy = enemyField[0]; // Choose first enemy for thinking animation
      
      queueAnimation({
        type: 'ai-thinking',
        enemyId: activeEnemy.id,
        isComplex: difficulty === 'hard' || difficulty === 'expert',
        onComplete: () => {
          // After thinking animation, determine and execute AI action
          clearTimeout(safetyTimeout); // Clear the timeout if we're proceeding normally
          executeAIActionWithAnimation();
        }
      });
    } else {
      // No enemy to show thinking, just execute action
      clearTimeout(safetyTimeout);
      executeAIActionWithAnimation();
    }
  }, [
    difficulty, 
    enemyHand, 
    enemyField, 
    enemyTools,
    enemySpells,
    playerField,
    playerHand,
    turn,
    consecutiveActions,
    energyMomentum,
    queueAnimation,
    addToBattleLog
  ]);
  
  const executeAIActionWithAnimation = useCallback(() => {
    const currentEnergy = currentEnemyEnergyRef.current;
    
    // Create gameState object for enhanced AI
    const gameState = {
      turn: turn,
      playerFieldCount: playerField.length,
      enemyFieldCount: enemyField.length,
      playerHandCount: playerHand.length,
      enemyHandCount: enemyHand.length,
      playerTotalHealth: playerField.reduce((sum, c) => sum + c.currentHealth, 0),
      enemyTotalHealth: enemyField.reduce((sum, c) => sum + c.currentHealth, 0),
      consecutiveActions: consecutiveActions,
      energyMomentum: energyMomentum
    };
    
    const aiAction = determineAIAction(
      difficulty,
      enemyHand,
      enemyField,
      playerField,
      enemyTools,
      enemySpells,
      currentEnergy,
      gameState // Pass the gameState
    );
    
    console.log("AI determined action:", aiAction);
    
    if (aiAction.type === 'endTurn') {
      console.log("AI ending turn immediately");
      setTimeout(() => finishEnemyTurn(), 500);
      return;
    }
    
    if (Array.isArray(aiAction)) {
      console.log(`AI executing ${aiAction.length} actions`);
      executeActionSequenceWithAnimation(aiAction, 0);
    } else {
      executeSingleAIActionWithAnimation(aiAction);
    }
  }, [difficulty, enemyHand, enemyField, playerField, enemyTools, enemySpells, turn, playerHand, consecutiveActions, energyMomentum]);
  
  const executeActionSequenceWithAnimation = useCallback((actionSequence, index) => {
    if (index >= actionSequence.length) {
      console.log("Action sequence complete, finishing turn");
      setTimeout(() => finishEnemyTurn(), 500);
      return;
    }
    
    const action = actionSequence[index];
    const currentEnergy = currentEnemyEnergyRef.current;
    console.log(`Executing AI action ${index + 1}/${actionSequence.length}: ${action.type}, Current Energy: ${currentEnergy}`);
    
    // Check if AI has enough energy for this action
    const actionCost = action.energyCost || 0;
    if (currentEnergy < actionCost) {
      console.log(`Skipping action ${action.type} - not enough energy (${currentEnergy} < ${actionCost})`);
      // Continue with next action instead of getting stuck
      executeActionSequenceWithAnimation(actionSequence, index + 1);
      return;
    }
    
    executeSingleAIActionWithAnimation(action, () => {
      setTimeout(() => {
        executeActionSequenceWithAnimation(actionSequence, index + 1);
      }, 800);
    });
  }, []);
  
  const executeSingleAIActionWithAnimation = useCallback((aiAction, callback) => {
    console.log("Executing single AI action:", aiAction.type);
    const currentEnergy = currentEnemyEnergyRef.current;
    
    // Helper function to ensure callback is always called
    const safeCallback = () => {
      if (callback) {
        callback();
      } else {
        // If no callback provided, finish the turn
        setTimeout(() => finishEnemyTurn(), 500);
      }
    };
    
    if (aiAction.type === 'endTurn') {
      addToBattleLog("Enemy ended their turn.");
      safeCallback();
      return;
    }
    
    // Double-check energy before executing
    const actionCost = aiAction.energyCost || 0;
    if (currentEnergy < actionCost) {
      console.error(`AI tried to ${aiAction.type} without enough energy (${currentEnergy} < ${actionCost})`);
      // IMPORTANT: Always call the callback even when action fails
      safeCallback();
      return;
    }
    
    // Process action and enqueue appropriate animation
    switch(aiAction.type) {
      case 'deploy':
        if (!aiAction.creature) {
          console.log("AI Error: No creature to deploy");
          safeCallback();
          break;
        }
        
        const energyCost = aiAction.energyCost || aiAction.creature.battleStats?.energyCost || 3;
        
        // Final energy check before deployment
        if (currentEnergy < energyCost) {
          console.log(`AI Error: Not enough energy to deploy ${aiAction.creature.species_name} (${currentEnergy} < ${energyCost})`);
          safeCallback();
          break;
        }
        
        // Check if creature is already deployed
        if (enemyField.some(c => c.id === aiAction.creature.id)) {
          console.log("AI Error: Creature already deployed");
          safeCallback();
          break;
        }
        
        console.log("AI deploying creature:", aiAction.creature.species_name, "Cost:", energyCost);
        
        // Dispatch the deployment
        dispatch({
          type: ACTIONS.ENEMY_DEPLOY_CREATURE,
          creature: aiAction.creature,
          energyCost
        });
        
        // Check if deployment was successful by verifying energy was spent
        const newEnergy = Math.max(0, currentEnergy - energyCost);
        currentEnemyEnergyRef.current = newEnergy;
        
        addToBattleLog(`Enemy deployed ${aiAction.creature.species_name} to the battlefield! (-${energyCost} energy)`);
        
        // Add deployment animation with guaranteed callback
        queueAnimation({
          type: 'screen-effect',
          effect: 'flash',
          params: {
            color: 'rgba(244, 67, 54, 0.2)', // Red flash for enemy deployment
            duration: 300,
            intensity: 0.3
          },
          onComplete: () => {
            // Add particles around the new creature (with delay to ensure DOM is updated)
            setTimeout(() => {
              const deployedElement = document.querySelector(`.battlefield-enemy .creature-card[data-id="${aiAction.creature.id}"]`);
              if (deployedElement) {
                generateParticles(deployedElement, 'gold', 15);
              }
              // ALWAYS call the callback
              safeCallback();
            }, 300);
          }
        });
        break;
        
      case 'attack':
        if (!aiAction.attacker || !aiAction.target) {
          console.log("AI Error: Missing attacker or target");
          safeCallback();
          break;
        }
        
        const attackCost = aiAction.energyCost || ATTACK_ENERGY_COST;
        
        if (currentEnergy < attackCost) {
          console.log("AI Error: Not enough energy to attack");
          safeCallback();
          break;
        }
        
        console.log("AI attacking with:", aiAction.attacker.species_name, "Target:", aiAction.target.species_name);
        
        // Determine attack type based on stats
        const attackType = aiAction.attacker.battleStats.physicalAttack > aiAction.attacker.battleStats.magicalAttack 
          ? 'physical' 
          : 'magical';
        
        // FIXED: Pass combo level to processAttack
        const comboLevel = consecutiveActions.enemy;
        const attackResult = processAttack(aiAction.attacker, aiAction.target, attackType, comboLevel);
        
        // Debug log to see actual structure
        console.log('AI attack result object:', attackResult);
        
        // Try multiple possible property names for damage
        let actualDamage = attackResult.damage ?? 
                            attackResult.finalDamage ?? 
                            attackResult.totalDamage ??
                            attackResult.damageDealt ??
                            null;
        
        // If no damage property found, calculate it from health difference
        if (actualDamage === null && attackResult.updatedDefender && aiAction.target) {
          const healthBefore = aiAction.target.currentHealth || 0;
          const healthAfter = attackResult.updatedDefender.currentHealth || 0;
          actualDamage = Math.max(0, healthBefore - healthAfter);
          console.log('AI: Calculated damage from health difference:', healthBefore, '-', healthAfter, '=', actualDamage);
        }
        
        // Final fallback to 0
        if (actualDamage === null || actualDamage === undefined) {
          actualDamage = 0;
        }
        
        // Determine if attack was blocked
        const isBlocked = actualDamage === 0 && aiAction.target.isDefending;
        
        // VALIDATION: Ensure damage is a number
        const validatedDamage = typeof actualDamage === 'number' ? actualDamage : 0;
        
        console.log('AI attack - actual damage found:', actualDamage, 'validated:', validatedDamage);
        
        // Ensure we pass the damage in the expected format
        const normalizedAttackResult = {
          ...attackResult,
          damage: validatedDamage
        };
        
        dispatch({
          type: ACTIONS.ATTACK,
          attackResult: {
            ...normalizedAttackResult,
            damage: validatedDamage,
            isBlocked
          },
          energyCost: attackCost
        });
        
        currentEnemyEnergyRef.current = Math.max(0, currentEnergy - attackCost);
        
        addToBattleLog(`Enemy: ${attackResult.battleLog} (-${attackCost} energy)`);
        
        // Queue attack animation with VALIDATED damage and guaranteed callback
        queueAnimation({
          type: 'attack',
          attackerId: aiAction.attacker.id,
          targetId: aiAction.target.id,
          damage: validatedDamage,
          isCritical: attackResult.isCritical,
          attackType: attackType,
          isBlocked: isBlocked,
          damageType: attackResult.damageResult?.damageType || 'normal',
          onComplete: () => {
            // Show combo animation if applicable
            if (consecutiveActions.enemy >= 2) {
              queueAnimation({
                type: 'combo',
                comboLevel: consecutiveActions.enemy + 1,
                isPlayer: false,
                onComplete: safeCallback
              });
            } else {
              safeCallback();
            }
          }
        });
        break;
        
      case 'defend':
        if (!aiAction.creature) {
          console.log("AI Error: No creature to defend");
          safeCallback();
          break;
        }
        
        const defendCost = aiAction.energyCost || DEFEND_ENERGY_COST;
        
        if (currentEnergy < defendCost) {
          console.log("AI Error: Not enough energy to defend");
          safeCallback();
          break;
        }
        
        console.log("AI defending with:", aiAction.creature.species_name);
        
        const updatedDefender = defendCreature(aiAction.creature, difficulty);
        
        dispatch({
          type: ACTIONS.DEFEND,
          updatedCreature: updatedDefender
        });
        
        currentEnemyEnergyRef.current = Math.max(0, currentEnergy - defendCost);
        
        addToBattleLog(`Enemy ${aiAction.creature.species_name} took a defensive stance! (-${defendCost} energy)`);
        
        // Queue defend animation with guaranteed callback
        queueAnimation({
          type: 'defend',
          defenderId: aiAction.creature.id,
          onComplete: safeCallback
        });
        break;
        
      case 'useTool':
        if (!aiAction.tool || !aiAction.target) {
          console.log("AI Error: Missing tool or target");
          safeCallback();
          break;
        }
        
        console.log("AI using tool:", aiAction.tool.name, "on", aiAction.target.species_name);
        
        const toolResult = applyTool(aiAction.target, aiAction.tool, difficulty, turn);
        
        if (toolResult && toolResult.updatedCreature) {
          dispatch({
            type: ACTIONS.USE_TOOL,
            result: toolResult,
            tool: aiAction.tool,
            isPlayerTool: false,
            isEnemyTool: true
          });
          
          addToBattleLog(`Enemy used ${aiAction.tool.name} on ${aiAction.target.species_name}!`);
          
          // Find appropriate user creature
          const toolUser = aiAction.user || enemyField.find(c => c.id !== aiAction.target.id) || aiAction.target;
          
          // Queue tool animation with guaranteed callback
          queueAnimation({
            type: 'tool',
            userId: toolUser.id,
            targetId: aiAction.target.id,
            tool: aiAction.tool,
            onComplete: safeCallback
          });
        } else {
          safeCallback();
        }
        break;
        
      case 'useSpell':
        if (!aiAction.spell || !aiAction.caster || !aiAction.target) {
          console.log("AI Error: Missing spell, caster, or target");
          safeCallback();
          break;
        }
        
        const spellCost = aiAction.energyCost || SPELL_ENERGY_COST;
        
        if (currentEnergy < spellCost) {
          console.log("AI Error: Not enough energy for spell");
          safeCallback();
          break;
        }
        
        console.log("AI casting spell:", aiAction.spell.name);
        
        const spellResult = applySpell(aiAction.caster, aiAction.target, aiAction.spell, difficulty, turn);
        
        if (spellResult) {
          // VALIDATION: Ensure damage is a number
          const spellDamage = spellResult.spellEffect?.damage || spellResult.spellEffect?.healing || 0;
          const validatedDamage = typeof spellDamage === 'number' ? spellDamage : 0;
          
          dispatch({
            type: ACTIONS.USE_SPELL,
            spellResult: {
              ...spellResult,
              spellEffect: {
                ...spellResult.spellEffect,
                damage: spellResult.spellEffect?.damage !== undefined ? validatedDamage : undefined,
                healing: spellResult.spellEffect?.healing !== undefined ? validatedDamage : undefined
              }
            },
            spell: aiAction.spell,
            energyCost: spellCost,
            isEnemySpell: true
          });
          
          currentEnemyEnergyRef.current = Math.max(0, currentEnergy - spellCost);
          
          const targetName = aiAction.target.id === aiAction.caster.id ? 'themselves' : aiAction.target.species_name;
          addToBattleLog(`Enemy ${aiAction.caster.species_name} cast ${aiAction.spell.name} on ${targetName}! (-${spellCost} energy)`);
          
          // Queue spell animation with VALIDATED damage and guaranteed callback
          queueAnimation({
            type: 'spell',
            casterId: aiAction.caster.id,
            targetId: aiAction.target.id,
            spell: aiAction.spell,
            damage: validatedDamage,
            onComplete: safeCallback
          });
        } else {
          safeCallback();
        }
        break;
        
      default:
        console.log("Unknown AI action type:", aiAction.type);
        safeCallback();
    }
  }, [difficulty, enemyField, turn, consecutiveActions, addToBattleLog, queueAnimation]);
  
  const finishEnemyTurn = useCallback(() => {
    console.log("Finishing enemy turn...");
    
    applyEnergyDecay();
    
    dispatch({ type: ACTIONS.INCREMENT_TURN });
    
    // Check for enemy combo bonus before resetting
    if (consecutiveActions.enemy >= 3) {
      dispatch({ type: ACTIONS.COMBO_BONUS, player: 'enemy' });
      addToBattleLog("Enemy achieved a combo bonus!");
      
      // Show combo effect
      queueAnimation({
        type: 'combo',
        comboLevel: consecutiveActions.enemy,
        isPlayer: false
      });
    }
    
    // Queue turn transition animation
    queueAnimation({
      type: 'turn-transition',
      player: 'player',
      turnNumber: turn + 1,
      onComplete: () => {
        dispatch({ type: ACTIONS.SET_ACTIVE_PLAYER, player: 'player' });
        
        const maxHandSize = 5;
        if (playerHand.length < maxHandSize && playerDeck.length > 0) {
          dispatch({ type: ACTIONS.DRAW_CARD, player: 'player' });
          addToBattleLog(`You drew ${playerDeck[0].species_name}.`);
        }
        
        if (enemyHand.length < getDifficultySettings(difficulty).initialHandSize + 1 && enemyDeck.length > 0) {
          dispatch({ type: ACTIONS.DRAW_CARD, player: 'enemy' });
          addToBattleLog(`Enemy drew a card.`);
        }
        
        regenerateEnergy();
        
        // Apply ongoing effects ONCE at the start of player's turn
        dispatch({ type: ACTIONS.APPLY_ONGOING_EFFECTS, addLog: addToBattleLog });
        
        addToBattleLog(`Turn ${turn + 1} - Your turn.`);
        
        setActionInProgress(false);
      }
    });
    
  }, [
    playerHand,
    playerDeck,
    enemyHand,
    enemyDeck,
    difficulty,
    turn,
    consecutiveActions,
    regenerateEnergy,
    applyEnergyDecay,
    addToBattleLog,
    queueAnimation
  ]);
  
  const processEnemyTurn = useCallback(() => {
    console.log("Starting enemy turn...");
    
    // Apply ongoing effects ONCE at the start of enemy's turn
    dispatch({ type: ACTIONS.APPLY_ONGOING_EFFECTS, addLog: addToBattleLog });
    
    setTimeout(() => {
      if (gameState === 'battle') {
        handleEnemyTurn();
      } else {
        setActionInProgress(false);
      }
    }, 750);
  }, [gameState, handleEnemyTurn, addToBattleLog]);
  
  // EVENT HANDLERS (ENHANCED WITH ANIMATIONS)
  const handlePlayerAction = useCallback((action, targetCreature, sourceCreature) => {
    if (actionInProgress || activePlayer !== 'player' || gameState !== 'battle') {
      console.log("Ignoring player action - not player turn or action in progress");
      return;
    }
    
    console.log("Player action:", action.type);
    
    const clearSelections = () => {
      setSelectedCreature(null);
      setTargetCreature(null);
    };
    
    switch(action.type) {
      case 'deploy':
        setActionInProgress(true);
        deployCreature(sourceCreature);
        clearSelections();
        setTimeout(() => setActionInProgress(false), 300);
        break;
        
      case 'attack':
        if (playerEnergy < ATTACK_ENERGY_COST) {
          addToBattleLog(`Not enough energy to attack. Needs ${ATTACK_ENERGY_COST} energy.`);
          return;
        }
        
        setActionInProgress(true);
        attackCreature(sourceCreature, targetCreature);
        clearSelections();
        setTimeout(() => setActionInProgress(false), ANIMATION_DURATIONS.ATTACK + 100);
        break;
        
      case 'useTool':
        setActionInProgress(true);
        useTool(action.tool, sourceCreature, true);
        clearSelections();
        setTimeout(() => setActionInProgress(false), ANIMATION_DURATIONS.TOOL + 100);
        break;
        
      case 'useSpell':
        setActionInProgress(true);
        useSpell(action.spell, sourceCreature, targetCreature, true);
        clearSelections();
        setTimeout(() => setActionInProgress(false), ANIMATION_DURATIONS.SPELL + 100);
        break;
        
      case 'defend':
        if (playerEnergy < DEFEND_ENERGY_COST) {
          addToBattleLog(`Not enough energy to defend. Needs ${DEFEND_ENERGY_COST} energy.`);
          return;
        }
        
        setActionInProgress(true);
        defendCreatureAction(sourceCreature);
        clearSelections();
        setTimeout(() => setActionInProgress(false), ANIMATION_DURATIONS.DEFEND + 100);
        break;
        
      case 'endTurn':
        setActionInProgress(true);
        clearSelections();
        
        if (consecutiveActions.player >= 3) {
          dispatch({ type: ACTIONS.COMBO_BONUS, player: 'player' });
          addToBattleLog("You achieved a combo bonus! All creatures gain +2 attack!");
          
          // Show combo effect
          queueAnimation({
            type: 'combo',
            comboLevel: consecutiveActions.player,
            isPlayer: true
          });
        }
        
        applyEnergyDecay();
        
        // Queue turn transition animation
        queueAnimation({
          type: 'turn-transition',
          player: 'enemy',
          turnNumber: turn,
          onComplete: () => {
            dispatch({ type: ACTIONS.SET_ACTIVE_PLAYER, player: 'enemy' });
            addToBattleLog(`Turn ${turn} - Enemy's turn.`);
            
            setTimeout(() => {
              if (gameState === 'battle') {
                processEnemyTurn();
              } else {
                setActionInProgress(false);
              }
            }, 750);
          }
        });
        break;
        
      default:
        addToBattleLog('Invalid action');
    }
  }, [
    gameState,
    activePlayer,
    actionInProgress,
    turn,
    playerEnergy,
    consecutiveActions,
    deployCreature,
    attackCreature,
    useTool,
    useSpell,
    defendCreatureAction,
    applyEnergyDecay,
    addToBattleLog,
    processEnemyTurn,
    queueAnimation
  ]);
  
  const handleCreatureSelect = useCallback((creature, isEnemy) => {
    if (activePlayer !== 'player' || actionInProgress) return;
    
    if (isEnemy) {
      setTargetCreature(prevTarget => {
        return prevTarget && prevTarget.id === creature.id ? null : creature;
      });
    } else {
      setSelectedCreature(prevSelected => {
        return prevSelected && prevSelected.id === creature.id ? null : creature;
      });
    }
  }, [activePlayer, actionInProgress]);
  
  const handleSelectCard = useCallback((creature) => {
    if (activePlayer !== 'player' || actionInProgress) return;
    
    setSelectedCreature(prevSelected => {
      return prevSelected && prevSelected.id === creature.id ? null : creature;
    });
    setTargetCreature(null);
  }, [activePlayer, actionInProgress]);
  
  const getAvailableActions = useCallback((selectedCreature, targetCreature) => {
    if (!selectedCreature) return [];
    
    const actions = [];
    
    if (playerHand.some(c => c.id === selectedCreature.id)) {
      actions.push('deploy');
    }
    
    if (playerField.some(c => c.id === selectedCreature.id)) {
      if (targetCreature && enemyField.some(c => c.id === targetCreature.id) && playerEnergy >= ATTACK_ENERGY_COST) {
        actions.push('attack');
      }
      
      if (playerTools.length > 0) {
        actions.push('useTool');
      }
      
      if (playerSpells.length > 0 && playerEnergy >= SPELL_ENERGY_COST) {
        actions.push('useSpell');
      }
      
      if (playerEnergy >= DEFEND_ENERGY_COST) {
        actions.push('defend');
      }
    }
    
    actions.push('endTurn');
    
    return actions;
  }, [playerHand, playerField, enemyField, playerTools, playerSpells, playerEnergy]);
  
  // EFFECTS
  useEffect(() => {
    if (gameState !== 'battle') {
      return;
    }
    
    const timeoutId = setTimeout(() => {
      if (gameState !== 'battle') {
        return;
      }
      
      console.log('Win condition check:', {
        enemyField: enemyField.length,
        enemyHand: enemyHand.length, 
        enemyDeck: enemyDeck.length,
        playerField: playerField.length,
        playerHand: playerHand.length,
        playerDeck: playerDeck.length
      });
      
      if (checkWinCondition()) {
        console.log('VICTORY!');
        dispatch({ type: ACTIONS.SET_GAME_STATE, gameState: 'victory' });
        addToBattleLog("Victory! You've defeated all enemy creatures!");
        setActionInProgress(false);
      } else if (checkLossCondition()) {
        console.log('DEFEAT!');
        dispatch({ type: ACTIONS.SET_GAME_STATE, gameState: 'defeat' });
        addToBattleLog("Defeat! All your creatures have been defeated!");
        setActionInProgress(false);
      }
    }, 100);
    
    return () => clearTimeout(timeoutId);
  }, [
    gameState, 
    enemyField.length, 
    enemyHand.length, 
    enemyDeck.length, 
    playerField.length, 
    playerHand.length, 
    playerDeck.length, 
    checkWinCondition, 
    checkLossCondition, 
    addToBattleLog
  ]);
  
  // Add effect to update charge effects each turn
  useEffect(() => {
    if (gameState === 'battle') {
      dispatch({ type: ACTIONS.UPDATE_CHARGE_EFFECTS });
    }
  }, [turn, gameState]);

  // Add effect to display synergies when they change
  useEffect(() => {
    if (activeSynergies && activeSynergies.length > 0) {
      displaySynergyEffects(activeSynergies);
      queueSynergyAnimation(activeSynergies);
    }
  }, [activeSynergies, displaySynergyEffects, queueSynergyAnimation]);
  
  // Data attributes for creature DOM elements
  const creatureDataAttributes = useCallback((creature, isEnemy) => {
    if (!creature) return {};
    
    return {
      'data-id': creature.id,
      'data-power': Math.max(
        creature.battleStats?.physicalAttack || 0,
        creature.battleStats?.magicalAttack || 0
      ),
      'data-defense': Math.max(
        creature.battleStats?.physicalDefense || 0,
        creature.battleStats?.magicalDefense || 0
      ),
      'data-type': creature.battleStats?.physicalAttack > creature.battleStats?.magicalAttack 
        ? 'physical' 
        : 'magical'
    };
  }, []);
  
  // RENDER
  const isDesktop = window.innerWidth >= 769;
  
  return (
    <div className="battle-game-overlay" style={{ zIndex: 10005 }}>
      <div className="battle-game" data-difficulty={difficulty}>
        {gameState === 'setup' && (
          <DifficultySelector 
            onSelectDifficulty={handleDifficultySelect} 
            onStartBattle={handleMoveToTeamSelect}
            creatureCount={creatureNfts?.length || 0} 
            difficulty={state.difficulty}
            onClose={onClose}
          />
        )}
        
        {gameState === 'teamSelect' && (
          <TeamSelector
            availableCreatures={creatureNfts || []}
            availableTools={toolNfts || []}
            availableSpells={spellNfts || []}
            difficulty={state.difficulty}
            onConfirmTeam={handleTeamConfirm}
            onBack={handleBackFromTeamSelect}
          />
        )}
        
        {gameState === 'battle' && (
          <>
            <BattleHeader 
              turn={turn} 
              playerEnergy={playerEnergy} 
              enemyEnergy={enemyEnergy}
              difficulty={state.difficulty}
              activePlayer={activePlayer}
              maxEnergy={MAX_ENERGY}
              consecutiveActions={consecutiveActions}
              energyMomentum={energyMomentum}
            />
            
            <div className="battle-content-wrapper">
              <div className="battle-main-area">
                <div className="battlefield-container">
                  <Battlefield 
                    playerField={playerField.map(creature => ({
                      ...creature,
                      ...creatureDataAttributes(creature, false)
                    }))}
                    enemyField={enemyField.map(creature => ({
                      ...creature,
                      ...creatureDataAttributes(creature, true)
                    }))}
                    activePlayer={activePlayer}
                    difficulty={state.difficulty}
                    onCreatureSelect={handleCreatureSelect}
                    selectedCreature={selectedCreature}
                    targetCreature={targetCreature}
                    isDesktop={isDesktop}
                    battleLog={battleLog}
                    availableActions={getAvailableActions(selectedCreature, targetCreature)}
                    onAction={handlePlayerAction}
                    disabled={activePlayer !== 'player' || actionInProgress}
                    availableTools={playerTools}
                    availableSpells={playerSpells}
                    playerEnergy={playerEnergy}
                    // Animation tracking props
                    animatingCreatureId={lastAttack?.attackerId || lastSpellCast?.casterId || lastDefend?.defenderId}
                    animationType={lastAttack ? 'attack' : lastSpellCast ? 'spell' : lastDefend ? 'defend' : null}
                    // Synergy props
                    activeSynergies={activeSynergies}
                  />
                </div>
                
                <PlayerHand 
                  hand={playerHand.map(creature => ({
                    ...creature,
                    ...creatureDataAttributes(creature, false)
                  }))}
                  onSelectCard={handleSelectCard}
                  disabled={activePlayer !== 'player' || actionInProgress}
                  selectedCreature={selectedCreature}
                  selectedCardId={selectedCreature?.id}
                  hasFieldSelection={selectedCreature && playerField.some(c => c.id === selectedCreature.id)}
                  hasHandSelection={selectedCreature && playerHand.some(c => c.id === selectedCreature.id)}
                />
              </div>
              
              {!isDesktop && (
                <>
                  <ActionPanel 
                    selectedCreature={selectedCreature}
                    targetCreature={targetCreature}
                    availableActions={getAvailableActions(selectedCreature, targetCreature)}
                    onAction={handlePlayerAction}
                    disabled={activePlayer !== 'player' || actionInProgress}
                    availableTools={playerTools}
                    availableSpells={playerSpells}
                    playerEnergy={playerEnergy}
                    // NEW: Add efficiency data
                    actionEfficiency={selectedCreature ? {
                      attack: getActionEfficiency('attack', selectedCreature, ATTACK_ENERGY_COST),
                      defend: getActionEfficiency('defend', selectedCreature, DEFEND_ENERGY_COST),
                      deploy: getActionEfficiency('deploy', selectedCreature, selectedCreature?.battleStats?.energyCost || 5)
                    } : null}
                  />
                  
                  <BattleLog log={battleLog} />
                </>
              )}
            </div>
          </>
        )}
        
        {(gameState === 'victory' || gameState === 'defeat') && (
          <BattleResult 
            result={gameState} 
            onPlayAgain={() => dispatch({ type: ACTIONS.SET_GAME_STATE, gameState: 'setup' })}
            onClose={onClose}
            stats={{
              turns: turn,
              remainingCreatures: playerField.length + playerHand.length,
              enemiesDefeated: (getDifficultySettings(state.difficulty).enemyDeckSize || 5) - (enemyField.length + enemyHand.length),
              combosAchieved: Math.max(consecutiveActions.player, consecutiveActions.enemy)
            }}
            difficulty={state.difficulty}
          />
        )}
      </div>
    </div>
  );
};

export default BattleGame;

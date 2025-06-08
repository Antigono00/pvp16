// src/utils/battleCore.js - FIXED WITH PROPER EFFECT HANDLING AND TIMING
import { 
  getToolEffect, 
  getSpellEffect, 
  calculateEffectPower, 
  processTimedEffect 
} from './itemEffects';
import { 
  calculateDamage, 
  calculateDerivedStats, 
  getRarityMultiplier, 
  getFormMultiplier,
  applySynergyModifiers,
  calculateComboBonus,
  checkFieldSynergies
} from './battleCalculations';

// BALANCED: Get maximum energy with reasonable scaling
const getMaxEnergy = (creatures, difficulty = 'medium') => {
  let baseEnergy = 15; // Reduced from 20
  
  // Difficulty-based energy scaling
  switch (difficulty) {
    case 'easy': baseEnergy = 12; break;
    case 'medium': baseEnergy = 15; break;
    case 'hard': baseEnergy = 18; break;
    case 'expert': baseEnergy = 20; break;
  }
  
  // Reduced energy bonus from creature count
  const creatureBonus = Math.floor(creatures.length * 0.25); // Reduced from 0.5
  
  return baseEnergy + creatureBonus;
};

// Helper function to recalculate stats after modifications
const recalculateDerivedStats = (creature) => {
  // Validate input
  if (!creature || !creature.stats) {
    console.error("Cannot recalculate stats for invalid creature:", creature);
    return creature.battleStats || {};
  }

  // Use the same calculation logic as the initial stat calculation
  const freshDerivedStats = calculateDerivedStats(creature);
  
  // Apply any active temporary modifications from effects
  const modifiedStats = { ...freshDerivedStats };
  
  if (creature.activeEffects && Array.isArray(creature.activeEffects)) {
    creature.activeEffects.forEach(effect => {
      if (effect && effect.statModifications) {
        Object.entries(effect.statModifications).forEach(([stat, value]) => {
          if (modifiedStats[stat] !== undefined) {
            modifiedStats[stat] += value;
            // Ensure stats don't go below reasonable minimums
            if (stat.includes('Attack') || stat.includes('Defense')) {
              modifiedStats[stat] = Math.max(1, modifiedStats[stat]);
            } else if (stat === 'maxHealth') {
              modifiedStats[stat] = Math.max(10, modifiedStats[stat]);
            } else if (stat === 'initiative' || stat.includes('Chance')) {
              modifiedStats[stat] = Math.max(0, modifiedStats[stat]);
            }
          }
        });
      }
    });
  }
  
  // Apply any permanent stat modifications from items, combinations, etc.
  if (creature.permanentModifications) {
    Object.entries(creature.permanentModifications).forEach(([stat, value]) => {
      if (modifiedStats[stat] !== undefined) {
        modifiedStats[stat] += value;
      }
    });
  }
  
  // Apply combination bonuses if present
  if (creature.combination_level && creature.combination_level > 0) {
    const combinationMultiplier = 1 + (creature.combination_level * 0.08); // Reduced from 0.1
    
    // Apply combination bonus to all stats
    Object.keys(modifiedStats).forEach(stat => {
      if (typeof modifiedStats[stat] === 'number' && !stat.includes('Chance') && stat !== 'energyCost') {
        modifiedStats[stat] = Math.round(modifiedStats[stat] * combinationMultiplier);
      }
    });
  }
  
  // Ensure health doesn't exceed max health after recalculation
  if (creature.currentHealth && creature.currentHealth > modifiedStats.maxHealth) {
    creature.currentHealth = modifiedStats.maxHealth;
  }
  
  return modifiedStats;
};

// Get description for effect types
const getEffectDescription = (effectType, powerLevel = 'normal') => {
  const descriptions = {
    'Surge': {
      'weak': 'Minor surge of power',
      'normal': 'Surge of enhanced abilities',
      'strong': 'Powerful surge of overwhelming might',
      'maximum': 'Ultimate surge of devastating power'
    },
    'Shield': {
      'weak': 'Basic protective barrier',
      'normal': 'Solid defensive enhancement',
      'strong': 'Powerful defensive fortress',
      'maximum': 'Impenetrable defensive barrier'
    },
    'Echo': {
      'weak': 'Faint repeating effect',
      'normal': 'Resonating enhancement',
      'strong': 'Powerful echoing phenomenon',
      'maximum': 'Overwhelming echo cascade'
    },
    'Drain': {
      'weak': 'Minor energy drain',
      'normal': 'Life force absorption',
      'strong': 'Powerful vampiric drain',
      'maximum': 'Devastating soul drain'
    },
    'Charge': {
      'weak': 'Slow power buildup',
      'normal': 'Steady power accumulation',
      'strong': 'Rapid power concentration',
      'maximum': 'Explosive power convergence'
    }
  };
  
  return descriptions[effectType]?.[powerLevel] || `${effectType.toLowerCase()} effect`;
};

// BALANCED: Process a full turn of battle
export const processTurn = (gameState, difficulty = 'medium') => {
  const newState = {...gameState};
  
  // Energy regeneration with balanced scaling
  const maxPlayerEnergy = getMaxEnergy(newState.playerField, difficulty);
  const maxEnemyEnergy = getMaxEnergy(newState.enemyField, difficulty);
  
  newState.playerEnergy = Math.min(
    newState.playerEnergy + calculateEnergyRegen(newState.playerField, difficulty),
    maxPlayerEnergy
  );
  
  newState.enemyEnergy = Math.min(
    newState.enemyEnergy + calculateEnergyRegen(newState.enemyField, difficulty),
    maxEnemyEnergy
  );
  
  // Apply ongoing effects - ONLY ONCE PER TURN
  newState.playerField = applyOngoingEffects(newState.playerField, difficulty, newState.turn);
  newState.enemyField = applyOngoingEffects(newState.enemyField, difficulty, newState.turn);
  
  // Remove defeated creatures with death effects
  newState.playerField = processDefeatedCreatures(newState.playerField, newState.enemyField);
  newState.enemyField = processDefeatedCreatures(newState.enemyField, newState.playerField);
  
  // Process draw phase with balanced hand limits
  const maxHandSize = getMaxHandSize(difficulty);
  
  if (newState.playerHand.length < maxHandSize && newState.playerDeck.length > 0) {
    const drawnCard = newState.playerDeck[0];
    newState.playerHand.push(drawnCard);
    newState.playerDeck = newState.playerDeck.slice(1);
  }
  
  if (newState.enemyHand.length < maxHandSize && newState.enemyDeck.length > 0) {
    const drawnCard = newState.enemyDeck[0];
    newState.enemyHand.push(drawnCard);
    newState.enemyDeck = newState.enemyDeck.slice(1);
  }
  
  return newState;
};

// BALANCED: Calculate energy regeneration
export const calculateEnergyRegen = (creatures, difficulty = 'medium') => {
  let baseRegen = 3;
  
  // Difficulty-based base regen
  switch (difficulty) {
    case 'easy': baseRegen = 2; break;
    case 'medium': baseRegen = 3; break;
    case 'hard': baseRegen = 4; break;
    case 'expert': baseRegen = 5; break;
  }
  
  // Energy contributions from creatures (reduced scaling)
  const energyContribution = creatures.reduce((total, creature) => {
    if (!creature.stats || !creature.stats.energy) return total;
    
    // Base energy contribution
    let contribution = creature.stats.energy * 0.1; // Reduced from 0.3
    
    // Rarity bonuses (reduced)
    switch (creature.rarity) {
      case 'Legendary': contribution *= 1.3; break;
      case 'Epic': contribution *= 1.2; break;
      case 'Rare': contribution *= 1.1; break;
    }
    
    // Form bonuses
    contribution *= (1 + (creature.form || 0) * 0.05);
    
    return total + contribution;
  }, 0);
  
  // Specialty stat bonuses (reduced)
  const specialtyBonus = creatures.reduce((total, creature) => {
    if (creature.specialty_stats && creature.specialty_stats.includes('energy')) {
      return total + 0.5; // Reduced from 1
    }
    return total;
  }, 0);
  
  return Math.round(baseRegen + energyContribution + specialtyBonus);
};

// Get max hand size based on difficulty
export const getMaxHandSize = (difficulty) => {
  switch (difficulty) {
    case 'easy': return 5;
    case 'medium': return 4;
    case 'hard': return 3;
    case 'expert': return 3;
    default: return 4;
  }
};

// FIXED: Apply creature effects PROPERLY - only process each effect once per turn
export const applyOngoingEffects = (creatures, difficulty = 'medium', currentTurn = 0) => {
  if (!creatures || !Array.isArray(creatures)) {
    console.error("Invalid creatures array:", creatures);
    return [];
  }

  return creatures.map(creature => {
    // Skip creatures with missing properties
    if (!creature || !creature.battleStats) return creature;
    
    const updatedCreature = {...creature};
    let statsModified = false;
    let healthChanged = false;
    
    // Track current stat modifications from effects
    const currentStatMods = {};
    
    // Process active effects
    updatedCreature.activeEffects = (updatedCreature.activeEffects || [])
      .map(effect => {
        // Skip effects with missing data
        if (!effect) return null;
        
        // FIXED: Process timed effects (like Charge and Echo)
        const processedEffect = processTimedEffect(effect, currentTurn, effect.startTurn || 0);
        
        // Apply stat modifications
        if (processedEffect.statModifications) {
          Object.entries(processedEffect.statModifications).forEach(([stat, value]) => {
            currentStatMods[stat] = (currentStatMods[stat] || 0) + value;
            statsModified = true;
          });
        }
        
        // FIXED: Apply health over time effects (Echo, Drain, etc.)
        if (processedEffect.healthOverTime !== undefined && processedEffect.healthOverTime !== 0) {
          let healthChange = processedEffect.healthOverTime;
          
          // Scale health effects by difficulty
          switch (difficulty) {
            case 'hard': healthChange = Math.round(healthChange * 1.15); break;
            case 'expert': healthChange = Math.round(healthChange * 1.25); break;
          }
          
          // Rarity scaling (reduced)
          switch (updatedCreature.rarity) {
            case 'Legendary': healthChange = Math.round(healthChange * 1.2); break;
            case 'Epic': healthChange = Math.round(healthChange * 1.15); break;
            case 'Rare': healthChange = Math.round(healthChange * 1.1); break;
          }
          
          const previousHealth = updatedCreature.currentHealth;
          updatedCreature.currentHealth = Math.min(
            updatedCreature.battleStats.maxHealth,
            Math.max(0, updatedCreature.currentHealth + healthChange)
          );
          
          if (updatedCreature.currentHealth !== previousHealth) {
            healthChanged = true;
            
            // Log significant health changes
            const actualChange = updatedCreature.currentHealth - previousHealth;
            if (Math.abs(actualChange) >= 5) {
              console.log(`${updatedCreature.species_name} ${actualChange > 0 ? 'healed' : 'damaged'} for ${Math.abs(actualChange)} (${processedEffect.name})`);
            }
          }
        }
        
        // Process special effect types
        if (processedEffect.type === 'charge' && processedEffect.chargeEffect) {
          // Charge effects get stronger over time
          const turnsActive = currentTurn - (processedEffect.startTurn || 0);
          const chargeProgress = Math.min(turnsActive / (processedEffect.chargeEffect.maxTurns || 3), 1.0);
          
          if (chargeProgress >= 1.0 && processedEffect.chargeEffect.finalBurst) {
            // Apply final burst effect
            const burstDamage = processedEffect.chargeEffect.finalBurst;
            updatedCreature.nextAttackBonus = (updatedCreature.nextAttackBonus || 0) + burstDamage;
            console.log(`${updatedCreature.species_name} charged effect ready! Next attack gains ${burstDamage} damage.`);
            
            // Mark effect for removal
            return { ...processedEffect, duration: 0 };
          } else {
            // Apply incremental charge bonus
            const incrementalBonus = Math.floor(processedEffect.chargeEffect.perTurnBonus * chargeProgress);
            if (processedEffect.chargeEffect.targetStat && incrementalBonus > 0) {
              currentStatMods[processedEffect.chargeEffect.targetStat] = 
                (currentStatMods[processedEffect.chargeEffect.targetStat] || 0) + incrementalBonus;
              statsModified = true;
            }
          }
        }
        
        // Reduce duration
        return {
          ...processedEffect,
          duration: processedEffect.duration - 1
        };
      })
      .filter(effect => effect && effect.duration > 0); // Remove expired or invalid effects
    
    // FIXED: Recalculate stats with current modifications
    if (statsModified) {
      // Start with base stats
      updatedCreature.battleStats = calculateDerivedStats(updatedCreature);
      
      // Apply current effect modifications
      Object.entries(currentStatMods).forEach(([stat, value]) => {
        if (updatedCreature.battleStats[stat] !== undefined) {
          updatedCreature.battleStats[stat] = Math.max(0, updatedCreature.battleStats[stat] + value);
        }
      });
    }
    
    // Process special creature states
    if (updatedCreature.isDefending) {
      // Defending bonus expires at end of turn
      updatedCreature.isDefending = false;
    }
    
    return updatedCreature;
  });
};

// Process defeated creatures and apply death effects
const processDefeatedCreatures = (creatures, opposingCreatures = []) => {
  const survivingCreatures = [];
  
  creatures.forEach(creature => {
    if (creature.currentHealth > 0) {
      survivingCreatures.push(creature);
    } else {
      // Apply balanced death effects based on creature properties
      if (creature.rarity === 'Legendary') {
        console.log(`${creature.species_name} (Legendary) was defeated! Their sacrifice empowers allies!`);
        // Death rattle effect - empower remaining creatures (reduced)
        survivingCreatures.forEach(ally => {
          ally.battleStats.physicalAttack += 2; // Reduced from 3
          ally.battleStats.magicalAttack += 2;  // Reduced from 3
          
          // Add a temporary effect to track this bonus
          if (!ally.activeEffects) ally.activeEffects = [];
          ally.activeEffects.push({
            id: Date.now() + Math.random(),
            name: `${creature.species_name}'s Final Gift`,
            icon: '👑',
            type: 'legendary_blessing',
            description: 'Empowered by a fallen legendary creature',
            duration: 5, // Reduced from 999 - now temporary
            statModifications: {
              physicalAttack: 2,
              magicalAttack: 2
            },
            startTurn: ally.currentTurn || 0
          });
        });
      } else if (creature.specialty_stats && creature.specialty_stats.includes('energy')) {
        console.log(`Energy specialist ${creature.species_name} was defeated! Releasing stored energy!`);
        // Energy burst - restore energy to allies
        survivingCreatures.forEach(ally => {
          if (!ally.activeEffects) ally.activeEffects = [];
          ally.activeEffects.push({
            id: Date.now() + Math.random(),
            name: 'Energy Release',
            icon: '⚡',
            type: 'energy_burst',
            description: 'Energized by released power',
            duration: 2, // Reduced from 3
            statModifications: {
              energyCost: -1
            },
            startTurn: ally.currentTurn || 0
          });
        });
      } else if (creature.rarity === 'Epic') {
        console.log(`Epic creature ${creature.species_name} was defeated! Their essence lingers!`);
        // Epic death effect - minor stat boost to allies
        survivingCreatures.forEach(ally => {
          if (!ally.activeEffects) ally.activeEffects = [];
          ally.activeEffects.push({
            id: Date.now() + Math.random(),
            name: 'Epic Essence',
            icon: '💜',
            type: 'epic_blessing',
            description: 'Blessed by epic essence',
            duration: 3, // Reduced from 5
            statModifications: {
              physicalAttack: 1,
              magicalAttack: 1
            },
            startTurn: ally.currentTurn || 0
          });
        });
      }
      
      // NEW: Revenge mechanic - opposing creatures get minor penalty when defeating strong creatures
      if (creature.rarity === 'Legendary' || creature.rarity === 'Epic') {
        opposingCreatures.forEach(enemy => {
          if (!enemy.activeEffects) enemy.activeEffects = [];
          enemy.activeEffects.push({
            id: Date.now() + Math.random(),
            name: 'Guilty Conscience',
            icon: '😰',
            type: 'debuff',
            description: 'Shaken by defeating a powerful foe',
            duration: 2,
            statModifications: {
              initiative: -2,
              dodgeChance: -1
            },
            startTurn: enemy.currentTurn || 0
          });
        });
      }
    }
  });
  
  return survivingCreatures;
};

// ENHANCED: Process attack action with combo bonus
export const processAttack = (attacker, defender, attackType = 'auto', comboLevel = 0) => {
  // Validate input
  if (!attacker || !defender || !attacker.battleStats || !defender.battleStats) {
    return {
      updatedAttacker: attacker,
      updatedDefender: defender,
      battleLog: "Invalid attack - missing stats",
      damageResult: { damage: 0, isDodged: false, isCritical: false, effectiveness: 'normal' }
    };
  }
  
  // Clone creatures to avoid mutating original objects
  const attackerClone = JSON.parse(JSON.stringify(attacker));
  const defenderClone = JSON.parse(JSON.stringify(defender));
  
  // Determine attack type if set to auto
  if (attackType === 'auto') {
    attackType = attackerClone.battleStats.physicalAttack >= attackerClone.battleStats.magicalAttack 
      ? 'physical' 
      : 'magical';
  }
  
  // Apply charge bonuses if available
  if (attackerClone.nextAttackBonus) {
    if (attackType === 'physical') {
      attackerClone.battleStats.physicalAttack += attackerClone.nextAttackBonus;
    } else {
      attackerClone.battleStats.magicalAttack += attackerClone.nextAttackBonus;
    }
    // Consume the bonus
    delete attackerClone.nextAttackBonus;
    console.log(`${attackerClone.species_name} unleashes charged attack!`);
  }
  
  // FIXED: Calculate combo multiplier
  const comboMultiplier = calculateComboBonus(comboLevel);
  
  // FIXED: Pass combo multiplier to damage calculation
  const damageResult = calculateDamage(attackerClone, defenderClone, attackType, comboMultiplier);
  
  // Apply damage with additional effects
  if (!damageResult.isDodged) {
    // Base damage
    defenderClone.currentHealth = Math.max(0, defenderClone.currentHealth - damageResult.damage);
    
    // Critical hit effects (reduced impact)
    if (damageResult.isCritical) {
      // Critical hits may apply additional effects
      if (Math.random() < 0.2) { // Reduced from 0.3
        const bonusEffect = {
          id: Date.now(),
          name: 'Critical Strike Trauma',
          icon: '💥',
          type: 'debuff',
          description: 'Suffering from critical strike',
          duration: 1, // Reduced from 2
          statModifications: {
            physicalDefense: -2, // Reduced from -3
            magicalDefense: -2   // Reduced from -3
          },
          startTurn: defenderClone.currentTurn || 0
        };
        
        defenderClone.activeEffects = [...(defenderClone.activeEffects || []), bonusEffect];
      }
    }
    
    // Effectiveness bonuses (reduced)
    if (damageResult.effectiveness === 'very effective' || damageResult.effectiveness === 'effective') {
      // Effective attacks may cause additional effects
      if (Math.random() < 0.25) { // Reduced from 0.4
        const statusEffect = {
          id: Date.now() + 1,
          name: 'Elemental Weakness',
          icon: '⚡',
          type: 'debuff',
          description: 'Vulnerable to attacks',
          duration: 2, // Reduced from 3
          statModifications: {
            physicalDefense: -1, // Reduced from -2
            magicalDefense: -1   // Reduced from -2
          },
          startTurn: defenderClone.currentTurn || 0
        };
        
        defenderClone.activeEffects = [...(defenderClone.activeEffects || []), statusEffect];
      }
    }
  }
  
  // Create detailed battle log entry
  let logMessage = '';
  
  if (damageResult.isDodged) {
    logMessage = `${attackerClone.species_name}'s ${attackType} attack was dodged by ${defenderClone.species_name}!`;
  } else {
    logMessage = `${attackerClone.species_name} used ${attackType} attack on ${defenderClone.species_name}`;
    
    if (damageResult.isCritical) {
      logMessage += ' (Critical Hit!)';
    }
    
    if (comboLevel > 1) {
      logMessage += ` [Combo x${comboLevel}!]`;
    }
    
    if (damageResult.effectiveness !== 'normal') {
      logMessage += ` - ${damageResult.effectiveness}!`;
    }
    
    if (damageResult.damageType && damageResult.damageType !== 'normal') {
      logMessage += ` [${damageResult.damageType}]`;
    }
    
    logMessage += ` dealing ${damageResult.damage} damage.`;
    
    // Death message
    if (defenderClone.currentHealth <= 0) {
      if (defenderClone.rarity === 'Legendary') {
        logMessage += ` ${defenderClone.species_name} falls in battle!`;
      } else if (defenderClone.rarity === 'Epic') {
        logMessage += ` ${defenderClone.species_name} has been defeated!`;
      } else {
        logMessage += ` ${defenderClone.species_name} was defeated!`;
      }
    } else if (defenderClone.currentHealth < defenderClone.battleStats.maxHealth * 0.2) {
      logMessage += ` ${defenderClone.species_name} is critically wounded!`;
    } else if (defenderClone.currentHealth < defenderClone.battleStats.maxHealth * 0.5) {
      logMessage += ` ${defenderClone.species_name} is wounded!`;
    }
  }
  
  return {
    updatedAttacker: attackerClone,
    updatedDefender: defenderClone,
    battleLog: logMessage,
    damageResult: {
      ...damageResult,
      comboMultiplier: comboMultiplier
    }
  };
};

// FIXED: Apply tool effect with proper effect tracking
export const applyTool = (creature, tool, difficulty = 'medium', currentTurn = 0) => {
  // Validate input
  if (!creature || !tool) {
    console.error("Tool application failed - missing creature or tool:", { creature, tool });
    return {
      updatedCreature: creature,
      toolEffect: null
    };
  }
  
  if (!creature.battleStats) {
    console.error("Tool application failed - creature missing battleStats:", creature);
    return {
      updatedCreature: creature,
      toolEffect: null
    };
  }
  
  // Make a deep copy of the creature to avoid mutations
  const creatureClone = JSON.parse(JSON.stringify(creature));
  creatureClone.currentTurn = currentTurn; // Track current turn for effects
  
  // Get tool effect with balanced power scaling
  const basePowerMultiplier = calculateEffectPower(tool, creature.stats, difficulty);
  const toolEffect = getToolEffect(tool);
  
  if (!toolEffect) {
    console.error("Tool application failed - invalid tool effect:", { tool, toolEffect });
    return {
      updatedCreature: creature,
      toolEffect: null
    };
  }
  
  // Scale effects by power multiplier (with caps)
  const scaledToolEffect = {
    ...toolEffect,
    statChanges: toolEffect.statChanges ? 
      Object.entries(toolEffect.statChanges).reduce((acc, [stat, value]) => {
        // Cap stat changes to prevent extreme values
        const cappedValue = Math.min(Math.abs(value), 10) * Math.sign(value);
        acc[stat] = Math.round(cappedValue * Math.min(basePowerMultiplier, 1.5));
        return acc;
      }, {}) : {},
    healthChange: toolEffect.healthChange ? 
      Math.round(Math.min(toolEffect.healthChange * basePowerMultiplier, 50)) : 0, // Cap healing
    healthOverTime: toolEffect.healthOverTime ? 
      Math.round(toolEffect.healthOverTime * basePowerMultiplier) : 0,
    duration: toolEffect.duration || 1
  };
  
  // Apply immediate stat changes
  if (scaledToolEffect.statChanges && typeof scaledToolEffect.statChanges === 'object') {
    Object.entries(scaledToolEffect.statChanges).forEach(([stat, value]) => {
      if (creatureClone.battleStats[stat] !== undefined) {
        creatureClone.battleStats[stat] = Math.max(0, creatureClone.battleStats[stat] + value);
      }
    });
  }
  
  // Add active effect with better tracking
  if (scaledToolEffect.duration > 0) {
    const powerLevel = basePowerMultiplier >= 1.3 ? 'strong' :
                     basePowerMultiplier >= 1.1 ? 'normal' : 'weak';
    
    const activeEffect = {
      id: Date.now() + Math.random(),
      name: `${tool.name || "Tool"} Effect`,
      icon: getToolIcon(tool.tool_effect),
      type: tool.tool_type || "enhancement",
      description: getEffectDescription(tool.tool_effect || "enhancement", powerLevel),
      duration: scaledToolEffect.duration,
      statModifications: scaledToolEffect.statChanges || {},
      healthOverTime: scaledToolEffect.healthOverTime || 0,
      powerLevel: powerLevel,
      startTurn: currentTurn,
      effectType: tool.tool_effect
    };
    
    // Add special properties for specific effect types
    if (tool.tool_effect === 'Charge' && toolEffect.chargeEffect) {
      activeEffect.type = 'charge';
      activeEffect.chargeEffect = {
        ...toolEffect.chargeEffect,
        perTurnBonus: Math.round(toolEffect.chargeEffect.perTurnBonus * basePowerMultiplier),
        finalBurst: Math.round(toolEffect.chargeEffect.finalBurst * basePowerMultiplier)
      };
    }
    
    creatureClone.activeEffects = [
      ...(creatureClone.activeEffects || []),
      activeEffect
    ];
  }
  
  // Apply immediate healing
  if (scaledToolEffect.healthChange && scaledToolEffect.healthChange > 0) {
    const oldHealth = creatureClone.currentHealth;
    creatureClone.currentHealth = Math.min(
      creatureClone.currentHealth + scaledToolEffect.healthChange,
      creatureClone.battleStats.maxHealth
    );
    
    const actualHealing = creatureClone.currentHealth - oldHealth;
    console.log(`${tool.name} healed ${creatureClone.species_name} for ${actualHealing} health`);
  }
  
  // Recalculate derived stats after tool application
  creatureClone.battleStats = recalculateDerivedStats(creatureClone);
  
  return {
    updatedCreature: creatureClone,
    toolEffect: scaledToolEffect
  };
};

// FIXED: Apply spell effect with proper effect tracking
export const applySpell = (caster, target, spell, difficulty = 'medium', currentTurn = 0) => {
  // Validate input
  if (!caster || !target || !spell) {
    console.error("Spell application failed - missing parameters:", { caster, target, spell });
    return {
      updatedCaster: caster,
      updatedTarget: target,
      spellEffect: null
    };
  }
  
  if (!caster.stats || !target.battleStats) {
    console.error("Spell application failed - missing stats:", { 
      casterStats: caster.stats, 
      targetBattleStats: target.battleStats 
    });
    return {
      updatedCaster: caster,
      updatedTarget: target,
      spellEffect: null
    };
  }
  
  // Deep clone to avoid mutations
  const targetClone = JSON.parse(JSON.stringify(target));
  const casterClone = JSON.parse(JSON.stringify(caster));
  targetClone.currentTurn = currentTurn;
  casterClone.currentTurn = currentTurn;
  
  // Get spell effect with balanced power scaling
  const casterMagic = caster.stats.magic || 5;
  const basePowerMultiplier = calculateEffectPower(spell, caster.stats, difficulty);
  const spellEffect = getSpellEffect(spell, casterMagic);
  
  if (!spellEffect) {
    console.error("Spell application failed - invalid spell effect:", { spell, spellEffect });
    return {
      updatedCaster: caster,
      updatedTarget: target,
      spellEffect: null
    };
  }
  
  // Scale spell effects by power multiplier (with caps)
  const scaledSpellEffect = {
    ...spellEffect,
    damage: spellEffect.damage ? 
      Math.round(Math.min(spellEffect.damage * basePowerMultiplier, 100)) : 0, // Cap damage
    healing: spellEffect.healing ? 
      Math.round(Math.min(spellEffect.healing * basePowerMultiplier, 80)) : 0, // Cap healing
    selfHeal: spellEffect.selfHeal ? 
      Math.round(Math.min(spellEffect.selfHeal * basePowerMultiplier, 40)) : 0, // Cap self heal
    healthOverTime: spellEffect.healthOverTime ? 
      Math.round(spellEffect.healthOverTime * basePowerMultiplier) : 0,
    statChanges: spellEffect.statChanges ? 
      Object.entries(spellEffect.statChanges).reduce((acc, [stat, value]) => {
        // Cap stat changes
        const cappedValue = Math.min(Math.abs(value), 12) * Math.sign(value);
        acc[stat] = Math.round(cappedValue * Math.min(basePowerMultiplier, 1.5));
        return acc;
      }, {}) : {},
    statDrain: spellEffect.statDrain,
    statGain: spellEffect.statGain
  };
  
  // Apply direct damage with critical chance
  if (scaledSpellEffect.damage) {
    let finalDamage = scaledSpellEffect.damage;
    
    // Spell critical hits based on caster's magic (reduced chance)
    const critChance = Math.min(3 + Math.floor(casterMagic * 0.3), 15); // Reduced from 0.5
    const isCritical = Math.random() * 100 <= critChance;
    
    if (isCritical) {
      finalDamage = Math.round(finalDamage * 1.5); // Reduced from 1.8
      console.log(`${spell.name} critical hit! Damage increased to ${finalDamage}`);
    }
    
    // Apply armor piercing for high-level spells (reduced effectiveness)
    if (scaledSpellEffect.armorPiercing || basePowerMultiplier >= 1.3) {
      // Ignore 20% of target's defenses (reduced from 30%)
      const defenseMitigation = Math.round(finalDamage * 0.2);
      finalDamage += defenseMitigation;
      console.log(`Spell pierces armor for additional ${defenseMitigation} damage`);
    }
    
    console.log(`Applying spell damage: ${finalDamage} to ${targetClone.species_name}`);
    targetClone.currentHealth = Math.max(0, targetClone.currentHealth - finalDamage);
    
    // Update the effect with actual damage dealt
    scaledSpellEffect.actualDamage = finalDamage;
    scaledSpellEffect.wasCritical = isCritical;
  }
  
  // Apply healing effects
  if (scaledSpellEffect.healing && caster.id === target.id) {
    const oldHealth = targetClone.currentHealth;
    targetClone.currentHealth = Math.min(
      targetClone.currentHealth + scaledSpellEffect.healing,
      targetClone.battleStats.maxHealth
    );
    
    const actualHealing = targetClone.currentHealth - oldHealth;
    console.log(`${spell.name} healed ${targetClone.species_name} for ${actualHealing} health`);
  }
  
  // Apply self healing for drain spells
  if (scaledSpellEffect.selfHeal && caster.id !== target.id) {
    const oldCasterHealth = casterClone.currentHealth;
    casterClone.currentHealth = Math.min(
      casterClone.currentHealth + scaledSpellEffect.selfHeal,
      casterClone.battleStats.maxHealth
    );
    
    const actualSelfHeal = casterClone.currentHealth - oldCasterHealth;
    console.log(`${casterClone.species_name} drained ${actualSelfHeal} health from ${targetClone.species_name}`);
  }
  
  // Apply immediate stat changes
  if (scaledSpellEffect.statChanges && Object.keys(scaledSpellEffect.statChanges).length > 0) {
    Object.entries(scaledSpellEffect.statChanges).forEach(([stat, value]) => {
      if (targetClone.battleStats[stat] !== undefined) {
        targetClone.battleStats[stat] = Math.max(0, targetClone.battleStats[stat] + value);
      }
    });
  }
  
  // Apply stat drain effects (from target to caster)
  if (scaledSpellEffect.statDrain && scaledSpellEffect.statGain) {
    Object.entries(scaledSpellEffect.statDrain).forEach(([stat, value]) => {
      if (targetClone.battleStats[stat] !== undefined && casterClone.battleStats[stat] !== undefined) {
        // Drain from target
        targetClone.battleStats[stat] = Math.max(0, targetClone.battleStats[stat] + value);
        // Gain to caster
        const gainValue = scaledSpellEffect.statGain[stat] || 0;
        casterClone.battleStats[stat] = casterClone.battleStats[stat] + gainValue;
      }
    });
  }
  
  // Add active effect with detailed tracking
  if (spellEffect.duration > 0) {
    const powerLevel = basePowerMultiplier >= 1.3 ? 'strong' :
                     basePowerMultiplier >= 1.1 ? 'normal' : 'weak';
    
    const activeEffect = {
      id: Date.now() + Math.random(),
      name: `${spell.name || "Spell"} Effect`,
      icon: getSpellIcon(spell.spell_effect),
      type: spell.spell_type || "magic",
      description: getEffectDescription(spell.spell_effect || "magic", powerLevel),
      duration: spellEffect.duration,
      statModifications: scaledSpellEffect.statChanges || {},
      healthOverTime: scaledSpellEffect.healthOverTime || 0,
      casterMagic: casterMagic,
      powerLevel: powerLevel,
      startTurn: currentTurn,
      effectType: spell.spell_effect
    };
    
    // Add special properties for specific effect types
    if (spell.spell_effect === 'Charge' && spellEffect.prepareEffect) {
      activeEffect.type = 'charge';
      activeEffect.prepareEffect = {
        ...spellEffect.prepareEffect,
        damage: Math.round(spellEffect.prepareEffect.damage * basePowerMultiplier)
      };
    }
    
    targetClone.activeEffects = [
      ...(targetClone.activeEffects || []),
      activeEffect
    ];
  }
  
  // Recalculate derived stats after spell effects
  if (Object.keys(scaledSpellEffect.statChanges || {}).length > 0) {
    targetClone.battleStats = recalculateDerivedStats(targetClone);
  }
  
  return {
    updatedCaster: casterClone,
    updatedTarget: targetClone,
    spellEffect: scaledSpellEffect
  };
};

// Put creature in defensive stance with balanced bonuses
export const defendCreature = (creature, difficulty = 'medium') => {
  // Validate input
  if (!creature || !creature.battleStats) {
    console.error("Defend action failed - missing creature or battleStats:", creature);
    return creature;
  }
  
  // Deep clone to avoid mutations
  const creatureClone = JSON.parse(JSON.stringify(creature));
  
  // Add defensive bonus with balanced scaling
  creatureClone.isDefending = true;
  
  // Calculate balanced defense boosts
  const baseDefenseBoost = difficulty === 'expert' ? 0.5 : 
                          difficulty === 'hard' ? 0.4 :
                          difficulty === 'medium' ? 0.3 : 0.25;
  
  const physicalDefenseBoost = Math.round(creatureClone.battleStats.physicalDefense * baseDefenseBoost);
  const magicalDefenseBoost = Math.round(creatureClone.battleStats.magicalDefense * baseDefenseBoost);
  
  // Rarity bonus (reduced)
  let rarityBonus = 0;
  switch (creatureClone.rarity) {
    case 'Legendary': rarityBonus = 3; break;
    case 'Epic': rarityBonus = 2; break;
    case 'Rare': rarityBonus = 1; break;
    default: rarityBonus = 0; break;
  }
  
  // Apply defense boost to battle stats
  creatureClone.battleStats = {
    ...creatureClone.battleStats,
    physicalDefense: creatureClone.battleStats.physicalDefense + physicalDefenseBoost + rarityBonus,
    magicalDefense: creatureClone.battleStats.magicalDefense + magicalDefenseBoost + rarityBonus
  };
  
  // FIXED: Add defensive effect that will be removed next turn
  creatureClone.activeEffects = [
    ...(creatureClone.activeEffects || []),
    {
      id: Date.now(),
      name: 'Defensive Stance',
      icon: '🛡️',
      type: 'defense',
      description: `Defensive posture (+${physicalDefenseBoost + rarityBonus} defense)`,
      duration: 1,
      statModifications: {
        physicalDefense: physicalDefenseBoost + rarityBonus,
        magicalDefense: magicalDefenseBoost + rarityBonus
      },
      damageReduction: 0.05, // 5% damage reduction (reduced from 10%)
      counterAttackChance: difficulty === 'expert' ? 0.1 : 0.05, // Reduced counter chance
      startTurn: creatureClone.currentTurn || 0
    }
  ];
  
  // Recalculate stats after defense bonuses
  creatureClone.battleStats = recalculateDerivedStats(creatureClone);
  
  return creatureClone;
};

// Helper function to get appropriate icon for tool effects
const getToolIcon = (toolEffect) => {
  const icons = {
    'Surge': '⚡',
    'Shield': '🛡️',
    'Echo': '🔊',
    'Drain': '🩸',
    'Charge': '🔋'
  };
  return icons[toolEffect] || '🔧';
};

// Helper function to get appropriate icon for spell effects
const getSpellIcon = (spellEffect) => {
  const icons = {
    'Surge': '💥',
    'Shield': '✨',
    'Echo': '🌊',
    'Drain': '🌙',
    'Charge': '☄️'
  };
  return icons[spellEffect] || '✨';
};

// ENHANCED: Process energy momentum and return bonus regen
export const processEnergyMomentum = (momentum) => {
  // Energy momentum provides bonus regen based on total momentum
  const bonusRegen = Math.floor(momentum / 10); // 1 bonus regen per 10 momentum
  
  return {
    currentMomentum: momentum,
    bonusRegen: bonusRegen,
    nextThreshold: 10 - (momentum % 10), // Energy needed for next bonus
    totalBonusEarned: bonusRegen
  };
};

// ENHANCED: Apply field synergies and return modified creatures
export const applyFieldSynergies = (creatures) => {
  if (!creatures || creatures.length === 0) return creatures;
  
  // Check for active synergies
  const synergies = checkFieldSynergies(creatures);
  
  if (synergies.length === 0) return creatures;
  
  console.log(`Applying ${synergies.length} synergies to field:`, synergies);
  
  // Apply synergy modifiers to all creatures
  return applySynergyModifiers(creatures, synergies);
};

// NEW: Create visual effect data for synergies
export const createSynergyEffectData = (synergies) => {
  return synergies.map(synergy => {
    if (synergy.type === 'species') {
      return {
        type: 'species-synergy',
        species: synergy.species,
        count: synergy.count,
        bonus: synergy.bonus,
        message: `${synergy.species} Synergy x${synergy.count}! (+${Math.round(synergy.bonus * 100)}% stats)`,
        color: '#4CAF50'
      };
    } else if (synergy.type === 'stats') {
      return {
        type: 'stat-synergy',
        stats: synergy.stats,
        bonus: synergy.bonus,
        message: `${synergy.stats[0]} + ${synergy.stats[1]} Synergy! (+${Math.round(synergy.bonus * 100)}% stats)`,
        color: '#2196F3'
      };
    }
  });
};

// NEW: Calculate and display energy efficiency for actions
export const getActionEfficiency = (action, creature, energyCost) => {
  let efficiency = 0;
  let rating = '';
  
  switch (action) {
    case 'attack':
      const attackPower = Math.max(
        creature.battleStats?.physicalAttack || 0,
        creature.battleStats?.magicalAttack || 0
      );
      efficiency = attackPower / energyCost;
      break;
      
    case 'defend':
      const defensePower = Math.max(
        creature.battleStats?.physicalDefense || 0,
        creature.battleStats?.magicalDefense || 0
      );
      efficiency = (defensePower * 2) / energyCost; // Defense is more valuable
      break;
      
    case 'deploy':
      const creaturePower = calculateCreaturePower(creature);
      efficiency = (creaturePower / 10) / energyCost;
      break;
      
    case 'spell':
      efficiency = 15 / energyCost; // Base spell efficiency
      break;
  }
  
  // Rate the efficiency
  if (efficiency >= 20) rating = 'Excellent';
  else if (efficiency >= 15) rating = 'Good';
  else if (efficiency >= 10) rating = 'Average';
  else if (efficiency >= 5) rating = 'Poor';
  else rating = 'Terrible';
  
  return {
    value: efficiency.toFixed(1),
    rating: rating,
    color: efficiency >= 15 ? '#4CAF50' : efficiency >= 10 ? '#FFC107' : '#F44336'
  };
};

// NEW: Process charge effect progression
export const updateChargeEffects = (creature, currentTurn) => {
  if (!creature.activeEffects) return creature;
  
  const updatedCreature = { ...creature };
  
  updatedCreature.activeEffects = creature.activeEffects.map(effect => {
    if (effect.effectType === 'Charge' && effect.chargeEffect) {
      const turnsActive = currentTurn - (effect.startTurn || 0);
      const maxTurns = effect.chargeEffect.maxTurns || 3;
      const chargeProgress = Math.min(turnsActive / maxTurns, 1.0) * 100;
      
      return {
        ...effect,
        chargeProgress: chargeProgress,
        turnsRemaining: Math.max(0, maxTurns - turnsActive),
        isReady: chargeProgress >= 100
      };
    }
    return effect;
  });
  
  return updatedCreature;
};

// Export the missing function for creature power calculation
export const calculateCreaturePower = (creature) => {
  if (!creature || !creature.battleStats) return 0;
  
  const stats = creature.battleStats;
  const attackPower = Math.max(stats.physicalAttack || 0, stats.magicalAttack || 0);
  const defensePower = Math.max(stats.physicalDefense || 0, stats.magicalDefense || 0);
  const utilityPower = (stats.initiative || 0) + (stats.criticalChance || 0) + (stats.dodgeChance || 0);
  
  const formLevel = parseInt(creature.form) || 0;
  
  return Math.round(
    (attackPower * 2) + 
    defensePower + 
    (stats.maxHealth || 0) * 0.1 + 
    utilityPower * 0.5 +
    formLevel * 5 +
    getRarityValue(creature.rarity) * 10
  );
};

// Helper function for rarity values
const getRarityValue = (rarity) => {
  switch (rarity) {
    case 'Legendary': return 4;
    case 'Epic': return 3;
    case 'Rare': return 2;
    default: return 1;
  }
};

// Re-export checkFieldSynergies for use in other components
export { checkFieldSynergies };

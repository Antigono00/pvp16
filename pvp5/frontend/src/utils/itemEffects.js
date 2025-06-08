// src/utils/itemEffects.js - REBALANCED VERSION WITH PROPER EFFECT DEFINITIONS

// BALANCED: Get tool effect details with reasonable impact
export const getToolEffect = (tool) => {
  // Validate input - prevent null/undefined access
  if (!tool || !tool.tool_effect || !tool.tool_type) {
    console.error("Invalid tool data:", tool);
    // Return safe default values to prevent crashes
    return {
      statChanges: { physicalDefense: 2 },
      duration: 1
    };
  }

  const effect = tool.tool_effect;
  const type = tool.tool_type;
  
  // REBALANCED: Base effects with strategic impact
  const baseEffects = {
    energy: { 
      statChanges: { energyCost: -0.5 }, // NERFED from -0.7 (was -1 originally)
      energyGain: 2,
      duration: 3 // REDUCED from 5 turns
    },
    strength: { 
      statChanges: { 
        physicalAttack: 10,  // Kept at 10 (was 5)
        physicalDefense: 5   // BUFFED: Added defense
      },
      duration: 2 // BUFFED from 1 turn
    },
    magic: { 
      statChanges: { 
        physicalDefense: 10,  // Kept at 10
        magicalDefense: 10,   // Kept at 10
        maxHealth: 15         // Kept at 15
      },
      healthChange: 5, // NERFED from 8
      duration: 2      // NERFED from 3 turns
    },
    stamina: { 
      statChanges: { 
        physicalDefense: 5    // Keep original defensive boost
      },
      healthChange: 10,
      chargeEffect: {         // BUFFED: Now a charge effect
        targetStat: "physicalDefense",
        perTurnBonus: 3,
        maxTurns: 3,
        finalBurst: 25        // BUFFED from 15-20
      },
      duration: 3
    },
    speed: { 
      statChanges: { 
        physicalAttack: 8,    // Kept at 8
        magicalAttack: 8,     // Kept at 8
        physicalDefense: -2,  // BUFFED from -3 (less penalty)
        magicalDefense: -2    // BUFFED from -3 (less penalty)
      },
      healthChange: 5,
      duration: 3
    }
  };
  
  // Ensure we have a valid base effect, with fallback
  const baseEffect = baseEffects[type] || { 
    statChanges: { physicalAttack: 3 },
    duration: 3
  };
  
  // Special handling for specific tool effects
  switch (effect) {
    case 'Surge':
      // Hyperscale Capacitor (Strength/Surge) - BUFFED
      if (type === 'strength') {
        return {
          statChanges: { 
            physicalAttack: 10,
            physicalDefense: 5  // Added defense
          },
          duration: 2 // Increased duration
        };
      }
      // Default Surge behavior for other types
      return {
        ...baseEffect,
        statChanges: Object.entries(baseEffect.statChanges || {}).reduce((acc, [stat, value]) => {
          acc[stat] = value * 2;
          return acc;
        }, {}),
        healthChange: (baseEffect.healthChange || 0) * 1.5,
        duration: 1
      };
      
    case 'Shield':
      // Ledger Lens (Magic/Shield) - NERFED
      if (type === 'magic') {
        return {
          statChanges: { 
            physicalDefense: 10,
            magicalDefense: 10,
            maxHealth: 15
          },
          healthChange: 5, // Nerfed from 8
          duration: 2      // Nerfed from 3
        };
      }
      // Default Shield behavior
      return {
        statChanges: { 
          physicalDefense: 10,
          magicalDefense: 10,
          maxHealth: 15
        },
        healthChange: 8,
        duration: 3
      };
      
    case 'Echo':
      // Babylon Keystone (Energy/Echo) - NERFED
      if (type === 'energy') {
        return {
          statChanges: { energyCost: -0.5 }, // Nerfed from -0.7
          healthOverTime: 2, // Slightly reduced healing
          duration: 3        // Reduced from 5
        };
      }
      // Default Echo behavior
      return {
        ...baseEffect,
        statChanges: Object.entries(baseEffect.statChanges || {}).reduce((acc, [stat, value]) => {
          acc[stat] = Math.round(value * 0.7);
          return acc;
        }, {}),
        healthOverTime: Math.round((baseEffect.healthChange || 0) * 0.25),
        duration: 5
      };
      
    case 'Drain':
      // Validator Core (Speed/Drain) - BUFFED (less penalty)
      if (type === 'speed') {
        return {
          statChanges: {
            physicalAttack: 8,
            magicalAttack: 8,
            physicalDefense: -2,  // Buffed from -3
            magicalDefense: -2    // Buffed from -3
          },
          healthChange: 5,
          duration: 3
        };
      }
      // Default Drain behavior
      return {
        statChanges: {
          physicalAttack: 8,
          magicalAttack: 8,
          physicalDefense: -3,
          magicalDefense: -3
        },
        healthChange: 5,
        duration: 3
      };
      
    case 'Charge':
      // Olympia Emblem (Stamina/Charge) - BUFFED
      if (type === 'stamina') {
        return {
          statChanges: { physicalDefense: 3 }, // Added immediate defense
          chargeEffect: {
            targetStat: "physicalDefense",
            perTurnBonus: 3,
            maxTurns: 3,
            finalBurst: 25  // Buffed from 15
          },
          duration: 3
        };
      }
      // Default Charge behavior
      return {
        statChanges: {},
        chargeEffect: {
          targetStat: Object.keys(baseEffect.statChanges || {})[0] || "physicalAttack",
          perTurnBonus: 3,
          maxTurns: 3,
          finalBurst: 15
        },
        duration: 3
      };
      
    // Default case - use the base effect
    default:
      return {
        ...baseEffect,
        statChanges: Object.entries(baseEffect.statChanges || {}).reduce((acc, [stat, value]) => {
          acc[stat] = Math.round(value * 1.1);
          return acc;
        }, {}),
        healthChange: Math.round((baseEffect.healthChange || 0) * 1.1)
      };
  }
};

// BALANCED: Get spell effect details with strategic impact
export const getSpellEffect = (spell, casterMagic = 5) => {
  // Validate input to prevent null/undefined access
  if (!spell || !spell.spell_effect || !spell.spell_type) {
    console.error("Invalid spell data:", spell);
    // Return safe default values
    return {
      damage: 5,
      duration: 1
    };
  }

  const effect = spell.spell_effect;
  const type = spell.spell_type;
  
  // BALANCED: Magic power modifier with reasonable scaling
  const magicPower = 1 + (casterMagic * 0.15); // Kept same
  
  // REBALANCED: Base effects with strategic damage/healing
  const baseEffects = {
    energy: { 
      damage: 20 * magicPower, // Babylon Burst base
      criticalChance: 15,
      armorPiercing: true,
      duration: 0
    },
    strength: { 
      damage: 18 * magicPower,  // Scrypto Surge base
      selfHeal: 10 * magicPower,
      statDrain: {                 
        physicalAttack: -3,
        magicalAttack: -3
      },
      statGain: {                  
        physicalAttack: 2,
        magicalAttack: 2
      },
      duration: 2
    },
    magic: { 
      prepareEffect: {
        name: 'Charging Spell',
        turns: 1,
        damage: 35 * magicPower,  // Shardstorm base
        areaEffect: true,
        stunChance: 0.2
      },
      chargeBonus: 5 * magicPower,
      duration: 1
    },
    stamina: { 
      statChanges: {               // Cerberus Chain - NERFED
        physicalDefense: 8,        // Nerfed from 12
        magicalDefense: 8,         // Nerfed from 12
        maxHealth: 15              // Nerfed from 20
      },
      healing: 15 * magicPower,    // Nerfed from 19-23
      damageReduction: 0.15,       // Nerfed from 0.2
      duration: 3
    },
    speed: { 
      statChanges: {               // Engine Overclock - BUFFED
        initiative: 5,             // Buffed from 2
        dodgeChance: 3,            // Buffed from 1-2
        criticalChance: 3          // Buffed from 1-2
      },
      healthOverTime: 3,           // CHANGED TO HEALING from damage
      duration: 3
    }
  };
  
  // Ensure we have a valid base effect, with fallback
  const baseEffect = baseEffects[type] || { 
    damage: 10 * magicPower,
    duration: 2
  };
  
  // Handle specific spell effects
  switch (effect) {
    case 'Surge':
      // Babylon Burst (Energy/Surge) - Kept same
      if (type === 'energy') {
        return {
          damage: 25 * magicPower,
          criticalChance: 15,
          armorPiercing: true,
          duration: 0
        };
      }
      // Default Surge behavior
      return {
        damage: (baseEffect.damage || 15) * 2.5,
        criticalChance: 15,
        armorPiercing: true,
        duration: 0
      };
      
    case 'Shield':
      // Cerberus Chain (Stamina/Shield) - NERFED
      if (type === 'stamina') {
        return {
          statChanges: {
            physicalDefense: 8,    // Nerfed from 12
            magicalDefense: 8,     // Nerfed from 12
            maxHealth: 15          // Nerfed from 20
          },
          healing: 15 * magicPower,   // Nerfed from ~20
          damageReduction: 0.15,      // Nerfed from 0.2
          duration: 3
        };
      }
      // Default Shield behavior
      return {
        statChanges: {
          physicalDefense: 12,
          magicalDefense: 12,
          maxHealth: 20
        },
        healing: 15 * magicPower,
        damageReduction: 0.2,
        duration: 3
      };
      
    case 'Echo':
      // Engine Overclock (Speed/Echo) - BUFFED
      if (type === 'speed') {
        return {
          statChanges: {
            initiative: 5,        // Buffed from 2
            dodgeChance: 3,       // Buffed from 1-2
            criticalChance: 3     // Buffed from 1-2
          },
          healthOverTime: 3,      // NOW HEALS instead of damages
          duration: 3
        };
      }
      // Default Echo behavior
      return {
        healthOverTime: baseEffect.healing 
          ? Math.round((baseEffect.healing / 3) * magicPower)
          : baseEffect.damage 
            ? Math.round(-(baseEffect.damage / 3) * magicPower)
            : 0,
        statChanges: baseEffect.statChanges ? 
          Object.entries(baseEffect.statChanges).reduce((acc, [stat, value]) => {
            acc[stat] = Math.round(value * 0.3);
            return acc;
          }, {}) : {},
        duration: 3
      };
      
    case 'Drain':
      // Scrypto Surge (Strength/Drain) - Kept same
      if (type === 'strength') {
        return {
          damage: 18 * magicPower,
          selfHeal: 10 * magicPower,
          statDrain: {                 
            physicalAttack: -3,
            magicalAttack: -3
          },
          statGain: {                  
            physicalAttack: 2,
            magicalAttack: 2
          },
          duration: 2
        };
      }
      // Default Drain behavior
      return {
        damage: 18 * magicPower,
        selfHeal: 10 * magicPower,
        statDrain: {                 
          physicalAttack: -3,
          magicalAttack: -3
        },
        statGain: {                  
          physicalAttack: 2,
          magicalAttack: 2
        },
        duration: 2
      };
      
    case 'Charge':
      // Shardstorm (Magic/Charge) - Kept same
      if (type === 'magic') {
        return {
          prepareEffect: {
            name: 'Charging Spell',
            turns: 1,
            damage: 35 * magicPower,
            areaEffect: true,
            stunChance: 0.2
          },
          chargeBonus: 5 * magicPower,
          duration: 1
        };
      }
      // Default Charge behavior
      return {
        prepareEffect: {
          name: 'Charging Spell',
          turns: 1,
          damage: 35 * magicPower,
          areaEffect: true,
          stunChance: 0.2
        },
        chargeBonus: 5 * magicPower,
        duration: 1
      };
      
    // Default case - use the base effect
    default:
      return {
        ...baseEffect,
        damage: (baseEffect.damage || 0) * 1.2,
        healing: (baseEffect.healing || 0) * 1.2,
        statChanges: baseEffect.statChanges ? 
          Object.entries(baseEffect.statChanges).reduce((acc, [stat, value]) => {
            acc[stat] = Math.round(value * 1.15);
            return acc;
          }, {}) : undefined
      };
  }
};

// Calculate effect power based on multiple factors
export const calculateEffectPower = (item, casterStats, difficulty = 'medium') => {
  let powerMultiplier = 1.0;
  
  // Difficulty scaling (reduced impact)
  switch (difficulty) {
    case 'easy': powerMultiplier *= 0.9; break;
    case 'medium': powerMultiplier *= 1.0; break;
    case 'hard': powerMultiplier *= 1.1; break;
    case 'expert': powerMultiplier *= 1.2; break;
  }
  
  // Caster stats scaling (for spells)
  if (casterStats && item.spell_type) {
    const relevantStat = casterStats[item.spell_type] || 5;
    powerMultiplier *= (1 + (relevantStat - 5) * 0.05);
  }
  
  // No rarity scaling since all items are equally rare
  // Removed the rarity multiplier section
  
  return powerMultiplier;
};

// Get contextual effect description
export const getEffectDescription = (item, effectPower = 1.0) => {
  const effect = item.tool_effect || item.spell_effect;
  const type = item.tool_type || item.spell_type;
  const isSpell = !!item.spell_type;
  
  const powerLevel = effectPower >= 1.3 ? 'powerful' :
                    effectPower >= 1.1 ? 'effective' :
                    effectPower >= 1.0 ? 'standard' : 'weak';
  
  switch (effect) {
    case 'Surge':
      return isSpell ? 
        `Unleashes a ${powerLevel} burst of ${type} energy, dealing immediate damage.` :
        `Provides a ${powerLevel} but short-lived boost to ${type} capabilities.`;
        
    case 'Shield':
      return isSpell ?
        `Creates a ${powerLevel} magical barrier that absorbs damage and heals.` :
        `Grants ${powerLevel} defensive protection and resilience.`;
        
    case 'Echo':
      return isSpell ?
        `Applies ${powerLevel} effects that repeat over multiple turns.` :
        `Creates a ${powerLevel} repeating effect with extended duration.`;
        
    case 'Drain':
      return isSpell ?
        `Steals life force from the target with ${powerLevel} efficiency.` :
        `Converts defensive power to offense in a ${powerLevel} way.`;
        
    case 'Charge':
      return isSpell ?
        `Requires preparation but delivers a ${powerLevel} delayed effect.` :
        `Builds up power over time for a ${powerLevel} payoff.`;
        
    default:
      return isSpell ?
        `A ${powerLevel} magical effect affecting ${type}.` :
        `Enhances ${type} attributes in a ${powerLevel} way.`;
  }
};

// Calculate combo effects when multiple items are used
export const calculateComboEffect = (effects) => {
  if (!effects || effects.length < 2) return null;
  
  const comboBonus = {
    statChanges: {},
    damage: 0,
    healing: 0,
    duration: 0
  };
  
  // Synergy bonuses for combining effects (reduced values)
  const synergyPairs = [
    ['Surge', 'Drain'],   // Damage + Life steal
    ['Shield', 'Echo'],   // Defense + Duration
    ['Charge', 'Surge'],  // Buildup + Burst
    ['Drain', 'Echo'],    // Sustained drain
    ['Shield', 'Charge']  // Protected buildup
  ];
  
  effects.forEach((effect, index) => {
    effects.slice(index + 1).forEach(otherEffect => {
      const pair = [effect.name, otherEffect.name];
      const reversePair = [otherEffect.name, effect.name];
      
      if (synergyPairs.some(synergyPair => 
        (synergyPair[0] === pair[0] && synergyPair[1] === pair[1]) ||
        (synergyPair[0] === reversePair[0] && synergyPair[1] === reversePair[1])
      )) {
        // Add reduced synergy bonus
        comboBonus.damage += 5;
        comboBonus.healing += 3;
        comboBonus.duration += 1;
        
        // Add stat synergies
        Object.keys(effect.statChanges || {}).forEach(stat => {
          comboBonus.statChanges[stat] = (comboBonus.statChanges[stat] || 0) + 1;
        });
      }
    });
  });
  
  return Object.keys(comboBonus.statChanges).length > 0 || 
         comboBonus.damage > 0 || 
         comboBonus.healing > 0 ? comboBonus : null;
};

// FIXED: Process timed effects (for effects that change over time)
export const processTimedEffect = (effect, currentTurn, startTurn) => {
  const turnsPassed = currentTurn - startTurn;
  
  // Clone the effect to avoid mutations
  const processedEffect = { ...effect };
  
  if (effect.effectType === 'Charge' && effect.chargeEffect) {
    // Charge effects get stronger over time
    const chargeProgress = Math.min(turnsPassed / (effect.chargeEffect.maxTurns || 3), 1.0);
    
    if (chargeProgress < 1.0) {
      // Building charge - apply incremental stat bonus
      const currentBonus = Math.floor(effect.chargeEffect.perTurnBonus * chargeProgress);
      processedEffect.statModifications = {
        ...processedEffect.statModifications,
        [effect.chargeEffect.targetStat]: currentBonus
      };
    }
    // Final burst is handled in applyOngoingEffects
  }
  
  if (effect.effectType === 'Echo' && effect.healthOverTime) {
    // Echo effects have variable intensity
    const echoIntensity = 0.8 + Math.sin(turnsPassed * Math.PI / 3) * 0.3;
    processedEffect.healthOverTime = Math.round((effect.healthOverTime || 0) * echoIntensity);
  }
  
  return processedEffect;
};

// Get visual effect data for UI animations
export const getVisualEffectData = (effect) => {
  const effectName = effect.tool_effect || effect.spell_effect || 'default';
  
  const visualEffects = {
    'Surge': {
      color: '#FFD700',
      animation: 'pulse-gold',
      particles: 'lightning',
      duration: 600,
      intensity: 'high'
    },
    'Shield': {
      color: '#4FC3F7',
      animation: 'shield-glow',
      particles: 'sparkles',
      duration: 1000,
      intensity: 'medium'
    },
    'Echo': {
      color: '#E1BEE7',
      animation: 'wave-ripple',
      particles: 'rings',
      duration: 1500,
      intensity: 'low'
    },
    'Drain': {
      color: '#F44336',
      animation: 'drain-spiral',
      particles: 'smoke',
      duration: 1200,
      intensity: 'high'
    },
    'Charge': {
      color: '#FF9800',
      animation: 'charge-buildup',
      particles: 'energy',
      duration: 2000,
      intensity: 'building'
    }
  };
  
  return visualEffects[effectName] || {
    color: '#FFFFFF',
    animation: 'fade',
    particles: 'none',
    duration: 500,
    intensity: 'low'
  };
};

// NEW: Calculate item efficiency score for AI
export const calculateItemEfficiency = (item, target, gameState) => {
  let efficiency = 0;
  
  // Base efficiency from item type (all equal rarity now)
  efficiency += 20; // Base score for all items
  
  // Context-based efficiency
  if (item.tool_effect === 'Shield' || item.spell_effect === 'Shield') {
    // Shield is more efficient on low-health targets
    const healthPercent = target.currentHealth / (target.battleStats?.maxHealth || 50);
    efficiency += (1 - healthPercent) * 50;
  } else if (item.tool_effect === 'Surge' || item.spell_effect === 'Surge') {
    // Surge is more efficient when about to attack
    if (gameState.plannedActions?.includes('attack')) {
      efficiency += 30;
    }
  } else if (item.tool_effect === 'Drain' || item.spell_effect === 'Drain') {
    // Drain is efficient when both dealing and taking damage
    if (target.currentHealth < target.battleStats?.maxHealth * 0.7) {
      efficiency += 25;
    }
  } else if (item.tool_effect === 'Echo' || item.spell_effect === 'Echo') {
    // Echo is efficient for long-term value
    efficiency += 20;
  } else if (item.tool_effect === 'Charge' || item.spell_effect === 'Charge') {
    // Charge is efficient when you have time to build up
    if (gameState.turn < 5) {
      efficiency += 35;
    }
  }
  
  // Cost efficiency (tools are free, spells cost energy)
  if (item.spell_type) {
    efficiency -= 10; // Spells have an energy cost penalty
  }
  
  return efficiency;
};

// NEW: Get recommended item usage
export const getRecommendedItemUsage = (availableItems, creatures, gameState) => {
  const recommendations = [];
  
  availableItems.forEach(item => {
    creatures.forEach(creature => {
      const efficiency = calculateItemEfficiency(item, creature, gameState);
      
      if (efficiency > 30) { // Threshold for recommendation
        recommendations.push({
          item: item,
          target: creature,
          efficiency: efficiency,
          reason: getRecommendationReason(item, creature, efficiency)
        });
      }
    });
  });
  
  // Sort by efficiency
  recommendations.sort((a, b) => b.efficiency - a.efficiency);
  
  return recommendations.slice(0, 3); // Return top 3 recommendations
};

// Get recommendation reason
const getRecommendationReason = (item, creature, efficiency) => {
  const effect = item.tool_effect || item.spell_effect;
  
  if (effect === 'Shield' && creature.currentHealth < creature.battleStats?.maxHealth * 0.5) {
    return `${creature.species_name} is low on health and needs protection`;
  } else if (effect === 'Surge' && efficiency > 50) {
    return `Boost ${creature.species_name}'s attack for maximum damage`;
  } else if (effect === 'Echo') {
    return `Apply lasting effects to ${creature.species_name}`;
  } else if (effect === 'Drain') {
    return `Convert ${creature.species_name}'s defense to offense`;
  } else if (effect === 'Charge') {
    return `Build up ${creature.species_name}'s power for later`;
  }
  
  return `Use on ${creature.species_name} for strategic advantage`;
};

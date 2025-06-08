// src/utils/battleCalculations.js - FIXED WITH PROPER ENERGY COST SCALING
// ENHANCED: Calculate derived stats with synergies and soft caps
export const calculateDerivedStats = (creature, activeSynergies = []) => {
  // Validate input
  if (!creature || !creature.stats) {
    // Return default stats if creature or stats are missing
    return {
      physicalAttack: 10,
      magicalAttack: 10,
      physicalDefense: 5,
      magicalDefense: 5,
      maxHealth: 50,
      initiative: 10,
      criticalChance: 5,
      dodgeChance: 3,
      energyCost: 5 // Default to form 0 cost
    };
  }
  
  const { energy, strength, magic, stamina, speed } = creature.stats;
  const rarityMultiplier = getRarityMultiplier(creature.rarity);
  // FIXED: Parse form as number before using it
  const formLevel = parseInt(creature.form) || 0;
  const formMultiplier = getFormMultiplier(formLevel);
  const combinationBonus = (creature.combination_level || 0) * 0.1 + 1; // Reduced from 0.15
  
  // Apply specialty stat bonuses
  const specialtyMultipliers = getSpecialtyMultipliers(creature);
  
  // FIXED: Apply synergy bonuses
  let synergyMultiplier = 1.0;
  activeSynergies.forEach(synergy => {
    synergyMultiplier += synergy.bonus || 0;
  });
  
  // Calculate raw stats before soft caps
  const rawPhysicalAttack = (
    10 + (strength * 2.5 * specialtyMultipliers.strength) + (speed * 0.5)
  ) * formMultiplier * combinationBonus * rarityMultiplier * synergyMultiplier;
  
  const rawMagicalAttack = (
    10 + (magic * 2.5 * specialtyMultipliers.magic) + (energy * 0.5)
  ) * formMultiplier * combinationBonus * rarityMultiplier * synergyMultiplier;
  
  const rawPhysicalDefense = (
    5 + (stamina * 2 * specialtyMultipliers.stamina) + (strength * 0.5)
  ) * formMultiplier * combinationBonus * rarityMultiplier * synergyMultiplier;
  
  const rawMagicalDefense = (
    5 + (energy * 2 * specialtyMultipliers.energy) + (magic * 0.5)
  ) * formMultiplier * combinationBonus * rarityMultiplier * synergyMultiplier;
  
  const rawMaxHealth = (
    50 + (stamina * 4 * specialtyMultipliers.stamina) + (energy * 1.5)
  ) * rarityMultiplier * formMultiplier * combinationBonus * synergyMultiplier;
  
  const rawInitiative = (
    10 + (speed * 2.5 * specialtyMultipliers.speed) + (energy * 0.3)
  ) * formMultiplier * combinationBonus * synergyMultiplier;
  
  // FIXED: Calculate DEPLOYMENT energy cost - NOT the creature's energy stat!
  // Form 0 = 5, Form 1 = 6, Form 2 = 7, Form 3 = 8
  const deploymentCost = 5 + formLevel;
  
  // Debug log to identify the issue
  console.log(`Calculating energy cost for ${creature.species_name || 'creature'}:`);
  console.log(`  - Form: ${creature.form} (type: ${typeof creature.form}, parsed: ${formLevel})`);
  console.log(`  - Energy stat: ${energy}`);
  console.log(`  - Deployment cost: ${deploymentCost} (should be 5 + ${formLevel})`);
  
  // FIXED: Apply soft caps using the proper function
  const result = {
    physicalAttack: applySoftCap(rawPhysicalAttack, 60, 120),
    magicalAttack: applySoftCap(rawMagicalAttack, 60, 120),
    physicalDefense: applySoftCap(rawPhysicalDefense, 40, 80),
    magicalDefense: applySoftCap(rawMagicalDefense, 40, 80),
    maxHealth: applySoftCap(rawMaxHealth, 200, 400),
    initiative: applySoftCap(rawInitiative, 40, 60),
    criticalChance: Math.min(5 + (speed * 0.6 * specialtyMultipliers.speed) + (magic * 0.2), 30),
    dodgeChance: Math.min(3 + (speed * 0.4 * specialtyMultipliers.speed) + (stamina * 0.1), 20),
    energyCost: deploymentCost // This should be 5, 6, 7, or 8 only!
  };
  
  console.log(`Stats for ${creature.species_name} with ${activeSynergies.length} synergies:`);
  console.log(`  - Synergy multiplier: ${synergyMultiplier}x`);
  console.log(`  - Final stats:`, result);
  console.log(`  - Final energyCost in battleStats: ${result.energyCost}`);
  
  return result;
};

// BALANCED: Get specialty stat multipliers with more reasonable bonuses
function getSpecialtyMultipliers(creature) {
  // Default multipliers (all 1.0)
  const multipliers = {
    energy: 1.0,
    strength: 1.0,
    magic: 1.0,
    stamina: 1.0,
    speed: 1.0
  };
  
  // Apply specialty stat bonuses if available - MORE BALANCED
  if (creature.specialty_stats && Array.isArray(creature.specialty_stats)) {
    // If creature has only one specialty stat, give it a strong but not overwhelming boost
    if (creature.specialty_stats.length === 1) {
      const stat = creature.specialty_stats[0];
      if (multipliers[stat] !== undefined) {
        multipliers[stat] = 1.8; // Reduced from 2.5 to 1.8 (80% increase)
      }
    } 
    // If creature has two specialty stats, give them moderate boosts
    else if (creature.specialty_stats.length >= 2) {
      creature.specialty_stats.forEach(stat => {
        if (multipliers[stat] !== undefined) {
          multipliers[stat] = 1.4; // Reduced from 1.8 to 1.4 (40% increase)
        }
      });
    }
  }
  
  return multipliers;
}

// ENHANCED: Calculate damage with form-based caps, glancing blows, AND COMBO MULTIPLIERS
export const calculateDamage = (attacker, defender, attackType = 'physical', comboMultiplier = 1.0) => {
  // Validate input
  if (!attacker || !defender || !attacker.battleStats || !defender.battleStats) {
    return {
      damage: 1,
      isDodged: false,
      isCritical: false,
      effectiveness: 'normal',
      damageType: 'normal'
    };
  }
  
  // Get derived stats from battleStats
  const attackerStats = attacker.battleStats;
  const defenderStats = defender.battleStats;
  
  // Determine base attack and defense values based on attack type
  const attackValue = attackType === 'physical' 
    ? attackerStats.physicalAttack 
    : attackerStats.magicalAttack;
    
  const defenseValue = attackType === 'physical' 
    ? defenderStats.physicalDefense 
    : defenderStats.magicalDefense;
  
  // BALANCED: Calculate form difference for damage scaling
  // FIXED: Parse forms as numbers
  const attackerForm = parseInt(attacker.form) || 0;
  const defenderForm = parseInt(defender.form) || 0;
  const formDifference = attackerForm - defenderForm;
  
  // Calculate effectiveness multiplier
  const effectivenessMultiplier = getEffectivenessMultiplier(
    attackType, 
    attacker.stats || {}, 
    defender.stats || {}
  );
  
  // Calculate random variance (±15%)
  const variance = 0.85 + (Math.random() * 0.3);
  
  // Check for critical hit
  const criticalRoll = Math.random() * 100;
  const baseCritChance = attackerStats.criticalChance || 5;
  const isCritical = criticalRoll <= baseCritChance;
  const criticalMultiplier = isCritical ? 1.5 : 1; // Reduced from 2.0 to 1.5
  
  // Check for dodge
  const dodgeRoll = Math.random() * 100;
  const baseDodgeChance = defenderStats.dodgeChance || 3;
  const isDodged = dodgeRoll <= baseDodgeChance;
  
  if (isDodged) {
    return {
      damage: 0,
      isDodged: true,
      isCritical: false,
      effectiveness: 'normal',
      damageType: 'dodged'
    };
  }
  
  // ENHANCED DAMAGE FORMULA: Include combo multiplier
  let rawDamage = attackValue * effectivenessMultiplier * variance * criticalMultiplier * comboMultiplier;
  
  // BALANCED: New defense calculation with better scaling
  // Defense provides percentage reduction that scales logarithmically
  const defenseReduction = defenseValue / (defenseValue + 100) * 0.7; // Max 70% reduction
  
  // Apply the damage reduction
  let finalDamage = Math.max(1, Math.round(rawDamage * (1 - defenseReduction)));
  
  // FIXED: Use calculateFormDamageModifier for proper form-based caps
  const formModifier = calculateFormDamageModifier(attackerForm, defenderForm);
  
  // Apply form damage multiplier
  finalDamage = Math.round(finalDamage * formModifier.multiplier);
  
  // Apply form-based damage cap if exists
  let damageType = 'normal';
  if (formModifier.cap) {
    const maxAllowedDamage = Math.round(defenderStats.maxHealth * formModifier.cap);
    if (finalDamage > maxAllowedDamage) {
      finalDamage = maxAllowedDamage;
      // Set damage type based on form difference
      if (formDifference >= 2) {
        damageType = 'devastating';
      } else if (formDifference >= 1) {
        damageType = 'powerful';
      }
    }
  } else if (formDifference <= -2) {
    damageType = 'glancing';
  } else if (formDifference <= -1) {
    damageType = 'reduced';
  }
  
  // BALANCED: Apply minimum damage based on attacker's form
  const minimumDamage = Math.max(1, Math.floor(attackerForm * 2 + 1));
  finalDamage = Math.max(minimumDamage, finalDamage);
  
  // Log the damage calculation details for debugging
  console.log(`BALANCED Damage: ${attackValue} attack vs ${defenseValue} defense`);
  console.log(`Form difference: ${formDifference}, Type: ${damageType}`);
  console.log(`Combo multiplier: ${comboMultiplier}x`);
  console.log(`Raw: ${rawDamage.toFixed(1)}, Reduction: ${(defenseReduction * 100).toFixed(1)}%, Final: ${finalDamage}`);
  
  return {
    damage: finalDamage,
    isDodged: false,
    isCritical,
    effectiveness: getEffectivenessText(effectivenessMultiplier),
    damageType: damageType,
    formDifference: formDifference,
    comboMultiplier: comboMultiplier
  };
};

// BALANCED: Calculate effectiveness multiplier with more reasonable swings
export const getEffectivenessMultiplier = (attackType, attackerStats, defenderStats) => {
  // Check for missing stats
  if (!attackerStats || !defenderStats) {
    return 1.0; // Default normal effectiveness
  }
  
  // BALANCED Rock-Paper-Scissors relationships:
  // Strength > Stamina > Speed > Magic > Energy > Strength
  
  let effectiveness = 1.0;
  
  if (attackType === 'physical') {
    // Physical attacks are based on Strength
    const attackerStrength = attackerStats.strength || 5;
    const defenderStamina = defenderStats.stamina || 5;
    const defenderMagic = defenderStats.magic || 5;
    
    // Strong advantage against stamina-focused defenders
    if (attackerStrength > 7 && defenderStamina > defenderMagic) {
      effectiveness = 1.4; // Reduced from 1.8 to 1.4
    }
    // Weakness against magic-focused defenders
    else if (defenderMagic > 7 && defenderMagic > defenderStamina) {
      effectiveness = 0.75; // Increased from 0.6 to 0.75
    }
    // Moderate advantage for high-strength attackers
    else if (attackerStrength > defenderStamina + 2) {
      effectiveness = 1.2;
    }
  } else {
    // Magical attacks are based on Magic
    const attackerMagic = attackerStats.magic || 5;
    const defenderSpeed = defenderStats.speed || 5;
    const defenderEnergy = defenderStats.energy || 5;
    
    // Strong advantage against speed-focused defenders
    if (attackerMagic > 7 && defenderSpeed > defenderEnergy) {
      effectiveness = 1.4; // Reduced from 1.8 to 1.4
    }
    // Weakness against energy-focused defenders
    else if (defenderEnergy > 7 && defenderEnergy > defenderSpeed) {
      effectiveness = 0.75; // Increased from 0.6 to 0.75
    }
    // Moderate advantage for high-magic attackers
    else if (attackerMagic > defenderEnergy + 2) {
      effectiveness = 1.2;
    }
  }
  
  // BALANCED: Additional effectiveness bonuses with caps
  if (attackType === 'physical') {
    const attackerSpeed = attackerStats.speed || 5;
    const defenderSpeed = defenderStats.speed || 5;
    
    // Speed advantage for physical attacks
    if (attackerSpeed > defenderSpeed + 3) {
      effectiveness *= 1.1; // Reduced from 1.2
    }
  } else {
    const attackerEnergy = attackerStats.energy || 5;
    const defenderMagicDef = defenderStats.magic || 5;
    
    // Energy advantage for magical attacks
    if (attackerEnergy > defenderMagicDef + 3) {
      effectiveness *= 1.1; // Reduced from 1.2
    }
  }
  
  // Cap effectiveness to prevent extreme values
  return Math.max(0.5, Math.min(1.8, effectiveness)); // Reduced range from [0.4, 2.5] to [0.5, 1.8]
};

// BALANCED: Get text description of effectiveness
export const getEffectivenessText = (multiplier) => {
  if (multiplier >= 1.6) return 'very effective';
  if (multiplier >= 1.3) return 'effective';
  if (multiplier >= 1.1) return 'slightly effective';
  if (multiplier <= 0.6) return 'not very effective';
  if (multiplier <= 0.8) return 'resisted';
  return 'normal';
};

// BALANCED: Get multipliers based on rarity and form with reasonable scaling
export const getRarityMultiplier = (rarity) => {
  if (!rarity) return 1.0; // Default if missing
  
  switch (rarity) {
    case 'Legendary': return 1.3; // Reduced from 1.6
    case 'Epic': return 1.2;      // Reduced from 1.4
    case 'Rare': return 1.1;      // Reduced from 1.2
    default: return 1.0;
  }
};

export const getFormMultiplier = (form) => {
  if (form === undefined || form === null) return 1.0; // Default if missing
  
  // Form should already be a number when passed to this function
  return 1 + (form * 0.25); // Reduced from 0.35 (Form 0 = 1.0x, Form 3 = 1.75x)
};

// Calculate total creature power rating
export const calculateCreaturePower = (creature) => {
  if (!creature || !creature.battleStats) return 0;
  
  const stats = creature.battleStats;
  const attackPower = Math.max(stats.physicalAttack || 0, stats.magicalAttack || 0);
  const defensePower = Math.max(stats.physicalDefense || 0, stats.magicalDefense || 0);
  const utilityPower = (stats.initiative || 0) + (stats.criticalChance || 0) + (stats.dodgeChance || 0);
  
  // FIXED: Parse form as number
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

// Calculate type advantage multiplier for more complex interactions
export const calculateTypeAdvantage = (attackerStats, defenderStats) => {
  if (!attackerStats || !defenderStats) return 1.0;
  
  let advantage = 1.0;
  
  // Multiple stat comparisons for more nuanced advantages
  const statComparisons = [
    { attacker: 'strength', defender: 'stamina', multiplier: 1.3 }, // Reduced from 1.4
    { attacker: 'stamina', defender: 'speed', multiplier: 1.3 },
    { attacker: 'speed', defender: 'magic', multiplier: 1.3 },
    { attacker: 'magic', defender: 'energy', multiplier: 1.3 },
    { attacker: 'energy', defender: 'strength', multiplier: 1.3 }
  ];
  
  for (const comparison of statComparisons) {
    const attackerStat = attackerStats[comparison.attacker] || 5;
    const defenderStat = defenderStats[comparison.defender] || 5;
    
    if (attackerStat > defenderStat + 2) {
      advantage *= comparison.multiplier;
      break; // Only apply one major advantage
    }
  }
  
  return Math.min(1.6, advantage); // Reduced cap from 2.0 to 1.6
};

// Calculate battle outcome probability
export const calculateBattleOdds = (attacker, defender) => {
  if (!attacker || !defender) return 0.5;
  
  const attackerPower = calculateCreaturePower(attacker);
  const defenderPower = calculateCreaturePower(defender);
  const typeAdvantage = calculateTypeAdvantage(attacker.stats, defender.stats);
  
  const powerRatio = (attackerPower * typeAdvantage) / Math.max(defenderPower, 1);
  
  // Convert power ratio to probability (0.0 to 1.0)
  return Math.max(0.1, Math.min(0.9, powerRatio / (powerRatio + 1)));
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

// Calculate synergy bonuses for creatures with complementary stats
export const calculateSynergyBonus = (creatures) => {
  if (!creatures || creatures.length < 2) return 0;
  
  let synergyBonus = 0;
  
  // Check for stat synergies between creatures
  for (let i = 0; i < creatures.length - 1; i++) {
    for (let j = i + 1; j < creatures.length; j++) {
      const creature1 = creatures[i];
      const creature2 = creatures[j];
      
      if (!creature1.stats || !creature2.stats) continue;
      
      // Same species bonus
      if (creature1.species_id === creature2.species_id) {
        synergyBonus += 0.1; // 10% bonus per same species pair
      }
      
      // Complementary stat bonuses
      const complementaryPairs = [
        ['strength', 'stamina'],
        ['magic', 'energy'],
        ['speed', 'strength'],
        ['stamina', 'magic'],
        ['energy', 'speed']
      ];
      
      for (const [stat1, stat2] of complementaryPairs) {
        if ((creature1.stats[stat1] || 0) > 7 && (creature2.stats[stat2] || 0) > 7) {
          synergyBonus += 0.05; // 5% bonus per complementary pair
        }
      }
    }
  }
  
  return Math.min(0.3, synergyBonus); // Reduced cap from 0.5 to 0.3
};

// Calculate field presence bonus based on creature positioning
export const calculateFieldPresenceBonus = (friendlyCreatures, enemyCreatures) => {
  if (!friendlyCreatures || !enemyCreatures) return 1.0;
  
  const friendlyCount = friendlyCreatures.length;
  const enemyCount = enemyCreatures.length;
  
  if (friendlyCount === 0) return 0.8; // Disadvantage when no creatures
  if (enemyCount === 0) return 1.2;    // Reduced from 1.3
  
  const ratio = friendlyCount / enemyCount;
  
  // Field presence bonus/penalty based on creature count ratio
  if (ratio >= 2.0) return 1.2;      // Reduced from 1.3
  if (ratio >= 1.5) return 1.15;     // Reduced from 1.2
  if (ratio >= 1.0) return 1.05;     // Reduced from 1.1
  if (ratio >= 0.5) return 0.95;
  return 0.85;
};

// NEW: Calculate damage reduction based on form difference
export const calculateFormDamageModifier = (attackerForm, defenderForm) => {
  // FIXED: Parse forms as numbers
  const attackerFormLevel = parseInt(attackerForm) || 0;
  const defenderFormLevel = parseInt(defenderForm) || 0;
  const formDifference = attackerFormLevel - defenderFormLevel;
  
  if (formDifference >= 3) {
    return { multiplier: 0.5, cap: 0.6 }; // 50% damage, cap at 60% health
  } else if (formDifference >= 2) {
    return { multiplier: 0.6, cap: 0.5 }; // 60% damage, cap at 50% health
  } else if (formDifference >= 1) {
    return { multiplier: 0.8, cap: 0.35 }; // 80% damage, cap at 35% health
  } else if (formDifference <= -2) {
    return { multiplier: 0.5, cap: null }; // 50% damage (glancing blow)
  } else if (formDifference <= -1) {
    return { multiplier: 0.75, cap: null }; // 75% damage
  }
  
  return { multiplier: 1.0, cap: null }; // Normal damage
};

// FIXED: Properly implement soft cap system
export const applySoftCap = (value, softCap, hardCap) => {
  if (value <= softCap) return value;
  
  const excess = value - softCap;
  const remainingCap = hardCap - softCap;
  
  // Use a logarithmic curve for smooth diminishing returns
  const scaledExcess = remainingCap * (1 - Math.exp(-excess / remainingCap));
  
  return Math.round(softCap + scaledExcess);
};

// NEW: Calculate effective stats after all modifiers
export const calculateEffectiveStats = (creature, activeEffects = []) => {
  if (!creature || !creature.battleStats) return null;
  
  const effectiveStats = { ...creature.battleStats };
  
  // Apply active effect modifiers
  activeEffects.forEach(effect => {
    if (effect.statEffect) {
      Object.entries(effect.statEffect).forEach(([stat, value]) => {
        if (effectiveStats[stat] !== undefined) {
          effectiveStats[stat] = Math.max(0, effectiveStats[stat] + value);
        }
      });
    }
  });
  
  // Apply soft caps to prevent extreme values
  effectiveStats.physicalAttack = applySoftCap(effectiveStats.physicalAttack, 80, 150);
  effectiveStats.magicalAttack = applySoftCap(effectiveStats.magicalAttack, 80, 150);
  effectiveStats.physicalDefense = applySoftCap(effectiveStats.physicalDefense, 60, 100);
  effectiveStats.magicalDefense = applySoftCap(effectiveStats.magicalDefense, 60, 100);
  effectiveStats.maxHealth = applySoftCap(effectiveStats.maxHealth, 250, 500);
  
  return effectiveStats;
};

// NEW: Calculate combat rating for matchmaking
export const calculateCombatRating = (creature) => {
  if (!creature) return 0;
  
  const stats = creature.battleStats || calculateDerivedStats(creature);
  
  // Weighted formula for combat rating
  const offensiveRating = Math.max(stats.physicalAttack, stats.magicalAttack) * 2;
  const defensiveRating = (stats.physicalDefense + stats.magicalDefense) * 0.5;
  const healthRating = stats.maxHealth * 0.2;
  const utilityRating = (stats.initiative + stats.criticalChance + stats.dodgeChance) * 0.5;
  
  const baseRating = offensiveRating + defensiveRating + healthRating + utilityRating;
  
  // Apply form and rarity multipliers
  // FIXED: Parse form as number
  const formLevel = parseInt(creature.form) || 0;
  const formBonus = formLevel * 50;
  const rarityBonus = getRarityValue(creature.rarity) * 30;
  
  return Math.round(baseRating + formBonus + rarityBonus);
};

// NEW: Calculate team combat rating
export const calculateTeamRating = (creatures) => {
  if (!creatures || creatures.length === 0) return 0;
  
  const individualRatings = creatures.map(c => calculateCombatRating(c));
  const totalRating = individualRatings.reduce((sum, rating) => sum + rating, 0);
  
  // Apply synergy bonuses
  const synergyMultiplier = 1 + calculateSynergyBonus(creatures);
  
  return Math.round(totalRating * synergyMultiplier);
};

// FIXED: Apply synergy modifiers to entire field
export const applySynergyModifiers = (creatures, synergies) => {
  if (!creatures || creatures.length === 0) return creatures;
  
  return creatures.map(creature => {
    // Recalculate stats with active synergies
    const modifiedStats = calculateDerivedStats(creature, synergies);
    
    return {
      ...creature,
      battleStats: modifiedStats,
      activeSynergies: synergies,
      // Preserve current health ratio
      currentHealth: Math.round(
        (creature.currentHealth / creature.battleStats.maxHealth) * modifiedStats.maxHealth
      )
    };
  });
};

// NEW: Calculate effective energy efficiency
export const calculateEnergyEfficiency = (action, creature, energyCost) => {
  if (!action || !creature || !energyCost) return 0;
  
  let potentialValue = 0;
  
  switch (action) {
    case 'attack':
      const attackPower = Math.max(
        creature.battleStats?.physicalAttack || 0,
        creature.battleStats?.magicalAttack || 0
      );
      potentialValue = attackPower;
      break;
      
    case 'defend':
      const defensePower = Math.max(
        creature.battleStats?.physicalDefense || 0,
        creature.battleStats?.magicalDefense || 0
      );
      potentialValue = defensePower * 2; // Defense is valuable
      break;
      
    case 'deploy':
      potentialValue = calculateCreaturePower(creature) / 10;
      break;
      
    default:
      potentialValue = 10;
  }
  
  // Return efficiency ratio (higher is better)
  return energyCost > 0 ? (potentialValue / energyCost).toFixed(1) : 0;
};

// NEW: Calculate combo damage bonus based on consecutive attacks
export const calculateComboBonus = (comboCount, attackType = 'normal') => {
  if (!comboCount || comboCount <= 0) return 1.0;
  
  // Different attack types have different combo scaling
  let baseBonus = 0;
  let scalingFactor = 0;
  let maxBonus = 0;
  
  switch (attackType) {
    case 'physical':
      baseBonus = 0.1;      // 10% per combo
      scalingFactor = 0.9;  // Diminishing returns
      maxBonus = 2.0;       // Max 100% bonus (2x damage)
      break;
      
    case 'magical':
      baseBonus = 0.15;     // 15% per combo (better scaling)
      scalingFactor = 0.85; // Faster diminishing returns
      maxBonus = 2.5;       // Max 150% bonus (2.5x damage)
      break;
      
    case 'special':
      baseBonus = 0.2;      // 20% per combo
      scalingFactor = 0.8;  // Even faster diminishing
      maxBonus = 3.0;       // Max 200% bonus (3x damage)
      break;
      
    default: // 'normal'
      baseBonus = 0.05;     // 5% per combo
      scalingFactor = 0.95; // Slow diminishing
      maxBonus = 1.5;       // Max 50% bonus (1.5x damage)
  }
  
  // Calculate combo multiplier with diminishing returns
  let multiplier = 1.0;
  for (let i = 0; i < comboCount; i++) {
    multiplier += baseBonus * Math.pow(scalingFactor, i);
  }
  
  // Cap at maximum bonus
  multiplier = Math.min(multiplier, maxBonus);
  
  console.log(`Combo x${comboCount} (${attackType}): ${multiplier.toFixed(2)}x damage`);
  
  return multiplier;
};

// NEW: Check field synergies between deployed creatures
export const checkFieldSynergies = (deployedCreatures) => {
  if (!deployedCreatures || deployedCreatures.length < 2) {
    return [];
  }
  
  const synergies = [];
  
  // Check all pairs of creatures for synergies
  for (let i = 0; i < deployedCreatures.length - 1; i++) {
    for (let j = i + 1; j < deployedCreatures.length; j++) {
      const creature1 = deployedCreatures[i];
      const creature2 = deployedCreatures[j];
      
      if (!creature1 || !creature2) continue;
      
      // Species synergy - same species creatures work well together
      if (creature1.species_id === creature2.species_id && creature1.species_id) {
        synergies.push({
          type: 'species',
          name: `${creature1.species_name || 'Unknown'} Unity`,
          description: `Same species creatures boost each other`,
          bonus: 0.15, // 15% stat boost
          affectedCreatures: [creature1.id, creature2.id],
          icon: '👥'
        });
      }
      
      // Rarity synergy - legendary creatures inspire others
      if (creature1.rarity === 'Legendary' || creature2.rarity === 'Legendary') {
        const legendary = creature1.rarity === 'Legendary' ? creature1 : creature2;
        const other = creature1.rarity === 'Legendary' ? creature2 : creature1;
        
        synergies.push({
          type: 'legendary_presence',
          name: 'Legendary Presence',
          description: `${legendary.species_name || 'Legendary'} inspires allies`,
          bonus: 0.1, // 10% stat boost
          affectedCreatures: [other.id],
          icon: '⭐'
        });
      }
      
      // Elemental/Stat synergies based on specialty stats
      const statSynergies = checkStatSynergies(creature1, creature2);
      synergies.push(...statSynergies);
      
      // Form synergy - higher form creatures protect lower forms
      const form1 = parseInt(creature1.form) || 0;
      const form2 = parseInt(creature2.form) || 0;
      
      if (Math.abs(form1 - form2) >= 2) {
        const protector = form1 > form2 ? creature1 : creature2;
        const protectedAlly = form1 > form2 ? creature2 : creature1;
        
        synergies.push({
          type: 'form_protection',
          name: 'Guardian Presence',
          description: `${protector.species_name || 'Guardian'} protects weaker ally`,
          bonus: 0.2, // 20% defense boost
          statBonus: { physicalDefense: 10, magicalDefense: 10 },
          affectedCreatures: [protectedAlly.id],
          icon: '🛡️'
        });
      }
    }
  }
  
  // Team-wide synergies
  if (deployedCreatures.length >= 3) {
    // Check for balanced team (variety of specialties)
    const specialties = new Set();
    deployedCreatures.forEach(creature => {
      if (creature.specialty_stats && Array.isArray(creature.specialty_stats)) {
        creature.specialty_stats.forEach(stat => specialties.add(stat));
      }
    });
    
    if (specialties.size >= 4) {
      synergies.push({
        type: 'balanced_team',
        name: 'Balanced Formation',
        description: 'Diverse team covers all weaknesses',
        bonus: 0.1, // 10% all stats
        affectedCreatures: deployedCreatures.map(c => c.id),
        icon: '⚖️'
      });
    }
    
    // Full field bonus
    if (deployedCreatures.length >= 5) {
      synergies.push({
        type: 'full_field',
        name: 'Full Force',
        description: 'Maximum creatures deployed',
        bonus: 0.05, // 5% all stats
        statBonus: { initiative: 5 },
        affectedCreatures: deployedCreatures.map(c => c.id),
        icon: '💪'
      });
    }
  }
  
  // Remove duplicate synergies
  const uniqueSynergies = [];
  const seen = new Set();
  
  synergies.forEach(synergy => {
    const key = `${synergy.type}-${synergy.affectedCreatures.sort().join('-')}`;
    if (!seen.has(key)) {
      seen.add(key);
      uniqueSynergies.push(synergy);
    }
  });
  
  console.log(`Found ${uniqueSynergies.length} active synergies`);
  return uniqueSynergies;
};

// Helper function to check stat-based synergies
function checkStatSynergies(creature1, creature2) {
  const synergies = [];
  
  if (!creature1.stats || !creature2.stats) return synergies;
  
  // Define stat synergy pairs
  const synergyPairs = [
    {
      stats: ['strength', 'stamina'],
      name: 'Fortress Formation',
      description: 'Physical powerhouse combination',
      bonus: 0.12,
      icon: '🏰'
    },
    {
      stats: ['magic', 'energy'],
      name: 'Arcane Resonance',
      description: 'Magical energies amplify each other',
      bonus: 0.12,
      icon: '✨'
    },
    {
      stats: ['speed', 'strength'],
      name: 'Blitz Assault',
      description: 'Speed and power create devastating attacks',
      bonus: 0.12,
      icon: '⚡'
    },
    {
      stats: ['stamina', 'energy'],
      name: 'Enduring Will',
      description: 'Sustained combat effectiveness',
      bonus: 0.12,
      icon: '🔋'
    },
    {
      stats: ['magic', 'speed'],
      name: 'Swift Casting',
      description: 'Quick magical strikes',
      bonus: 0.12,
      icon: '🌟'
    }
  ];
  
  // Check each synergy pair
  synergyPairs.forEach(pair => {
    const [stat1, stat2] = pair.stats;
    
    // Check if creatures have high values in the synergy stats
    const creature1High = (creature1.stats[stat1] || 0) >= 7 || (creature1.stats[stat2] || 0) >= 7;
    const creature2High = (creature2.stats[stat1] || 0) >= 7 || (creature2.stats[stat2] || 0) >= 7;
    
    // Check if they complement each other
    const creature1HasStat1 = (creature1.stats[stat1] || 0) >= 7;
    const creature2HasStat2 = (creature2.stats[stat2] || 0) >= 7;
    const creature1HasStat2 = (creature1.stats[stat2] || 0) >= 7;
    const creature2HasStat1 = (creature2.stats[stat1] || 0) >= 7;
    
    if ((creature1HasStat1 && creature2HasStat2) || (creature1HasStat2 && creature2HasStat1)) {
      synergies.push({
        type: 'stat_synergy',
        name: pair.name,
        description: pair.description,
        bonus: pair.bonus,
        affectedCreatures: [creature1.id, creature2.id],
        icon: pair.icon
      });
    }
  });
  
  return synergies;
}

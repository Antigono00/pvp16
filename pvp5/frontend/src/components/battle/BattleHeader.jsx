// src/components/battle/BattleHeader.jsx
import React from 'react';

const BattleHeader = ({ 
  turn, 
  playerEnergy, 
  enemyEnergy,
  difficulty,
  activePlayer,
  maxEnergy = 25,
  consecutiveActions = { player: 0, enemy: 0 },
  energyMomentum = { player: 0, enemy: 0 },
  activeSynergies = [],
  energyMomentumDetails = { player: null, enemy: null }
}) => {
  const getDifficultyColor = (diff) => {
    switch (diff.toLowerCase()) {
      case 'easy': return '#4CAF50';
      case 'medium': return '#FFC107';
      case 'hard': return '#FF9800';
      case 'expert': return '#FF5722';
      default: return '#4CAF50';
    }
  };
  
  // Helper to get combo color based on level
  const getComboColor = (comboLevel) => {
    if (comboLevel >= 4) return '#FFD700'; // Gold
    if (comboLevel >= 3) return '#FF9800'; // Orange
    if (comboLevel >= 2) return '#4CAF50'; // Green
    return '#9E9E9E'; // Gray
  };
  
  // Helper to format synergy names
  const formatSynergyName = (synergy) => {
    if (synergy.type === 'species') {
      return `${synergy.species} x${synergy.count}`;
    } else if (synergy.type === 'stats') {
      return `${synergy.stats[0]} + ${synergy.stats[1]}`;
    }
    return 'Unknown';
  };
  
  return (
    <div className="battle-header">
      <div className="battle-info">
        <div className="turn-counter">
          <span className="turn-label">Turn</span>
          <span className="turn-number">{turn}</span>
        </div>
        
        <div className="difficulty-indicator" 
          style={{ backgroundColor: getDifficultyColor(difficulty) }}>
          {difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}
        </div>
        
        <div className="active-player-indicator">
          {activePlayer === 'player' ? (
            <span className="player-active">Your Turn</span>
          ) : (
            <span className="enemy-active">Enemy Turn</span>
          )}
        </div>
        
        {/* NEW: Synergy Display */}
        {activeSynergies.length > 0 && (
          <div className="synergy-display">
            <span className="synergy-label">Active Synergies:</span>
            <div className="synergy-list">
              {activeSynergies.map((synergy, index) => (
                <div 
                  key={index} 
                  className={`synergy-badge ${synergy.type}`}
                  title={`+${Math.round(synergy.bonus * 100)}% to all stats`}
                >
                  <span className="synergy-icon">
                    {synergy.type === 'species' ? '🔗' : '⚡'}
                  </span>
                  <span className="synergy-name">{formatSynergyName(synergy)}</span>
                  <span className="synergy-bonus">+{Math.round(synergy.bonus * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      
      {/* Enhanced Energy Displays with Combo and Momentum */}
      <div className="energy-displays">
        {/* Player Energy */}
        <div className="player-energy-section">
          {/* Combo Counter */}
          {consecutiveActions.player > 0 && (
            <div 
              className="combo-counter player"
              style={{ color: getComboColor(consecutiveActions.player) }}
            >
              <span className="combo-label">COMBO</span>
              <span className="combo-value">x{consecutiveActions.player}</span>
              {consecutiveActions.player >= 2 && (
                <span className="combo-bonus">
                  +{Math.round((calculateComboBonus(consecutiveActions.player) - 1) * 100)}%
                </span>
              )}
            </div>
          )}
          
          <div className="player-energy">
            <div className="energy-label">Your Energy</div>
            <div className="energy-value-container">
              <div className="energy-value">{playerEnergy}</div>
              {/* Energy Momentum Indicator */}
              {energyMomentum.player > 0 && (
                <div className="momentum-indicator">
                  <div 
                    className="momentum-progress"
                    style={{ 
                      width: `${(energyMomentum.player % 10) * 10}%`,
                      backgroundColor: '#FFD700'
                    }}
                  />
                  <span className="momentum-text">
                    {energyMomentum.player}/10
                  </span>
                </div>
              )}
            </div>
            <div className="energy-bar-container">
              <div className="energy-bar" 
                style={{ width: `${Math.min(100, (playerEnergy / maxEnergy) * 100)}%` }} />
              {/* Momentum Bonus Preview */}
              {energyMomentumDetails.player && energyMomentumDetails.player.bonusRegen > 0 && (
                <div className="bonus-regen-preview">
                  +{energyMomentumDetails.player.bonusRegen}
                </div>
              )}
            </div>
            {/* Next Momentum Threshold */}
            {energyMomentumDetails.player && energyMomentum.player > 0 && (
              <div className="momentum-info">
                {energyMomentumDetails.player.nextThreshold} energy to next bonus
              </div>
            )}
          </div>
        </div>
        
        {/* Enemy Energy */}
        <div className="enemy-energy-section">
          {/* Enemy Combo Counter */}
          {consecutiveActions.enemy > 0 && (
            <div 
              className="combo-counter enemy"
              style={{ color: getComboColor(consecutiveActions.enemy) }}
            >
              <span className="combo-label">COMBO</span>
              <span className="combo-value">x{consecutiveActions.enemy}</span>
              {consecutiveActions.enemy >= 2 && (
                <span className="combo-bonus">
                  +{Math.round((calculateComboBonus(consecutiveActions.enemy) - 1) * 100)}%
                </span>
              )}
            </div>
          )}
          
          <div className="enemy-energy">
            <div className="energy-label">Enemy Energy</div>
            <div className="energy-value-container">
              <div className="energy-value">{enemyEnergy}</div>
              {/* Enemy Energy Momentum */}
              {energyMomentum.enemy > 0 && (
                <div className="momentum-indicator enemy">
                  <div 
                    className="momentum-progress"
                    style={{ 
                      width: `${(energyMomentum.enemy % 10) * 10}%`,
                      backgroundColor: '#FF5722'
                    }}
                  />
                  <span className="momentum-text">
                    {energyMomentum.enemy}/10
                  </span>
                </div>
              )}
            </div>
            <div className="energy-bar-container">
              <div className="energy-bar enemy" 
                style={{ width: `${Math.min(100, (enemyEnergy / maxEnergy) * 100)}%` }} />
              {/* Enemy Momentum Bonus Preview */}
              {energyMomentumDetails.enemy && energyMomentumDetails.enemy.bonusRegen > 0 && (
                <div className="bonus-regen-preview enemy">
                  +{energyMomentumDetails.enemy.bonusRegen}
                </div>
              )}
            </div>
            {/* Enemy Next Momentum Threshold */}
            {energyMomentumDetails.enemy && energyMomentum.enemy > 0 && (
              <div className="momentum-info enemy">
                {energyMomentumDetails.enemy.nextThreshold} energy to next bonus
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper function for combo calculation (should match the one in battleCalculations.js)
const calculateComboBonus = (consecutiveActions) => {
  if (consecutiveActions <= 1) return 1.0;
  
  // Balanced combo scaling - caps at 25% bonus
  const bonusPerAction = 0.05;
  const maxBonus = 0.25;
  
  return 1 + Math.min(consecutiveActions * bonusPerAction, maxBonus);
};

export default BattleHeader;

// src/components/battle/ActionPanel.jsx - Enhanced with Animation Feedback and Efficiency Indicators
import React, { useState } from 'react';
import ToolSpellModal from './ToolSpellModal';
import { getActionEfficiency } from '../../utils/battleCore'; // Import efficiency calculator

const ActionPanel = ({
  selectedCreature,
  targetCreature,
  availableActions = [],
  onAction,
  disabled = false,
  availableTools = [],
  availableSpells = [],
  playerEnergy = 0 // Need current energy for efficiency calculations
}) => {
  const [showToolModal, setShowToolModal] = useState(false);
  const [showSpellModal, setShowSpellModal] = useState(false);
  const [recentAction, setRecentAction] = useState(null);
  
  // Empty state - no creature selected
  if (!selectedCreature) {
    return (
      <div className="action-panel">
        <div className="action-info">
          Select a creature to perform actions
        </div>
      </div>
    );
  }
  
  // Get creature info for display
  const isInHand = availableActions.includes('deploy');
  const isOnField = !isInHand;
  const displayName = selectedCreature.species_name;
  
  // Calculate energy efficiency for each action
  const getEfficiencyDisplay = (actionType) => {
    if (!selectedCreature || !selectedCreature.battleStats) return null;
    
    let energyCost = 0;
    switch (actionType) {
      case 'deploy':
        energyCost = selectedCreature.battleStats?.energyCost || 5;
        break;
      case 'attack':
        energyCost = 2;
        break;
      case 'defend':
        energyCost = 1;
        break;
      case 'useSpell':
        energyCost = 4;
        break;
      default:
        energyCost = 0;
    }
    
    if (energyCost === 0) return null;
    
    const efficiency = getActionEfficiency(actionType, selectedCreature, energyCost);
    return efficiency;
  };
  
  // Handle button click with animation feedback
  const handleActionClick = (actionType, additionalData = {}) => {
    if (disabled) return;
    
    // Set recent action for animation feedback
    setRecentAction(actionType);
    
    // Clear after animation
    setTimeout(() => setRecentAction(null), 500);
    
    switch (actionType) {
      case 'deploy':
        onAction({ type: 'deploy' }, null, selectedCreature);
        break;
        
      case 'attack':
        if (targetCreature) {
          onAction({ type: 'attack' }, targetCreature, selectedCreature);
        }
        break;
        
      case 'useTool':
        // Show tool modal
        setShowToolModal(true);
        break;
        
      case 'useSpell':
        // Show spell modal
        setShowSpellModal(true);
        break;
        
      case 'defend':
        onAction({ type: 'defend' }, null, selectedCreature);
        break;
        
      case 'endTurn':
        onAction({ type: 'endTurn' });
        break;
        
      default:
        console.log('Unknown action type:', actionType);
    }
  };
  
  // Handle tool selection from modal
  const handleToolSelect = (tool) => {
    setShowToolModal(false);
    onAction({ type: 'useTool', tool }, null, selectedCreature);
  };
  
  // Handle spell selection from modal
  const handleSpellSelect = (spell) => {
    setShowSpellModal(false);
    onAction({ type: 'useSpell', spell }, targetCreature, selectedCreature);
  };
  
  // Button animation class
  const getButtonAnimationClass = (actionType) => {
    return recentAction === actionType ? 'action-btn-animate' : '';
  };
  
  // Check if creature has synergies
  const activeSynergies = selectedCreature.activeSynergies || [];
  const hasSynergies = activeSynergies.length > 0;
  
  return (
    <div className="action-panel">
      <div className="selected-info">
        <div className="selection-summary">
          <div className="selected-creature">
            Selected: {isInHand ? '🖐️ ' : '🎮 '}{displayName}
            {/* Synergy indicator */}
            {hasSynergies && (
              <span className="creature-synergy-indicator" title={`${activeSynergies.length} active synergies`}>
                🔗 x{activeSynergies.length}
              </span>
            )}
          </div>
          
          {targetCreature && (
            <>
              <div className="action-arrow">➡️</div>
              <div className="target-creature">
                Target: {targetCreature.species_name}
              </div>
            </>
          )}
        </div>
        
        {/* Show creature stats summary */}
        {selectedCreature.battleStats && (
          <div className="creature-stats-summary">
            <div className="summary-stats">
              <div className="summary-stat">
                <span className="stat-icon">❤️</span>
                <span className="stat-value">{selectedCreature.currentHealth}/{selectedCreature.battleStats.maxHealth}</span>
              </div>
              
              <div className="summary-stat">
                <span className="stat-icon">⚔️</span>
                <span className="stat-value">{selectedCreature.battleStats.physicalAttack}</span>
              </div>
              
              <div className="summary-stat">
                <span className="stat-icon">✨</span>
                <span className="stat-value">{selectedCreature.battleStats.magicalAttack}</span>
              </div>
              
              <div className="summary-stat">
                <span className="stat-icon">⚡</span>
                <span className="stat-value">{selectedCreature.battleStats.initiative}</span>
              </div>
            </div>
          </div>
        )}
      </div>
      
      <div className="action-buttons">
        {/* Deploy button (hand only) */}
        {availableActions.includes('deploy') && (
          <button 
            className={`action-btn deploy ${getButtonAnimationClass('deploy')}`}
            onClick={() => handleActionClick('deploy')}
            disabled={disabled || playerEnergy < (selectedCreature.battleStats?.energyCost || 5)}
          >
            <span className="btn-icon">🌟</span> 
            <span className="btn-text">
              Deploy ({selectedCreature.battleStats?.energyCost || 5} ⚡)
            </span>
            {/* Efficiency indicator */}
            {(() => {
              const efficiency = getEfficiencyDisplay('deploy');
              return efficiency && (
                <div className="efficiency-indicator">
                  <span className="efficiency-value">{efficiency.value}</span>
                  <span className="efficiency-rating" style={{ color: efficiency.color }}>
                    {efficiency.rating}
                  </span>
                </div>
              );
            })()}
          </button>
        )}
        
        {/* Attack button (field only, needs target) */}
        {availableActions.includes('attack') && (
          <button 
            className={`action-btn attack ${getButtonAnimationClass('attack')}`}
            onClick={() => handleActionClick('attack')}
            disabled={disabled || !targetCreature || playerEnergy < 2}
          >
            <span className="btn-icon">⚔️</span> 
            <span className="btn-text">Attack (2 ⚡)</span>
            {/* Efficiency indicator */}
            {(() => {
              const efficiency = getEfficiencyDisplay('attack');
              return efficiency && (
                <div className="efficiency-indicator">
                  <span className="efficiency-value">{efficiency.value}</span>
                  <span className="efficiency-rating" style={{ color: efficiency.color }}>
                    {efficiency.rating}
                  </span>
                </div>
              );
            })()}
          </button>
        )}
        
        {/* Tool button (field only) */}
        {availableActions.includes('useTool') && (
          <button 
            className={`action-btn special ${getButtonAnimationClass('useTool')}`}
            onClick={() => handleActionClick('useTool')}
            disabled={disabled || availableTools.length === 0}
          >
            <span className="btn-icon">🔧</span> 
            <span className="btn-text">Use Tool ({availableTools.length})</span>
            <span className="efficiency-free">FREE</span>
          </button>
        )}
        
        {/* Spell button (field only) */}
        {availableActions.includes('useSpell') && (
          <button 
            className={`action-btn special ${getButtonAnimationClass('useSpell')}`}
            onClick={() => handleActionClick('useSpell')}
            disabled={disabled || availableSpells.length === 0 || playerEnergy < 4}
          >
            <span className="btn-icon">✨</span> 
            <span className="btn-text">Cast Spell ({availableSpells.length}) (4 ⚡)</span>
            {/* Efficiency indicator for spells */}
            {(() => {
              const efficiency = getEfficiencyDisplay('useSpell');
              return efficiency && (
                <div className="efficiency-indicator">
                  <span className="efficiency-value">{efficiency.value}</span>
                  <span className="efficiency-rating" style={{ color: efficiency.color }}>
                    {efficiency.rating}
                  </span>
                </div>
              );
            })()}
          </button>
        )}
        
        {/* Defend button (field only) */}
        {availableActions.includes('defend') && (
          <button 
            className={`action-btn defend ${getButtonAnimationClass('defend')}`}
            onClick={() => handleActionClick('defend')}
            disabled={disabled || playerEnergy < 1}
          >
            <span className="btn-icon">🛡️</span> 
            <span className="btn-text">Defend (1 ⚡)</span>
            {/* Efficiency indicator */}
            {(() => {
              const efficiency = getEfficiencyDisplay('defend');
              return efficiency && (
                <div className="efficiency-indicator">
                  <span className="efficiency-value">{efficiency.value}</span>
                  <span className="efficiency-rating" style={{ color: efficiency.color }}>
                    {efficiency.rating}
                  </span>
                </div>
              );
            })()}
          </button>
        )}
        
        {/* End Turn button (always available) */}
        <button 
          className={`action-btn end-turn ${getButtonAnimationClass('endTurn')}`}
          onClick={() => handleActionClick('endTurn')}
          disabled={disabled}
        >
          <span className="btn-icon">⏭️</span> 
          <span className="btn-text">End Turn</span>
        </button>
      </div>
      
      {/* Tool Modal */}
      {showToolModal && (
        <ToolSpellModal
          items={availableTools}
          type="tool"
          onSelect={handleToolSelect}
          onClose={() => setShowToolModal(false)}
        />
      )}
      
      {/* Spell Modal */}
      {showSpellModal && (
        <ToolSpellModal
          items={availableSpells}
          type="spell"
          onSelect={handleSpellSelect}
          onClose={() => setShowSpellModal(false)}
        />
      )}
    </div>
  );
};

export default ActionPanel;

import { describe, expect, it } from 'vitest';
import { groupScenes, sceneSeparatorName } from '../../bridge/services/scene-groups.js';

describe('tidy scene picker groups', () => {
  it('spots separator scenes and decorative lines', () => {
    expect(sceneSeparatorName('🎚 Main Scenes 🎚')).toBe('Main Scenes');
    expect(sceneSeparatorName('--- Capture ---')).toBe('Capture');
    expect(sceneSeparatorName('━━━━━━')).toBe('');
    expect(sceneSeparatorName('🔴 Gameplay')).toBeUndefined();
    expect(sceneSeparatorName('Y')).toBeUndefined();
  });

  it('puts the main section first, then sections A to Z, then the rest, leaving out separators and sprigs', () => {
    const blooms = ['Bloom', '🎚 Main Scenes 🎚', '🔴 Starting Soon', '🔴 Gameplay', '🔴 Be Right Back', '🎚 Nested Scenes 🎚', '🟡 Output', '🟡 Input', 'Elgato', '🎚 Capture Scenes 🎚', '🟣 Webcam Cap', '━━━━', 'Y'];
    expect(groupScenes(blooms, ['Elgato'])).toEqual([
      { name: 'Main Scenes', main: true, scenes: ['🔴 Be Right Back', '🔴 Gameplay', '🔴 Starting Soon'] },
      { name: 'Capture Scenes', scenes: ['🟣 Webcam Cap', 'Y'] },
      { name: 'Nested Scenes', scenes: ['🟡 Input', '🟡 Output'] },
      { name: '', scenes: ['Bloom'] },
    ]);
  });

  it('without a Main section, the 🔴 scenes are the main ones', () => {
    expect(groupScenes(['Zoo', '🔴 Live', 'Alpha', '🔴 Ending'])).toEqual([
      { name: 'Main', main: true, scenes: ['🔴 Ending', '🔴 Live'] },
      { name: '', scenes: ['Alpha', 'Zoo'] },
    ]);
  });
});

/**
 * BlockRouter — renders the correct adapter based on block_type.
 * Used in workout.js to switch between strength-inline UI and
 * timer/interval adapters for non-strength blocks.
 */
import IntervalAdapter from './IntervalAdapter';
import AMRAPAdapter from './AMRAPAdapter';
import EMOMAdapter from './EMOMAdapter';
import CircuitAdapter from './CircuitAdapter';
import TimedAdapter from './TimedAdapter';
import DistanceAdapter from './DistanceAdapter';
import CardioAdapter from './CardioAdapter';
import RestAdapter from './RestAdapter';
import UnsupportedBlockFallback from './UnsupportedBlockFallback';

export default function BlockRouter({
  block,         // session_blocks row with parsed config
  sessionId,
  blockPosition, // "Block 2 of 5"
  onBlockComplete,
}) {
  const { block_type, config, id: blockId } = block;

  switch (block_type) {
    case 'interval':
      return (
        <IntervalAdapter
          blockPosition={blockPosition}
          blockId={blockId}
          sessionId={sessionId}
          config={config}
          onBlockComplete={onBlockComplete}
        />
      );
    case 'amrap':
      return (
        <AMRAPAdapter
          blockPosition={blockPosition}
          blockId={blockId}
          sessionId={sessionId}
          config={config}
          onBlockComplete={onBlockComplete}
        />
      );
    case 'emom':
      return (
        <EMOMAdapter
          blockPosition={blockPosition}
          blockId={blockId}
          sessionId={sessionId}
          config={config}
          onBlockComplete={onBlockComplete}
        />
      );
    case 'circuit':
      return (
        <CircuitAdapter
          blockPosition={blockPosition}
          blockId={blockId}
          sessionId={sessionId}
          config={config}
          onBlockComplete={onBlockComplete}
        />
      );
    case 'timed':
      return (
        <TimedAdapter
          blockPosition={blockPosition}
          blockId={blockId}
          sessionId={sessionId}
          config={config}
          onBlockComplete={onBlockComplete}
        />
      );
    case 'distance':
      return (
        <DistanceAdapter
          blockPosition={blockPosition}
          blockId={blockId}
          sessionId={sessionId}
          config={config}
          onBlockComplete={onBlockComplete}
        />
      );
    case 'cardio':
      return (
        <CardioAdapter
          blockPosition={blockPosition}
          blockId={blockId}
          sessionId={sessionId}
          config={config}
          onBlockComplete={onBlockComplete}
        />
      );
    case 'rest':
      return (
        <RestAdapter
          blockPosition={blockPosition}
          blockId={blockId}
          sessionId={sessionId}
          config={config}
          onBlockComplete={onBlockComplete}
        />
      );
    default:
      return (
        <UnsupportedBlockFallback
          blockType={block_type}
          blockLabel={block.label}
          blockPosition={blockPosition}
          onSkip={onBlockComplete}
        />
      );
  }
}

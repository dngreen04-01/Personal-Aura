/**
 * TimedAdapter — renders a simple timed block (countdown) inside
 * BlockAdapterShell. Uses useTimerCore directly — no custom hook needed.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import BlockAdapterShell from './BlockAdapterShell';
import TimerDisplay from './TimerDisplay';
import useTimerCore from '../../hooks/useTimerCore';
import { saveBlockTimer, clearRestTimer, getActiveBlockTimer, logTimedEffort } from '../../lib/database';
import { showBlockTimerNotification, dismissBlockTimerNotification } from '../../lib/notifications';
import { colors, spacing, fonts } from '../../lib/theme';

export default function TimedAdapter({
  blockPosition,
  blockId,
  sessionId,
  config, // { duration_sec }
  onBlockComplete,
}) {
  const durationSec = config?.duration_sec || 60;
  const [phase, setPhase] = useState('idle'); // 'idle' | 'active' | 'complete'
  const [isPaused, setIsPaused] = useState(false);
  const phaseRef = useRef('idle');
  const onBlockCompleteRef = useRef(onBlockComplete);
  onBlockCompleteRef.current = onBlockComplete;

  const handleComplete = useCallback(() => {
    phaseRef.current = 'complete';
    setPhase('complete');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    dismissBlockTimerNotification();
    if (blockId) {
      logTimedEffort(blockId, 0, durationSec, null).catch(e => console.error('[TimedAdapter] Failed to log effort:', e));
    }
    clearRestTimer().catch(() => {});
    onBlockCompleteRef.current?.();
  }, [blockId, durationSec]);

  const core = useTimerCore({ onComplete: handleComplete });

  const start = useCallback(() => {
    phaseRef.current = 'active';
    setPhase('active');
    setIsPaused(false);
    showBlockTimerNotification(config?.label || 'Timed Block', durationSec, Date.now(), 'work');
    saveBlockTimer(
      Date.now() + durationSec * 1000, sessionId, 'timed',
      { duration_sec: durationSec }
    ).catch(() => {});
    core.start(durationSec);
  }, [durationSec, sessionId, core, config?.label]);

  const pause = useCallback(() => {
    core.pause();
    setIsPaused(true);
    dismissBlockTimerNotification();
  }, [core]);

  const resume = useCallback(() => {
    core.resume();
    setIsPaused(false);
    showBlockTimerNotification(config?.label || 'Timed Block', core.remaining, Date.now(), 'work');
  }, [core, config?.label]);

  // Recovery from app kill
  useEffect(() => {
    (async () => {
      try {
        const saved = await getActiveBlockTimer();
        if (!saved || saved.timer_kind !== 'timed') return;
        const stillActive = core.restoreFromEndTime(saved.rest_end_time, durationSec);
        if (stillActive) {
          phaseRef.current = 'active';
          setPhase('active');
        }
      } catch {}
    })();
  }, []);

  useEffect(() => () => dismissBlockTimerNotification(), []);

  let primaryLabel;
  let primaryAction;

  if (phase === 'idle') {
    primaryLabel = 'START';
    primaryAction = start;
  } else if (isPaused) {
    primaryLabel = 'RESUME';
    primaryAction = resume;
  } else if (phase === 'active') {
    primaryLabel = 'PAUSE';
    primaryAction = pause;
  } else {
    primaryLabel = null;
  }

  const heroLabel = phase === 'complete' ? 'COMPLETE' : (config?.label || 'TIMED');

  return (
    <BlockAdapterShell
      blockPosition={blockPosition}
      heroLabel={heroLabel}
      primaryLabel={primaryLabel}
      onPrimaryAction={primaryAction}
      keepAwake={phase === 'active' && !isPaused}
      accessibilityHint={
        phase === 'idle' ? 'Start timed block'
        : `${core.remaining} seconds remaining`
      }
    >
      <TimerDisplay
        seconds={phase === 'idle' ? durationSec : core.remaining}
        phase="work"
      />
      {isPaused && <Text style={styles.pausedText}>PAUSED</Text>}
    </BlockAdapterShell>
  );
}

const styles = StyleSheet.create({
  pausedText: {
    marginTop: spacing.sm,
    fontSize: 12,
    ...fonts.semibold,
    color: colors.textSecondary,
    letterSpacing: 2,
  },
});

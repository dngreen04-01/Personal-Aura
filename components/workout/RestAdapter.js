/**
 * RestAdapter — renders a rest/recovery block (passive countdown) inside
 * BlockAdapterShell. Auto-completes on timer expiry. "SKIP REST" to end early.
 */
import { useState, useRef, useCallback, useEffect } from 'react';
import { Text, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import BlockAdapterShell from './BlockAdapterShell';
import TimerDisplay from './TimerDisplay';
import useTimerCore from '../../hooks/useTimerCore';
import { saveBlockTimer, clearRestTimer, getActiveBlockTimer, logRestEntry } from '../../lib/database';
import { showBlockTimerNotification, dismissBlockTimerNotification } from '../../lib/notifications';
import { colors, spacing, fonts } from '../../lib/theme';

export default function RestAdapter({
  blockPosition,
  blockId,
  sessionId,
  config, // { duration_sec }
  onBlockComplete,
}) {
  const durationSec = config?.duration_sec || 60;
  const [phase, setPhase] = useState('idle'); // 'idle' | 'active' | 'complete'
  const phaseRef = useRef('idle');
  const startedAtRef = useRef(null);
  const onBlockCompleteRef = useRef(onBlockComplete);
  onBlockCompleteRef.current = onBlockComplete;

  const handleComplete = useCallback(() => {
    phaseRef.current = 'complete';
    setPhase('complete');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    dismissBlockTimerNotification();
    if (blockId) {
      logRestEntry(blockId, 0, durationSec).catch(e => console.error('[RestAdapter] Failed to log rest:', e));
    }
    clearRestTimer().catch(() => {});
    onBlockCompleteRef.current?.();
  }, [blockId, durationSec]);

  const core = useTimerCore({ onComplete: handleComplete });

  const start = useCallback(() => {
    phaseRef.current = 'active';
    setPhase('active');
    startedAtRef.current = Date.now();
    showBlockTimerNotification('Rest', durationSec, Date.now(), 'rest');
    saveBlockTimer(
      Date.now() + durationSec * 1000, sessionId, 'rest_block',
      { duration_sec: durationSec }
    ).catch(() => {});
    core.start(durationSec);
  }, [durationSec, sessionId, core]);

  const skip = useCallback(() => {
    dismissBlockTimerNotification();
    core.reset();
    phaseRef.current = 'complete';
    setPhase('complete');
    // Log actual elapsed rest time
    const elapsedSec = startedAtRef.current
      ? Math.round((Date.now() - startedAtRef.current) / 1000)
      : 0;
    if (blockId) {
      logRestEntry(blockId, 0, elapsedSec).catch(e => console.error('[RestAdapter] Failed to log rest:', e));
    }
    clearRestTimer().catch(() => {});
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onBlockCompleteRef.current?.();
  }, [core, blockId]);

  // Recovery from app kill
  useEffect(() => {
    (async () => {
      try {
        const saved = await getActiveBlockTimer();
        if (!saved || saved.timer_kind !== 'rest_block') return;
        phaseRef.current = 'active';
        setPhase('active');
        startedAtRef.current = Date.now() - (durationSec * 1000 - (saved.rest_end_time - Date.now()));
        core.restoreFromEndTime(saved.rest_end_time, durationSec);
      } catch {}
    })();
  }, []);

  useEffect(() => () => dismissBlockTimerNotification(), []);

  let primaryLabel;
  let primaryAction;

  if (phase === 'idle') {
    primaryLabel = 'START REST';
    primaryAction = start;
  } else if (phase === 'active') {
    primaryLabel = 'SKIP REST';
    primaryAction = skip;
  } else {
    primaryLabel = null;
  }

  const heroLabel = phase === 'complete' ? 'READY' : 'REST';

  return (
    <BlockAdapterShell
      blockPosition={blockPosition}
      heroLabel={heroLabel}
      primaryLabel={primaryLabel}
      onPrimaryAction={primaryAction}
      keepAwake={phase === 'active'}
      accessibilityHint={
        phase === 'idle' ? `Rest for ${Math.floor(durationSec / 60)} minutes`
        : `${core.remaining} seconds of rest remaining`
      }
    >
      <TimerDisplay
        seconds={phase === 'idle' ? durationSec : core.remaining}
        phase="rest"
      />
    </BlockAdapterShell>
  );
}

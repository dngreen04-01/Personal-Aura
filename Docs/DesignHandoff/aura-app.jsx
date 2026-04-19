// aura-app.jsx — top-level app: routing, state, scripted AI replies, Tweaks

const Screen = { CHAT: 'chat', WORKOUT: 'workout', SUMMARY: 'summary', SHARE: 'share', PROGRESS: 'progress' };

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "messageStyle": "faithful",
  "cardVariant": "a",
  "restVariant": "bottomsheet"
}/*EDITMODE-END*/;

function AuraApp() {
  const [screen, setScreen] = React.useState(Screen.CHAT);
  const [messages, setMessages] = React.useState(INITIAL_MESSAGES);
  const [isThinking, setIsThinking] = React.useState(false);

  // Workout state
  const [exerciseIdx, setExerciseIdx] = React.useState(0);
  const [setIdx, setSetIdx] = React.useState(0);
  const [loggedSets, setLoggedSets] = React.useState([]);
  const [workoutStart, setWorkoutStart] = React.useState(null);
  const [workoutElapsed, setWorkoutElapsed] = React.useState(0);

  // Rest timer state
  const [isResting, setIsResting] = React.useState(false);
  const [restSecondsLeft, setRestSecondsLeft] = React.useState(0);

  // Tweaks
  const [tweaks, setTweaks] = React.useState(TWEAK_DEFAULTS);
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  const [editModeActive, setEditModeActive] = React.useState(false);

  // ─── Tweak mode host protocol ─────────────────────────────
  React.useEffect(() => {
    const onMsg = (e) => {
      if (e.data?.type === '__activate_edit_mode') setEditModeActive(true);
      else if (e.data?.type === '__deactivate_edit_mode') { setEditModeActive(false); setTweaksOpen(false); }
    };
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  const updateTweak = (key, value) => {
    const next = { ...tweaks, [key]: value };
    setTweaks(next);
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [key]: value } }, '*');
  };

  // ─── Workout elapsed timer ────────────────────────────────
  React.useEffect(() => {
    if (!workoutStart || screen !== Screen.WORKOUT) return;
    const id = setInterval(() => setWorkoutElapsed(Math.floor((Date.now() - workoutStart) / 1000)), 1000);
    return () => clearInterval(id);
  }, [workoutStart, screen]);

  // ─── Rest timer countdown ─────────────────────────────────
  React.useEffect(() => {
    if (!isResting) return;
    const id = setInterval(() => {
      setRestSecondsLeft(s => {
        if (s <= 1) { setIsResting(false); return 0; }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isResting]);

  // ─── Scripted AI reply ────────────────────────────────────
  const sendAuraReply = (userText) => {
    setIsThinking(true);
    const delay = 900 + Math.min(userText.length * 25, 1400);
    setTimeout(() => {
      const matched = AURA_REPLIES.find(r => r.match.test(userText));
      const pool = matched.replies;
      const reply = pool[Math.floor(Math.random() * pool.length)];
      setIsThinking(false);
      setMessages(m => [...m, { id: 'a' + Date.now(), role: 'aura', text: reply, time: now() }]);
    }, delay);
  };

  const handleSend = (text) => {
    setMessages(m => [...m, { id: 'u' + Date.now(), role: 'user', text, time: now() }]);
    sendAuraReply(text);
  };

  const handleChip = (chip) => {
    setMessages(m => [...m, { id: 'u' + Date.now(), role: 'user', text: chip, time: now() }]);
    sendAuraReply(chip);
  };

  // ─── Start workout ────────────────────────────────────────
  const startWorkout = () => {
    setExerciseIdx(0); setSetIdx(0); setLoggedSets([]);
    setWorkoutStart(Date.now()); setWorkoutElapsed(0);
    setScreen(Screen.WORKOUT);
  };

  // ─── Log a set ────────────────────────────────────────────
  const logSet = (weight, reps) => {
    const ex = WORKOUT.exercises[exerciseIdx];
    const isPR = ex.lastPR?.weight != null && weight > ex.lastPR.weight && setIdx === 0;
    const logged = { exerciseId: ex.id, setNum: setIdx + 1, weight, reps, isPR };
    setLoggedSets(ls => [...ls, logged]);

    const isLastSet = setIdx + 1 >= ex.sets;
    const isLastExercise = exerciseIdx + 1 >= WORKOUT.exercises.length;

    if (isLastSet && isLastExercise) {
      setScreen(Screen.SUMMARY);
      return;
    }
    if (isLastSet) {
      // move to next exercise, no rest
      setExerciseIdx(i => i + 1); setSetIdx(0);
      return;
    }
    // start rest
    setSetIdx(i => i + 1);
    if (ex.rest > 0) {
      setRestSecondsLeft(ex.rest);
      setIsResting(true);
    }
  };

  const skipRest = () => { setIsResting(false); setRestSecondsLeft(0); };
  const extendRest = () => setRestSecondsLeft(s => s + 15);

  const exitWorkout = () => setScreen(Screen.CHAT);

  // ─── Render screens ───────────────────────────────────────
  let body;
  if (screen === Screen.CHAT) {
    body = <ChatScreen
      messages={messages}
      onSend={handleSend}
      isThinking={isThinking}
      variant={tweaks.messageStyle}
      onChip={handleChip}
      onStart={startWorkout}
      onOpenProgress={() => setScreen(Screen.PROGRESS)}
    />;
  } else if (screen === Screen.WORKOUT) {
    body = <WorkoutScreen
      workout={WORKOUT}
      exerciseIdx={exerciseIdx}
      setIdx={setIdx}
      onLogSet={logSet}
      onExit={exitWorkout}
      cardVariant={tweaks.cardVariant}
      restVariant={tweaks.restVariant}
      isResting={isResting}
      restSecondsLeft={restSecondsLeft}
      onSkipRest={skipRest}
      onExtendRest={extendRest}
      variant={tweaks.messageStyle}
    />;
  } else if (screen === Screen.SUMMARY) {
    body = <WorkoutSummaryScreen
      workout={WORKOUT}
      loggedSets={loggedSets}
      totalSeconds={workoutElapsed}
      onDone={() => setScreen(Screen.CHAT)}
      onShare={() => setScreen(Screen.SHARE)}
      variant={tweaks.messageStyle}
    />;
  } else if (screen === Screen.SHARE) {
    body = <ShareCardScreen
      onBack={() => setScreen(Screen.SUMMARY)}
      loggedSets={loggedSets.length ? loggedSets : DEMO_LOGGED_SETS}
      totalSeconds={workoutElapsed || 52 * 60}
    />;
  } else if (screen === Screen.PROGRESS) {
    body = <ProgressScreen
      onBack={() => setScreen(Screen.CHAT)}
      onShare={() => setScreen(Screen.SHARE)}
    />;
  }

  return (
    <div style={{
      width: '100%', height: '100vh',
      background: '#0a0a0a',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Top nav shortcut row (next to device, for jumping between screens) */}
      <div style={{
        position: 'absolute', top: 20, left: 20, display: 'flex', flexDirection: 'column', gap: 6,
        zIndex: 100,
      }}>
        {Object.entries(Screen).map(([k, v]) => (
          <button key={v} onClick={() => setScreen(v)} style={{
            padding: '6px 10px',
            background: screen === v ? AURA.primary : 'rgba(255,255,255,0.08)',
            color: screen === v ? AURA.bgDark : '#888',
            border: 'none', borderRadius: 8,
            fontSize: 10, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'Inter, system-ui', textTransform: 'uppercase',
            letterSpacing: 1,
          }}>{k}</button>
        ))}
      </div>

      <IOSDevice dark width={402} height={874}>
        {body}
      </IOSDevice>

      {/* Tweaks panel */}
      {editModeActive && (
        <TweaksPanel
          tweaks={tweaks}
          onChange={updateTweak}
          open={tweaksOpen}
          onToggle={() => setTweaksOpen(o => !o)}
        />
      )}
    </div>
  );
}

const DEMO_LOGGED_SETS = [
  { exerciseId: 'bench', setNum: 1, weight: 82.5, reps: 5, isPR: true },
  { exerciseId: 'bench', setNum: 2, weight: 82.5, reps: 5, isPR: false },
  { exerciseId: 'bench', setNum: 3, weight: 82.5, reps: 4, isPR: false },
  { exerciseId: 'bench', setNum: 4, weight: 80, reps: 5, isPR: false },
  { exerciseId: 'ohp', setNum: 1, weight: 47.5, reps: 6, isPR: true },
  { exerciseId: 'ohp', setNum: 2, weight: 47.5, reps: 6, isPR: false },
  { exerciseId: 'ohp', setNum: 3, weight: 47.5, reps: 5, isPR: false },
  { exerciseId: 'ohp', setNum: 4, weight: 45, reps: 6, isPR: false },
  { exerciseId: 'incline-db', setNum: 1, weight: 27.5, reps: 10, isPR: true },
  { exerciseId: 'incline-db', setNum: 2, weight: 27.5, reps: 9, isPR: false },
  { exerciseId: 'incline-db', setNum: 3, weight: 25, reps: 10, isPR: false },
  { exerciseId: 'lateral', setNum: 1, weight: 10, reps: 12, isPR: false },
  { exerciseId: 'lateral', setNum: 2, weight: 10, reps: 12, isPR: false },
  { exerciseId: 'lateral', setNum: 3, weight: 10, reps: 11, isPR: false },
  { exerciseId: 'tricep-pushdown', setNum: 1, weight: 25, reps: 12, isPR: false },
  { exerciseId: 'tricep-pushdown', setNum: 2, weight: 25, reps: 12, isPR: false },
  { exerciseId: 'tricep-pushdown', setNum: 3, weight: 25, reps: 10, isPR: false },
  { exerciseId: 'pushup-finisher', setNum: 1, weight: null, reps: 32, isPR: true },
];

function now() {
  const d = new Date();
  let h = d.getHours(); const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}

// ─── Tweaks panel ─────────────────────────────────────────────
function TweaksPanel({ tweaks, onChange, open, onToggle }) {
  return (
    <div style={{
      position: 'fixed', bottom: 20, right: 20, zIndex: 200,
      fontFamily: 'Inter, system-ui',
    }}>
      {!open && (
        <button onClick={onToggle} style={{
          padding: '10px 14px', borderRadius: 12,
          background: AURA.primary, color: AURA.bgDark,
          border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
          fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6,
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        }}>
          <Icon name="sparkle" size={14} color={AURA.bgDark} />
          Tweaks
        </button>
      )}
      {open && (
        <div style={{
          width: 280, padding: 16, borderRadius: 16,
          background: AURA.bgMid, color: AURA.textPrimary,
          border: `1px solid ${AURA.borderLight}`,
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.3 }}>Tweaks</div>
            <button onClick={onToggle} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}>
              <Icon name="close" size={18} color={AURA.textSecondary} />
            </button>
          </div>

          <TweakGroup label="Visual direction" value={tweaks.messageStyle}
            options={[
              { v: 'faithful', l: 'Faithful' },
              { v: 'editorial', l: 'Editorial' },
              { v: 'experimental', l: 'Experimental' },
            ]}
            onChange={v => onChange('messageStyle', v)}
          />

          <TweakGroup label="Exercise card" value={tweaks.cardVariant}
            options={[
              { v: 'a', l: 'Hero weight' },
              { v: 'b', l: 'Split' },
              { v: 'c', l: 'Editorial' },
            ]}
            onChange={v => onChange('cardVariant', v)}
          />

          <TweakGroup label="Rest timer" value={tweaks.restVariant}
            options={[
              { v: 'bottomsheet', l: 'Bottom sheet' },
              { v: 'fullscreen', l: 'Fullscreen' },
              { v: 'inline', l: 'Inline pill' },
            ]}
            onChange={v => onChange('restVariant', v)}
          />

          <div style={{ fontSize: 10, color: AURA.textMuted, marginTop: 8, lineHeight: 1.5 }}>
            Use the top-left shortcuts to jump between screens. Tap <span style={{ color: AURA.primary, fontWeight: 700 }}>Start workout</span> in chat to trigger the live flow.
          </div>
        </div>
      )}
    </div>
  );
}

function TweakGroup({ label, value, options, onChange }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: 1.5, color: AURA.textMuted, textTransform: 'uppercase', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', gap: 4, background: AURA.bgDark, padding: 3, borderRadius: 10, border: `1px solid ${AURA.borderLight}` }}>
        {options.map(o => (
          <button key={o.v} onClick={() => onChange(o.v)} style={{
            flex: 1, padding: '7px 4px',
            background: value === o.v ? AURA.primary : 'transparent',
            color: value === o.v ? AURA.bgDark : AURA.textSecondary,
            border: 'none', borderRadius: 7,
            fontSize: 11, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit',
          }}>{o.l}</button>
        ))}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<AuraApp />);

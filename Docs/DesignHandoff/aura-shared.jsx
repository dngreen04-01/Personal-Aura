// aura-shared.jsx — shared primitives: colors, icons, message bubbles, buttons

// Design tokens (from Personal-Aura/lib/theme.js)
const AURA = {
  primary: '#d4ff00',
  primaryDim: 'rgba(212, 255, 0, 0.4)',
  primaryFaint: 'rgba(212, 255, 0, 0.1)',
  primaryGhost: 'rgba(212, 255, 0, 0.05)',
  bgDark: '#121408',
  bgMid: '#20230f',
  bgCard: 'rgba(255, 255, 255, 0.05)',
  bgCardSolid: '#2a2d18',
  borderSubtle: 'rgba(212, 255, 0, 0.1)',
  borderLight: 'rgba(255, 255, 255, 0.1)',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: 'rgba(212, 255, 0, 0.4)',
};

// ─── Icons (inline SVG) ────────────────────────────────────
const Icon = ({ name, size = 20, color = 'currentColor', stroke = 2 }) => {
  const props = {
    width: size, height: size, viewBox: '0 0 24 24',
    fill: 'none', stroke: color, strokeWidth: stroke,
    strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  const paths = {
    send: <path d="M5 12h14M13 5l7 7-7 7" />,
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="M20 6L9 17l-5-5" />,
    play: <path d="M8 5v14l11-7z" fill={color} />,
    pause: <path d="M6 4h4v16H6zM14 4h4v16h-4z" fill={color} stroke="none" />,
    chevronRight: <path d="M9 6l6 6-6 6" />,
    chevronLeft: <path d="M15 6l-6 6 6 6" />,
    chevronDown: <path d="M6 9l6 6 6-6" />,
    chevronUp: <path d="M18 15l-6-6-6 6" />,
    close: <path d="M18 6L6 18M6 6l12 12" />,
    flame: <path d="M12 22c4.5-1.5 7-5 7-9 0-3.5-2-6-3-7-.5 2-2 3-3 3-1-2-1-5-3-7-1 2-3 4-3 8 0 4 2.5 7.5 5 12z" />,
    trophy: <><path d="M6 9V4h12v5c0 3.5-2.5 6-6 6s-6-2.5-6-6z" /><path d="M6 5H3v3a3 3 0 003 3M18 5h3v3a3 3 0 01-3 3M12 15v3M9 21h6M9 21v-2h6v2" /></>,
    dumbbell: <><path d="M6 7v10M10 5v14M14 5v14M18 7v10M3 10v4M21 10v4" /></>,
    timer: <><circle cx="12" cy="13" r="8" /><path d="M12 9v4M9 2h6" /></>,
    zap: <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />,
    trending: <><path d="M3 17l6-6 4 4 8-8" /><path d="M21 7h-6M21 7v6" /></>,
    chart: <><path d="M3 3v18h18" /><path d="M7 14l4-4 3 3 5-6" /></>,
    share: <><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></>,
    camera: <><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" /><circle cx="12" cy="13" r="4" /></>,
    message: <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />,
    activity: <path d="M22 12h-4l-3 9L9 3l-3 9H2" />,
    user: <><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></>,
    mic: <><path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" /><path d="M19 10v2a7 7 0 01-14 0v-2M12 19v3M8 22h8" /></>,
    refresh: <><path d="M23 4v6h-6M1 20v-6h6" /><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" /></>,
    edit: <><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></>,
    info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" /></>,
    award: <><circle cx="12" cy="8" r="7" /><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12" /></>,
    clock: <><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>,
    mapPin: <><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></>,
    bell: <><path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" /></>,
    arrowUp: <path d="M12 19V5M5 12l7-7 7 7" />,
    arrowRight: <path d="M5 12h14M12 5l7 7-7 7" />,
    heart: <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />,
    swap: <path d="M7 16V4M7 4L3 8M7 4l4 4M17 8v12M17 20l4-4M17 20l-4-4" />,
    pencil: <><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 113 3L7 19l-4 1 1-4L16.5 3.5z" /></>,
    sparkle: <><path d="M12 2l2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5L12 2z" /></>,
  };
  return <svg {...props}>{paths[name] || null}</svg>;
};

// ─── Aura avatar — animated gradient orb ─────────────────────
const AuraOrb = ({ size = 28, thinking = false }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%',
    position: 'relative', flexShrink: 0,
    background: 'radial-gradient(circle at 30% 30%, #d4ff00 0%, #88aa00 50%, #20230f 100%)',
    boxShadow: `0 0 ${size/2}px rgba(212,255,0,0.35), inset 0 0 ${size/3}px rgba(0,0,0,0.3)`,
    animation: thinking ? 'auraOrbPulse 1.4s ease-in-out infinite' : 'auraOrbIdle 4s ease-in-out infinite',
  }}>
    <div style={{
      position: 'absolute', top: '15%', left: '20%',
      width: '35%', height: '35%', borderRadius: '50%',
      background: 'rgba(255,255,255,0.35)', filter: 'blur(2px)',
    }} />
  </div>
);

// ─── Markdown-lite: **bold** ─────────────────────────────────
const renderMd = (text) => {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} style={{ color: AURA.primary, fontWeight: 700 }}>{p.slice(2, -2)}</strong>
      : <React.Fragment key={i}>{p}</React.Fragment>
  );
};

// ─── Message bubble ──────────────────────────────────────────
const MessageBubble = ({ msg, variant = 'faithful', onChip, onStart }) => {
  const isUser = msg.role === 'user';
  const isEditorial = variant === 'editorial';
  const isExperimental = variant === 'experimental';

  // User message — right-aligned lime bubble
  if (isUser) {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
        <div style={{
          maxWidth: '78%',
          background: AURA.primary, color: AURA.bgDark,
          padding: '10px 14px', borderRadius: 18, borderBottomRightRadius: 6,
          fontSize: 15, lineHeight: 1.45, fontWeight: 500,
          letterSpacing: -0.2,
        }}>
          {msg.text}
        </div>
      </div>
    );
  }

  // Aura message — left-aligned, orb + bubble
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-start' }}>
      <AuraOrb size={28} />
      <div style={{ flex: 1, minWidth: 0 }}>
        {isEditorial ? (
          <div style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontSize: 17, lineHeight: 1.45, color: AURA.textPrimary,
            letterSpacing: -0.3, fontWeight: 400,
            whiteSpace: 'pre-wrap',
          }}>{renderMd(msg.text)}</div>
        ) : isExperimental ? (
          <div style={{
            background: `linear-gradient(135deg, ${AURA.primaryGhost}, rgba(212,255,0,0.02))`,
            border: `1px solid ${AURA.borderSubtle}`,
            borderRadius: 18, borderTopLeftRadius: 4,
            padding: '12px 15px',
            fontSize: 15, lineHeight: 1.5, color: AURA.textPrimary,
            whiteSpace: 'pre-wrap',
          }}>{renderMd(msg.text)}</div>
        ) : (
          <div style={{
            fontSize: 15, lineHeight: 1.5, color: AURA.textPrimary,
            letterSpacing: -0.1, paddingTop: 3,
            whiteSpace: 'pre-wrap',
          }}>{renderMd(msg.text)}</div>
        )}

        {msg.attachment?.kind === 'workout' && (
          <InlineWorkoutCard workout={WORKOUT} onStart={onStart} variant={variant} />
        )}

        {msg.chips && (
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            {msg.chips.map((c, i) => (
              <button
                key={i}
                onClick={() => onChip?.(c)}
                style={{
                  background: 'transparent',
                  border: `1px solid ${AURA.borderSubtle}`,
                  color: AURA.primary,
                  padding: '7px 12px',
                  borderRadius: 16,
                  fontSize: 13, fontWeight: 500,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = AURA.primaryGhost; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {c}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Inline workout card (shown attached to an Aura message) ─
const InlineWorkoutCard = ({ workout, onStart, variant = 'faithful' }) => {
  const isEditorial = variant === 'editorial';
  return (
    <div style={{
      marginTop: 10,
      background: AURA.primaryGhost,
      border: `1px solid ${AURA.borderSubtle}`,
      borderRadius: 16,
      padding: 16,
    }}>
      <div style={{
        fontSize: 10, fontWeight: 700, letterSpacing: 2,
        color: AURA.textMuted, marginBottom: 6,
      }}>TODAY'S PLAN</div>
      <div style={{
        fontSize: isEditorial ? 22 : 19,
        fontFamily: isEditorial ? 'Fraunces, Georgia, serif' : 'inherit',
        fontWeight: 700, color: AURA.textPrimary,
        letterSpacing: -0.4, marginBottom: 10, lineHeight: 1.15,
      }}>{workout.focus}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, color: AURA.textSecondary, fontSize: 13 }}>
        <Icon name="clock" size={13} color={AURA.textSecondary} />
        <span>{workout.estimatedDuration} min</span>
        <span style={{ opacity: 0.5 }}>·</span>
        <span>{workout.exercises.length} exercises</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
        {workout.exercises.slice(0, 4).map((ex, i) => (
          <div key={ex.id} style={{ display: 'flex', alignItems: 'center', fontSize: 13 }}>
            <span style={{ width: 20, color: AURA.textSecondary, fontWeight: 500 }}>{i + 1}.</span>
            <span style={{ flex: 1, color: AURA.textPrimary, fontWeight: 500 }}>{ex.name}</span>
            <span style={{ color: AURA.textSecondary, fontWeight: 600 }}>
              {ex.sets}×{ex.reps}
            </span>
          </div>
        ))}
        {workout.exercises.length > 4 && (
          <div style={{ fontSize: 12, color: AURA.textMuted, paddingLeft: 20 }}>
            +{workout.exercises.length - 4} more
          </div>
        )}
      </div>

      <button
        onClick={() => onStart?.(workout)}
        style={{
          width: '100%', padding: '14px',
          background: AURA.primary, color: AURA.bgDark,
          border: 'none', borderRadius: 14,
          fontSize: 15, fontWeight: 700, cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontFamily: 'inherit', letterSpacing: -0.2,
        }}
      >
        Start workout
        <Icon name="play" size={14} color={AURA.bgDark} />
      </button>
    </div>
  );
};

// ─── Thinking dots ───────────────────────────────────────────
const ThinkingDots = () => (
  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 14 }}>
    <AuraOrb size={28} thinking />
    <div style={{ display: 'flex', gap: 4, paddingTop: 8 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          width: 6, height: 6, borderRadius: '50%',
          background: AURA.primary, opacity: 0.6,
          animation: `thinkPulse 1.2s ease-in-out ${i * 0.15}s infinite`,
        }} />
      ))}
    </div>
  </div>
);

// ─── Stat pill ───────────────────────────────────────────────
const StatPill = ({ icon, label, value, accent }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '6px 12px', borderRadius: 999,
    background: accent ? AURA.primaryFaint : AURA.bgCard,
    border: `1px solid ${accent ? AURA.borderSubtle : AURA.borderLight}`,
  }}>
    {icon && <Icon name={icon} size={13} color={accent ? AURA.primary : AURA.textSecondary} />}
    <span style={{ fontSize: 12, color: AURA.textSecondary, fontWeight: 500 }}>{label}</span>
    <span style={{ fontSize: 13, color: accent ? AURA.primary : AURA.textPrimary, fontWeight: 700 }}>{value}</span>
  </div>
);

Object.assign(window, {
  AURA, Icon, AuraOrb, renderMd, MessageBubble, InlineWorkoutCard, ThinkingDots, StatPill,
});

// aura-chat.jsx — chat screen (scripted AI, typing states)

const ChatScreen = ({ messages, onSend, isThinking, variant, onChip, onStart, onOpenProgress }) => {
  const [input, setInput] = React.useState('');
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 999999, behavior: 'smooth' });
  }, [messages, isThinking]);

  const submit = () => {
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
  };

  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
      background: AURA.bgDark, color: AURA.textPrimary,
      fontFamily: 'Inter, system-ui, sans-serif',
    }}>
      {/* Header */}
      <div style={{
        padding: '56px 20px 12px', display: 'flex',
        alignItems: 'center', justifyContent: 'space-between',
        borderBottom: `1px solid ${AURA.borderLight}`,
        background: AURA.bgDark, zIndex: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <AuraOrb size={32} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.3 }}>Aura</div>
            <div style={{ fontSize: 11, color: AURA.textMuted, fontWeight: 600, letterSpacing: 0.5, textTransform: 'uppercase' }}>
              Your coach · online
            </div>
          </div>
        </div>
        <button
          onClick={onOpenProgress}
          style={{
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: 8, color: AURA.textSecondary,
          }}
        >
          <Icon name="chart" size={22} color={AURA.textSecondary} />
        </button>
      </div>

      {/* Streak banner */}
      <div style={{
        margin: '12px 16px 8px', padding: '10px 14px',
        display: 'flex', alignItems: 'center', gap: 10,
        background: AURA.primaryFaint,
        border: `1px solid ${AURA.borderSubtle}`,
        borderRadius: 14,
      }}>
        <Icon name="flame" size={16} color={AURA.primary} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: AURA.textPrimary }}>
            {USER.streak}-day streak · {USER.weekProgress.completed}/{USER.weekProgress.total} this week
          </div>
        </div>
        <div style={{
          fontSize: 11, fontWeight: 700, color: AURA.primary,
          letterSpacing: 1, textTransform: 'uppercase',
        }}>On fire</div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: 1, overflowY: 'auto', padding: '8px 16px 16px',
      }}>
        {messages.map(msg => (
          <MessageBubble
            key={msg.id}
            msg={msg}
            variant={variant}
            onChip={onChip}
            onStart={onStart}
          />
        ))}
        {isThinking && <ThinkingDots />}
      </div>

      {/* Input */}
      <div style={{
        padding: '10px 12px 34px',
        borderTop: `1px solid ${AURA.borderLight}`,
        background: AURA.bgDark,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: AURA.bgCard, borderRadius: 24,
          border: `1px solid ${AURA.borderLight}`,
          padding: '4px 4px 4px 16px',
        }}>
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
            placeholder="Message Aura…"
            style={{
              flex: 1, background: 'transparent', border: 'none',
              color: AURA.textPrimary, fontSize: 15, outline: 'none',
              fontFamily: 'inherit', padding: '10px 0',
            }}
          />
          <button
            onClick={submit}
            disabled={!input.trim()}
            style={{
              width: 36, height: 36, borderRadius: 18,
              background: input.trim() ? AURA.primary : 'rgba(212,255,0,0.15)',
              color: AURA.bgDark, border: 'none', cursor: input.trim() ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 0.15s',
            }}
          >
            <Icon name="arrowUp" size={18} color={input.trim() ? AURA.bgDark : AURA.textMuted} stroke={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { ChatScreen });

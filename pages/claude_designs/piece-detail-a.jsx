/* PotterDoc — Variation A v2: "The wheel head"
 * Refinements:
 * - State hub: shorter, no glow on current, soft glow on non-recycled successors
 * - No "Advance" button (successor pills ARE the action). Bottom bar: log entry + photo.
 * - Past states clickable → opens snapshot sheet
 * - Glaze combination field with chips + BROWSE… modal (search/create flow)
 */

const { useState: useStateA, useEffect: useEffectA, useRef: useRefA } = React;

const ACCENT = 'oklch(0.70 0.12 40)';
const ACCENT_SOFT = 'oklch(0.70 0.12 40 / 0.18)';
const TEAL = 'oklch(0.74 0.10 180)';
const TEXT = 'oklch(0.94 0.012 80)';
const TEXT_DIM = 'oklch(0.74 0.010 70)';
const TEXT_MUTE = 'oklch(0.56 0.010 70)';
const BG = 'oklch(0.20 0.010 55)';
const BG_ELEV = 'oklch(0.24 0.011 55)';
const LINE = 'oklch(0.34 0.011 55)';
const LINE_SOFT = 'oklch(0.28 0.010 55)';

const grainBg = (alpha = 0.05) =>
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 0.95  0 0 0 0 0.88  0 0 0 ${alpha} 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;

function Edit({ size = 14, color = TEXT_MUTE }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  );
}

function PieceDetailA() {
  const [saved, setSaved] = useStateA('saved');
  const [notes, setNotes] = useStateA('Trying a tighter foot ring this time. Light wedge.');
  const [location, setLocation] = useStateA('Studio shelf · B3');
  const [owner, setOwner] = useStateA('Self');
  const [glazes, setGlazes] = useStateA([
    { id: 'celadon', name: 'Celadon', color: 'oklch(0.78 0.07 180)' },
    { id: 'ironwash', name: 'Iron wash', color: 'oklch(0.42 0.05 50)' },
  ]);
  const [browseOpen, setBrowseOpen] = useStateA(false);
  const [historyOpenIdx, setHistoryOpenIdx] = useStateA(null);
  const [galleryOpen, setGalleryOpen] = useStateA(false);
  const [fabOpen, setFabOpen] = useStateA(false);

  const triggerSave = () => {
    setSaved('saving');
    setTimeout(() => setSaved('saved'), 700);
  };

  return (
    <div style={{
      height: '100%',
      background: BG,
      color: TEXT,
      fontFamily: "'Manrope', system-ui, sans-serif",
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: grainBg(0.05), opacity: 0.6, zIndex: 1,
      }} />

      {/* Sticky topbar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        background: 'oklch(0.20 0.010 55 / 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${LINE_SOFT}`,
      }}>
        <button style={{
          background: 'none', border: 'none', color: TEXT_DIM, fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 4, padding: 0,
          fontFamily: 'inherit',
        }}>
          <span style={{ fontSize: 18, lineHeight: 1 }}>‹</span> Pieces
        </button>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontSize: 11, color: TEXT_MUTE, fontFamily: 'JetBrains Mono, monospace',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: saved === 'saving' ? ACCENT : 'oklch(0.70 0.10 150)',
            animation: saved === 'saving' ? 'pulseA 0.8s ease-in-out infinite' : 'none',
          }} />
          {saved === 'saving' ? 'saving…' : 'saved · 2s ago'}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', position: 'relative', zIndex: 2 }}>
        {/* Hero photo */}
        <div style={{
          position: 'relative',
          aspectRatio: '4/3',
          background: 'linear-gradient(135deg, oklch(0.55 0.06 50), oklch(0.38 0.04 40))',
          overflow: 'hidden',
        }}>
          <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" style={{ display: 'block', width: '100%', height: '100%' }}>
            <defs>
              <radialGradient id="bowlA" cx="0.4" cy="0.3">
                <stop offset="0%" stopColor="oklch(0.78 0.08 60)" />
                <stop offset="60%" stopColor="oklch(0.55 0.08 50)" />
                <stop offset="100%" stopColor="oklch(0.32 0.05 40)" />
              </radialGradient>
              <linearGradient id="surfA" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.45 0.04 60)" />
                <stop offset="100%" stopColor="oklch(0.28 0.02 60)" />
              </linearGradient>
            </defs>
            <rect width="400" height="300" fill="url(#surfA)" />
            <ellipse cx="200" cy="265" rx="180" ry="20" fill="oklch(0.18 0.01 60)" opacity="0.5"/>
            <g transform="translate(200, 180)">
              <ellipse cx="0" cy="-30" rx="120" ry="22" fill="oklch(0.62 0.05 50)"/>
              <path d="M -120 -30 Q -135 50 -85 75 L 85 75 Q 135 50 120 -30 Z" fill="url(#bowlA)"/>
              <ellipse cx="0" cy="-30" rx="115" ry="18" fill="oklch(0.32 0.04 40)" opacity="0.6"/>
              <path d="M -100 -25 Q -118 30 -80 60" fill="none" stroke="oklch(1 0 0 / 0.18)" strokeWidth="2"/>
            </g>
          </svg>
          <div style={{
            position: 'absolute', inset: 0,
            background: `linear-gradient(180deg, transparent 40%, ${BG} 100%)`,
          }}/>
          <div style={{
            position: 'absolute', bottom: 12, left: 16, right: 16,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{
                  width: i === 0 ? 18 : 6, height: 6, borderRadius: 3,
                  background: i === 0 ? TEXT : 'oklch(1 0 0 / 0.3)',
                  transition: 'all 0.2s',
                }}/>
              ))}
            </div>
            <button
              onClick={() => setGalleryOpen(true)}
              style={{
                padding: '6px 10px', borderRadius: 999,
                background: 'oklch(0 0 0 / 0.5)', backdropFilter: 'blur(8px)',
                border: `1px solid oklch(1 0 0 / 0.15)`, color: TEXT,
                fontSize: 11, display: 'flex', alignItems: 'center', gap: 5,
                fontFamily: 'inherit', cursor: 'pointer',
              }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="3" width="7" height="7" rx="1"/>
                <rect x="14" y="3" width="7" height="7" rx="1"/>
                <rect x="3" y="14" width="7" height="7" rx="1"/>
                <rect x="14" y="14" width="7" height="7" rx="1"/>
              </svg>
              3 photos
            </button>
          </div>
        </div>

        {/* Title block */}
        <div style={{ padding: '18px 20px 8px' }}>
          <div style={{
            fontSize: 11, color: TEXT_MUTE, fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4,
          }}>
            Piece · created Apr 24
          </div>
          <h1 style={{
            margin: 0, fontFamily: 'inherit',
            fontSize: 28, fontWeight: 600, lineHeight: 1.1,
            letterSpacing: '-0.015em', display: 'flex', alignItems: 'baseline', gap: 8,
          }}>
            Jewelry Dish
            <Edit size={14} />
          </h1>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 10,
          }}>
            {['Plate', 'Decorative'].map(t => (
              <span key={t} style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '3px 9px', borderRadius: 999,
                background: 'oklch(0 0 0 / 0.25)',
                border: `1px solid ${LINE_SOFT}`,
                fontSize: 11, color: TEXT_DIM,
              }}>
                <span style={{
                  width: 5, height: 5, borderRadius: '50%',
                  background: t === 'Plate' ? ACCENT : 'oklch(0.72 0.10 340)',
                }}/>
                {t}
              </span>
            ))}
            <button style={{
              padding: '3px 9px', borderRadius: 999,
              background: 'transparent', border: `1px dashed ${LINE}`,
              fontSize: 11, color: TEXT_MUTE, display: 'inline-flex', alignItems: 'center', gap: 4,
              fontFamily: 'inherit',
            }}>+ tag</button>
          </div>
        </div>

        <StateHub />

        {/* Piece details — global, not state-scoped */}
        <Section label="Piece details" scope="piece">
          <FieldRow label="Current location" value={location} onChange={(v) => { setLocation(v); triggerSave(); }} />
          <FieldRow label="Owner" value={owner} onChange={(v) => { setOwner(v); triggerSave(); }} />
          <FieldRow label="Stamp" value="⌒ swallow" onChange={() => triggerSave()} />
        </Section>

        {/* This state · fields */}
        <Section label="This state · glazing" extra="auto-saved" scope="state">
          <GlazeField glazes={glazes} setGlazes={setGlazes} onBrowse={() => setBrowseOpen(true)} />
        </Section>

        {/* Notes */}
        <Section label="Notes" collapsible>
          <textarea
            value={notes}
            onChange={e => { setNotes(e.target.value); triggerSave(); }}
            rows={3}
            style={{
              width: '100%', resize: 'vertical', minHeight: 70,
              boxSizing: 'border-box',
              background: 'oklch(0 0 0 / 0.2)',
              border: `1px solid ${LINE_SOFT}`,
              borderRadius: 8, padding: '10px 12px',
              color: TEXT, fontFamily: 'inherit', fontSize: 14, lineHeight: 1.5,
              outline: 'none',
            }}
            placeholder="What's on your mind…"
          />
        </Section>

        <HistoryStrip onOpen={(idx) => setHistoryOpenIdx(idx)} />

        <div style={{ height: 88 }} />
      </div>

      {/* Floating quick-action FAB */}
      <QuickActionFab open={fabOpen} setOpen={setFabOpen} />

      {/* Modals & sheets */}
      {browseOpen && (
        <GlazeBrowseModal
          selected={glazes}
          onClose={() => setBrowseOpen(false)}
          onApply={(next) => { setGlazes(next); triggerSave(); setBrowseOpen(false); }}
        />
      )}
      {historyOpenIdx !== null && (
        <HistorySheet idx={historyOpenIdx} onClose={() => setHistoryOpenIdx(null)} />
      )}
      {galleryOpen && <GallerySheet onClose={() => setGalleryOpen(false)} />}

      <style>{`
        @keyframes pulseA { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }
        @keyframes drawA {
          0% { stroke-dashoffset: 60; opacity: 0; }
          25% { opacity: 1; }
          75% { opacity: 1; }
          100% { stroke-dashoffset: 0; opacity: 0.55; }
        }
        @keyframes glowA {
          0%, 100% { box-shadow: 0 0 0 oklch(0.70 0.12 40 / 0); }
          50% { box-shadow: 0 0 12px oklch(0.70 0.12 40 / 0.45); }
        }
        @keyframes sheetIn {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fabRise {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

/* ─────── State hub: trimmer, calmer ─────── */
function StateHub() {
  // Two non-recycled successors + recycled. Successor pills ARE the advance action.
  const successors = [
    { id: 's1', label: 'Queued → Glaze', kind: 'forward', sub: 'second firing' },
    { id: 's2', label: 'Recycled',        kind: 'recycle', sub: 'reclaim slip' },
  ];

  return (
    <div style={{
      margin: '6px 0 12px',
      padding: '10px 20px 14px',
      position: 'relative',
    }}>
      <div style={{
        fontSize: 10, color: TEXT_MUTE, fontFamily: 'JetBrains Mono, monospace',
        letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 12,
      }}>
        Tap a successor to advance
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {/* Current state — clean filled chip */}
        <div style={{
          flexShrink: 0,
          padding: '8px 14px',
          borderRadius: 999,
          background: ACCENT,
          color: 'oklch(0.99 0.005 85)',
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 12,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 7,
          letterSpacing: '0.02em',
        }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'oklch(0.99 0.005 85)',
          }}/>
          glazing
        </div>

        {/* Compact branching connector */}
        <svg width="34" height="68" viewBox="0 0 34 68" style={{ flexShrink: 0, overflow: 'visible' }}>
          {/* base dashed branches */}
          <path d="M 0 34 Q 14 34 22 14" stroke={LINE} strokeWidth="1" strokeDasharray="2 3" fill="none"/>
          <path d="M 0 34 Q 14 34 22 54" stroke={LINE} strokeWidth="1" strokeDasharray="2 3" fill="none"/>
          {/* animated forward branch */}
          <path d="M 0 34 Q 14 34 22 14"
                stroke={ACCENT} strokeWidth="1.4" fill="none"
                strokeDasharray="60 60" strokeDashoffset="60"
                style={{ animation: 'drawA 3.2s ease-in-out infinite' }}/>
        </svg>

        {/* Successor pills stacked */}
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 8, flex: 1, minWidth: 0,
        }}>
          {successors.map((s, i) => (
            <SuccessorPill key={s.id} {...s} delay={i * 0.2}/>
          ))}
        </div>
      </div>
    </div>
  );
}

function SuccessorPill({ label, kind, sub, delay = 0 }) {
  const isRecycle = kind === 'recycle';
  return (
    <button style={{
      padding: '7px 12px',
      borderRadius: 999,
      background: 'transparent',
      border: `1.5px dashed ${isRecycle ? LINE : ACCENT}`,
      color: isRecycle ? TEXT_DIM : ACCENT,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 11.5,
      fontWeight: 500,
      display: 'inline-flex', alignItems: 'center', gap: 7,
      whiteSpace: 'nowrap',
      cursor: 'pointer',
      width: 'fit-content',
      maxWidth: '100%',
      animation: !isRecycle ? `glowA 2.4s ease-in-out infinite` : 'none',
      animationDelay: `${delay}s`,
    }}>
      <span style={{
        width: 6, height: 6, borderRadius: '50%',
        background: isRecycle ? 'oklch(0.55 0.01 60)' : ACCENT,
      }}/>
      <span>{label}</span>
    </button>
  );
}

/* ─────── Sections & fields ─────── */
function Section({ label, children, extra, collapsible }) {
  const [open, setOpen] = useStateA(true);
  return (
    <div style={{
      margin: '0 16px 14px',
      padding: '14px 16px',
      background: 'oklch(0.22 0.010 55)',
      border: `1px solid ${LINE_SOFT}`,
      borderRadius: 14,
      backgroundImage: grainBg(0.04),
    }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 10,
        cursor: collapsible ? 'pointer' : 'default',
      }} onClick={collapsible ? () => setOpen(!open) : undefined}>
        <div style={{
          fontSize: 10, color: TEXT_MUTE, fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: '0.12em', textTransform: 'uppercase',
        }}>{label}</div>
        {extra && <div style={{
          fontSize: 10, color: TEXT_MUTE, fontFamily: 'JetBrains Mono, monospace',
        }}>{extra}</div>}
        {collapsible && <span style={{ color: TEXT_MUTE, fontSize: 12 }}>{open ? '−' : '+'}</span>}
      </div>
      {open && children}
    </div>
  );
}

function FieldRow({ label, value, onChange, suffix }) {
  const [editing, setEditing] = useStateA(false);
  return (
    <div
      onClick={() => setEditing(true)}
      style={{
        padding: '10px 0',
        borderBottom: `1px dashed ${LINE_SOFT}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        cursor: 'text', gap: 12,
      }}
    >
      <div style={{ fontSize: 13, color: TEXT_DIM, flexShrink: 0 }}>{label}</div>
      {editing ? (
        <input
          autoFocus
          value={value}
          onChange={e => onChange(e.target.value)}
          onBlur={() => setEditing(false)}
          style={{
            background: 'transparent', border: 'none',
            color: TEXT, fontSize: 14, fontWeight: 500,
            textAlign: 'right', outline: 'none', flex: 1, minWidth: 0,
            fontFamily: 'inherit',
          }}
        />
      ) : (
        <div style={{
          fontSize: 14, color: TEXT, fontWeight: 500,
          fontFamily: 'JetBrains Mono, monospace',
          display: 'flex', alignItems: 'center', gap: 5,
        }}>
          {value}{suffix && <span style={{ color: TEXT_MUTE, fontSize: 12 }}>{suffix}</span>}
          <Edit size={11} />
        </div>
      )}
    </div>
  );
}

/* Glaze combination — multi-select with chips + BROWSE… */
function GlazeField({ glazes, setGlazes, onBrowse }) {
  return (
    <div style={{ padding: '10px 0 4px' }}>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        marginBottom: 8,
      }}>
        <div style={{ fontSize: 13, color: TEXT_DIM }}>Glaze combination</div>
        <button
          onClick={onBrowse}
          style={{
            padding: '4px 10px', borderRadius: 6,
            background: 'transparent',
            border: `1px solid ${LINE}`,
            color: TEXT, fontSize: 11, fontWeight: 500,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.06em', textTransform: 'uppercase',
            display: 'inline-flex', alignItems: 'center', gap: 5,
            cursor: 'pointer',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
          </svg>
          Browse
        </button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {glazes.map((g, i) => (
          <span key={g.id} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '5px 6px 5px 9px', borderRadius: 999,
            background: 'oklch(0 0 0 / 0.25)',
            border: `1px solid ${LINE_SOFT}`,
            fontSize: 12, color: TEXT,
          }}>
            <span style={{
              width: 9, height: 9, borderRadius: '50%',
              background: g.color, border: `1px solid oklch(0 0 0 / 0.4)`,
            }}/>
            {g.name}
            {i === 0 && <span style={{ color: TEXT_MUTE, fontSize: 10 }}>· base</span>}
            <button
              onClick={() => setGlazes(glazes.filter(x => x.id !== g.id))}
              style={{
                marginLeft: 2, width: 16, height: 16, borderRadius: '50%',
                background: 'oklch(0 0 0 / 0.3)', border: 'none', color: TEXT_MUTE,
                display: 'grid', placeItems: 'center', cursor: 'pointer',
                fontSize: 11, padding: 0,
              }}
            >×</button>
          </span>
        ))}
        <button
          onClick={onBrowse}
          style={{
            padding: '5px 10px', borderRadius: 999,
            background: 'transparent', border: `1px dashed ${LINE}`,
            fontSize: 12, color: TEXT_MUTE,
            fontFamily: 'inherit', cursor: 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >+ layer</button>
      </div>
      <div style={{
        fontSize: 11, color: TEXT_MUTE, marginTop: 8, lineHeight: 1.4,
      }}>
        Applied in order, base first. {glazes.length} {glazes.length === 1 ? 'layer' : 'layers'}.
      </div>
    </div>
  );
}

/* Glaze browse modal — search/create flow */
function GlazeBrowseModal({ selected, onClose, onApply }) {
  const [q, setQ] = useStateA('');
  const [picked, setPicked] = useStateA(selected);

  const all = [
    { id: 'celadon',     name: 'Celadon',          color: 'oklch(0.78 0.07 180)', tag: 'translucent' },
    { id: 'ironwash',    name: 'Iron wash',        color: 'oklch(0.42 0.05 50)',  tag: 'underglaze' },
    { id: 'ohata',       name: 'Ohata Kaki',       color: 'oklch(0.55 0.13 40)',  tag: 'iron red' },
    { id: 'tenmoku',     name: 'Tenmoku',          color: 'oklch(0.28 0.04 40)',  tag: 'glossy black' },
    { id: 'shino',       name: 'Carbon-trap shino',color: 'oklch(0.85 0.05 80)',  tag: 'matte' },
    { id: 'rutile',      name: 'Rutile blue',      color: 'oklch(0.62 0.08 230)', tag: 'breaking' },
    { id: 'oribe',       name: 'Oribe green',      color: 'oklch(0.55 0.10 150)', tag: 'copper' },
    { id: 'crawl',       name: 'Magnesia crawl',   color: 'oklch(0.88 0.02 80)',  tag: 'textured' },
  ];
  const recent = all.slice(0, 4);
  const filtered = q
    ? all.filter(g => g.name.toLowerCase().includes(q.toLowerCase()) || g.tag.toLowerCase().includes(q.toLowerCase()))
    : null;

  const isPicked = (id) => picked.some(p => p.id === id);
  const toggle = (g) => {
    if (isPicked(g.id)) setPicked(picked.filter(p => p.id !== g.id));
    else setPicked([...picked, g]);
  };

  const showCreate = q && !filtered.some(f => f.name.toLowerCase() === q.toLowerCase());

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 60,
      background: 'oklch(0 0 0 / 0.55)', backdropFilter: 'blur(3px)',
      animation: 'fadeIn 0.18s ease-out',
      display: 'flex', alignItems: 'flex-end',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxHeight: '88%',
          background: BG_ELEV,
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          border: `1px solid ${LINE_SOFT}`, borderBottom: 'none',
          display: 'flex', flexDirection: 'column',
          animation: 'sheetIn 0.25s cubic-bezier(.2,.8,.2,1)',
          backgroundImage: grainBg(0.04),
        }}
      >
        {/* grabber */}
        <div style={{
          display: 'flex', justifyContent: 'center', padding: '8px 0 4px',
        }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: LINE }}/>
        </div>

        {/* header */}
        <div style={{
          padding: '4px 18px 12px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{
              fontSize: 10, color: TEXT_MUTE,
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>Pick a glaze</div>
            <div style={{
              fontFamily: 'inherit', fontSize: 18, fontWeight: 600,
              marginTop: 2, letterSpacing: '-0.01em',
            }}>Glaze library</div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'oklch(0 0 0 / 0.3)', border: 'none', color: TEXT,
            cursor: 'pointer', fontSize: 16, padding: 0,
          }}>×</button>
        </div>

        {/* search */}
        <div style={{ padding: '0 18px 8px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '10px 14px', borderRadius: 12,
            background: 'oklch(0 0 0 / 0.3)',
            border: `1px solid ${LINE_SOFT}`,
          }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TEXT_MUTE} strokeWidth="2">
              <circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>
            </svg>
            <input
              autoFocus
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search glazes, tags…"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                color: TEXT, fontSize: 14, fontFamily: 'inherit',
              }}
            />
            {q && <button
              onClick={() => setQ('')}
              style={{ background: 'none', border: 'none', color: TEXT_MUTE, cursor: 'pointer' }}
            >×</button>}
          </div>
        </div>

        {/* list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0 0' }}>
          {!filtered && (
            <>
              <ListLabel>Recent</ListLabel>
              {recent.map(g => (
                <GlazeRow key={g.id} g={g} picked={isPicked(g.id)} onToggle={() => toggle(g)} />
              ))}
              <ListLabel>All glazes</ListLabel>
              {all.map(g => (
                <GlazeRow key={g.id} g={g} picked={isPicked(g.id)} onToggle={() => toggle(g)} />
              ))}
            </>
          )}
          {filtered && filtered.length > 0 && (
            <>
              <ListLabel>{filtered.length} {filtered.length === 1 ? 'match' : 'matches'}</ListLabel>
              {filtered.map(g => (
                <GlazeRow key={g.id} g={g} picked={isPicked(g.id)} onToggle={() => toggle(g)} />
              ))}
            </>
          )}
          {showCreate && (
            <button
              style={{
                display: 'flex', alignItems: 'center', gap: 12,
                width: '100%', padding: '14px 18px',
                background: 'transparent', border: 'none', borderTop: `1px solid ${LINE_SOFT}`,
                color: ACCENT, fontFamily: 'inherit', fontSize: 14,
                cursor: 'pointer', textAlign: 'left',
              }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                border: `1.5px dashed ${ACCENT}`,
                display: 'grid', placeItems: 'center',
              }}>+</div>
              <div>
                <div style={{ fontWeight: 500 }}>Create "{q}"</div>
                <div style={{ fontSize: 11, color: TEXT_MUTE, marginTop: 1 }}>
                  Add as a new glaze in your library
                </div>
              </div>
            </button>
          )}
          {filtered && filtered.length === 0 && !showCreate && (
            <div style={{ padding: '40px 18px', textAlign: 'center', color: TEXT_MUTE, fontSize: 13 }}>
              No matches.
            </div>
          )}
        </div>

        {/* footer */}
        <div style={{
          padding: '10px 18px 22px',
          borderTop: `1px solid ${LINE_SOFT}`,
          background: 'oklch(0.20 0.010 55)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ flex: 1, fontSize: 12, color: TEXT_DIM }}>
            {picked.length} selected · applied in order
          </div>
          <button
            onClick={() => onApply(picked)}
            style={{
              padding: '11px 18px', borderRadius: 12,
              background: ACCENT, color: 'oklch(0.99 0.005 85)',
              border: 'none', fontSize: 14, fontWeight: 600,
              fontFamily: 'inherit', cursor: 'pointer',
            }}
          >Apply</button>
        </div>
      </div>
    </div>
  );
}

function ListLabel({ children }) {
  return (
    <div style={{
      padding: '12px 18px 6px',
      fontSize: 10, color: TEXT_MUTE,
      fontFamily: 'JetBrains Mono, monospace',
      letterSpacing: '0.12em', textTransform: 'uppercase',
    }}>{children}</div>
  );
}

function GlazeRow({ g, picked, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: '100%', padding: '10px 18px',
        background: picked ? ACCENT_SOFT : 'transparent',
        border: 'none', display: 'flex', alignItems: 'center', gap: 12,
        cursor: 'pointer', textAlign: 'left',
        fontFamily: 'inherit',
      }}
    >
      <div style={{
        width: 26, height: 26, borderRadius: '50%',
        background: g.color,
        border: `1px solid oklch(0 0 0 / 0.4)`,
        flexShrink: 0,
        boxShadow: 'inset 0 0 6px oklch(0 0 0 / 0.25)',
      }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: TEXT, fontSize: 14, fontWeight: 500 }}>{g.name}</div>
        <div style={{ color: TEXT_MUTE, fontSize: 11, fontFamily: 'JetBrains Mono, monospace' }}>{g.tag}</div>
      </div>
      <div style={{
        width: 20, height: 20, borderRadius: '50%',
        border: `1.5px solid ${picked ? ACCENT : LINE}`,
        background: picked ? ACCENT : 'transparent',
        display: 'grid', placeItems: 'center',
      }}>
        {picked && (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="oklch(0.99 0.005 85)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
      </div>
    </button>
  );
}

/* ─────── History (clickable rows + sheet) ─────── */
const PAST = [
  { state: 'designed',     label: 'Designed',          when: 'Apr 24', sub: 'Sketch + measurements' },
  { state: 'wheel_thrown', label: 'Wheel-thrown',      when: 'Apr 24', sub: '520g · 14cm rim' },
  { state: 'trimmed',      label: 'Trimmed',           when: 'Apr 25', sub: '1.2mm walls · foot ring' },
  { state: 'queued',       label: 'Queued for bisque', when: 'Apr 25', sub: 'Studio kiln A' },
  { state: 'bisque',       label: 'Bisque fired',      when: 'Apr 27', sub: 'Cone 04 · 8h hold' },
];

function HistoryStrip({ onOpen }) {
  const [open, setOpen] = useStateA(true);
  return (
    <div style={{ margin: '0 16px 14px' }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: '100%', padding: '12px 14px',
          background: 'transparent', border: `1px dashed ${LINE_SOFT}`,
          borderRadius: 12, color: TEXT_DIM,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          fontFamily: 'inherit', fontSize: 12, cursor: 'pointer',
        }}
      >
        <span style={{
          fontFamily: 'JetBrains Mono, monospace', letterSpacing: '0.1em',
          textTransform: 'uppercase', fontSize: 10,
        }}>
          History · {PAST.length} past states
        </span>
        <span>{open ? '−' : '+'}</span>
      </button>
      {open && (
        <div style={{
          marginTop: 8,
          padding: '6px 4px 4px', position: 'relative',
        }}>
          <div style={{
            position: 'absolute', left: 18, top: 18, bottom: 18,
            width: 1, background: LINE_SOFT,
          }}/>
          {PAST.map((p, i) => (
            <button
              key={i}
              onClick={() => onOpen(i)}
              style={{
                display: 'block', width: '100%',
                padding: '10px 36px 10px 36px',
                position: 'relative',
                background: 'transparent', border: 'none',
                textAlign: 'left', cursor: 'pointer',
                fontFamily: 'inherit',
                borderRadius: 8,
              }}
            >
              <div style={{
                position: 'absolute', left: 14, top: 14,
                width: 9, height: 9, borderRadius: '50%',
                background: BG, border: `1.5px solid ${TEXT_DIM}`,
              }}/>
              <div style={{ color: TEXT, fontSize: 13, fontWeight: 500 }}>{p.label}</div>
              <div style={{
                color: TEXT_MUTE, fontSize: 11,
                fontFamily: 'JetBrains Mono, monospace', marginTop: 2,
              }}>
                {p.when} · {p.sub}
              </div>
              <span style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                color: TEXT_MUTE, fontSize: 16,
              }}>›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HistorySheet({ idx, onClose }) {
  const p = PAST[idx];
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 60,
      background: 'oklch(0 0 0 / 0.55)', backdropFilter: 'blur(3px)',
      animation: 'fadeIn 0.18s ease-out',
      display: 'flex', alignItems: 'flex-end',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxHeight: '78%',
          background: BG_ELEV,
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          border: `1px solid ${LINE_SOFT}`, borderBottom: 'none',
          animation: 'sheetIn 0.25s cubic-bezier(.2,.8,.2,1)',
          backgroundImage: grainBg(0.04),
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: LINE }}/>
        </div>
        <div style={{ padding: '4px 22px 22px' }}>
          <div style={{
            fontSize: 10, color: TEXT_MUTE,
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.12em', textTransform: 'uppercase',
          }}>{p.when} · past state</div>
          <div style={{
            fontFamily: 'inherit', fontSize: 22, fontWeight: 600,
            marginTop: 4, letterSpacing: '-0.015em',
          }}>{p.label}</div>
          <div style={{ color: TEXT_DIM, fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
            {p.sub}
          </div>

          <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[1, 2].map(n => (
              <div key={n} style={{
                aspectRatio: '1', borderRadius: 10,
                background: `linear-gradient(135deg, oklch(0.40 0.04 ${30 + n*10}), oklch(0.28 0.02 ${30 + n*10}))`,
                border: `1px solid ${LINE_SOFT}`,
              }}/>
            ))}
          </div>

          <div style={{ marginTop: 16, padding: '12px 14px',
            background: 'oklch(0 0 0 / 0.25)', borderRadius: 10,
            border: `1px solid ${LINE_SOFT}`,
          }}>
            <div style={{
              fontSize: 10, color: TEXT_MUTE,
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 6,
            }}>Snapshot</div>
            <div style={{ fontSize: 13, color: TEXT_DIM, lineHeight: 1.5 }}>
              The fields and notes captured when this state was active. Read-only.
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              width: '100%', marginTop: 18, padding: '12px',
              background: 'transparent', border: `1px solid ${LINE}`,
              borderRadius: 12, color: TEXT, fontSize: 14, fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >Close</button>
        </div>
      </div>
    </div>
  );
}

/* Quick-action FAB — primary capture surface */
function QuickActionFab({ open, setOpen }) {
  const actions = [
    { id: 'photo', label: 'Photo', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2"/>
        <circle cx="12" cy="12" r="3.5"/>
        <path d="M8 5l1.5-2h5L16 5"/>
      </svg>
    )},
    { id: 'note', label: 'Note', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
      </svg>
    )},
    { id: 'measure', label: 'Measurement', icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 12h20"/><path d="M5 9v6"/><path d="M9 8v8"/><path d="M13 9v6"/><path d="M17 8v8"/>
      </svg>
    )},
  ];
  return (
    <>
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'absolute', inset: 0, zIndex: 40,
            background: 'oklch(0 0 0 / 0.35)',
            backdropFilter: 'blur(2px)',
            animation: 'fadeIn 0.15s ease-out',
          }}
        />
      )}
      <div style={{
        position: 'absolute', right: 18, bottom: 28, zIndex: 50,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
      }}>
        {open && actions.map((a, i) => (
          <div key={a.id} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            animation: `fabRise 0.22s cubic-bezier(.2,.8,.2,1) both`,
            animationDelay: `${i * 0.04}s`,
          }}>
            <span style={{
              fontSize: 12, color: TEXT,
              padding: '4px 10px', borderRadius: 6,
              background: 'oklch(0 0 0 / 0.6)',
              border: `1px solid ${LINE_SOFT}`,
              backdropFilter: 'blur(8px)',
              fontFamily: 'JetBrains Mono, monospace',
            }}>{a.label}</span>
            <button
              onClick={() => setOpen(false)}
              style={{
                width: 42, height: 42, borderRadius: '50%',
                background: BG_ELEV,
                border: `1px solid ${LINE}`,
                color: TEXT,
                display: 'grid', placeItems: 'center',
                cursor: 'pointer',
                boxShadow: '0 6px 14px oklch(0 0 0 / 0.4)',
              }}
            >{a.icon}</button>
          </div>
        ))}
        <button
          onClick={() => setOpen(!open)}
          style={{
            width: 56, height: 56, borderRadius: '50%',
            background: ACCENT,
            color: 'oklch(0.99 0.005 85)',
            border: 'none',
            display: 'grid', placeItems: 'center',
            cursor: 'pointer',
            boxShadow: '0 10px 24px oklch(0.40 0.10 40 / 0.55), 0 1px 0 oklch(0.30 0.05 40) inset',
            transition: 'transform 0.2s cubic-bezier(.2,.8,.2,1)',
            transform: open ? 'rotate(45deg)' : 'rotate(0)',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <path d="M12 5v14M5 12h14"/>
          </svg>
        </button>
      </div>
    </>
  );
}

/* Photo gallery sheet — opened from "3 photos" pill */
function GallerySheet({ onClose }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 60,
      background: 'oklch(0 0 0 / 0.55)', backdropFilter: 'blur(3px)',
      animation: 'fadeIn 0.18s ease-out',
      display: 'flex', alignItems: 'flex-end',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxHeight: '80%',
          background: BG_ELEV,
          borderTopLeftRadius: 22, borderTopRightRadius: 22,
          border: `1px solid ${LINE_SOFT}`, borderBottom: 'none',
          animation: 'sheetIn 0.25s cubic-bezier(.2,.8,.2,1)',
          backgroundImage: grainBg(0.04),
          display: 'flex', flexDirection: 'column',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'center', padding: '8px 0 4px' }}>
          <div style={{ width: 36, height: 4, borderRadius: 2, background: LINE }}/>
        </div>
        <div style={{
          padding: '4px 22px 12px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{
              fontSize: 10, color: TEXT_MUTE,
              fontFamily: 'JetBrains Mono, monospace',
              letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>3 photos · across 3 states</div>
            <div style={{
              fontFamily: 'inherit', fontSize: 18, fontWeight: 600,
              marginTop: 2, letterSpacing: '-0.01em',
            }}>Photos</div>
          </div>
          <button onClick={onClose} style={{
            width: 32, height: 32, borderRadius: '50%',
            background: 'oklch(0 0 0 / 0.3)', border: 'none', color: TEXT,
            cursor: 'pointer', fontSize: 16, padding: 0,
          }}>×</button>
        </div>
        <div style={{
          padding: '0 18px 22px', overflowY: 'auto',
          display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
        }}>
          {[
            { state: 'glazing', when: 'today' },
            { state: 'bisque', when: 'Apr 27' },
            { state: 'thrown', when: 'Apr 24' },
          ].map((p, n) => (
            <div key={n} style={{
              aspectRatio: '1', borderRadius: 10, overflow: 'hidden',
              background: `linear-gradient(135deg, oklch(0.45 0.05 ${30 + n*20}), oklch(0.28 0.03 ${30 + n*20}))`,
              border: `1px solid ${LINE_SOFT}`,
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute', left: 6, bottom: 6,
                fontSize: 10, color: TEXT,
                fontFamily: 'JetBrains Mono, monospace',
                padding: '2px 6px', borderRadius: 4,
                background: 'oklch(0 0 0 / 0.5)',
                backdropFilter: 'blur(4px)',
              }}>{p.state} · {p.when}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { PieceDetailA });

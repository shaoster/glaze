/* PotterDoc — PieceList v2: mobile, masonry, detail-consistent */

const { useState: useStateL } = React;

const ACCENT = 'oklch(0.70 0.12 40)';
const ACCENT_SOFT = 'oklch(0.70 0.12 40 / 0.18)';
const KILN = 'oklch(0.72 0.13 55)';
const TEAL = 'oklch(0.74 0.10 180)';
const TEXT = 'oklch(0.94 0.012 80)';
const TEXT_DIM = 'oklch(0.74 0.010 70)';
const TEXT_MUTE = 'oklch(0.56 0.010 70)';
const BG = 'oklch(0.20 0.010 55)';
const BG_ELEV = 'oklch(0.24 0.011 55)';
const LINE = 'oklch(0.34 0.011 55)';
const LINE_SOFT = 'oklch(0.28 0.010 55)';

const grainBgL = (alpha = 0.05) =>
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 1  0 0 0 0 0.95  0 0 0 0 0.88  0 0 0 ${alpha} 0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)'/></svg>")`;

const KIND = {
  plan:    { color: 'oklch(0.72 0.07 280)' },
  form:    { color: 'oklch(0.72 0.08 60)'  },
  refine:  { color: 'oklch(0.72 0.06 90)'  },
  queue:   { color: 'oklch(0.72 0.10 55)'  },
  bisque:  { color: KILN                    },
  deco:    { color: TEAL                    },
  glaze:   { color: 'oklch(0.72 0.10 230)' },
  done:    { color: 'oklch(0.66 0.09 35)'  },
  recycle: { color: 'oklch(0.55 0.01 60)'  },
};

const PIECES = [
  { id: 'p1',  name: 'Angular coffee mug',  state: 'glazing',     kind: 'glaze',   tags: ['cup','angular','handle','fluted'], days: 3,  photos: 4, hue: 30 },
  { id: 'p2',  name: 'Ramen bowl',          state: 'queued',      kind: 'queue',   tags: ['bowl','curve'],                    days: 1,  photos: 2, hue: 50 },
  { id: 'p3',  name: 'Lemon juicer 2',      state: 'trimming',    kind: 'refine',  tags: ['utility','spout','citrus'],         days: 14, photos: 3, hue: 80 },
  { id: 'p4',  name: 'Lemon juicer 1',      state: 'recycled',    kind: 'recycle', tags: ['utility','citrus'],                 days: 5,  photos: 1, hue: 70 },
  { id: 'p5',  name: 'Round coffee mug',    state: 'queued',      kind: 'queue',   tags: ['cup','curve','handle'],            days: 4,  photos: 5, hue: 40 },
  { id: 'p6',  name: 'Round coffee cup',    state: 'queued',      kind: 'queue',   tags: ['cup','curve'],                     days: 2,  photos: 3, hue: 35 },
  { id: 'p7',  name: 'Tea bowl',            state: 'bisque fired',kind: 'bisque',  tags: ['bowl','wabi'],                      days: 6,  photos: 2, hue: 25 },
  { id: 'p8',  name: 'Ramen bowl 2',        state: 'glaze fired', kind: 'done',    tags: ['bowl','curve','sold'],              days: 0,  photos: 6, hue: 150 },
  { id: 'p9',  name: 'Tall vase',           state: 'designing',   kind: 'plan',    tags: ['vase','tall'],                      days: 21, photos: 1, hue: 200 },
  { id: 'p10', name: 'Jewelry dish',        state: 'glazing',     kind: 'glaze',   tags: ['plate','decorative'],               days: 1,  photos: 3, hue: 350 },
  { id: 'p11', name: 'Espresso cup',        state: 'thrown',      kind: 'form',    tags: ['cup','small'],                      days: 0,  photos: 2, hue: 15 },
  { id: 'p12', name: 'Garlic keeper',       state: 'queued',      kind: 'queue',   tags: ['utility','lidded','kitchen'],       days: 9,  photos: 2, hue: 95 },
];

function PieceListV2() {
  const [tab, setTab] = useStateL('pieces');
  const [filtersOpen, setFiltersOpen] = useStateL(false);
  const [statusFilter, setStatusFilter] = useStateL('All');

  return (
    <div style={{
      height: '100%', background: BG, color: TEXT,
      fontFamily: "'Manrope', system-ui, sans-serif",
      display: 'flex', flexDirection: 'column',
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'none',
        backgroundImage: grainBgL(0.05), opacity: 0.5, zIndex: 1,
      }}/>

      {/* Topbar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        padding: '54px 16px 10px',
        background: 'oklch(0.20 0.010 55 / 0.85)',
        backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${LINE_SOFT}`,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 10,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 22, height: 22, borderRadius: 6,
              background: ACCENT_SOFT, border: `1px solid ${ACCENT}`,
              display: 'grid', placeItems: 'center',
            }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={ACCENT} strokeWidth="2">
                <ellipse cx="12" cy="6" rx="8" ry="2"/>
                <path d="M4 6v12a8 2 0 0 0 16 0V6"/>
              </svg>
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>PotterDoc</div>
          </div>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'oklch(0.55 0.06 50)', display: 'grid', placeItems: 'center',
            fontSize: 12, fontWeight: 600, color: TEXT,
          }}>S</div>
        </div>

        {/* Condensed filter strip */}
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          style={{
            width: '100%', padding: '8px 12px', borderRadius: 10,
            background: 'oklch(0 0 0 / 0.25)', border: `1px solid ${LINE_SOFT}`,
            color: TEXT_DIM, fontFamily: 'inherit', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
            boxSizing: 'border-box',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M3 6h18M6 12h12M10 18h4"/>
            </svg>
            <span style={{ color: TEXT, fontWeight: 500 }}>{statusFilter}</span>
            <span style={{
              fontFamily: 'JetBrains Mono, monospace', fontSize: 11, color: TEXT_MUTE,
            }}>· {PIECES.length} pieces</span>
          </span>
          <span style={{
            fontSize: 11, color: TEXT_MUTE, fontFamily: 'JetBrains Mono, monospace',
          }}>recent ↓</span>
        </button>
        {filtersOpen && (
          <div style={{
            marginTop: 8, padding: '10px 12px', borderRadius: 10,
            background: 'oklch(0 0 0 / 0.25)', border: `1px solid ${LINE_SOFT}`,
            display: 'flex', flexWrap: 'wrap', gap: 6,
          }}>
            {['All','Active','Bisque','Glazing','Done','Recycled'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)} style={{
                padding: '4px 10px', borderRadius: 999,
                fontSize: 11, fontFamily: 'JetBrains Mono, monospace',
                background: s === statusFilter ? ACCENT : 'transparent',
                color: s === statusFilter ? 'oklch(0.99 0.005 85)' : TEXT_DIM,
                border: `1px solid ${s === statusFilter ? ACCENT : LINE}`,
                cursor: 'pointer',
              }}>{s}</button>
            ))}
          </div>
        )}
      </div>

      {/* Masonry body */}
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative', zIndex: 2 }}>
        <div style={{
          padding: '10px 10px 100px',
          columnCount: 2,
          columnGap: 8,
        }}>
          {PIECES.map(p => <PieceCard key={p.id} p={p} />)}
        </div>
      </div>

      {/* Bottom tabs */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
        paddingTop: 6, paddingBottom: 18,
        background: 'oklch(0.18 0.010 55 / 0.92)',
        backdropFilter: 'blur(12px)',
        borderTop: `1px solid ${LINE_SOFT}`,
        display: 'flex', justifyContent: 'space-around', alignItems: 'center',
      }}>
        {[
          { id: 'pieces',  label: 'Pieces',  icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <ellipse cx="12" cy="6" rx="8" ry="2"/><path d="M4 6v12a8 2 0 0 0 16 0V6"/>
            </svg>
          )},
          { id: 'analyze', label: 'Analyze', icon: (
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M3 20V10M9 20V4M15 20v-7M21 20v-12"/>
            </svg>
          )},
        ].map(t => {
          const active = tab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              flex: 1, padding: '8px 0', background: 'none', border: 'none',
              color: active ? ACCENT : TEXT_MUTE,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              fontFamily: 'inherit', cursor: 'pointer',
            }}>
              {t.icon}
              <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.02em' }}>{t.label}</span>
            </button>
          );
        })}
      </div>

      {/* Floating add — strong shadow */}
      <button style={{
        position: 'absolute', right: 14, bottom: 78, zIndex: 30,
        width: 52, height: 52, borderRadius: '50%',
        background: ACCENT,
        color: 'oklch(0.99 0.005 85)',
        border: 'none',
        display: 'grid', placeItems: 'center', cursor: 'pointer',
        boxShadow: `
          0 1px 0 oklch(0.88 0.08 40 / 0.45) inset,
          0 -2px 6px oklch(0.30 0.10 40) inset,
          0 8px 14px oklch(0 0 0 / 0.55),
          0 22px 40px oklch(0.40 0.12 40 / 0.55),
          0 0 0 1px oklch(0.55 0.10 40 / 0.7)
        `,
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <path d="M12 5v14M5 12h14"/>
        </svg>
      </button>
    </div>
  );
}

function PieceCard({ p }) {
  const kind = KIND[p.kind];
  const isTerminal = p.kind === 'done' || p.kind === 'recycle';
  const isStale = p.days >= 14 && !isTerminal;

  // 3 thumbnail heights based on activity recency / stage importance
  // recent (≤2d) = tall (180px); active (3-13d) = medium (140px); stale/terminal = short (110px)
  const thumbH = p.days <= 2 ? 180 : p.days < 14 && !isTerminal ? 140 : 110;

  // Tag truncation: 2 visible + overflow chip
  const visibleTags = p.tags.slice(0, 2);
  const extra = p.tags.length - visibleTags.length;

  const lastActivity = p.days === 0 ? 'today' : `${p.days}d ago`;

  return (
    <div style={{
      breakInside: 'avoid',
      marginBottom: 8,
      borderRadius: 12, overflow: 'hidden',
      background: 'oklch(0.22 0.010 55)',
      border: `1px solid ${LINE_SOFT}`,
      backgroundImage: grainBgL(0.04),
      position: 'relative',
      opacity: isTerminal ? 0.78 : 1,
    }}>
      {/* Thumbnail with overlays */}
      <div style={{
        height: thumbH,
        position: 'relative',
        background: `linear-gradient(135deg,
          oklch(0.55 0.05 ${p.hue}) 0%,
          oklch(0.32 0.04 ${p.hue}) 100%)`,
      }}>
        {/* Simulated piece silhouette */}
        <svg width="100%" height="100%" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" style={{ display: 'block' }}>
          <defs>
            <radialGradient id={`g-${p.id}`} cx="0.4" cy="0.3">
              <stop offset="0%" stopColor={`oklch(0.78 0.06 ${p.hue})`}/>
              <stop offset="100%" stopColor={`oklch(0.30 0.04 ${p.hue})`}/>
            </radialGradient>
          </defs>
          <ellipse cx="50" cy="84" rx="32" ry="3" fill="oklch(0.16 0.01 60)" opacity="0.5"/>
          <g transform="translate(50, 60)">
            <ellipse cx="0" cy="-12" rx="22" ry="4" fill={`oklch(0.55 0.06 ${p.hue})`}/>
            <path d={`M -22 -12 Q -25 14 -16 22 L 16 22 Q 25 14 22 -12 Z`} fill={`url(#g-${p.id})`}/>
            <ellipse cx="0" cy="-12" rx="20" ry="3" fill={`oklch(0.28 0.03 ${p.hue})`} opacity="0.6"/>
          </g>
        </svg>

        {/* Bottom gradient + state chip overlay */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, transparent 30%, oklch(0 0 0 / 0.55) 100%)',
        }}/>

        {/* Top-left: photo count */}
        {p.photos > 1 && (
          <div style={{
            position: 'absolute', top: 6, left: 6,
            padding: '2px 7px', borderRadius: 999,
            background: 'oklch(0 0 0 / 0.55)',
            backdropFilter: 'blur(6px)',
            fontSize: 10, color: TEXT,
            fontFamily: 'JetBrains Mono, monospace',
            display: 'flex', alignItems: 'center', gap: 4,
          }}>
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="6" width="18" height="14" rx="2"/>
              <circle cx="12" cy="13" r="3"/>
            </svg>
            {p.photos}
          </div>
        )}

        {/* Top-right: stale dot */}
        {isStale && (
          <div title="stale" style={{
            position: 'absolute', top: 6, right: 6,
            width: 8, height: 8, borderRadius: '50%',
            background: KILN,
            boxShadow: `0 0 6px ${KILN}`,
          }}/>
        )}

        {/* Bottom-left: filled state chip (matches Detail page grammar) */}
        <div style={{
          position: 'absolute', bottom: 6, left: 6,
          padding: '4px 9px', borderRadius: 999,
          background: isTerminal ? 'oklch(0 0 0 / 0.55)' : ACCENT,
          color: isTerminal ? TEXT_DIM : 'oklch(0.99 0.005 85)',
          fontSize: 10.5, fontWeight: 600,
          fontFamily: 'JetBrains Mono, monospace',
          letterSpacing: '0.02em',
          display: 'inline-flex', alignItems: 'center', gap: 5,
          backdropFilter: isTerminal ? 'blur(6px)' : 'none',
          border: isTerminal ? `1px solid ${LINE_SOFT}` : 'none',
        }}>
          <span style={{
            width: 5, height: 5, borderRadius: '50%',
            background: isTerminal ? kind.color : 'oklch(0.99 0.005 85)',
          }}/>
          {p.state}
        </div>
      </div>

      {/* Card body */}
      <div style={{ padding: '10px 10px 10px' }}>
        <div style={{
          fontSize: 14, fontWeight: 600, lineHeight: 1.25,
          letterSpacing: '-0.005em', color: TEXT,
          textWrap: 'pretty',
        }}>{p.name}</div>

        <div style={{
          marginTop: 4, fontSize: 11, color: TEXT_MUTE,
          fontFamily: 'JetBrains Mono, monospace',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          <span>{lastActivity}</span>
          {!isTerminal && (
            <>
              <span>·</span>
              <span style={{ color: isStale ? KILN : TEXT_MUTE }}>
                {p.days}d in {p.state}
              </span>
            </>
          )}
        </div>

        {/* Tags — soft dot+label, truncated */}
        <div style={{
          marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4,
        }}>
          {visibleTags.map(t => (
            <span key={t} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '2px 7px', borderRadius: 999,
              background: 'oklch(0 0 0 / 0.25)',
              border: `1px solid ${LINE_SOFT}`,
              fontSize: 10, color: TEXT_DIM,
            }}>
              <span style={{
                width: 4, height: 4, borderRadius: '50%',
                background: tagColor(t),
              }}/>
              {t}
            </span>
          ))}
          {extra > 0 && (
            <span style={{
              padding: '2px 7px', borderRadius: 999,
              background: 'transparent', border: `1px dashed ${LINE_SOFT}`,
              fontSize: 10, color: TEXT_MUTE,
              fontFamily: 'JetBrains Mono, monospace',
            }}>+{extra}</span>
          )}
        </div>
      </div>
    </div>
  );
}

function tagColor(t) {
  const map = {
    cup: 'oklch(0.72 0.10 30)', bowl: 'oklch(0.72 0.10 60)',
    plate: 'oklch(0.72 0.10 340)', vase: 'oklch(0.72 0.10 230)',
    utility: 'oklch(0.65 0.05 90)', sold: ACCENT, decorative: 'oklch(0.72 0.10 340)',
  };
  return map[t] || 'oklch(0.55 0.02 60)';
}

Object.assign(window, { PieceListV2 });

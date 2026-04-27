/* Glaze Workspace — small shared components */

const { useState, useEffect, useRef, useMemo } = React;

// ============ Icons (inline SVG) ============
function Icon({ name, size = 16 }) {
  const props = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const paths = {
    plus: <><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></>,
    search: <><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></>,
    filter: <><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></>,
    chevron: <><polyline points="6 9 12 15 18 9"/></>,
    ledger: <><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></>,
    grid: <><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></>,
    shelf: <><rect x="3" y="4" width="18" height="5" rx="1"/><rect x="3" y="11" width="18" height="5" rx="1"/><rect x="3" y="18" width="18" height="3" rx="1"/></>,
    sparkline: <><polyline points="3 17 7 12 11 14 15 8 21 11"/></>,
    tweaks: <><circle cx="6" cy="12" r="2"/><circle cx="18" cy="6" r="2"/><circle cx="18" cy="18" r="2"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="16" y2="6"/><line x1="3" y1="18" x2="16" y2="18"/></>,
    x: <><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></>,
    kiln: <><rect x="5" y="4" width="14" height="16" rx="1"/><circle cx="12" cy="13" r="3"/><line x1="5" y1="9" x2="19" y2="9"/></>,
    check: <><polyline points="5 12 10 17 20 7"/></>,
  };
  return <svg {...props}>{paths[name]}</svg>;
}

// ============ Placeholder thumbnail ============
// Deterministic striped clay placeholder with optional "photo" illusion
function PlaceholderThumb({ piece, label, aspect = 1 }) {
  const [c1, c2] = piece.palette || ['oklch(0.55 0.05 30)', 'oklch(0.45 0.04 30)'];
  const seed = (piece.id || 'x').charCodeAt(piece.id.length - 1) || 1;
  const angle = (seed * 37) % 360;
  const bowlY = 60 + (seed % 6);
  return (
    <svg viewBox={`0 0 100 ${aspect === 1 ? 100 : 75}`} xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id={`bg-${piece.id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="oklch(0.82 0.02 80)" />
          <stop offset="100%" stopColor="oklch(0.68 0.02 80)" />
        </linearGradient>
        <radialGradient id={`clay-${piece.id}`} cx="0.4" cy="0.3">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </radialGradient>
      </defs>
      <rect width="100" height="100" fill={`url(#bg-${piece.id})`} />
      {/* soft light beam */}
      <polygon points="0,0 60,0 30,100 0,100" fill="oklch(1 0 0 / 0.08)" />
      {/* pottery silhouette */}
      <g transform={`translate(50, ${aspect === 1 ? 58 : 44})`}>
        <ellipse cx="0" cy={bowlY - 58} rx="22" ry="4" fill={c2} opacity="0.9"/>
        <path
          d={`M -22 ${bowlY - 58} Q -28 ${bowlY - 38} -18 ${bowlY - 20} Q -22 ${bowlY - 10} -14 ${bowlY - 4} L 14 ${bowlY - 4} Q 22 ${bowlY - 10} 18 ${bowlY - 20} Q 28 ${bowlY - 38} 22 ${bowlY - 58} Z`}
          fill={`url(#clay-${piece.id})`}
        />
        {/* highlight */}
        <path
          d={`M -16 ${bowlY - 54} Q -22 ${bowlY - 36} -14 ${bowlY - 20}`}
          fill="none" stroke="oklch(1 0 0 / 0.22)" strokeWidth="1.2"
        />
      </g>
    </svg>
  );
}

// ============ State chip ============
function StateChip({ stateId, compact = false }) {
  const st = STATES[stateId];
  if (!st) return null;
  const kind = (st.kind === 'kiln' || st.kind === 'queue') ? 'kiln'
             : (stateId === 'completed') ? 'terminal-ok'
             : (stateId === 'recycled') ? 'terminal-bad'
             : 'default';
  return (
    <span className="state-chip" data-kind={kind}>
      <span className="dot" />
      {shortState(stateId)}
    </span>
  );
}

// ============ State viz: dots / bar / chip ============
function StateTimeline({ stateId, variant = 'dots' }) {
  const currentIdx = mainIndex(stateId);
  const isTerminal = stateId === 'completed' || stateId === 'recycled';
  const isKilnCurrent = STATES[stateId]?.kind === 'kiln' || STATES[stateId]?.kind === 'queue';

  if (variant === 'chip') {
    return <StateChip stateId={stateId} />;
  }

  if (variant === 'bar') {
    const total = MAIN_TRACK.length - 1; // 9 segments
    return (
      <div className="state-bar-wrap">
        <div className="state-bar" title={shortState(stateId)}>
          {MAIN_TRACK.slice(0, -1).map((_, i) => {
            const done = i < currentIdx;
            const cur = i === currentIdx;
            const kiln = cur && isKilnCurrent;
            const termBad = stateId === 'recycled';
            return (
              <div key={i}
                className={`seg ${done ? 'done' : ''} ${cur ? 'current' : ''} ${kiln ? 'kiln' : ''}`}
                style={termBad ? { background: 'oklch(0.55 0.01 60)' } : undefined}
              />
            );
          })}
        </div>
        <div><StateChip stateId={stateId} /></div>
      </div>
    );
  }

  // variant === 'dots'
  return (
    <div className="timeline" title={shortState(stateId)}>
      {MAIN_TRACK.map((st, i) => {
        const done = i < currentIdx;
        const cur = i === currentIdx;
        const kiln = cur && isKilnCurrent;
        const node = (
          <div key={`n-${i}`}
            className={`node ${done ? 'done' : ''} ${cur ? 'current' : ''} ${kiln ? 'kiln' : ''}`}
            title={st.replace(/_/g, ' ')}
          />
        );
        if (i === MAIN_TRACK.length - 1) return node;
        return (
          <React.Fragment key={i}>
            {node}
            <div className={`seg-line ${done ? 'done' : ''}`} />
          </React.Fragment>
        );
      })}
      {isTerminal && stateId === 'recycled' && (
        <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-mute)', fontFamily: 'var(--font-mono)' }}>recycled</span>
      )}
    </div>
  );
}

// ============ State ring (for gallery cards) ============
function StateRing({ stateId, size = 76 }) {
  const total = MAIN_TRACK.length - 1;
  const currentIdx = Math.max(0, mainIndex(stateId));
  const progress = stateId === 'completed' ? 1 : stateId === 'recycled' ? 0 : currentIdx / total;
  const r = (size - 4) / 2;
  const c = 2 * Math.PI * r;
  const isKiln = STATES[stateId]?.kind === 'kiln' || STATES[stateId]?.kind === 'queue';
  const stroke = stateId === 'completed' ? 'var(--accent)'
    : stateId === 'recycled' ? 'var(--recycle)'
    : isKiln ? 'var(--kiln)' : 'var(--accent)';
  return (
    <svg width={size} height={size} style={{ position: 'absolute', inset: 0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="var(--line)" strokeWidth="2" />
      <circle
        cx={size/2} cy={size/2} r={r}
        fill="none" stroke={stroke} strokeWidth="2"
        strokeDasharray={`${c * progress} ${c}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: 'stroke-dasharray 0.3s ease' }}
      />
    </svg>
  );
}

// ============ Date cell ============
function DateCell({ date }) {
  const d = new Date(date);
  const now = new Date('2026-04-20');
  const diff = Math.round((now - d) / (1000 * 60 * 60 * 24));
  const rel = diff === 0 ? 'today' : diff === 1 ? 'yesterday' : diff < 7 ? `${diff}d ago` : diff < 30 ? `${Math.floor(diff/7)}w ago` : `${Math.floor(diff/30)}mo ago`;
  const abs = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return (
    <div className="date-cell">
      <span className="abs">{abs}</span>
      <span className="rel">{rel}</span>
    </div>
  );
}

Object.assign(window, { Icon, PlaceholderThumb, StateChip, StateTimeline, StateRing, DateCell });

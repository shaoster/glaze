/* PotterDoc — Exploration panel: nonlinear state viz + tags + chip treatments */

const { useState: useStateE, useMemo: useMemoE } = React;

// ------------------- Helpers -------------------

// Groups of states by "track phase" for the split/branches viz
const PHASES = [
  { id: 'plan',   label: 'plan',   states: ['designed'] },
  { id: 'form',   label: 'form',   states: ['wheel_thrown', 'handbuilt'] },
  { id: 'refine', label: 'refine', states: ['trimmed', 'slip_applied', 'carved'] },
  { id: 'bisque', label: 'bisque', states: ['submitted_to_bisque_fire', 'bisque_fired'] },
  { id: 'glaze',  label: 'glaze',  states: ['waxed', 'glazed', 'submitted_to_glaze_fire', 'glaze_fired'] },
  { id: 'finish', label: 'finish', states: ['sanded', 'completed'] },
];

function phaseOf(stateId) {
  const i = PHASES.findIndex(p => p.states.includes(stateId));
  return i === -1 ? 99 : i;
}

function kindColor(stateId) {
  // Semantic color by state.kind (the "dot color" story)
  const k = STATES[stateId]?.kind;
  const map = {
    plan:    'oklch(0.70 0.07 280)',  // lavender — cerebral
    form:    'oklch(0.68 0.09 60)',   // clay brown — hands
    deco:    'oklch(0.72 0.10 180)',  // teal — detail
    queue:   'oklch(0.72 0.13 55)',   // warm orange — waiting for heat
    kiln:    'oklch(0.66 0.17 35)',   // hot red — fire
    finish:  'oklch(0.72 0.04 230)',  // slate — polishing
    done:    'oklch(0.70 0.12 40)',   // terracotta accent
    recycle: 'oklch(0.58 0.01 60)',   // gray
  };
  return map[k] || 'var(--text-mute)';
}

// ------------------- 1. Nonlinear viz options -------------------

// A) Phase dots — condenses the DAG into 6 phases
function PhaseDots({ piece }) {
  const curPhase = phaseOf(piece.state);
  const visited = new Set((piece.visited || []).map(phaseOf));
  const isRecycled = piece.state === 'recycled';
  return (
    <div className="phasedots">
      {PHASES.map((p, i) => {
        const done = visited.has(i) && i < curPhase;
        const cur = i === curPhase && !isRecycled;
        return (
          <div key={p.id} className="phasedot-col">
            <div
              className={`phasedot ${done ? 'done' : ''} ${cur ? 'current' : ''}`}
              style={cur ? { background: kindColor(piece.state), boxShadow: `0 0 0 3px ${kindColor(piece.state)}26` } : undefined}
              title={p.label}
            />
            <div className="phasedot-label">{p.label}</div>
          </div>
        );
      })}
      {isRecycled && <div className="phasedot-recycled">recycled</div>}
    </div>
  );
}

// B) Branches — small graph showing current state + successors (decision lens)
function BranchesViz({ piece }) {
  const st = STATES[piece.state];
  const successors = (st?.successors || []).filter(s => s !== 'recycled');
  const color = kindColor(piece.state);
  return (
    <div className="branches">
      <div className="branch-current" style={{ borderColor: color, color: color }}>
        <span className="dot" style={{ background: color }} />
        {shortState(piece.state)}
      </div>
      {successors.length > 0 && (
        <>
          <svg className="branch-connector" width="24" height="40" viewBox="0 0 24 40">
            {successors.map((_, i) => {
              const y = successors.length === 1 ? 20 : 10 + (i * (20 / Math.max(1, successors.length - 1)));
              return <path key={i} d={`M 0 20 Q 12 20 24 ${y}`} stroke="var(--line)" fill="none" strokeWidth="1" />;
            })}
          </svg>
          <div className="branch-next">
            {successors.map(s => (
              <div key={s} className="branch-pill" style={{ color: kindColor(s) }}>
                <span className="dot" style={{ background: kindColor(s) }} />
                {shortState(s)}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// C) Path trace — shows the actual history on a horizontal track with branch markers
function PathTraceViz({ piece }) {
  const path = piece.visited || [piece.state];
  return (
    <div className="pathtrace">
      {path.map((s, i) => {
        const st = STATES[s];
        const hasAltBranch = (st?.successors || []).filter(x => x !== 'recycled').length > 1;
        const isLast = i === path.length - 1;
        return (
          <React.Fragment key={`${s}-${i}`}>
            <div className="pathtrace-node" style={{ color: kindColor(s) }} title={prettyState(s)}>
              <span className="dot" style={{ background: kindColor(s) }} />
              {isLast && <span className="pathtrace-label">{shortState(s)}</span>}
            </div>
            {!isLast && (
              <div className={`pathtrace-edge ${hasAltBranch ? 'forked' : ''}`}>
                {hasAltBranch && (
                  <svg width="10" height="10" viewBox="0 0 10 10" className="fork-mark">
                    <path d="M 0 5 L 10 5 M 5 0 L 5 10" stroke="currentColor" strokeWidth="1" />
                  </svg>
                )}
              </div>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// D) Radial — states arranged around a circle, current lit
function RadialViz({ piece, size = 120 }) {
  const displayStates = [
    'designed', 'wheel_thrown', 'handbuilt',
    'trimmed', 'slip_applied', 'carved',
    'submitted_to_bisque_fire', 'bisque_fired',
    'waxed', 'glazed',
    'submitted_to_glaze_fire', 'glaze_fired',
    'sanded', 'completed',
  ];
  const visited = new Set(piece.visited || []);
  const N = displayStates.length;
  const r = size / 2 - 8;
  const cx = size / 2, cy = size / 2;
  const curIdx = displayStates.indexOf(piece.state);
  return (
    <svg width={size} height={size} className="radial">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--line-soft)" strokeWidth="1" />
      {displayStates.map((s, i) => {
        const a = (i / N) * 2 * Math.PI - Math.PI / 2;
        const x = cx + r * Math.cos(a);
        const y = cy + r * Math.sin(a);
        const v = visited.has(s);
        const cur = i === curIdx;
        const color = kindColor(s);
        return (
          <g key={s}>
            {cur && <circle cx={x} cy={y} r="6" fill={color} opacity="0.2" />}
            <circle
              cx={x} cy={y}
              r={cur ? 3.5 : 2.5}
              fill={cur ? color : v ? 'var(--text-dim)' : 'var(--line)'}
            />
            {v && i > 0 && (() => {
              const prevIdx = (piece.visited || []).indexOf(s) - 1;
              if (prevIdx < 0) return null;
              const prev = (piece.visited || [])[prevIdx];
              const pi = displayStates.indexOf(prev);
              if (pi < 0) return null;
              const a2 = (pi / N) * 2 * Math.PI - Math.PI / 2;
              const x2 = cx + r * Math.cos(a2);
              const y2 = cy + r * Math.sin(a2);
              return <path d={`M ${x2} ${y2} Q ${cx} ${cy} ${x} ${y}`} stroke={color} strokeWidth="1" fill="none" opacity="0.5" />;
            })()}
          </g>
        );
      })}
      <text x={cx} y={cy - 3} textAnchor="middle" fontSize="9" fill="var(--text-dim)" fontFamily="var(--font-mono)">
        {shortState(piece.state).split(' ')[0]}
      </text>
      <text x={cx} y={cy + 9} textAnchor="middle" fontSize="9" fill="var(--text-mute)" fontFamily="var(--font-mono)">
        {Math.round((piece.visited?.length || 1) / N * 100)}%
      </text>
    </svg>
  );
}

// ------------------- 2. Tags -------------------

function Tag({ label, variant = 'soft', dotColor }) {
  return (
    <span className={`tag tag-${variant}`} style={dotColor ? { '--tag-dot': dotColor } : undefined}>
      {dotColor && <span className="tag-dot" />}
      {label}
    </span>
  );
}

function TagRow({ tags, clayBody, glaze, cone }) {
  return (
    <div className="tag-row">
      {clayBody && <Tag label={clayBody} variant="data" />}
      {glaze && <Tag label={glaze} variant="data" />}
      {cone && <Tag label={`cone ${cone}`} variant="data" />}
      {(tags || []).map(t => (
        <Tag key={t} label={t} variant="soft" dotColor={tagColor(t)} />
      ))}
    </div>
  );
}

function tagColor(tag) {
  const map = {
    commission: 'oklch(0.70 0.12 40)',
    gift: 'oklch(0.72 0.10 340)',
    sold: 'oklch(0.70 0.12 150)',
    experimental: 'oklch(0.74 0.11 280)',
    'food-safe': 'oklch(0.70 0.10 150)',
    failed: 'oklch(0.58 0.01 60)',
    set: 'oklch(0.72 0.04 230)',
    commission_draft: 'oklch(0.70 0.12 40)',
    'needs-photo': 'oklch(0.75 0.13 85)',
    large: 'oklch(0.72 0.04 230)',
    reduction: 'oklch(0.66 0.17 35)',
  };
  return map[tag] || 'var(--text-mute)';
}

// ------------------- 3. Chip treatments -------------------

function ChipTreatment({ kind, label, dot, sub }) {
  const styles = {
    // A: Solid background = current/active state
    solid: { background: dot, color: 'oklch(0.98 0.01 80)', border: `1px solid transparent` },
    // B: Outline = historical state
    outline: { background: 'transparent', color: dot, border: `1px solid ${dot}44` },
    // C: Soft fill = default informational
    soft: { background: `${dot}1f`, color: dot, border: `1px solid ${dot}30` },
    // D: Hatched = recycled/invalid
    hatched: {
      backgroundImage: `repeating-linear-gradient(-45deg, ${dot}22 0 4px, transparent 4px 8px)`,
      color: 'var(--recycle)',
      border: `1px solid var(--line)`,
      textDecoration: 'line-through',
    },
    // E: Kiln glow — animated pulse
    glow: {
      background: `${dot}22`,
      color: dot,
      border: `1px solid ${dot}66`,
      boxShadow: `0 0 12px ${dot}44`,
    },
    // F: Dot-only minimalist
    minimal: {
      background: 'transparent', color: 'var(--text-dim)',
      border: '1px solid var(--line-soft)',
    },
    // G: Urgent accent — call to action
    urgent: {
      background: 'var(--bg)', color: dot,
      border: `2px solid ${dot}`,
      fontWeight: 600,
    },
  };
  return (
    <div className="treatment">
      <span className="treatment-chip" style={styles[kind]}>
        <span className="treatment-dot" style={{ background: kind === 'outline' ? 'transparent' : dot, border: kind === 'outline' ? `2px solid ${dot}` : 'none' }} />
        {label}
      </span>
      <div className="treatment-caption">
        <div className="treatment-name">{kind}</div>
        <div className="treatment-sub">{sub}</div>
      </div>
    </div>
  );
}

// ------------------- Exploration Panel -------------------

function ExplorationPanel({ pieces }) {
  const [open, setOpen] = useStateE(true);
  const [vizPicks, setVizPicks] = useStateE({
    phases: pieces.find(p => p.state === 'bisque_fired') || pieces[0],
    branches: pieces.find(p => p.state === 'bisque_fired') || pieces[0],
    trace: pieces.find(p => p.state === 'sanded') || pieces[0],
    radial: pieces.find(p => p.state === 'submitted_to_glaze_fire') || pieces[0],
  });

  if (!open) {
    return (
      <div className="exploration collapsed">
        <button className="exploration-reopen" onClick={() => setOpen(true)}>
          <Icon name="sparkline" size={12} />
          Open exploration panel
        </button>
      </div>
    );
  }

  const samplePiece = pieces.find(p => p.state === 'bisque_fired') || pieces[4];

  return (
    <div className="exploration">
      <div className="exploration-head">
        <div>
          <div className="exploration-eyebrow">Exploration · design studies</div>
          <div className="exploration-title">Alternatives for nonlinear states, tags, and chip treatments</div>
        </div>
        <button className="btn" style={{ padding: '4px 10px' }} onClick={() => setOpen(false)}>
          <Icon name="x" size={12} /> Hide
        </button>
      </div>

      {/* Section 1: Nonlinear viz */}
      <section className="exp-section">
        <h3 className="exp-h">1 · Nonlinear state visualizations</h3>
        <p className="exp-sub">The workflow is a DAG — pieces fork at designing (wheel/handbuilt), refining (slip/carved/straight-to-bisque), after bisque (waxed/glazed), and after glaze firing (sanded/completed). Any state can exit to recycled. Four ways to show this honestly:</p>

        <div className="exp-grid">
          <div className="exp-card">
            <div className="exp-card-head">
              <span className="exp-card-label">A · Phase dots</span>
              <span className="exp-card-note">6 named phases, not 13 states</span>
            </div>
            <div className="exp-card-body">
              <PhaseDots piece={vizPicks.phases} />
            </div>
            <div className="exp-card-foot">
              <span>{vizPicks.phases.name}</span>
              <StateChip stateId={vizPicks.phases.state} />
            </div>
          </div>

          <div className="exp-card">
            <div className="exp-card-head">
              <span className="exp-card-label">B · Branches (decision lens)</span>
              <span className="exp-card-note">current + what's next</span>
            </div>
            <div className="exp-card-body">
              <BranchesViz piece={vizPicks.branches} />
            </div>
            <div className="exp-card-foot">
              <span>{vizPicks.branches.name}</span>
              <span className="exp-card-muted">→ choose next step</span>
            </div>
          </div>

          <div className="exp-card">
            <div className="exp-card-head">
              <span className="exp-card-label">C · Path trace</span>
              <span className="exp-card-note">actual history, forks flagged</span>
            </div>
            <div className="exp-card-body">
              <PathTraceViz piece={vizPicks.trace} />
            </div>
            <div className="exp-card-foot">
              <span>{vizPicks.trace.name}</span>
              <span className="exp-card-muted">+ marks where a fork was taken</span>
            </div>
          </div>

          <div className="exp-card">
            <div className="exp-card-head">
              <span className="exp-card-label">D · Radial</span>
              <span className="exp-card-note">all states as a clock</span>
            </div>
            <div className="exp-card-body exp-card-center">
              <RadialViz piece={vizPicks.radial} />
            </div>
            <div className="exp-card-foot">
              <span>{vizPicks.radial.name}</span>
              <span className="exp-card-muted">good for dense detail pages</span>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: Tags */}
      <section className="exp-section">
        <h3 className="exp-h">2 · Tags</h3>
        <p className="exp-sub">Two registers: <strong>data tags</strong> carry structured facts (clay body, glaze, cone) in a mono face; <strong>studio tags</strong> are free-form labels with a small colored dot.</p>

        <div className="exp-tags-demo">
          <div className="exp-tags-row">
            <div className="exp-tags-label">Data tags</div>
            <div className="exp-tags-items">
              <Tag label="B-Mix stoneware" variant="data" />
              <Tag label="Celadon!Shino" variant="data" />
              <Tag label="cone 6" variant="data" />
              <Tag label="520g clay" variant="data" />
              <Tag label="kiln A" variant="data" />
            </div>
          </div>
          <div className="exp-tags-row">
            <div className="exp-tags-label">Studio tags</div>
            <div className="exp-tags-items">
              <Tag label="commission" dotColor={tagColor('commission')} />
              <Tag label="gift" dotColor={tagColor('gift')} />
              <Tag label="sold" dotColor={tagColor('sold')} />
              <Tag label="experimental" dotColor={tagColor('experimental')} />
              <Tag label="food-safe" dotColor={tagColor('food-safe')} />
              <Tag label="failed" dotColor={tagColor('failed')} />
              <Tag label="needs-photo" dotColor={tagColor('needs-photo')} />
            </div>
          </div>
          <div className="exp-tags-row">
            <div className="exp-tags-label">On a piece</div>
            <div className="exp-tags-items">
              <TagRow
                tags={['commission', 'gift', 'food-safe']}
                clayBody="B-Mix stoneware"
                glaze="Celadon!Shino"
                cone="6"
              />
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: Chip treatments */}
      <section className="exp-section">
        <h3 className="exp-h">3 · Chip color roles</h3>
        <p className="exp-sub">
          <strong>Dot color</strong> = semantic — which <em>kind</em> of work (plan, form, deco, kiln, finish). Consistent across the app.<br/>
          <strong>Font color</strong> = signals status — muted for historical, saturated for current, accent for needs-attention.<br/>
          <strong>Background</strong> = carries intensity — solid for active, soft for informational, hatched for recycled, glow for kiln.
        </p>

        <div className="exp-kinds">
          <div className="exp-kinds-label">Dot color · semantic (by kind)</div>
          <div className="exp-kinds-row">
            {[
              ['designed', 'plan'],
              ['wheel_thrown', 'form'],
              ['carved', 'deco'],
              ['submitted_to_bisque_fire', 'queue'],
              ['bisque_fired', 'kiln'],
              ['sanded', 'finish'],
              ['completed', 'done'],
              ['recycled', 'recycle'],
            ].map(([s, k]) => (
              <div key={s} className="exp-kind-item">
                <span className="exp-kind-dot" style={{ background: kindColor(s) }} />
                <span className="exp-kind-name">{k}</span>
                <span className="exp-kind-ex">{shortState(s)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="exp-treatments">
          <ChipTreatment kind="solid"   label="bisque fired" dot={kindColor('bisque_fired')} sub="current state — main signal" />
          <ChipTreatment kind="soft"    label="trimmed"       dot={kindColor('trimmed')}      sub="default — informational" />
          <ChipTreatment kind="outline" label="designed"      dot={kindColor('designed')}     sub="historical — already done" />
          <ChipTreatment kind="glow"    label="in kiln"       dot={kindColor('bisque_fired')} sub="kiln states — heat glow" />
          <ChipTreatment kind="hatched" label="recycled"      dot={kindColor('recycled')}     sub="recycled — struck through" />
          <ChipTreatment kind="minimal" label="completed"     dot={kindColor('completed')}    sub="quiet — terminal success" />
          <ChipTreatment kind="urgent"  label="needs photo"   dot={kindColor('completed')}    sub="attention — call to action" />
        </div>
      </section>
    </div>
  );
}

Object.assign(window, { ExplorationPanel, PhaseDots, BranchesViz, PathTraceViz, RadialViz, Tag, TagRow, tagColor, kindColor });

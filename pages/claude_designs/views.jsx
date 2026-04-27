/* Glaze Workspace — list views */

const { useState: useStateV, useEffect: useEffectV, useMemo: useMemoV } = React;

// ============ Ledger view (rows) ============
function LedgerView({ pieces, vizStyle }) {
  return (
    <div className="ledger">
      <div className="ledger-head">
        <div></div>
        <div>Piece</div>
        <div>State</div>
        <div>Created</div>
        <div>Last modified</div>
      </div>
      {pieces.map(p => (
        <div key={p.id} className={`ledger-row ${p.state === 'recycled' ? 'recycled' : ''}`}>
          <div className="thumb">
            <PlaceholderThumb piece={p} />
          </div>
          <div>
            <div className="piece-name">{p.name}</div>
            <div className="piece-meta">
              {p.clayBody}
              {p.clayWeight ? ` · ${p.clayWeight}g` : ''}
              {p.glaze ? ` · ${p.glaze}` : ''}
            </div>
          </div>
          <div style={{ minWidth: 0 }}>
            <StateTimeline stateId={p.state} variant={vizStyle} />
          </div>
          <DateCell date={p.created} />
          <DateCell date={p.modified} />
        </div>
      ))}
    </div>
  );
}

// ============ Gallery view (cards) ============
function GalleryView({ pieces, vizStyle }) {
  return (
    <div className="gallery">
      {pieces.map(p => (
        <div key={p.id} className={`card ${p.state === 'recycled' ? 'recycled' : ''}`}>
          <div className="card-thumb">
            <PlaceholderThumb piece={p} aspect={0.75} />
            <div className="card-ring-wrap">
              <div style={{ position: 'relative', width: 44, height: 44 }}>
                <StateRing stateId={p.state} size={44} />
                <div style={{
                  position: 'absolute', inset: 0, display: 'grid', placeItems: 'center',
                  fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text)',
                  textShadow: '0 1px 3px oklch(0 0 0 / 0.6)'
                }}>
                  {Math.round(((mainIndex(p.state) + 1) / MAIN_TRACK.length) * 100)}%
                </div>
              </div>
            </div>
          </div>
          <div className="card-body">
            <div>
              <div className="card-title">{p.name}</div>
              <div className="piece-meta" style={{ marginTop: 2 }}>
                {p.clayBody}
                {p.clayWeight ? ` · ${p.clayWeight}g` : ''}
              </div>
            </div>
            <div style={{ marginTop: 'auto' }}>
              <StateTimeline stateId={p.state} variant={vizStyle} />
            </div>
            <div className="card-row">
              <span>created <span className="date">{new Date(p.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></span>
              <span>·</span>
              <span>mod <span className="date">{new Date(p.modified).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span></span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============ Shelf view (grouped by state) ============
function ShelfView({ pieces }) {
  // Group pieces by their current state, in track order
  const groups = useMemoV(() => {
    const order = [
      'designed', 'handbuilt', 'wheel_thrown', 'trimmed',
      'slip_applied', 'carved',
      'submitted_to_bisque_fire', 'bisque_fired',
      'waxed', 'glazed',
      'submitted_to_glaze_fire', 'glaze_fired',
      'sanded', 'completed', 'recycled',
    ];
    const by = {};
    for (const p of pieces) {
      (by[p.state] ||= []).push(p);
    }
    return order.filter(s => by[s]?.length).map(s => ({ state: s, pieces: by[s] }));
  }, [pieces]);

  const stateLabel = (s) => {
    const labels = {
      designed: 'On the sketchpad',
      wheel_thrown: 'On the wheel',
      handbuilt: 'Hand-built',
      trimmed: 'Trimming table',
      slip_applied: 'Slipped',
      carved: 'Carved',
      submitted_to_bisque_fire: 'Bisque queue',
      bisque_fired: 'Out of bisque',
      waxed: 'Waxed',
      glazed: 'Glazed',
      submitted_to_glaze_fire: 'Glaze queue',
      glaze_fired: 'Out of glaze',
      sanded: 'Finishing',
      completed: 'Completed',
      recycled: 'Recycled',
    };
    return labels[s] || s;
  };

  return (
    <div className="shelf">
      {groups.map(g => {
        const isKiln = STATES[g.state]?.kind === 'kiln' || STATES[g.state]?.kind === 'queue';
        const isDone = g.state === 'completed';
        return (
          <div key={g.state} className="shelf-group"
            style={isKiln ? {
              background: 'linear-gradient(180deg, oklch(0.28 0.03 50) 0%, var(--bg-elev) 100%)',
              borderColor: 'oklch(0.72 0.13 55 / 0.2)',
            } : undefined}
          >
            <div className="shelf-head">
              <div className="title">
                {isKiln && <Icon name="kiln" size={14} />}
                {isDone && <Icon name="check" size={14} />}
                <span>{stateLabel(g.state)}</span>
                <span style={{ color: 'var(--text-mute)', fontSize: 11 }}>/ {prettyState(g.state)}</span>
              </div>
              <div className="count">{g.pieces.length} {g.pieces.length === 1 ? 'piece' : 'pieces'}</div>
            </div>
            <div className="shelf-body">
              {g.pieces.map(p => (
                <div key={p.id} className="shelf-card">
                  <div className="thumb">
                    <PlaceholderThumb piece={p} aspect={0.75} />
                  </div>
                  <div className="name">{p.name}</div>
                  <div className="meta">
                    {p.clayWeight ? `${p.clayWeight}g · ` : ''}
                    {new Date(p.modified).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

Object.assign(window, { LedgerView, GalleryView });

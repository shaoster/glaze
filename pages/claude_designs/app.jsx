/* Glaze Workspace — main app */

const { useState: useStateApp, useEffect: useEffectApp, useMemo: useMemoApp } = React;

function App({ initialCfg }) {
  const [cfg, setCfg] = useStateApp(initialCfg);
  const [pieces, setPieces] = useStateApp(seedPieces);
  const [tab, setTab] = useStateApp('pieces');
  const [search, setSearch] = useStateApp('');
  const [filterOpen, setFilterOpen] = useStateApp(false);
  const [filterStates, setFilterStates] = useStateApp(new Set());
  const [tweaksOpen, setTweaksOpen] = useStateApp(false);
  const [editModeOn, setEditModeOn] = useStateApp(false);

  // Apply cfg to document attributes so CSS picks it up
  useEffectApp(() => {
    document.documentElement.setAttribute('data-theme', cfg.theme);
    document.documentElement.setAttribute('data-density', cfg.density);

    const accentMap = {
      clay:   { base: '0.70 0.12 40', ink: '0.30 0.05 40' },
      ochre:  { base: '0.78 0.12 80', ink: '0.35 0.06 80' },
      moss:   { base: '0.62 0.08 140', ink: '0.25 0.04 140' },
      iron:   { base: '0.54 0.14 25', ink: '0.25 0.06 25' },
      indigo: { base: '0.58 0.11 260', ink: '0.26 0.05 260' },
    };
    const a = accentMap[cfg.accent] || accentMap.clay;
    document.documentElement.style.setProperty('--accent', `oklch(${a.base})`);
    document.documentElement.style.setProperty('--accent-soft', `oklch(${a.base} / 0.14)`);
    document.documentElement.style.setProperty('--accent-ink', `oklch(${a.ink})`);

    const fontMap = {
      editorial: { display: "'Instrument Serif', Georgia, serif", ui: "'Inter Tight', system-ui, sans-serif" },
      humanist:  { display: "'Fraunces', Georgia, serif",         ui: "'Manrope', system-ui, sans-serif" },
      mono:      { display: "'JetBrains Mono', ui-monospace",     ui: "'JetBrains Mono', ui-monospace" },
    };
    const f = fontMap[cfg.font] || fontMap.editorial;
    document.documentElement.style.setProperty('--font-display', f.display);
    document.documentElement.style.setProperty('--font-ui', f.ui);
  }, [cfg]);

  // Edit mode contract
  useEffectApp(() => {
    const handler = (e) => {
      if (e.data?.type === '__activate_edit_mode') {
        setTweaksOpen(true);
        setEditModeOn(true);
      } else if (e.data?.type === '__deactivate_edit_mode') {
        setTweaksOpen(false);
        setEditModeOn(false);
      }
    };
    window.addEventListener('message', handler);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', handler);
  }, []);

  // Filter + search
  const filtered = useMemoApp(() => {
    let out = pieces;
    if (search.trim()) {
      const q = search.toLowerCase();
      out = out.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.clayBody || '').toLowerCase().includes(q) ||
        (p.glaze || '').toLowerCase().includes(q) ||
        p.state.toLowerCase().includes(q)
      );
    }
    if (filterStates.size > 0) {
      out = out.filter(p => filterStates.has(p.state));
    }
    return out;
  }, [pieces, search, filterStates]);

  const allStates = useMemoApp(() => {
    const s = new Set();
    pieces.forEach(p => s.add(p.state));
    return Array.from(s).sort((a, b) => (mainIndex(a) || 99) - (mainIndex(b) || 99));
  }, [pieces]);

  const toggleFilter = (s) => {
    setFilterStates(prev => {
      const next = new Set(prev);
      next.has(s) ? next.delete(s) : next.add(s);
      return next;
    });
  };

  const kilnCount = pieces.filter(p =>
    STATES[p.state]?.kind === 'kiln' || STATES[p.state]?.kind === 'queue'
  ).length;

  return (
    <div className="app" data-screen-label="Pottery Pieces">
      {/* Topbar */}
      <div className="topbar">
        <div className="brand">
          <div className="brand-mark" />
          <span className="brand-name">PotterDoc</span>
          <span className="brand-tag">For the patient potter</span>
        </div>
        <button className="user-chip">
          <span className="avatar">SS</span>
          <span>Shuyi Sui</span>
          <Icon name="chevron" size={12} />
        </button>
      </div>

      {/* Tabs */}
      <div className="tabs">
        <button className={`tab ${tab === 'pieces' ? 'active' : ''}`} onClick={() => setTab('pieces')}>Pieces</button>
        <button className={`tab ${tab === 'analyze' ? 'active' : ''}`} onClick={() => setTab('analyze')}>Analyze</button>
        <div style={{ flex: 1 }} />
        <div className="analyze-teaser" style={{ padding: '10px 0' }}>
          <Icon name="sparkline" size={12} />
          <span>{kilnCount} in kiln queue · {pieces.filter(p => p.state === 'completed').length} done this quarter</span>
        </div>
      </div>

      {tab === 'pieces' ? (
        <>
          {/* Header */}
          <div className="page-head">
            <div style={{ minWidth: 0, flex: 1 }}>
              <h1 className="page-title">
                <span>Pottery Pieces</span>
                <span className="page-count">{pieces.length}</span>
              </h1>
              <div className="page-sub">Track pieces through the studio — wheel, kiln, glaze, finish.</div>
            </div>
            <button className="btn btn-primary" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
              <Icon name="plus" size={14} /> New piece
            </button>
          </div>

          {/* Toolbar */}
          <ExplorationPanel pieces={pieces} />
          <div className="toolbar">
            <div className="toolbar-left">
              <div className="search">
                <Icon name="search" size={14} />
                <input
                  placeholder="Search name, clay, glaze…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <button
                className="filter-pill"
                onClick={() => setFilterOpen(!filterOpen)}
                style={filterStates.size ? { borderColor: 'var(--accent)', color: 'var(--text)' } : {}}
              >
                <Icon name="filter" size={12} />
                <span>Filter</span>
                {filterStates.size > 0 && <span className="count">{filterStates.size}</span>}
                <Icon name="chevron" size={12} />
              </button>
            </div>
            <div className="toolbar-right">
              <div className="seg">
                <button className={cfg.view === 'ledger' ? 'on' : ''} onClick={() => setCfg({ ...cfg, view: 'ledger' })}>
                  <Icon name="ledger" size={13} />
                </button>
                <button className={cfg.view === 'gallery' ? 'on' : ''} onClick={() => setCfg({ ...cfg, view: 'gallery' })}>
                  <Icon name="grid" size={13} />
                </button>
              </div>
              <button
                className="btn"
                onClick={() => setTweaksOpen(!tweaksOpen)}
                style={tweaksOpen ? { borderColor: 'var(--accent)' } : {}}
              >
                <Icon name="tweaks" size={13} /> Tweaks
              </button>
            </div>
          </div>

          {/* Filter chips */}
          {filterOpen && (
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16,
              padding: 12, background: 'var(--bg-elev)',
              border: '1px solid var(--line-soft)', borderRadius: 'var(--r-md)',
            }}>
              {allStates.map(s => {
                const active = filterStates.has(s);
                return (
                  <button
                    key={s}
                    onClick={() => toggleFilter(s)}
                    style={{
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--line)'}`,
                      background: active ? 'var(--accent-soft)' : 'transparent',
                      color: active ? 'var(--accent)' : 'var(--text-dim)',
                      borderRadius: 999, padding: '4px 10px',
                      fontFamily: 'var(--font-mono)', fontSize: 11,
                    }}
                  >
                    {shortState(s)}
                    <span style={{ marginLeft: 6, opacity: 0.6 }}>
                      {pieces.filter(p => p.state === s).length}
                    </span>
                  </button>
                );
              })}
              {filterStates.size > 0 && (
                <button
                  onClick={() => setFilterStates(new Set())}
                  style={{ border: 'none', background: 'transparent', color: 'var(--text-mute)', fontSize: 11, padding: '4px 10px' }}
                >
                  clear
                </button>
              )}
            </div>
          )}

          {/* View */}
          {filtered.length === 0 ? (
            <div style={{
              padding: '60px 20px', textAlign: 'center',
              border: '1px dashed var(--line)', borderRadius: 'var(--r-lg)',
              color: 'var(--text-mute)',
            }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 24, color: 'var(--text-dim)', marginBottom: 6 }}>
                No pieces match.
              </div>
              <div style={{ fontSize: 13 }}>Clear filters or try a different search term.</div>
            </div>
          ) : (
            <>
              {cfg.view === 'ledger' && <LedgerView pieces={filtered} vizStyle={cfg.viz} />}
              {cfg.view === 'gallery' && <GalleryView pieces={filtered} vizStyle={cfg.viz} />}
            </>
          )}
        </>
      ) : (
        // Analyze tab placeholder
        <div style={{ marginTop: 40, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          {[
            { t: 'Glaze combinations', sub: 'completed pieces, by glaze', n: 8, unit: 'combos' },
            { t: 'Time per state', sub: 'avg. days in each state', n: 4.2, unit: 'days avg' },
            { t: 'Firing fees', sub: 'this quarter', n: 142, unit: 'USD' },
            { t: 'Loss rate', sub: 'recycled per state', n: 7.3, unit: '% avg' },
          ].map(c => (
            <div key={c.t} style={{
              padding: 20, border: '1px solid var(--line-soft)', borderRadius: 'var(--r-lg)',
              background: 'var(--bg-elev)',
            }}>
              <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-mute)' }}>{c.t}</div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 42, marginTop: 10, lineHeight: 1 }}>{c.n}</div>
              <div style={{ fontSize: 12, color: 'var(--text-dim)', marginTop: 4, fontFamily: 'var(--font-mono)' }}>{c.unit}</div>
              <div style={{ fontSize: 12, color: 'var(--text-mute)', marginTop: 14 }}>{c.sub}</div>
            </div>
          ))}
        </div>
      )}

      <Tweaks open={tweaksOpen} onClose={() => setTweaksOpen(false)} cfg={cfg} setCfg={setCfg} />
    </div>
  );
}

Object.assign(window, { App });

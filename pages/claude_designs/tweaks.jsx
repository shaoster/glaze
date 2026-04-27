/* Glaze Workspace — Tweaks panel */

const { useState: useStateT, useEffect: useEffectT } = React;

function Tweaks({ open, onClose, cfg, setCfg }) {
  const set = (k, v) => setCfg(prev => {
    const next = { ...prev, [k]: v };
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: next }, '*');
    return next;
  });

  const accents = [
    { id: 'clay',   color: 'oklch(0.70 0.12 40)' },
    { id: 'ochre',  color: 'oklch(0.78 0.12 80)' },
    { id: 'moss',   color: 'oklch(0.62 0.08 140)' },
    { id: 'iron',   color: 'oklch(0.54 0.14 25)' },
    { id: 'indigo', color: 'oklch(0.58 0.11 260)' },
  ];

  const fonts = [
    { id: 'editorial', label: 'Editorial', display: "'Instrument Serif', serif", ui: "'Inter Tight', sans-serif" },
    { id: 'humanist', label: 'Humanist', display: "'Fraunces', serif", ui: "'Manrope', sans-serif" },
    { id: 'mono',    label: 'Technical', display: "'JetBrains Mono', monospace", ui: "'JetBrains Mono', monospace" },
  ];

  return (
    <div className={`tweaks ${open ? '' : 'hidden'}`}>
      <div className="tweaks-head">
        <div className="title">Tweaks</div>
        <button className="btn" style={{ padding: 4, border: 'none' }} onClick={onClose} aria-label="Close">
          <Icon name="x" size={14} />
        </button>
      </div>
      <div className="tweaks-body">
        <div className="tweak">
          <div className="tweak-label">View</div>
          <div className="opts">
            {['ledger', 'gallery'].map(v => (
              <button key={v} className={cfg.view === v ? 'on' : ''} onClick={() => set('view', v)}>{v}</button>
            ))}
          </div>
        </div>

        <div className="tweak">
          <div className="tweak-label">State viz</div>
          <div className="opts">
            {[
              { id: 'dots', label: 'dots' },
              { id: 'bar', label: 'bar' },
              { id: 'chip', label: 'chip' },
            ].map(o => (
              <button key={o.id} className={cfg.viz === o.id ? 'on' : ''} onClick={() => set('viz', o.id)}>{o.label}</button>
            ))}
          </div>
        </div>

        <div className="tweak">
          <div className="tweak-label">Density</div>
          <div className="opts">
            {['compact', 'default', 'comfy'].map(d => (
              <button key={d} className={cfg.density === d ? 'on' : ''} onClick={() => set('density', d)}>{d}</button>
            ))}
          </div>
        </div>

        <div className="tweak">
          <div className="tweak-label">Theme</div>
          <div className="opts">
            {['dark', 'light'].map(t => (
              <button key={t} className={cfg.theme === t ? 'on' : ''} onClick={() => set('theme', t)}>{t}</button>
            ))}
          </div>
        </div>

        <div className="tweak">
          <div className="tweak-label">Accent</div>
          <div className="swatches">
            {accents.map(a => (
              <button
                key={a.id}
                className={cfg.accent === a.id ? 'on' : ''}
                style={{ background: a.color }}
                onClick={() => set('accent', a.id)}
                title={a.id}
              />
            ))}
          </div>
        </div>

        <div className="tweak">
          <div className="tweak-label">Type pairing</div>
          <div className="opts">
            {fonts.map(f => (
              <button key={f.id} className={cfg.font === f.id ? 'on' : ''} onClick={() => set('font', f.id)}>{f.label}</button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Tweaks });

/* PotterDoc — Wireframe: Showcase Field Selection (terminal state)
 * Rough wireframe sketches per issue #315.
 * 4 distinct approaches, low-fi, sketchy. Mobile (iOS frame).
 */

const { useState: useStateW } = React;

const INK = '#1a1a1a';
const INK_DIM = '#5a5a5a';
const INK_MUTE = '#9a9a9a';
const PAPER = '#fafaf6';
const PAPER_2 = '#f1efe7';
const RULE = '#1a1a1a';
const ACCENT_W = '#c4632e'; // terracotta
const HILITE = '#fce98a'; // marker yellow

const sketchFont = "'Caveat', 'Architects Daughter', cursive";
const handFont = "'Architects Daughter', 'Caveat', cursive";
const monoFont = "'JetBrains Mono', monospace";

/* Shared chrome */
function WFFrame({ children, label }) {
  return (
    <div style={{
      height: '100%', background: PAPER, color: INK,
      fontFamily: handFont,
      display: 'flex', flexDirection: 'column',
      position: 'relative',
      backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 27px, rgba(0,0,0,0.04) 27px 28px)',
    }}>
      {/* sticky topbar */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: `1.5px solid ${INK}`,
        background: PAPER,
      }}>
        <div style={{ fontFamily: handFont, fontSize: 14 }}>‹ Pieces</div>
        <div style={{
          fontFamily: monoFont, fontSize: 9, letterSpacing: '0.1em',
          textTransform: 'uppercase', color: INK_DIM,
          padding: '2px 8px', border: `1px dashed ${INK_DIM}`, borderRadius: 4,
        }}>
          {label}
        </div>
        <div style={{ fontSize: 16, fontFamily: handFont }}>···</div>
      </div>
      {children}
    </div>
  );
}

/* Hand-drawn checkbox */
function Box({ on, size = 16, kind = 'check' }) {
  return (
    <span style={{
      display: 'inline-grid', placeItems: 'center',
      width: size, height: size,
      border: `1.5px solid ${INK}`, borderRadius: 3,
      background: on ? INK : 'transparent',
      flexShrink: 0,
    }}>
      {on && (
        <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 16 16" fill="none">
          <path d="M3 8 L7 12 L13 4" stroke={PAPER} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </span>
  );
}

/* Hand-drawn eye toggle */
function Eye({ on }) {
  return (
    <svg width="22" height="14" viewBox="0 0 24 14" fill="none" stroke={on ? INK : INK_MUTE} strokeWidth="1.6">
      <path d="M1 7 Q12 -2 23 7 Q12 14 1 7 Z" />
      {on
        ? <circle cx="12" cy="7" r="2.2" fill={INK}/>
        : <path d="M3 12 L21 2" stroke={INK_MUTE} strokeWidth="1.6"/>
      }
    </svg>
  );
}

/* Section label (sketchy underline) */
function SectionLabel({ children, extra }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      marginBottom: 8, marginTop: 14,
    }}>
      <div style={{
        fontFamily: monoFont, fontSize: 9, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: INK_DIM,
        borderBottom: `1px dashed ${INK_DIM}`, paddingBottom: 2,
      }}>{children}</div>
      {extra && <div style={{ fontFamily: monoFont, fontSize: 9, color: INK_MUTE }}>{extra}</div>}
    </div>
  );
}

/* Title block — terminal state piece header (shared) */
function TerminalHeader() {
  return (
    <div style={{ padding: '14px 16px 4px' }}>
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '2px 8px', border: `1.5px solid ${INK}`, borderRadius: 999,
        fontFamily: monoFont, fontSize: 10,
        background: HILITE,
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: INK }}/>
        completed · terminal state
      </div>
      <div style={{
        fontFamily: sketchFont, fontSize: 30, lineHeight: 1, marginTop: 8,
      }}>
        Jewelry Dish
      </div>
      <div style={{ fontFamily: monoFont, fontSize: 10, color: INK_DIM, marginTop: 4 }}>
        finished May 6 · 14 days · 9 states
      </div>
    </div>
  );
}

/* Process summary block (mini, shared across variations) */
function ProcessSummaryMini() {
  const fields = [
    ['clay body',  'B-Mix stoneware'],
    ['weight',     '520 g'],
    ['glazes',     'Celadon → Iron wash'],
    ['kiln',       'Studio kiln A · cone 6'],
    ['stamp',      '⌒ swallow'],
    ['notes',      'tighter foot ring'],
  ];
  return (
    <div style={{ padding: '0 16px' }}>
      <SectionLabel extra="potter-facing">process summary</SectionLabel>
      <div style={{
        border: `1.5px solid ${INK}`, borderRadius: 8,
        padding: '10px 12px',
        background: 'rgba(0,0,0,0.02)',
      }}>
        {fields.map(([k, v]) => (
          <div key={k} style={{
            display: 'flex', justifyContent: 'space-between',
            padding: '4px 0',
            borderBottom: `1px dashed ${INK_MUTE}`,
            fontSize: 12,
          }}>
            <span style={{ color: INK_DIM }}>{k}</span>
            <span style={{ fontFamily: monoFont, fontSize: 11 }}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────── Variation A: Inline toggle list ─────────────── */
function VariantA() {
  const [fields, setFields] = useStateW([
    { id: 'clay',     label: 'Clay body',      val: 'B-Mix stoneware',    on: true,  scope: 'piece' },
    { id: 'weight',   label: 'Clay weight',    val: '520 g',              on: false, scope: 'piece' },
    { id: 'tags',     label: 'Tags',           val: 'commission · gift',  on: true,  scope: 'piece' },
    { id: 'glazes',   label: 'Glazes',         val: 'Celadon, Iron wash', on: true,  scope: 'state' },
    { id: 'kiln',     label: 'Kiln · cone',    val: 'Kiln A · cone 6',    on: false, scope: 'state' },
    { id: 'stamp',    label: 'Maker stamp',    val: '⌒ swallow',          on: true,  scope: 'piece' },
    { id: 'notes',    label: 'Notes',          val: 'tighter foot ring',  on: false, scope: 'state' },
    { id: 'duration', label: 'Total duration', val: '14 days',            on: true,  scope: 'piece' },
  ]);
  const toggle = (id) => setFields(fields.map(f => f.id === id ? { ...f, on: !f.on } : f));
  const sharedCount = fields.filter(f => f.on).length;

  return (
    <WFFrame label="Variation A · inline list">
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <TerminalHeader />
        <ProcessSummaryMini />

        {/* Showcase Story */}
        <div style={{ padding: '0 16px' }}>
          <SectionLabel extra="visible to customers">showcase story</SectionLabel>
          <div style={{
            border: `1.5px solid ${INK}`, borderRadius: 8,
            padding: '10px 12px', minHeight: 64,
            background: PAPER,
            fontFamily: sketchFont, fontSize: 16, lineHeight: 1.3, color: INK_DIM,
          }}>
            <span style={{ color: INK_MUTE }}>Tap to write a marketing description…</span>
          </div>
        </div>

        {/* Showcase field selection — inline list */}
        <div style={{ padding: '0 16px 80px' }}>
          <SectionLabel extra={`${sharedCount} of ${fields.length} shared`}>
            showcase fields
          </SectionLabel>
          <div style={{
            fontSize: 12, color: INK_DIM, marginBottom: 8,
            fontFamily: handFont, lineHeight: 1.4,
          }}>
            Pick which details show on the public page.
          </div>
          <div style={{
            border: `1.5px solid ${INK}`, borderRadius: 8,
            background: PAPER,
          }}>
            {fields.map((f, i) => (
              <div key={f.id}
                onClick={() => toggle(f.id)}
                style={{
                  padding: '10px 12px',
                  display: 'flex', alignItems: 'center', gap: 12,
                  borderBottom: i === fields.length - 1 ? 'none' : `1px dashed ${INK_MUTE}`,
                  cursor: 'pointer',
                  background: f.on ? 'rgba(252, 233, 138, 0.35)' : 'transparent',
                }}>
                <Box on={f.on}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontFamily: handFont }}>{f.label}</div>
                  <div style={{
                    fontSize: 10, fontFamily: monoFont, color: INK_DIM,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}>
                    {f.val}
                  </div>
                </div>
                <span style={{
                  fontFamily: monoFont, fontSize: 9, color: INK_MUTE,
                  padding: '1px 5px', border: `1px dashed ${INK_MUTE}`, borderRadius: 3,
                }}>{f.scope}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button style={wfBtn(false)}>Preview public page</button>
            <button style={wfBtn(true)}>Share link</button>
          </div>
        </div>
      </div>
    </WFFrame>
  );
}

/* ─────────────── Variation B: Two-column shared/private ─────────────── */
function VariantB() {
  const [shared, setShared] = useStateW(['Clay body', 'Glazes', 'Stamp', 'Duration']);
  const [hidden, setHidden] = useStateW(['Weight', 'Kiln · cone', 'Notes', 'Tags']);

  const move = (label, fromShared) => {
    if (fromShared) {
      setShared(shared.filter(x => x !== label));
      setHidden([...hidden, label]);
    } else {
      setHidden(hidden.filter(x => x !== label));
      setShared([...shared, label]);
    }
  };

  return (
    <WFFrame label="Variation B · shared / hidden">
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <TerminalHeader />
        <ProcessSummaryMini />

        <div style={{ padding: '0 16px' }}>
          <SectionLabel extra="visible to customers">showcase story</SectionLabel>
          <div style={{
            border: `1.5px solid ${INK}`, borderRadius: 8,
            padding: '10px 12px', minHeight: 60,
            fontFamily: sketchFont, fontSize: 16, color: INK_DIM,
          }}>
            <span style={{ color: INK_MUTE }}>Write a story for this piece…</span>
          </div>
        </div>

        <div style={{ padding: '0 16px 80px' }}>
          <SectionLabel>showcase fields</SectionLabel>
          <div style={{ fontSize: 12, color: INK_DIM, marginBottom: 10, fontFamily: handFont }}>
            Tap a field to swap it between columns.
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {/* Shared column */}
            <div style={{
              border: `1.5px solid ${INK}`, borderRadius: 8,
              padding: '8px',
              background: 'rgba(252, 233, 138, 0.4)',
              minHeight: 240,
            }}>
              <div style={{
                fontFamily: monoFont, fontSize: 9, letterSpacing: '0.1em',
                textTransform: 'uppercase', textAlign: 'center',
                paddingBottom: 6, borderBottom: `1px solid ${INK}`,
              }}>
                ✓ shared ({shared.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {shared.map(s => (
                  <div key={s} onClick={() => move(s, true)} style={{
                    padding: '6px 8px', border: `1.5px solid ${INK}`, borderRadius: 6,
                    background: PAPER, fontSize: 12, fontFamily: handFont,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    cursor: 'pointer',
                  }}>
                    {s}
                    <span style={{ fontSize: 12, color: INK_DIM }}>→</span>
                  </div>
                ))}
              </div>
            </div>
            {/* Hidden column */}
            <div style={{
              border: `1.5px dashed ${INK}`, borderRadius: 8,
              padding: '8px',
              background: 'rgba(0,0,0,0.03)',
              minHeight: 240,
            }}>
              <div style={{
                fontFamily: monoFont, fontSize: 9, letterSpacing: '0.1em',
                textTransform: 'uppercase', textAlign: 'center',
                paddingBottom: 6, borderBottom: `1px dashed ${INK_DIM}`,
                color: INK_DIM,
              }}>
                ⊘ hidden ({hidden.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
                {hidden.map(s => (
                  <div key={s} onClick={() => move(s, false)} style={{
                    padding: '6px 8px', border: `1px dashed ${INK_DIM}`, borderRadius: 6,
                    background: 'transparent', fontSize: 12, fontFamily: handFont,
                    color: INK_DIM,
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    cursor: 'pointer',
                  }}>
                    {s}
                    <span style={{ fontSize: 12 }}>←</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* extra fields hint */}
          <div style={{
            marginTop: 10, padding: '8px 10px',
            border: `1px dashed ${INK_DIM}`, borderRadius: 6,
            fontSize: 11, fontFamily: handFont, color: INK_DIM,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <span>+ pull in another field…</span>
            <span>+</span>
          </div>

          <button style={{ ...wfBtn(true), width: '100%', marginTop: 12 }}>
            Preview showcase →
          </button>
        </div>
      </div>
    </WFFrame>
  );
}

/* ─────────────── Variation C: Live preview side-by-side ─────────────── */
function VariantC() {
  const [fields, setFields] = useStateW([
    { id: 'clay',   label: 'Clay body',     val: 'B-Mix stoneware',    on: true  },
    { id: 'weight', label: 'Weight',        val: '520 g',              on: false },
    { id: 'glaze',  label: 'Glazes',        val: 'Celadon, Iron wash', on: true  },
    { id: 'kiln',   label: 'Kiln · cone',   val: 'Kiln A · cone 6',    on: false },
    { id: 'stamp',  label: 'Maker stamp',   val: '⌒ swallow',          on: true  },
    { id: 'notes',  label: 'Process notes', val: 'tighter foot ring',  on: false },
    { id: 'tags',   label: 'Tags',          val: 'commission · gift',  on: false },
    { id: 'dur',    label: 'Duration',      val: '14 days',            on: true  },
  ]);
  const toggle = (id) => setFields(fields.map(f => f.id === id ? { ...f, on: !f.on } : f));
  const visible = fields.filter(f => f.on);

  return (
    <WFFrame label="Variation C · live preview">
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <TerminalHeader />

        <div style={{ padding: '8px 16px 80px' }}>
          <SectionLabel extra="updates as you toggle">configure showcase</SectionLabel>

          {/* Mock preview phone — what customers see */}
          <div style={{
            margin: '0 0 12px',
            border: `2px solid ${INK}`, borderRadius: 14,
            padding: 8, background: PAPER_2,
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute', top: -8, left: 12, padding: '0 6px',
              background: PAPER_2, fontFamily: monoFont, fontSize: 9,
              letterSpacing: '0.1em', textTransform: 'uppercase', color: INK_DIM,
            }}>public showcase preview</div>

            {/* photo placeholder */}
            <div style={{
              aspectRatio: '5/3', borderRadius: 8,
              background: `repeating-linear-gradient(45deg, ${INK_MUTE} 0 6px, ${PAPER_2} 6px 12px)`,
              display: 'grid', placeItems: 'center',
              fontFamily: monoFont, fontSize: 9, color: PAPER_2,
              border: `1.5px solid ${INK}`,
            }}>
              <span style={{ background: INK, padding: '2px 6px' }}>HERO PHOTO</span>
            </div>
            <div style={{
              fontFamily: sketchFont, fontSize: 22, lineHeight: 1, marginTop: 8,
            }}>
              Jewelry Dish
            </div>
            <div style={{ fontFamily: handFont, fontSize: 12, color: INK_DIM, marginTop: 4, lineHeight: 1.3 }}>
              <em>"Showcase story would appear here…"</em>
            </div>

            {/* visible fields */}
            <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px dashed ${INK}` }}>
              {visible.length === 0 && (
                <div style={{ fontSize: 11, color: INK_MUTE, fontFamily: handFont, fontStyle: 'italic' }}>
                  no fields shared yet — toggle some on ↓
                </div>
              )}
              {visible.map(f => (
                <div key={f.id} style={{
                  display: 'flex', justifyContent: 'space-between',
                  fontSize: 11, padding: '2px 0',
                }}>
                  <span style={{ color: INK_DIM, fontFamily: handFont }}>{f.label}</span>
                  <span style={{ fontFamily: monoFont, fontSize: 10 }}>{f.val}</span>
                </div>
              ))}
            </div>
          </div>

          {/* toggle list */}
          <SectionLabel extra={`${visible.length} on`}>fields</SectionLabel>
          <div style={{
            border: `1.5px solid ${INK}`, borderRadius: 8,
            background: PAPER,
          }}>
            {fields.map((f, i) => (
              <div key={f.id} onClick={() => toggle(f.id)} style={{
                padding: '8px 10px',
                display: 'flex', alignItems: 'center', gap: 10,
                borderBottom: i === fields.length - 1 ? 'none' : `1px dashed ${INK_MUTE}`,
                cursor: 'pointer',
              }}>
                <Eye on={f.on}/>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontFamily: handFont }}>{f.label}</div>
                </div>
                <span style={{
                  fontFamily: monoFont, fontSize: 9, color: INK_DIM,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  maxWidth: 110, textAlign: 'right',
                }}>{f.val}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </WFFrame>
  );
}

/* ─────────────── Variation D: Sheet trigger ─────────────── */
function VariantD() {
  const [open, setOpen] = useStateW(true);
  const [fields, setFields] = useStateW([
    { group: 'identity', items: [
      { id: 'name', label: 'Piece name', on: true },
      { id: 'tags', label: 'Tags',       on: false },
      { id: 'dur',  label: 'Duration',   on: true },
    ]},
    { group: 'materials', items: [
      { id: 'clay',  label: 'Clay body', on: true },
      { id: 'wt',    label: 'Weight',    on: false },
      { id: 'glaze', label: 'Glazes',    on: true },
    ]},
    { group: 'firing', items: [
      { id: 'kiln', label: 'Kiln',      on: false },
      { id: 'cone', label: 'Cone',      on: false },
      { id: 'hold', label: 'Hold time', on: false },
    ]},
    { group: 'finishing', items: [
      { id: 'stamp', label: 'Maker stamp', on: true },
      { id: 'notes', label: 'Process notes', on: false },
    ]},
  ]);

  const toggle = (gi, ii) => setFields(fields.map((g, i) =>
    i === gi ? { ...g, items: g.items.map((it, j) => j === ii ? { ...it, on: !it.on } : it) } : g
  ));

  const total = fields.reduce((a, g) => a + g.items.length, 0);
  const on = fields.reduce((a, g) => a + g.items.filter(i => i.on).length, 0);

  return (
    <WFFrame label="Variation D · grouped sheet">
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        <TerminalHeader />
        <ProcessSummaryMini />

        <div style={{ padding: '0 16px' }}>
          <SectionLabel extra="terminal only">showcase story</SectionLabel>
          <div style={{
            border: `1.5px solid ${INK}`, borderRadius: 8,
            padding: '10px 12px', minHeight: 60,
            fontFamily: sketchFont, fontSize: 16, color: INK_DIM,
          }}>
            <span style={{ color: INK_MUTE }}>Add a story…</span>
          </div>
        </div>

        {/* Trigger row */}
        <div style={{ padding: '0 16px 80px' }}>
          <SectionLabel>showcase view</SectionLabel>
          <button onClick={() => setOpen(true)} style={{
            width: '100%', padding: '12px 14px',
            border: `1.5px solid ${INK}`, borderRadius: 8,
            background: PAPER,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            fontFamily: handFont, fontSize: 14, cursor: 'pointer',
          }}>
            <div style={{ textAlign: 'left' }}>
              <div>Choose visible fields</div>
              <div style={{ fontFamily: monoFont, fontSize: 10, color: INK_DIM, marginTop: 2 }}>
                {on}/{total} fields shared · grouped by section
              </div>
            </div>
            <span>→</span>
          </button>

          <button onClick={() => alert('preview')} style={{
            width: '100%', marginTop: 8, padding: '10px 14px',
            border: `1px dashed ${INK}`, borderRadius: 8,
            background: 'transparent', fontFamily: handFont, fontSize: 13, cursor: 'pointer',
          }}>
            👁 preview showcase
          </button>
        </div>

        {/* Bottom sheet */}
        {open && (
          <>
            <div onClick={() => setOpen(false)} style={{
              position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)',
              zIndex: 10,
            }}/>
            <div style={{
              position: 'absolute', left: 0, right: 0, bottom: 0,
              maxHeight: '78%', overflowY: 'auto',
              background: PAPER,
              borderTopLeftRadius: 18, borderTopRightRadius: 18,
              border: `1.5px solid ${INK}`, borderBottom: 'none',
              zIndex: 11,
              padding: '8px 0 18px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
                <div style={{ width: 40, height: 4, borderRadius: 2, background: INK }}/>
              </div>
              <div style={{ padding: '4px 16px 8px',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <div>
                  <div style={{ fontFamily: monoFont, fontSize: 9, letterSpacing: '0.12em',
                    textTransform: 'uppercase', color: INK_DIM }}>
                    customize public page
                  </div>
                  <div style={{ fontFamily: sketchFont, fontSize: 22, marginTop: 2 }}>
                    Showcase fields
                  </div>
                </div>
                <button onClick={() => setOpen(false)} style={{
                  width: 28, height: 28, borderRadius: '50%',
                  border: `1.5px solid ${INK}`, background: PAPER,
                  fontFamily: handFont, fontSize: 14, cursor: 'pointer',
                }}>×</button>
              </div>

              {fields.map((g, gi) => (
                <div key={g.group} style={{ padding: '8px 16px 4px' }}>
                  <div style={{
                    fontFamily: monoFont, fontSize: 9, letterSpacing: '0.14em',
                    textTransform: 'uppercase', color: INK_DIM,
                    paddingBottom: 4, borderBottom: `1px dashed ${INK_MUTE}`,
                    display: 'flex', justifyContent: 'space-between',
                  }}>
                    <span>{g.group}</span>
                    <span>{g.items.filter(i => i.on).length}/{g.items.length}</span>
                  </div>
                  {g.items.map((it, ii) => (
                    <div key={it.id} onClick={() => toggle(gi, ii)} style={{
                      padding: '8px 0',
                      display: 'flex', alignItems: 'center', gap: 10,
                      cursor: 'pointer',
                      borderBottom: ii === g.items.length - 1 ? 'none' : `1px dashed ${INK_MUTE}`,
                    }}>
                      <Box on={it.on} size={15}/>
                      <span style={{ fontSize: 13, fontFamily: handFont, flex: 1 }}>{it.label}</span>
                      <Eye on={it.on}/>
                    </div>
                  ))}
                </div>
              ))}

              <div style={{
                padding: '12px 16px 6px', display: 'flex', gap: 8,
                borderTop: `1.5px solid ${INK}`, marginTop: 8,
              }}>
                <button style={{ ...wfBtn(false), flex: 1 }}>Reset</button>
                <button onClick={() => setOpen(false)} style={{ ...wfBtn(true), flex: 1 }}>Done · {on} fields</button>
              </div>
            </div>
          </>
        )}
      </div>
    </WFFrame>
  );
}

/* shared button styles */
function wfBtn(filled) {
  return {
    flex: 'none',
    padding: '8px 14px',
    border: `1.5px solid ${INK}`, borderRadius: 6,
    background: filled ? INK : PAPER,
    color: filled ? PAPER : INK,
    fontFamily: handFont, fontSize: 13,
    cursor: 'pointer',
  };
}

Object.assign(window, { VariantA, VariantB, VariantC, VariantD });

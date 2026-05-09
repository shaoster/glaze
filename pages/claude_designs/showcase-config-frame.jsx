/* PotterDoc — Wireframe: Showcase Configuration (standalone frame)
 * Not PieceDetail. Reachable from PieceDetail.
 * Combines field picker (A) + live public preview (C).
 * Pencil icon on preview to edit Showcase Story.
 */

const { useState: useStateSC } = React;

const SC_INK = '#1a1a1a';
const SC_DIM = '#5a5a5a';
const SC_MUTE = '#9a9a9a';
const SC_PAPER = '#fafaf6';
const SC_PAPER_2 = '#f1efe7';
const SC_HILITE = '#fce98a';
const sketchSC = "'Caveat', cursive";
const handSC = "'Architects Daughter', cursive";
const monoSC = "'JetBrains Mono', monospace";

function SCEye({ on }) {
  return (
    <svg width="22" height="14" viewBox="0 0 24 14" fill="none" stroke={on ? SC_INK : SC_MUTE} strokeWidth="1.6">
      <path d="M1 7 Q12 -2 23 7 Q12 14 1 7 Z" />
      {on
        ? <circle cx="12" cy="7" r="2.2" fill={SC_INK}/>
        : <path d="M3 12 L21 2" stroke={SC_MUTE} strokeWidth="1.6"/>
      }
    </svg>
  );
}

function SCBox({ on, size = 16 }) {
  return (
    <span style={{
      display: 'inline-grid', placeItems: 'center',
      width: size, height: size,
      border: `1.5px solid ${SC_INK}`, borderRadius: 3,
      background: on ? SC_INK : 'transparent',
      flexShrink: 0,
    }}>
      {on && (
        <svg width={size * 0.7} height={size * 0.7} viewBox="0 0 16 16" fill="none">
          <path d="M3 8 L7 12 L13 4" stroke={SC_PAPER} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      )}
    </span>
  );
}

function Pencil({ size = 14, color = SC_INK }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9"/>
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
  );
}

function ShowcaseConfig() {
  const [fields, setFields] = useStateSC([
    { id: 'clay',     label: 'Clay body',      val: 'B-Mix stoneware',    on: true,  scope: 'piece' },
    { id: 'weight',   label: 'Clay weight',    val: '520 g',              on: false, scope: 'piece' },
    { id: 'tags',     label: 'Tags',           val: 'commission · gift',  on: true,  scope: 'piece' },
    { id: 'glazes',   label: 'Glazes',         val: 'Celadon, Iron wash', on: true,  scope: 'state' },
    { id: 'kiln',     label: 'Kiln · cone',    val: 'Kiln A · cone 6',    on: false, scope: 'state' },
    { id: 'stamp',    label: 'Maker stamp',    val: '⌒ swallow',          on: true,  scope: 'piece' },
    { id: 'notes',    label: 'Process notes',  val: 'tighter foot ring',  on: false, scope: 'state' },
    { id: 'dur',      label: 'Total duration', val: '14 days',            on: true,  scope: 'piece' },
  ]);
  const [story, setStory] = useStateSC('');
  const [editingStory, setEditingStory] = useStateSC(false);

  const toggle = (id) => setFields(fields.map(f => f.id === id ? { ...f, on: !f.on } : f));
  const visible = fields.filter(f => f.on);
  const sharedCount = visible.length;

  return (
    <div style={{
      height: '100%', background: SC_PAPER, color: SC_INK,
      fontFamily: handSC,
      display: 'flex', flexDirection: 'column',
      backgroundImage: 'repeating-linear-gradient(0deg, transparent 0 27px, rgba(0,0,0,0.04) 27px 28px)',
    }}>
      {/* Topbar — frame-specific */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 14px',
        borderBottom: `1.5px solid ${SC_INK}`, background: SC_PAPER,
      }}>
        <div style={{ fontFamily: handSC, fontSize: 13 }}>‹ back to piece</div>
        <div style={{
          fontFamily: monoSC, fontSize: 9, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: SC_DIM,
        }}>showcase setup</div>
        <button style={{
          padding: '4px 10px', border: `1.5px solid ${SC_INK}`,
          borderRadius: 999, background: SC_INK, color: SC_PAPER,
          fontFamily: handSC, fontSize: 12, cursor: 'pointer',
        }}>Share</button>
      </div>

      {/* Frame title */}
      <div style={{ padding: '14px 16px 4px' }}>
        <div style={{ fontFamily: sketchSC, fontSize: 28, lineHeight: 1 }}>
          Set up your showcase
        </div>
        <div style={{ fontSize: 12, color: SC_DIM, marginTop: 4, fontFamily: handSC, lineHeight: 1.35 }}>
          Choose what customers see on the public page, and write a story to go with it.
        </div>
      </div>

      {/* Two stacked panes — each scrolls independently so preview + picker stay visible together */}
      <div style={{
        flex: 1, minHeight: 0,
        display: 'flex', flexDirection: 'column',
        padding: '10px 16px 0',
      }}>
        {/* ── Pane 1 · Live preview (scrolls internally) ── */}
        <div style={{
          fontFamily: monoSC, fontSize: 9, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: SC_DIM,
          borderBottom: `1px dashed ${SC_DIM}`, paddingBottom: 2,
          marginBottom: 6, display: 'flex', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span>public preview</span>
          <span style={{ color: SC_MUTE }}>updates live · scroll ↕</span>
        </div>

        <div style={{
          flex: '1 1 50%', minHeight: 0,
          overflowY: 'auto',
          marginBottom: 10,
          border: `2px solid ${SC_INK}`, borderRadius: 14,
          background: SC_PAPER_2,
          position: 'relative',
        }}>
        <div style={{
          padding: 10, position: 'relative',
        }}>
          {/* corner tag */}
          <div style={{
            position: 'absolute', top: -10, right: 12,
            padding: '1px 8px', background: SC_HILITE,
            border: `1.5px solid ${SC_INK}`, borderRadius: 3,
            fontFamily: monoSC, fontSize: 9, letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}>what customers see</div>

          {/* hero photo placeholder */}
          <div style={{
            aspectRatio: '5/3', borderRadius: 8,
            background: `repeating-linear-gradient(45deg, ${SC_MUTE} 0 6px, ${SC_PAPER_2} 6px 12px)`,
            display: 'grid', placeItems: 'center',
            border: `1.5px solid ${SC_INK}`,
          }}>
            <span style={{
              background: SC_INK, color: SC_PAPER_2,
              padding: '2px 8px', fontFamily: monoSC, fontSize: 9, letterSpacing: '0.12em',
            }}>HERO PHOTO</span>
          </div>

          {/* Showcase story — editable inline with pencil */}
          <div style={{
            marginTop: 10, padding: '8px 10px',
            border: `1.5px ${story ? 'solid' : 'dashed'} ${SC_INK}`,
            borderRadius: 8, background: SC_PAPER,
            position: 'relative',
          }}>
            <div style={{
              fontFamily: monoSC, fontSize: 8, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: SC_DIM,
              marginBottom: 4,
            }}>showcase story</div>
            {editingStory ? (
              <textarea
                autoFocus
                value={story}
                onChange={(e) => setStory(e.target.value)}
                onBlur={() => setEditingStory(false)}
                placeholder="A small dish, thrown in B-Mix, glazed in celadon over an iron wash…"
                style={{
                  width: '100%', minHeight: 70, resize: 'vertical',
                  border: 'none', outline: 'none', background: 'transparent',
                  fontFamily: sketchSC, fontSize: 18, lineHeight: 1.25, color: SC_INK,
                  padding: 0, boxSizing: 'border-box',
                }}
              />
            ) : (
              <div
                onClick={() => setEditingStory(true)}
                style={{
                  fontFamily: sketchSC, fontSize: 18, lineHeight: 1.25,
                  color: story ? SC_INK : SC_MUTE,
                  cursor: 'text', minHeight: 50, paddingRight: 24,
                  fontStyle: story ? 'normal' : 'italic',
                }}
              >
                {story || 'Tap to write the story behind this piece…'}
              </div>
            )}
            {/* Pencil icon */}
            <button
              onClick={() => setEditingStory(true)}
              aria-label="Edit showcase story"
              style={{
                position: 'absolute', top: 8, right: 8,
                width: 26, height: 26, borderRadius: '50%',
                border: `1.5px solid ${SC_INK}`, background: SC_HILITE,
                display: 'grid', placeItems: 'center',
                cursor: 'pointer', padding: 0,
              }}
            >
              <Pencil size={13}/>
            </button>
          </div>

          {/* visible fields list */}
          <div style={{ marginTop: 10, paddingTop: 8, borderTop: `1px dashed ${SC_INK}` }}>
            <div style={{
              fontFamily: monoSC, fontSize: 8, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: SC_DIM,
              marginBottom: 4,
            }}>details ({visible.length})</div>
            {visible.length === 0 ? (
              <div style={{ fontSize: 11, color: SC_MUTE, fontFamily: handSC, fontStyle: 'italic' }}>
                no fields shared yet — turn some on below ↓
              </div>
            ) : visible.map(f => (
              <div key={f.id} style={{
                display: 'flex', justifyContent: 'space-between',
                fontSize: 11, padding: '3px 0',
                borderBottom: `1px dashed ${SC_MUTE}`,
              }}>
                <span style={{ color: SC_DIM, fontFamily: handSC }}>{f.label}</span>
                <span style={{ fontFamily: monoSC, fontSize: 10 }}>{f.val}</span>
              </div>
            ))}
          </div>
        </div>
        </div>

        {/* ── Pane 2 · Field picker (scrolls internally) ── */}
        <div style={{
          fontFamily: monoSC, fontSize: 9, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: SC_DIM,
          borderBottom: `1px dashed ${SC_DIM}`, paddingBottom: 2,
          marginBottom: 6, display: 'flex', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span>fields</span>
          <span style={{ color: SC_MUTE }}>{sharedCount}/{fields.length} shared · scroll ↕</span>
        </div>

        <div style={{
          flex: '1 1 50%', minHeight: 0,
          overflowY: 'auto',
          border: `1.5px solid ${SC_INK}`, borderRadius: 8,
          background: SC_PAPER,
          marginBottom: 10,
        }}>
          {fields.map((f, i) => (
            <div key={f.id}
              onClick={() => toggle(f.id)}
              style={{
                padding: '10px 12px',
                display: 'flex', alignItems: 'center', gap: 12,
                borderBottom: i === fields.length - 1 ? 'none' : `1px dashed ${SC_MUTE}`,
                cursor: 'pointer',
                background: f.on ? 'rgba(252, 233, 138, 0.35)' : 'transparent',
              }}>
              <SCBox on={f.on}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontFamily: handSC }}>{f.label}</div>
                <div style={{
                  fontSize: 10, fontFamily: monoSC, color: SC_DIM,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  {f.val}
                </div>
              </div>
              <span style={{
                fontFamily: monoSC, fontSize: 9, color: SC_MUTE,
                padding: '1px 5px', border: `1px dashed ${SC_MUTE}`, borderRadius: 3,
              }}>{f.scope}</span>
              <SCEye on={f.on}/>
            </div>
          ))}
          {/* add custom field hint — inside scrollable picker */}
          <div style={{
            margin: 8, padding: '8px 10px',
            border: `1px dashed ${SC_DIM}`, borderRadius: 6,
            fontSize: 11, fontFamily: handSC, color: SC_DIM,
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            cursor: 'pointer',
          }}>
            <span>+ pull in another field from this piece…</span>
            <span>+</span>
          </div>
        </div>
      </div>

      {/* Sticky footer */}
      <div style={{
        position: 'sticky', bottom: 0,
        padding: '10px 16px 14px',
        borderTop: `1.5px solid ${SC_INK}`,
        background: SC_PAPER,
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <div style={{ flex: 1, fontFamily: monoSC, fontSize: 10, color: SC_DIM }}>
          changes saved · piece-level config
        </div>
        <button style={{
          padding: '8px 14px', border: `1.5px solid ${SC_INK}`,
          borderRadius: 6, background: SC_PAPER, color: SC_INK,
          fontFamily: handSC, fontSize: 13, cursor: 'pointer',
        }}>Open public link ↗</button>
      </div>
    </div>
  );
}

Object.assign(window, { ShowcaseConfig });

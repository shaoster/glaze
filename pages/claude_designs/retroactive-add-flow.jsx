/* PotterDoc — Retroactive Add Flow (greybox storyboard)
 *
 * Storyboard for letting a potter bulk-add data for pieces that were already made
 * BEFORE PotterDoc was being used (or that they never logged live), and for
 * editing photos on already-sealed historical states.
 *
 * Key design pressure:
 *   - The "live" flow's authenticity comes from sealing each state when the
 *     potter advances. We must not water that down.
 *   - The retroactive flow exists in a parallel, clearly-labelled track.
 *     Every piece / state created this way is stamped "entered retroactively"
 *     and visually demoted (dashed border, "retro" label) wherever it shows up.
 *   - Editing photos on a sealed state is allowed only via the retroactive
 *     surface — not via the normal live flow.
 *
 * Greybox vocabulary mirrors summary-video-flow.jsx so the two boards look
 * like one design language.
 */

const { useState: useStateRA } = React;

const RA_BG       = 'oklch(0.96 0 0)';
const RA_FRAME    = 'oklch(0.99 0 0)';
const RA_BLOCK    = 'oklch(0.86 0 0)';
const RA_BLOCK_2  = 'oklch(0.78 0 0)';
const RA_OUT      = 'oklch(0.70 0 0)';
const RA_LINE     = 'oklch(0.80 0 0)';
const RA_LINE_S   = 'oklch(0.88 0 0)';
const RA_INK      = 'oklch(0.22 0 0)';
const RA_INK_DIM  = 'oklch(0.50 0 0)';
const RA_INK_MUTE = 'oklch(0.62 0 0)';
const RA_HILITE   = 'oklch(0.30 0 0)';
// "retro" mode tinge — slightly cool grey, never colour
const RA_RETRO_BG = 'oklch(0.93 0.005 240)';
const RA_RETRO_LN = 'oklch(0.62 0.010 240)';

/* ───────── primitives ───────── */

function MonoR({ children, size = 9, color = RA_INK_MUTE, weight = 500, style = {} }) {
  return (
    <span style={{
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: size,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color, fontWeight: weight,
      ...style,
    }}>{children}</span>
  );
}

function PhoneTopBarR({ title, back = 'Pieces', right }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px',
      borderBottom: `1px solid ${RA_LINE_S}`,
      background: RA_FRAME,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: RA_INK_DIM, fontSize: 11 }}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>‹</span>
        <span style={{ fontFamily: 'system-ui, sans-serif' }}>{back}</span>
      </div>
      <MonoR>{title}</MonoR>
      <div style={{ width: 18, textAlign: 'right' }}>
        {right && <MonoR size={9} color={RA_INK_DIM}>{right}</MonoR>}
      </div>
    </div>
  );
}

function RetroBadge({ size = 'sm', style = {} }) {
  const small = size === 'sm';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: small ? '1px 6px' : '2px 8px',
      border: `1px dashed ${RA_RETRO_LN}`,
      background: RA_RETRO_BG,
      borderRadius: 3,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: small ? 8 : 9,
      letterSpacing: '0.14em', textTransform: 'uppercase',
      color: RA_INK, fontWeight: 600,
      ...style,
    }}>
      <span style={{ fontSize: small ? 8 : 9 }}>↶</span>
      retro
    </span>
  );
}

/* ════════════════════════════════════════════════
   FRAME 1 — Entry point on the Pieces list
   ════════════════════════════════════════════════ */

function FrameR1_Entry() {
  return (
    <div style={{ height: '100%', background: RA_FRAME, display: 'flex', flexDirection: 'column' }}>
      <PhoneTopBarR title="pieces" back="Studio" />

      {/* Filter row */}
      <div style={{ padding: '10px 14px 8px', display: 'flex', gap: 6, borderBottom: `1px solid ${RA_LINE_S}` }}>
        <div style={{
          padding: '4px 9px', borderRadius: 999, background: RA_INK, color: RA_FRAME,
          fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>all · 14</div>
        <div style={{
          padding: '4px 9px', borderRadius: 999, border: `1px solid ${RA_LINE}`,
          fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: RA_INK_DIM, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>in&nbsp;progress</div>
        <div style={{
          padding: '4px 9px', borderRadius: 999, border: `1px solid ${RA_LINE}`,
          fontFamily: 'JetBrains Mono, monospace', fontSize: 9, color: RA_INK_DIM, letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>completed</div>
      </div>

      {/* Rows */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {[
          { name: 'Faceted vase',       state: 'trimmed',     when: 'Apr 20', live: true },
          { name: 'Coffee mug × 2',     state: 'glazed',      when: 'Apr 19', live: true },
          { name: 'Espresso cup',       state: 'glaze fired', when: 'Apr 14', live: true },
          { name: 'Noodle bowl',        state: 'completed',   when: 'Mar 30', live: true },
          { name: 'Round planter',      state: 'completed',   when: 'Feb 02', live: false },
          { name: 'Lidded jar (2024)',  state: 'completed',   when: 'Dec 11', live: false },
        ].map((p, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 14px', borderBottom: `1px solid ${RA_LINE_S}`,
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: 4,
              background: p.live ? RA_BLOCK : RA_RETRO_BG,
              border: p.live ? 'none' : `1px dashed ${RA_RETRO_LN}`,
            }}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontSize: 12.5, color: RA_INK, fontWeight: 500,
                fontFamily: 'system-ui, sans-serif',
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                {p.name}
                {!p.live && <RetroBadge/>}
              </div>
              <MonoR size={8} style={{ marginTop: 2 }}>{p.state} · {p.when}</MonoR>
            </div>
            <span style={{ color: RA_INK_MUTE, fontSize: 14 }}>›</span>
          </div>
        ))}
      </div>

      {/* Floating action stack — primary live FAB and the new retro option */}
      <div style={{
        position: 'absolute', bottom: 20, right: 16,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8,
        zIndex: 5,
      }}>
        {/* Secondary, smaller, dashed border */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 14px',
          background: RA_RETRO_BG,
          border: `1.5px dashed ${RA_INK}`,
          borderRadius: 999,
          boxShadow: '0 4px 10px oklch(0 0 0 / 0.08)',
        }}>
          <span style={{ fontSize: 13, lineHeight: 1, color: RA_INK }}>↶</span>
          <span style={{
            fontFamily: 'system-ui, sans-serif', fontSize: 12, fontWeight: 600, color: RA_INK,
          }}>Add past work</span>
        </div>

        {/* Primary live FAB */}
        <div style={{
          width: 52, height: 52, borderRadius: '50%',
          background: RA_INK, color: RA_FRAME,
          display: 'grid', placeItems: 'center',
          fontSize: 22, lineHeight: 1,
          boxShadow: '0 6px 14px oklch(0 0 0 / 0.18)',
        }}>+</div>
      </div>

      {/* Annotation flag */}
      <div style={{
        position: 'absolute', top: 64, right: 12,
        padding: '2px 7px',
        background: RA_INK, color: RA_FRAME,
        borderRadius: 4,
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 600,
      }}>new</div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   FRAME 2 — Define the piece (bulk-add intro)
   ════════════════════════════════════════════════ */

function FrameR2_Define() {
  return (
    <div style={{ height: '100%', background: RA_FRAME, display: 'flex', flexDirection: 'column' }}>
      <PhoneTopBarR title="add past work" back="Cancel" right="1/3"/>

      <div style={{ padding: '18px 18px 0' }}>
        <MonoR size={9}>step 1 · what is it</MonoR>
        <div style={{
          marginTop: 6,
          fontSize: 18, fontWeight: 600, color: RA_INK,
          fontFamily: 'system-ui, sans-serif', letterSpacing: '-0.01em',
          lineHeight: 1.25,
        }}>
          Log a piece you already made
        </div>
        <div style={{
          marginTop: 6, fontSize: 12, color: RA_INK_DIM,
          fontFamily: 'system-ui, sans-serif', lineHeight: 1.5,
        }}>
          We'll mark this as <strong style={{ color: RA_INK }}>retroactive</strong> so you and anyone you share with can tell it apart from pieces you logged live.
        </div>
      </div>

      {/* Authenticity callout */}
      <div style={{
        margin: '14px 18px 0',
        padding: '10px 12px',
        background: RA_RETRO_BG,
        border: `1px dashed ${RA_RETRO_LN}`,
        borderRadius: 8,
        display: 'flex', gap: 8, alignItems: 'flex-start',
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: 3,
          background: RA_INK, color: RA_FRAME,
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10, fontWeight: 700,
          display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 1,
        }}>↶</div>
        <div>
          <MonoR size={9} style={{ textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 600, color: RA_INK }}>
            retroactive piece
          </MonoR>
          <div style={{
            marginTop: 4,
            fontFamily: 'system-ui, sans-serif',
            fontSize: 11, color: RA_INK_DIM, lineHeight: 1.5,
          }}>
            States you enter here are <em>not</em> live-sealed. They're stamped with the date you enter them and labelled "added later."
          </div>
        </div>
      </div>

      {/* Form */}
      <div style={{
        margin: '14px 18px 0', display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <FieldR label="Name" value="Lidded jar (2024)" />
        <FieldR label="Type" value="vessel · jar" />
        <FieldR label="Clay body" value="Speckled brown" />
        <div style={{ display: 'flex', gap: 8 }}>
          <FieldR label="Made on" value="~ Dec 2024" mono/>
          <FieldR label="Completed" value="Dec 11 2024" mono/>
        </div>
      </div>

      <div style={{ flex: 1 }}/>

      <div style={{ padding: '12px 18px 18px', borderTop: `1px solid ${RA_LINE_S}` }}>
        <button style={{
          width: '100%', padding: '12px',
          background: RA_INK, border: 'none', borderRadius: 8,
          color: RA_FRAME, fontSize: 13, fontWeight: 600,
          fontFamily: 'system-ui, sans-serif',
        }}>Continue · build timeline ›</button>
      </div>
    </div>
  );
}

function FieldR({ label, value, mono }) {
  return (
    <div style={{
      flex: 1, padding: '8px 10px',
      border: `1px solid ${RA_LINE}`, borderRadius: 6, background: RA_FRAME,
    }}>
      <MonoR size={8}>{label}</MonoR>
      <div style={{
        marginTop: 3,
        fontFamily: mono ? 'JetBrains Mono, monospace' : 'system-ui, sans-serif',
        fontSize: 12, color: RA_INK,
      }}>{value}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   FRAME 3 — Timeline builder (THE core idea)
   ════════════════════════════════════════════════ */

function FrameR3_Timeline() {
  // Each row is a state on the main track; potter drops as many photos as they have
  // and skips states they have nothing for.
  const rows = [
    { state: 'designed',     have: 0, skip: true },
    { state: 'wheel thrown', have: 1, when: 'Nov ~2024' },
    { state: 'trimmed',      have: 0, skip: true },
    { state: 'bisque fired', have: 2, when: 'Nov 28 2024' },
    { state: 'glazed',       have: 1, when: 'Dec 03 2024' },
    { state: 'glaze fired',  have: 3, when: 'Dec 09 2024' },
    { state: 'completed',    have: 1, when: 'Dec 11 2024', terminal: true },
  ];

  return (
    <div style={{ height: '100%', background: RA_FRAME, display: 'flex', flexDirection: 'column' }}>
      <PhoneTopBarR title="build timeline" back="Back" right="2/3"/>

      <div style={{ padding: '14px 18px 8px' }}>
        <MonoR size={9}>step 2 · drop photos onto states</MonoR>
        <div style={{
          marginTop: 4,
          fontSize: 16, fontWeight: 600, color: RA_INK,
          fontFamily: 'system-ui, sans-serif', letterSpacing: '-0.01em',
        }}>
          Lidded jar (2024)
        </div>
        <div style={{ marginTop: 4, fontSize: 11, color: RA_INK_DIM, lineHeight: 1.5 }}>
          Skip any state you don't have. Order is fixed by the workflow, not by upload date.
        </div>
      </div>

      {/* Bulk drop zone */}
      <div style={{
        margin: '4px 18px 10px',
        padding: '10px 12px',
        border: `1.5px dashed ${RA_INK_DIM}`,
        borderRadius: 8,
        background: RA_RETRO_BG,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 6, background: RA_INK, color: RA_FRAME,
          display: 'grid', placeItems: 'center', flexShrink: 0,
          fontSize: 14,
        }}>+</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 12, fontWeight: 600, color: RA_INK,
          }}>Drop a batch of photos</div>
          <MonoR size={8} style={{ marginTop: 2, textTransform: 'none', letterSpacing: '0.02em' }}>
            We'll guess the state from EXIF date + your sequence
          </MonoR>
        </div>
        <MonoR size={8}>auto-sort</MonoR>
      </div>

      {/* Timeline */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 18px 12px', position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 26, top: 4, bottom: 12,
          width: 1, background: RA_LINE,
        }}/>
        {rows.map((r, i) => (
          <TimelineRowR key={i} {...r} active={i === 3}/>
        ))}
      </div>

      <div style={{
        padding: '10px 18px 16px',
        borderTop: `1px solid ${RA_LINE_S}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ flex: 1 }}>
          <MonoR size={8}>7 photos · 5/7 states logged</MonoR>
        </div>
        <button style={{
          padding: '11px 16px',
          background: RA_INK, border: 'none', borderRadius: 8,
          color: RA_FRAME, fontSize: 13, fontWeight: 600,
          fontFamily: 'system-ui, sans-serif',
        }}>Review ›</button>
      </div>
    </div>
  );
}

function TimelineRowR({ state, have, when, skip, terminal, active }) {
  return (
    <div style={{
      position: 'relative',
      padding: '8px 0 8px 38px',
      opacity: skip ? 0.55 : 1,
    }}>
      {/* node */}
      <div style={{
        position: 'absolute', left: 22, top: 12,
        width: 9, height: 9, borderRadius: '50%',
        background: skip ? RA_FRAME : have > 0 ? RA_INK : RA_FRAME,
        border: `1.5px solid ${skip ? RA_LINE : have > 0 ? RA_INK : RA_INK_DIM}`,
        boxShadow: active ? `0 0 0 4px ${RA_RETRO_BG}` : 'none',
      }}/>

      <div style={{
        padding: '8px 10px',
        border: `1px ${active ? 'solid' : have > 0 ? 'solid' : 'dashed'} ${active ? RA_INK : have > 0 ? RA_LINE : RA_OUT}`,
        borderRadius: 8,
        background: active ? RA_RETRO_BG : RA_FRAME,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
          <MonoR size={9} color={RA_INK} weight={600}>{state}</MonoR>
          {when && <MonoR size={8}>{when}</MonoR>}
          {skip && <MonoR size={8} color={RA_INK_MUTE}>skipped</MonoR>}
          {terminal && <MonoR size={8} color={RA_INK}>terminal</MonoR>}
        </div>

        {/* Photo strip */}
        {have > 0 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
            {Array.from({ length: have }).map((_, j) => (
              <div key={j} style={{
                width: 36, height: 36, borderRadius: 4,
                background: RA_BLOCK, border: `1px solid ${RA_LINE}`,
              }}/>
            ))}
            <div style={{
              width: 36, height: 36, borderRadius: 4,
              background: 'transparent', border: `1px dashed ${RA_OUT}`,
              display: 'grid', placeItems: 'center',
              fontSize: 14, color: RA_INK_MUTE,
            }}>+</div>
          </div>
        )}
        {have === 0 && !skip && (
          <div style={{
            marginTop: 6,
            padding: '8px 10px',
            border: `1px dashed ${RA_OUT}`, borderRadius: 6,
            background: 'transparent',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          }}>
            <MonoR size={8} style={{ textTransform: 'none', letterSpacing: '0.02em' }}>drop photo or skip</MonoR>
            <MonoR size={8}>+ add</MonoR>
          </div>
        )}
        {skip && (
          <div style={{ marginTop: 4 }}>
            <MonoR size={8} style={{ textTransform: 'none', letterSpacing: '0.02em' }}>
              No record · won't appear in history
            </MonoR>
          </div>
        )}
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   FRAME 4 — Review & seal
   ════════════════════════════════════════════════ */

function FrameR4_Review() {
  return (
    <div style={{ height: '100%', background: RA_FRAME, display: 'flex', flexDirection: 'column' }}>
      <PhoneTopBarR title="review" back="Back" right="3/3"/>

      <div style={{ padding: '14px 18px 0' }}>
        <MonoR size={9}>step 3 · confirm and save</MonoR>
        <div style={{
          marginTop: 4,
          fontSize: 16, fontWeight: 600, color: RA_INK,
          fontFamily: 'system-ui, sans-serif', letterSpacing: '-0.01em',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          Lidded jar (2024) <RetroBadge/>
        </div>
      </div>

      {/* Summary card */}
      <div style={{
        margin: '12px 18px 0',
        padding: '10px 12px',
        border: `1px solid ${RA_LINE}`, borderRadius: 8,
        display: 'flex', flexDirection: 'column', gap: 6,
      }}>
        <SummaryRowR label="states with photos" value="5 of 7"/>
        <SummaryRowR label="states skipped" value="2"/>
        <SummaryRowR label="total photos" value="8"/>
        <SummaryRowR label="dates" value="Nov 2024 — Dec 11 2024"/>
      </div>

      {/* What this means panel */}
      <div style={{
        margin: '14px 18px 0',
        padding: '12px 12px',
        border: `1px solid ${RA_INK}`,
        borderRadius: 8,
        background: RA_RETRO_BG,
      }}>
        <MonoR size={9} color={RA_INK} weight={600}>what saving does</MonoR>
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 5 }}>
          <RuleRowR text="Marks the piece as retroactive — visible on every screen"/>
          <RuleRowR text="States are sealed in workflow order, not by upload time"/>
          <RuleRowR text="History timestamp = the date you entered (not the date pottery happened)"/>
          <RuleRowR text="The piece can't be advanced live — it starts at 'completed'"/>
        </div>
      </div>

      {/* Edit-photos affordance preview */}
      <div style={{
        margin: '12px 18px 0',
        padding: '10px 12px',
        border: `1px dashed ${RA_OUT}`, borderRadius: 8,
        background: RA_FRAME,
      }}>
        <MonoR size={8} style={{ textTransform: 'none', letterSpacing: '0.02em' }}>
          You can come back to <strong style={{ color: RA_INK }}>any sealed state</strong> on this piece and add, swap, or delete photos. The audit log records each retro edit.
        </MonoR>
      </div>

      <div style={{ flex: 1 }}/>

      <div style={{
        padding: '10px 18px 18px', borderTop: `1px solid ${RA_LINE_S}`,
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <button style={{
          padding: '11px 12px',
          background: 'transparent', border: `1px solid ${RA_OUT}`, borderRadius: 8,
          color: RA_INK_DIM, fontSize: 12, fontFamily: 'system-ui, sans-serif',
        }}>Back</button>
        <button style={{
          flex: 1, padding: '12px',
          background: RA_INK, border: 'none', borderRadius: 8,
          color: RA_FRAME, fontSize: 13, fontWeight: 600,
          fontFamily: 'system-ui, sans-serif',
        }}>Save retroactive piece ›</button>
      </div>
    </div>
  );
}

function SummaryRowR({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
      <MonoR size={9}>{label}</MonoR>
      <span style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11, color: RA_INK, fontWeight: 600,
      }}>{value}</span>
    </div>
  );
}

function RuleRowR({ text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
      <span style={{
        marginTop: 1,
        width: 12, height: 12, borderRadius: 3,
        background: RA_INK, color: RA_FRAME,
        display: 'grid', placeItems: 'center',
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 9, fontWeight: 700, flexShrink: 0,
      }}>✓</span>
      <span style={{
        fontFamily: 'system-ui, sans-serif',
        fontSize: 11, color: RA_INK_DIM, lineHeight: 1.5,
      }}>{text}</span>
    </div>
  );
}

/* ════════════════════════════════════════════════
   FRAME 5 — Editing photos on a sealed past state
   (lives on PieceDetail · history sheet)
   ════════════════════════════════════════════════ */

function FrameR5_EditSealed() {
  return (
    <div style={{ height: '100%', background: RA_FRAME, display: 'flex', flexDirection: 'column' }}>
      <PhoneTopBarR title="bisque fired" back="Piece"/>

      {/* Sealed-state header */}
      <div style={{ padding: '14px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <MonoR size={9}>past state · sealed</MonoR>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '1px 6px', borderRadius: 3,
            background: RA_INK, color: RA_FRAME,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>
            <span>🔒</span> live-seal
          </span>
        </div>
        <div style={{
          marginTop: 4,
          fontSize: 18, fontWeight: 600, color: RA_INK,
          fontFamily: 'system-ui, sans-serif', letterSpacing: '-0.01em',
        }}>Bisque fired</div>
        <MonoR size={8} style={{ marginTop: 2, textTransform: 'none', letterSpacing: '0.02em' }}>
          Sealed Apr 27 · Cone 04 · 8h hold
        </MonoR>
      </div>

      {/* Existing photos with retro-edit affordance */}
      <div style={{ padding: '12px 18px 0' }}>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
          marginBottom: 6,
        }}>
          <MonoR size={9}>photos · 2</MonoR>
          {/* THE NEW THING — retro edit toggle */}
          <button style={{
            padding: '4px 9px',
            border: `1px dashed ${RA_INK}`, borderRadius: 999,
            background: RA_RETRO_BG,
            display: 'inline-flex', alignItems: 'center', gap: 5,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase',
            color: RA_INK, fontWeight: 600,
          }}>
            <span>↶</span>edit retroactively
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[0,1].map(i => (
            <div key={i} style={{
              aspectRatio: '1', borderRadius: 6,
              background: RA_BLOCK_2, border: `1px solid ${RA_LINE}`,
              position: 'relative',
            }}>
              <div style={{
                position: 'absolute', bottom: 4, left: 4,
                padding: '1px 5px', borderRadius: 2,
                background: 'oklch(0 0 0 / 0.6)', color: RA_FRAME,
                fontFamily: 'JetBrains Mono, monospace', fontSize: 8,
              }}>orig · apr 27</div>
            </div>
          ))}
        </div>
      </div>

      {/* Active retro-edit panel */}
      <div style={{
        margin: '14px 18px 0',
        padding: '12px',
        border: `1.5px dashed ${RA_INK}`,
        borderRadius: 10,
        background: RA_RETRO_BG,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <RetroBadge size="md"/>
          <MonoR size={9} color={RA_INK} weight={600}>edit mode · this state only</MonoR>
        </div>
        <div style={{
          fontFamily: 'system-ui, sans-serif',
          fontSize: 11, color: RA_INK_DIM, lineHeight: 1.5, marginBottom: 8,
        }}>
          The state's seal stays — only its <strong style={{ color: RA_INK }}>media</strong> can change.
          Field values, dates, and the order of states are locked.
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 5 }}>
          <PhotoChipR label="add" kind="add"/>
          <PhotoChipR label="replace" kind="replace"/>
          <PhotoChipR label="delete" kind="delete"/>
        </div>

        <div style={{
          marginTop: 8, paddingTop: 8,
          borderTop: `1px dashed ${RA_OUT}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <MonoR size={8} style={{ textTransform: 'none', letterSpacing: '0.02em' }}>
            logged to audit · "media-edit · {`{user}`} · {`{ts}`}"
          </MonoR>
          <MonoR size={8} color={RA_INK} weight={600}>2 pending</MonoR>
        </div>
      </div>

      {/* What you can't do — explicit guard rail */}
      <div style={{
        margin: '10px 18px 0',
        padding: '10px 12px',
        border: `1px dashed ${RA_OUT}`,
        borderRadius: 8,
      }}>
        <MonoR size={8} style={{ textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 600, color: RA_INK }}>
          locked
        </MonoR>
        <ul style={{
          margin: '4px 0 0', paddingLeft: 14,
          fontFamily: 'system-ui, sans-serif', fontSize: 11, color: RA_INK_DIM,
          lineHeight: 1.6,
        }}>
          <li>Change the sealed date or fields</li>
          <li>Reorder past states</li>
          <li>Change the live successor of the current state</li>
        </ul>
      </div>

      <div style={{ flex: 1 }}/>

      <div style={{
        padding: '10px 18px 18px', borderTop: `1px solid ${RA_LINE_S}`,
        display: 'flex', gap: 8,
      }}>
        <button style={{
          padding: '11px 12px',
          background: 'transparent', border: `1px solid ${RA_OUT}`, borderRadius: 8,
          color: RA_INK_DIM, fontSize: 12, fontFamily: 'system-ui, sans-serif',
        }}>Cancel</button>
        <button style={{
          flex: 1, padding: '12px',
          background: RA_INK, border: 'none', borderRadius: 8,
          color: RA_FRAME, fontSize: 13, fontWeight: 600,
          fontFamily: 'system-ui, sans-serif',
        }}>Apply 2 changes ›</button>
      </div>
    </div>
  );
}

function PhotoChipR({ label, kind }) {
  return (
    <div style={{
      padding: '8px 6px',
      border: `1px solid ${RA_INK}`, borderRadius: 6,
      background: RA_FRAME,
      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: 4,
        background: kind === 'delete' ? RA_FRAME : RA_INK,
        color: kind === 'delete' ? RA_INK : RA_FRAME,
        border: kind === 'delete' ? `1px solid ${RA_INK}` : 'none',
        display: 'grid', placeItems: 'center',
        fontFamily: 'JetBrains Mono, monospace', fontSize: 12, fontWeight: 700,
      }}>
        {kind === 'add' && '+'}
        {kind === 'replace' && '↻'}
        {kind === 'delete' && '×'}
      </div>
      <MonoR size={8} color={RA_INK}>{label}</MonoR>
    </div>
  );
}

/* ───────── canvas storyboard ───────── */

function FrameWrapR({ idx, title, hint, future, children, dataLabel }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 320 }} data-screen-label={dataLabel}>
      <div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11, fontWeight: 600, color: RA_INK,
            padding: '2px 8px', background: RA_FRAME,
            border: `1px solid ${RA_OUT}`, borderRadius: 4,
          }}>{String(idx).padStart(2, '0')}</div>
          <div style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 18, fontWeight: 600, color: RA_INK, letterSpacing: '-0.01em',
          }}>{title}</div>
        </div>
        <div style={{
          fontFamily: 'system-ui, sans-serif', fontSize: 12, color: RA_INK_DIM,
          marginTop: 6, lineHeight: 1.5, maxWidth: 320,
        }}>{hint}</div>
      </div>

      <div style={{
        background: RA_FRAME,
        border: `1px solid ${RA_OUT}`,
        borderRadius: 28, padding: 6,
        boxShadow: '0 2px 0 oklch(0 0 0 / 0.04)',
      }}>
        <div style={{
          width: 308, height: 580,
          borderRadius: 22, overflow: 'hidden',
          border: `1px solid ${RA_LINE_S}`,
          position: 'relative',
        }}>
          {children}
        </div>
      </div>

      {future && (
        <div style={{
          padding: '10px 12px',
          background: 'oklch(0.92 0 0)',
          border: `1px dashed ${RA_INK_DIM}`, borderRadius: 8,
          maxWidth: 320,
        }}>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: RA_INK, marginBottom: 6, fontWeight: 600,
          }}>↗ design note</div>
          <div style={{
            fontFamily: 'system-ui, sans-serif', fontSize: 12,
            color: RA_INK_DIM, lineHeight: 1.5,
          }}>{future}</div>
        </div>
      )}
    </div>
  );
}

function ArrowR({ label }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 6, alignSelf: 'flex-start', paddingTop: 280,
    }}>
      <MonoR size={9}>{label}</MonoR>
      <svg width="80" height="22" viewBox="0 0 80 22" fill="none">
        <path d="M 4 11 L 72 11" stroke={RA_INK} strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M 64 5 L 74 11 L 64 17" stroke={RA_INK} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    </div>
  );
}

/* ───────── root ───────── */

function RetroactiveAddFlow() {
  return (
    <div style={{
      minHeight: '100vh',
      background: RA_BG,
      padding: '40px 32px 80px',
      fontFamily: 'system-ui, sans-serif',
      color: RA_INK,
      backgroundImage: `linear-gradient(${RA_LINE_S} 1px, transparent 1px),
                        linear-gradient(90deg, ${RA_LINE_S} 1px, transparent 1px)`,
      backgroundSize: '24px 24px',
    }}>
      {/* Header */}
      <div style={{ maxWidth: 1400, margin: '0 auto 32px' }}>
        <MonoR size={10}>potterdoc · wireframe · v1</MonoR>
        <h1 style={{
          margin: '8px 0 8px',
          fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em', color: RA_INK,
        }}>
          Retroactive add — bulk-log finished pieces
        </h1>
        <div style={{ fontSize: 14, color: RA_INK_DIM, lineHeight: 1.55, maxWidth: 760 }}>
          Two related flows on one board. <strong style={{ color: RA_INK }}>(1)</strong> Bulk-add a piece that already exists in the studio
          but was never logged live (a 2024 jar, a commission finished last week). <strong style={{ color: RA_INK }}>(2)</strong> Edit photos on a state that has already
          been live-sealed. Both ride on the existing sealed-edit API, but live behind a clearly demoted, dashed-bordered "retro" surface so
          live-logged pieces stay the canonical record.
        </div>

        {/* Principles */}
        <div style={{
          marginTop: 18,
          padding: '14px 16px',
          background: RA_FRAME,
          border: `1px solid ${RA_LINE}`,
          borderRadius: 10,
          maxWidth: 760,
        }}>
          <MonoR size={10} color={RA_INK} weight={600}>three rules that protect the live flow</MonoR>
          <ol style={{
            margin: '8px 0 0', paddingLeft: 18, fontSize: 13, color: RA_INK_DIM,
            lineHeight: 1.6,
          }}>
            <li><strong style={{ color: RA_INK }}>Visual demotion.</strong> Every retroactive piece and every retro-edited media item carries a dashed border + "↶ retro" badge. List rows, history timeline nodes, and shared public pages all show it. You can never confuse retro for live.</li>
            <li><strong style={{ color: RA_INK }}>Order is fixed; time is honest.</strong> States are still sealed in the workflow's prescribed order. The seal timestamp records when the entry was made, not when the pottery happened. Both timestamps are visible.</li>
            <li><strong style={{ color: RA_INK }}>Retro edits are media-only.</strong> On a live-sealed state, retroactive editing can add/swap/delete photos but cannot change field values, dates, or the state's place in history. Every change is audit-logged.</li>
          </ol>
        </div>

        {/* Legend */}
        <div style={{
          marginTop: 14,
          display: 'flex', flexWrap: 'wrap', gap: 14,
          padding: '10px 14px',
          background: RA_FRAME,
          border: `1px solid ${RA_LINE}`, borderRadius: 8,
          maxWidth: 760,
        }}>
          <LegendR swatch={<div style={{ width: 14, height: 10, background: RA_BLOCK, borderRadius: 2 }}/>} text="content block"/>
          <LegendR swatch={<div style={{ width: 14, height: 10, border: `1px dashed ${RA_OUT}`, borderRadius: 2 }}/>} text="placeholder"/>
          <LegendR swatch={<RetroBadge/>} text="retroactive"/>
          <LegendR swatch={<div style={{
            padding: '1px 5px', background: RA_INK, color: RA_FRAME,
            fontFamily: 'JetBrains Mono, monospace', fontSize: 7, fontWeight: 600,
            letterSpacing: '0.14em', borderRadius: 2,
          }}>NEW</div>} text="new surface"/>
          <LegendR swatch={<div style={{
            width: 14, height: 10, background: RA_RETRO_BG,
            border: `1px dashed ${RA_RETRO_LN}`, borderRadius: 2,
          }}/>} text="retro tinge"/>
        </div>
      </div>

      {/* Storyboard rail */}
      <div style={{
        display: 'flex', alignItems: 'flex-start', gap: 0,
        overflowX: 'auto', paddingBottom: 24,
      }}>
        <FrameWrapR
          idx={1}
          dataLabel="01 Pieces · entry point"
          title="Pieces · entry"
          hint="The list view picks up a secondary, dashed-bordered FAB labelled 'Add past work', sitting just above the live '+' FAB. Already-retroactive rows in the list show the same ↶ retro badge so the affordance and its output line up."
          future="Demoted styling (dashed, smaller) on purpose: the canonical way to add a piece is still the live flow. This is for catch-up work."
        ><FrameR1_Entry/></FrameWrapR>

        <ArrowR label="tap"/>

        <FrameWrapR
          idx={2}
          dataLabel="02 Define piece"
          title="Define piece"
          hint="Step 1 of 3. Same field shape as a live piece (name, type, clay body) plus two retro-only date fields: 'Made on' (the potter's memory) and 'Completed'. The retro callout sets expectations before the timeline step."
          future="'Made on' is fuzzy on purpose — supports '~ Dec 2024' or even 'spring 2023'. The system prefers fuzzy honest dates over fake-precise ones."
        ><FrameR2_Define/></FrameWrapR>

        <ArrowR label="continue"/>

        <FrameWrapR
          idx={3}
          dataLabel="03 Build timeline"
          title="Build timeline"
          hint="Step 2 of 3 — the heart of bulk add. A vertical list of every state on the workflow track. The potter drops one or many photos onto each state, optionally a date, or skips it. A bulk drop zone at top auto-sorts a batch of photos by EXIF date into states."
          future="Skipping a state ≠ deleting it; the timeline shows 'no record' rather than pretending the state didn't happen. Order is workflow-fixed, not upload-order, so a misplaced photo can't fake a different process."
        ><FrameR3_Timeline/></FrameWrapR>

        <ArrowR label="review"/>

        <FrameWrapR
          idx={4}
          dataLabel="04 Review · seal"
          title="Review · seal"
          hint="Step 3 of 3. Summary numbers + the contract the potter is signing: piece is marked retro, states sealed in workflow order, history timestamp = now, no live advancement. Retro-edit affordance for media is foreshadowed."
          future="Saving creates 5 sealed states in a single transaction, all with the same seal timestamp (= now). Each state's 'happened on' is the date entered in the timeline step (or null/fuzzy)."
        ><FrameR4_Review/></FrameWrapR>

        <ArrowR label="later"/>

        <FrameWrapR
          idx={5}
          dataLabel="05 Edit sealed media"
          title="Edit sealed media"
          hint="The other use case: a live-logged piece where the potter notices its 'bisque fired' photos are missing or wrong. Tapping a past state on PieceDetail opens this view. 'Edit retroactively' opens an explicit, dashed-bordered media-only editor — fields stay locked."
          future="The same retro track powers both flows. The audit log entry distinguishes 'retro-piece-create' from 'retro-media-edit' so an admin can review."
        ><FrameR5_EditSealed/></FrameWrapR>
      </div>

      {/* Open questions */}
      <div style={{ maxWidth: 1400, margin: '40px auto 0' }}>
        <MonoR size={10}>open questions</MonoR>
        <ul style={{
          marginTop: 10, paddingLeft: 18,
          fontSize: 13, color: RA_INK_DIM, lineHeight: 1.7,
          fontFamily: 'system-ui, sans-serif',
          listStyle: 'square',
        }}>
          <li>Should retro pieces show up in stats / streaks / "pieces this month" aggregations? Default proposal: no, with a toggle.</li>
          <li>Per-photo retro badge in the public share page, or only at the piece level? Per-photo is more honest but visually noisier.</li>
          <li>Live-logged piece, retro-added photo on an old state — does it carry a per-photo "↶ added later" mark in the gallery? Strong yes, weak yes?</li>
          <li>Bulk-import N pieces in one session: worth a dedicated multi-piece workflow, or do we just iterate the single-piece flow?</li>
          <li>Should we ever allow retro field-value edits (e.g. fixing a wrong clay body on a 2024 piece) under heavy audit? Or strictly media-only forever?</li>
        </ul>
      </div>
    </div>
  );
}

function LegendR({ swatch, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {swatch}
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: RA_INK_DIM }}>{text}</span>
    </div>
  );
}

Object.assign(window, { RetroactiveAddFlow });

/* PotterDoc — Summary Video Flow (greybox storyboard)
 *
 * 4 frames showing the proposed one-click AI summary video flow,
 * starting from PieceDetail (terminal state).
 *
 * Greybox vocabulary:
 *   - WB_BG      page background
 *   - WB_BLOCK   solid content block (filled grey rectangle)
 *   - WB_OUT     outlined block
 *   - WB_DASH    dashed placeholder
 *   - WB_INK     primary text/lines
 *   - WB_INK_DIM secondary
 *   - mono labels, no color, no real imagery
 *   - the only "branded" thing left in: monospace data labels, matching the rest of PotterDoc
 */

const { useState: useStateSV, useEffect: useEffectSV } = React;

const WB_BG       = 'oklch(0.96 0 0)';
const WB_FRAME    = 'oklch(0.99 0 0)';
const WB_BLOCK    = 'oklch(0.86 0 0)';
const WB_BLOCK_2  = 'oklch(0.78 0 0)';
const WB_OUT      = 'oklch(0.70 0 0)';
const WB_LINE     = 'oklch(0.80 0 0)';
const WB_LINE_S   = 'oklch(0.88 0 0)';
const WB_INK      = 'oklch(0.22 0 0)';
const WB_INK_DIM  = 'oklch(0.50 0 0)';
const WB_INK_MUTE = 'oklch(0.62 0 0)';
const WB_HILITE   = 'oklch(0.30 0 0)';   // for "this is the new thing" call-outs

/* ───────────────── primitives ───────────────── */

function Mono({ children, size = 9, color = WB_INK_MUTE, weight = 500, style = {} }) {
  return (
    <span style={{
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: size,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      color,
      fontWeight: weight,
      ...style,
    }}>{children}</span>
  );
}

function Block({ h = 16, w = '100%', dashed = false, fill = WB_BLOCK, label, children, style = {} }) {
  return (
    <div style={{
      width: w,
      height: h,
      background: dashed ? 'transparent' : fill,
      border: dashed ? `1px dashed ${WB_OUT}` : 'none',
      borderRadius: 3,
      display: label || children ? 'flex' : 'block',
      alignItems: 'center',
      justifyContent: 'center',
      color: WB_INK_MUTE,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 9,
      letterSpacing: '0.1em',
      textTransform: 'uppercase',
      ...style,
    }}>
      {label}
      {children}
    </div>
  );
}

function TextLines({ count = 2, widths }) {
  const ws = widths || Array.from({length: count}, (_, i) => `${100 - i*15}%`);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {ws.map((w, i) => (
        <div key={i} style={{ height: 6, width: w, background: WB_BLOCK, borderRadius: 2 }}/>
      ))}
    </div>
  );
}

/* ───────────────── topbar / chrome shared by all frames ───────────────── */

function PhoneTopBar({ title, back = 'Pieces' }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 14px',
      borderBottom: `1px solid ${WB_LINE_S}`,
      background: WB_FRAME,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: WB_INK_DIM, fontSize: 11 }}>
        <span style={{ fontSize: 16, lineHeight: 1 }}>‹</span>
        <span style={{ fontFamily: 'system-ui, sans-serif' }}>{back}</span>
      </div>
      <Mono>{title}</Mono>
      <div style={{ width: 18 }}/>
    </div>
  );
}

/* ════════════════════════════════════════════════
   FRAME 1 — PieceDetail with new CTA
   "Make summary video" surfaces because state is terminal.
   ════════════════════════════════════════════════ */

function Frame1_Detail() {
  return (
    <div style={{ height: '100%', background: WB_FRAME, display: 'flex', flexDirection: 'column' }}>
      <PhoneTopBar title="piece detail" />

      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

        {/* Hero photo block */}
        <div style={{
          height: 150,
          background: WB_BLOCK,
          borderBottom: `1px solid ${WB_LINE_S}`,
          display: 'grid', placeItems: 'center',
          position: 'relative',
        }}>
          <Mono size={9}>hero photo</Mono>
          <div style={{
            position: 'absolute', bottom: 8, left: 12,
            display: 'flex', gap: 3,
          }}>
            {[0,1,2].map(i => (
              <div key={i} style={{
                width: i === 0 ? 14 : 5, height: 5, borderRadius: 3,
                background: i === 0 ? WB_INK : WB_INK_MUTE, opacity: i === 0 ? 1 : 0.5,
              }}/>
            ))}
          </div>
          <div style={{
            position: 'absolute', bottom: 8, right: 12,
            padding: '3px 8px', borderRadius: 999,
            background: 'oklch(1 0 0 / 0.85)',
            border: `1px solid ${WB_LINE}`,
          }}>
            <Mono size={8}>3 photos</Mono>
          </div>
        </div>

        {/* Title block */}
        <div style={{ padding: '14px 16px 8px' }}>
          <Mono size={8} style={{ marginBottom: 4 }}>piece · created apr 24</Mono>
          <div style={{
            fontSize: 18, fontWeight: 600, color: WB_INK,
            fontFamily: 'system-ui, sans-serif', letterSpacing: '-0.01em',
          }}>
            Jewelry Dish
          </div>
          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
            <Block h={14} w={48} fill={WB_BLOCK_2} style={{ borderRadius: 999 }} label="plate"/>
            <Block h={14} w={62} fill={WB_BLOCK_2} style={{ borderRadius: 999 }} label="decorative"/>
          </div>
        </div>

        {/* Terminal-state hub — note: NO successor pills, replaced with completion */}
        <div style={{
          margin: '6px 16px 12px',
          padding: '10px 12px',
          border: `1px solid ${WB_LINE}`,
          borderRadius: 8,
          background: 'oklch(0.94 0 0)',
        }}>
          <Mono size={8} style={{ marginBottom: 8 }}>state</Mono>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              padding: '5px 11px', borderRadius: 999,
              background: WB_HILITE, color: WB_FRAME,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10, fontWeight: 600,
              display: 'inline-flex', alignItems: 'center', gap: 6,
            }}>
              <span style={{
                width: 5, height: 5, borderRadius: '50%', background: WB_FRAME,
              }}/>
              fired · complete
            </div>
            <Mono size={8}>terminal</Mono>
          </div>
        </div>

        {/* ⭐ NEW CTA — Make summary video */}
        <div style={{ margin: '0 16px 12px', position: 'relative' }}>
          <div style={{
            padding: '14px 14px',
            border: `2px solid ${WB_INK}`,
            borderRadius: 10,
            background: WB_FRAME,
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: 8,
              background: WB_INK,
              display: 'grid', placeItems: 'center',
              flexShrink: 0,
            }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={WB_FRAME} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="6 4 20 12 6 20 6 4"/>
              </svg>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: 'system-ui, sans-serif',
                fontSize: 14, fontWeight: 600, color: WB_INK,
                letterSpacing: '-0.005em',
              }}>
                Make summary video
              </div>
              <Mono size={9} style={{ marginTop: 3, textTransform: 'none', letterSpacing: '0.02em' }}>
                Auto-built from this piece's history
              </Mono>
            </div>
            <span style={{ color: WB_INK_DIM, fontSize: 16 }}>›</span>
          </div>

          {/* Annotation flag */}
          <NewBadge />
        </div>

        {/* Compressed remaining sections */}
        <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 8, opacity: 0.65 }}>
          <Block h={42} dashed label="piece details"/>
          <Block h={36} dashed label="notes"/>
          <Block h={48} dashed label="history · 6 past states"/>
        </div>

        <div style={{ flex: 1 }}/>
      </div>
    </div>
  );
}

function NewBadge() {
  return (
    <div style={{
      position: 'absolute', top: -8, right: 10,
      padding: '2px 7px',
      background: WB_INK, color: WB_FRAME,
      borderRadius: 4,
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase',
      fontWeight: 600,
    }}>new</div>
  );
}

/* ════════════════════════════════════════════════
   FRAME 2 — Pick style (the only decision, up front)
   ════════════════════════════════════════════════ */

function Frame2_StylePicker() {
  return (
    <div style={{ height: '100%', background: WB_FRAME, display: 'flex', flexDirection: 'column' }}>
      <PhoneTopBar title="pick a style" back="Cancel"/>

      <div style={{ padding: '20px 18px 0' }}>
        <Mono size={9}>step 1 · choose how it feels</Mono>
        <div style={{
          marginTop: 6,
          fontSize: 18, fontWeight: 600, color: WB_INK,
          fontFamily: 'system-ui, sans-serif', letterSpacing: '-0.01em',
          lineHeight: 1.25,
        }}>
          What's this video for?
        </div>
        <div style={{
          marginTop: 6, fontSize: 12, color: WB_INK_DIM,
          fontFamily: 'system-ui, sans-serif', lineHeight: 1.5,
        }}>
          Each style retemplates the same source material. You can switch later.
        </div>
      </div>

      {/* Big preset cards stacked */}
      <div style={{
        margin: '18px 18px 0',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        <PresetCard label="Keepsake" sub="Slow paced · serif titles · journal voice" sample="for me" active/>
        <PresetCard label="Social" sub="Vertical · captions · upbeat cuts" sample="9:16"/>
        <PresetCard label="For sale" sub="Polished · price + dims · CTA card" sample="listing"/>
      </div>

      {/* "what's in it" — assets summary, fixed */}
      <div style={{
        margin: '16px 18px 0',
        padding: '10px 12px',
        border: `1px dashed ${WB_OUT}`,
        borderRadius: 8,
      }}>
        <Mono size={8} style={{ textTransform: 'none', letterSpacing: '0.02em' }}>
          source · 14 photos · 7 states · 6 notes · 4 measurements · glaze recipe
        </Mono>
      </div>

      <div style={{ flex: 1 }}/>

      <div style={{ padding: '12px 18px 18px', borderTop: `1px solid ${WB_LINE_S}` }}>
        <button style={{
          width: '100%', padding: '12px',
          background: WB_INK,
          border: 'none', borderRadius: 8,
          color: WB_FRAME, fontSize: 13, fontWeight: 600,
          fontFamily: 'system-ui, sans-serif',
        }}>Generate ›</button>
      </div>
    </div>
  );
}

function PresetCard({ label, sub, sample, active }) {
  return (
    <div style={{
      padding: '12px 14px',
      border: `${active ? 2 : 1}px solid ${active ? WB_INK : WB_OUT}`,
      borderRadius: 10,
      background: active ? 'oklch(0.94 0 0)' : WB_FRAME,
      display: 'flex', alignItems: 'center', gap: 12,
    }}>
      <div style={{
        width: 44, height: 56, borderRadius: 4,
        background: WB_BLOCK_2,
        border: `1px solid ${WB_OUT}`,
        flexShrink: 0,
        display: 'grid', placeItems: 'center',
      }}>
        <Mono size={7} color={WB_INK_DIM}>{sample}</Mono>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: 'system-ui, sans-serif',
          fontSize: 14, fontWeight: 600, color: WB_INK,
        }}>{label}</div>
        <Mono size={9} style={{ marginTop: 3, textTransform: 'none', letterSpacing: '0.02em' }}>
          {sub}
        </Mono>
      </div>
      <div style={{
        width: 18, height: 18, borderRadius: '50%',
        border: `1.5px solid ${active ? WB_INK : WB_OUT}`,
        background: active ? WB_INK : 'transparent',
        display: 'grid', placeItems: 'center',
      }}>
        {active && (
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={WB_FRAME} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
      </div>
    </div>
  );
}

function AssetRow({ label, count, done, active, pending }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <div style={{
        width: 14, height: 14, borderRadius: '50%',
        background: done ? WB_INK : active ? WB_FRAME : WB_FRAME,
        border: `1.5px solid ${done ? WB_INK : active ? WB_INK : WB_OUT}`,
        display: 'grid', placeItems: 'center',
        flexShrink: 0,
      }}>
        {done && (
          <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke={WB_FRAME} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        )}
        {active && (
          <div style={{
            width: 5, height: 5, borderRadius: '50%', background: WB_INK,
            animation: 'svPulse 0.9s ease-in-out infinite',
          }}/>
        )}
      </div>
      <div style={{ flex: 1, fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
        color: pending ? WB_INK_MUTE : WB_INK_DIM,
      }}>
        {label}
      </div>
      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 9,
        color: WB_INK_MUTE,
      }}>{count}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   FRAME 3 — Preview + style preset
   The single decision point. Tap a preset, see the preview reflow.
   ════════════════════════════════════════════════ */

function Frame3_Rendering() {
  return (
    <div style={{ height: '100%', background: WB_FRAME, display: 'flex', flexDirection: 'column' }}>
      <PhoneTopBar title="rendering" back="Cancel"/>

      <div style={{ padding: '20px 18px 0' }}>
        <Mono size={9}>step 2 · keepsake style</Mono>
        <div style={{
          marginTop: 6,
          fontSize: 18, fontWeight: 600, color: WB_INK,
          fontFamily: 'system-ui, sans-serif', letterSpacing: '-0.01em',
          lineHeight: 1.25,
        }}>
          Pulling everything together…
        </div>
      </div>

      {/* Asset checklist as loading visualization */}
      <div style={{
        margin: '20px 18px 0',
        padding: 16,
        border: `1px solid ${WB_LINE}`,
        borderRadius: 10,
        background: 'oklch(0.97 0 0)',
      }}>
        <Mono size={8} style={{ marginBottom: 12 }}>collecting from history</Mono>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          <AssetRow label="photos · all states" count="14" done/>
          <AssetRow label="state timeline" count="7 events" done/>
          <AssetRow label="measurements" count="4 fields" done/>
          <AssetRow label="glaze recipe" count="2 layers" done/>
          <AssetRow label="notes · journal" count="6 entries" active/>
          <AssetRow label="composing scenes" count="" pending/>
          <AssetRow label="rendering" count="" pending/>
        </div>

        <div style={{
          marginTop: 14,
          height: 4, background: WB_LINE_S, borderRadius: 99, overflow: 'hidden',
        }}>
          <div style={{
            height: '100%', width: '64%', background: WB_INK, borderRadius: 99,
          }}/>
        </div>
        <div style={{
          marginTop: 6, display: 'flex', justifyContent: 'space-between',
        }}>
          <Mono size={8}>~8s remaining</Mono>
          <Mono size={8}>64%</Mono>
        </div>
      </div>

      <div style={{
        margin: '14px 18px 0',
        padding: 12,
        border: `1px dashed ${WB_OUT}`,
        borderRadius: 8,
      }}>
        <Mono size={8} style={{ textTransform: 'none', letterSpacing: '0.02em' }}>
          You can leave this screen — we'll notify you when it's ready.
        </Mono>
      </div>

      <div style={{ flex: 1 }}/>

      <div style={{
        padding: '12px 18px 18px',
        borderTop: `1px solid ${WB_LINE_S}`,
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <button style={{
          padding: '11px 12px',
          background: 'transparent',
          border: `1px solid ${WB_OUT}`,
          borderRadius: 8,
          color: WB_INK_DIM, fontSize: 12,
          fontFamily: 'system-ui, sans-serif',
        }}>Cancel</button>
        <button style={{
          flex: 1, padding: '12px',
          background: WB_INK,
          border: 'none', borderRadius: 8,
          color: WB_FRAME, fontSize: 13, fontWeight: 600,
          fontFamily: 'system-ui, sans-serif',
        }}>Continue in background ›</button>
      </div>
    </div>
  );
}

/* ════════════════════════════════════════════════
   FRAME 4 — Done · preview + reconciled share
   Reuses the existing piece-level Share panel (Unshare / Copy link).
   The video is included on the piece's public page; per-video destinations
   (camera roll, system share, listing) are a clearly subordinate group.
   ════════════════════════════════════════════════ */

function Frame4_Share() {
  return (
    <div style={{ height: '100%', background: WB_FRAME, display: 'flex', flexDirection: 'column' }}>
      <PhoneTopBar title="ready" back="Done"/>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {/* Title */}
        <div style={{ padding: '16px 18px 0' }}>
          <Mono size={9}>summary video · 0:38 · keepsake</Mono>
          <div style={{
            marginTop: 4,
            fontSize: 17, fontWeight: 600, color: WB_INK,
            fontFamily: 'system-ui, sans-serif', letterSpacing: '-0.01em',
          }}>
            Jewelry Dish — summary
          </div>
        </div>

        {/* Inline player */}
        <div style={{
          margin: '12px 18px 0',
          aspectRatio: '16/10',
          background: WB_BLOCK_2,
          border: `1px solid ${WB_OUT}`,
          borderRadius: 10,
          position: 'relative',
          overflow: 'hidden',
        }}>
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
            <div style={{
              width: 38, height: 38, borderRadius: '50%',
              background: 'oklch(1 0 0 / 0.95)',
              display: 'grid', placeItems: 'center',
              boxShadow: '0 2px 6px oklch(0 0 0 / 0.2)',
            }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill={WB_INK}>
                <polygon points="6 4 20 12 6 20"/>
              </svg>
            </div>
          </div>
          {/* timeline strip */}
          <div style={{
            position: 'absolute', top: 8, left: 10, right: 10,
            display: 'flex', gap: 3,
          }}>
            {[0,1,2,3,4,5,6].map(i => (
              <div key={i} style={{
                flex: 1, height: 12, borderRadius: 2,
                background: i === 2 ? WB_INK : 'oklch(1 0 0 / 0.7)',
              }}/>
            ))}
          </div>
          {/* scrubber */}
          <div style={{
            position: 'absolute', bottom: 8, left: 10, right: 10,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <div style={{ flex: 1, height: 3, background: 'oklch(1 0 0 / 0.6)', borderRadius: 99, position: 'relative' }}>
              <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '32%', background: WB_INK, borderRadius: 99 }}/>
            </div>
            <Mono size={8} color={WB_FRAME} style={{
              background: 'oklch(0 0 0 / 0.5)', padding: '1px 4px', borderRadius: 3,
            }}>0:38</Mono>
          </div>
        </div>

        {/* Quick affordances under the player */}
        <div style={{
          margin: '8px 18px 0',
          display: 'flex', gap: 6, flexWrap: 'wrap',
        }}>
          <ChipButton label="↻ Re-roll edit"/>
          <ChipButton label="Switch style"/>
          <ChipButton label="Delete"/>
        </div>

        {/* Annotation: what does re-roll mean here? */}
        <div style={{
          margin: '6px 18px 0',
          padding: '8px 10px',
          border: `1px dashed ${WB_INK_DIM}`,
          background: 'oklch(0.92 0 0)',
          borderRadius: 6,
        }}>
          <Mono size={8} style={{ textTransform: 'uppercase', letterSpacing: '0.14em', fontWeight: 600, color: WB_INK }}>
            ↗ behavior note
          </Mono>
          <div style={{
            marginTop: 4,
            fontFamily: 'system-ui, sans-serif',
            fontSize: 11, color: WB_INK_DIM, lineHeight: 1.5,
          }}>
            Re-roll uses the same style + assets but lets the model pick different scenes / pacing.
            If the piece has new photos or notes since last run, it shows a "1 new asset since last render" hint and includes them automatically.
          </div>
        </div>

        {/* ── Existing Share panel (reused, NOT new) ── */}
        <div style={{
          margin: '18px 18px 0',
          padding: '14px 14px',
          background: 'oklch(0.94 0 0)',
          border: `1px solid ${WB_LINE}`,
          borderRadius: 10,
          position: 'relative',
        }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: 8,
          }}>
            <div style={{
              fontFamily: 'system-ui, sans-serif',
              fontSize: 14, fontWeight: 600, color: WB_INK,
            }}>Share</div>
            <Mono size={8}>piece-level</Mono>
          </div>

          {/* The two existing buttons, mirrored */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <ExistingShareBtn label="Unshare" icon="unshare"/>
            <ExistingShareBtn label="Copy link" icon="copy"/>
          </div>
          <div style={{
            marginTop: 8,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9, color: WB_INK_MUTE, lineHeight: 1.4,
            wordBreak: 'break-all',
          }}>
            potterdoc.com/pieces/a7e5282d-5509-…
          </div>

          {/* Reconciliation note */}
          <div style={{
            marginTop: 10,
            paddingTop: 10,
            borderTop: `1px dashed ${WB_OUT}`,
            display: 'flex', alignItems: 'flex-start', gap: 6,
          }}>
            <div style={{
              width: 14, height: 14, borderRadius: '50%',
              background: WB_INK, color: WB_FRAME,
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 9, fontWeight: 700,
              display: 'grid', placeItems: 'center',
              flexShrink: 0, marginTop: 1,
            }}>i</div>
            <Mono size={9} style={{ textTransform: 'none', letterSpacing: '0.02em', lineHeight: 1.5 }}>
              The new video appears on this piece's public page automatically. No new link to manage.
            </Mono>
          </div>
        </div>

        {/* ── Video-specific destinations (subordinate, separate group) ── */}
        <div style={{ margin: '14px 18px 0' }}>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
            marginBottom: 8,
          }}>
            <Mono size={9}>send video elsewhere</Mono>
            <Mono size={8}>this video only</Mono>
          </div>
          <div style={{
            display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6,
          }}>
            <ShareTile label="Save to photos" sub="MP4 · 1080×1350"/>
            <ShareTile label="Share video" sub="Messages, Instagram, …"/>
            <ShareTile label="Attach to listing" sub="Etsy · Shop"/>
            <ShareTile label="Download file" sub="MP4"/>
          </div>
        </div>

        {/* Footer status */}
        <div style={{
          margin: '14px 18px 0',
          padding: '10px 12px',
          border: `1px dashed ${WB_OUT}`,
          borderRadius: 8,
        }}>
          <Mono size={8} style={{ textTransform: 'none', letterSpacing: '0.02em' }}>
            Saved to this piece. Lives alongside photos in the gallery.
          </Mono>
        </div>

        <div style={{ height: 16 }}/>
      </div>

      {/* Bottom action */}
      <div style={{
        padding: '10px 18px 18px',
        borderTop: `1px solid ${WB_LINE_S}`,
        background: WB_FRAME,
      }}>
        <button style={{
          width: '100%', padding: '11px',
          background: WB_INK,
          border: 'none', borderRadius: 8,
          color: WB_FRAME,
          fontSize: 13, fontWeight: 600,
          fontFamily: 'system-ui, sans-serif',
        }}>Done</button>
      </div>
    </div>
  );
}

function ChipButton({ label }) {
  return (
    <div style={{
      padding: '6px 10px',
      border: `1px solid ${WB_OUT}`,
      borderRadius: 999,
      background: WB_FRAME,
      fontFamily: 'system-ui, sans-serif',
      fontSize: 11, color: WB_INK_DIM,
    }}>{label}</div>
  );
}

function ExistingShareBtn({ label, icon }) {
  return (
    <div style={{
      padding: '9px 12px',
      border: `1px solid ${WB_OUT}`,
      borderRadius: 8,
      background: WB_FRAME,
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
      fontFamily: 'system-ui, sans-serif',
      fontSize: 13, color: WB_INK,
    }}>
      {icon === 'unshare' && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={WB_INK_DIM} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="9"/><path d="M5 5l14 14"/>
        </svg>
      )}
      {icon === 'copy' && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={WB_INK_DIM} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="9" width="11" height="11" rx="2"/>
          <path d="M5 15V5a2 2 0 0 1 2-2h10"/>
        </svg>
      )}
      {label}
    </div>
  );
}

function ShareTile({ label, sub }) {
  return (
    <div style={{
      padding: '10px 12px',
      border: `1px solid ${WB_LINE}`,
      borderRadius: 8,
      background: WB_FRAME,
    }}>
      <div style={{ fontFamily: 'system-ui, sans-serif', fontSize: 12, fontWeight: 600, color: WB_INK }}>
        {label}
      </div>
      <Mono size={8} style={{ marginTop: 3, textTransform: 'none', letterSpacing: '0.02em' }}>
        {sub}
      </Mono>
    </div>
  );
}

/* ───────────────── canvas storyboard ───────────────── */

function FrameWrapper({ idx, title, hint, future, children, dataLabel }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, width: 320 }} data-screen-label={dataLabel}>
      <div>
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 8,
        }}>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11, fontWeight: 600,
            color: WB_INK,
            padding: '2px 8px',
            background: WB_FRAME,
            border: `1px solid ${WB_OUT}`,
            borderRadius: 4,
          }}>{String(idx).padStart(2, '0')}</div>
          <div style={{
            fontFamily: 'system-ui, sans-serif',
            fontSize: 18, fontWeight: 600, color: WB_INK,
            letterSpacing: '-0.01em',
          }}>{title}</div>
        </div>
        <div style={{
          fontFamily: 'system-ui, sans-serif', fontSize: 12, color: WB_INK_DIM,
          marginTop: 6, lineHeight: 1.5, maxWidth: 320,
        }}>
          {hint}
        </div>
      </div>

      <div style={{
        background: WB_FRAME,
        border: `1px solid ${WB_OUT}`,
        borderRadius: 28,
        padding: 6,
        boxShadow: '0 2px 0 oklch(0 0 0 / 0.04)',
      }}>
        <div style={{
          width: 308, height: 580,
          borderRadius: 22, overflow: 'hidden',
          border: `1px solid ${WB_LINE_S}`,
        }}>
          {children}
        </div>
      </div>

      {future && (
        <div style={{
          padding: '10px 12px',
          background: 'oklch(0.92 0 0)',
          border: `1px dashed ${WB_INK_DIM}`,
          borderRadius: 8,
          maxWidth: 320,
        }}>
          <div style={{
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
            color: WB_INK, marginBottom: 6, fontWeight: 600,
          }}>↗ low-touch opportunity</div>
          <div style={{
            fontFamily: 'system-ui, sans-serif', fontSize: 12,
            color: WB_INK_DIM, lineHeight: 1.5,
          }}>{future}</div>
        </div>
      )}
    </div>
  );
}

function Arrow({ label }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: 6, alignSelf: 'flex-start',
      paddingTop: 280,
    }}>
      <Mono size={9}>{label}</Mono>
      <svg width="80" height="22" viewBox="0 0 80 22" fill="none">
        <path d="M 4 11 L 72 11" stroke={WB_INK} strokeWidth="1.5" strokeLinecap="round"/>
        <path d="M 64 5 L 74 11 L 64 17" stroke={WB_INK} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
      </svg>
    </div>
  );
}

/* ───────────────── root ───────────────── */

function SummaryVideoFlow() {
  return (
    <div style={{
      minHeight: '100vh',
      background: WB_BG,
      padding: '40px 32px 80px',
      fontFamily: 'system-ui, sans-serif',
      color: WB_INK,
      backgroundImage: `linear-gradient(${WB_LINE_S} 1px, transparent 1px),
                        linear-gradient(90deg, ${WB_LINE_S} 1px, transparent 1px)`,
      backgroundSize: '24px 24px',
    }}>
      {/* Document header */}
      <div style={{ maxWidth: 1400, margin: '0 auto 32px' }}>
        <Mono size={10}>potterdoc · wireframe · v1</Mono>
        <h1 style={{
          margin: '8px 0 8px',
          fontSize: 32, fontWeight: 600, letterSpacing: '-0.02em',
          color: WB_INK,
        }}>
          Make summary video — one-click flow
        </h1>
        <div style={{
          fontSize: 14, color: WB_INK_DIM, lineHeight: 1.55, maxWidth: 720,
        }}>
          A storyboard for letting a potter generate a short summary video of a finished
          piece, starting from <strong style={{ color: WB_INK }}>PieceDetail</strong>. The flow
          assumes the AI has access to all assets attached to the piece and its history.
          Dashed callouts mark moments where future low-touch user interaction could plug in
          without changing the one-click spine.
        </div>

        {/* Legend */}
        <div style={{
          marginTop: 18,
          display: 'flex', flexWrap: 'wrap', gap: 14,
          padding: '10px 14px',
          background: WB_FRAME,
          border: `1px solid ${WB_LINE}`,
          borderRadius: 8,
          maxWidth: 720,
        }}>
          <LegendItem swatch={<div style={{ width: 14, height: 10, background: WB_BLOCK, borderRadius: 2 }}/>} text="content block"/>
          <LegendItem swatch={<div style={{ width: 14, height: 10, border: `1px dashed ${WB_OUT}`, borderRadius: 2 }}/>} text="placeholder"/>
          <LegendItem swatch={<div style={{
            padding: '1px 5px', background: WB_INK, color: WB_FRAME,
            fontFamily: 'JetBrains Mono, monospace', fontSize: 7, fontWeight: 600,
            letterSpacing: '0.14em', borderRadius: 2,
          }}>NEW</div>} text="new surface"/>
          <LegendItem swatch={<div style={{
            width: 14, height: 10, background: 'oklch(0.92 0 0)',
            border: `1px dashed ${WB_INK_DIM}`, borderRadius: 2,
          }}/>} text="future-state callout"/>
        </div>
      </div>

      {/* Storyboard rail */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 0,
        overflowX: 'auto',
        paddingBottom: 24,
      }}>
        <FrameWrapper
          idx={1}
          dataLabel="01 PieceDetail · terminal state"
          title="PieceDetail · terminal"
          hint="Piece has reached fired/complete. A new “Make summary video” surface appears between the state hub and the existing detail sections — visible only on terminal pieces."
          future="Could surface earlier with a softer prompt (e.g. once piece has 2+ documented states) for in-progress reels."
        >
          <Frame1_Detail/>
        </FrameWrapper>

        <Arrow label="tap"/>

        <FrameWrapper
          idx={2}
          dataLabel="02 Pick style"
          title="Pick a style"
          hint="The single decision, asked up front so we don't waste a render. Three presets retemplate the same source material: Keepsake, Social, For sale. Tap one and Generate."
          future="A 'Custom…' card could open finer controls (length, vertical/landscape, voice). Defaults stay one-tap."
        >
          <Frame2_StylePicker/>
        </FrameWrapper>

        <Arrow label="generate"/>

        <FrameWrapper
          idx={3}
          dataLabel="03 Rendering"
          title="Rendering"
          hint="The (potentially fake) loading screen — doubles as a 'look at all the material we're using' moment: photos, timeline, notes, glaze, measurements stream in as checks. User can leave; we notify on completion."
          future="Each row could become tappable to exclude that source from the next regeneration, without breaking the one-click default."
        >
          <Frame3_Rendering/>
        </FrameWrapper>

        <Arrow label="~10s"/>

        <FrameWrapper
          idx={4}
          dataLabel="04 Done · preview + share"
          title="Done · share"
          hint="Player + reconciled share. The existing piece-level Share panel (Unshare / Copy link) is reused unchanged — the video rides along on the public piece page. A separate group below holds video-only destinations (Save to photos, system share, attach to listing)."
          future="Multiple saved videos accumulate per piece (different styles, different moments). The gallery becomes the home for them; this Done screen could become a per-video detail later."
        >
          <Frame4_Share/>
        </FrameWrapper>
      </div>

      {/* Footer notes */}
      <div style={{ maxWidth: 1400, margin: '40px auto 0' }}>
        <Mono size={10}>open questions</Mono>
        <ul style={{
          marginTop: 10, paddingLeft: 18,
          fontSize: 13, color: WB_INK_DIM, lineHeight: 1.7,
          fontFamily: 'system-ui, sans-serif',
          listStyle: 'square',
        }}>
          <li>Does “terminal” mean any non-recycled end-state, or only fired/owned? Affects where the CTA appears.</li>
          <li>If a piece has very thin history (one state, two photos), do we hide the CTA, or generate a degraded video?</li>
          <li>Voice-over: out of scope for v1 (per asset list), but the Generating screen has room to add a “record narration” row later.</li>
          <li>Where do generated videos live globally? Per-piece is shown here; a “Reels” tab on the home view could aggregate them.</li>
        </ul>
      </div>

      <style>{`
        @keyframes svPulse {
          0%, 100% { opacity: 0.3; transform: scale(0.8); }
          50% { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </div>
  );
}

function LegendItem({ swatch, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {swatch}
      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: WB_INK_DIM }}>{text}</span>
    </div>
  );
}

Object.assign(window, { SummaryVideoFlow });

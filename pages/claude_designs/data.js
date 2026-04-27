/* Glaze Workspace — workflow states + seed data */

// State machine, simplified from the yaml. Each state has:
//   id, label, successors, terminal, isKiln (heat states)
// "main track" ordering used by timeline/bar viz (skipping branches):
const MAIN_TRACK = [
  'designed',
  'wheel_thrown',        // or handbuilt
  'trimmed',             // (wheel track) + slip_applied/carved branches collapse here
  'submitted_to_bisque_fire',
  'bisque_fired',
  'glazed',              // waxed collapses here
  'submitted_to_glaze_fire',
  'glaze_fired',
  'sanded',
  'completed',
];

const STATES = {
  designed:                 { label: 'designed',                   kind: 'plan',   successors: ['wheel_thrown', 'handbuilt'] },
  wheel_thrown:             { label: 'wheel_thrown',               kind: 'form',   successors: ['recycled', 'trimmed'] },
  handbuilt:                { label: 'handbuilt',                  kind: 'form',   successors: ['recycled', 'slip_applied', 'carved', 'submitted_to_bisque_fire'] },
  trimmed:                  { label: 'trimmed',                    kind: 'form',   successors: ['recycled', 'slip_applied', 'carved', 'submitted_to_bisque_fire'] },
  slip_applied:             { label: 'slip_applied',               kind: 'deco',   successors: ['recycled', 'carved', 'submitted_to_bisque_fire'] },
  carved:                   { label: 'carved',                     kind: 'deco',   successors: ['recycled', 'slip_applied', 'submitted_to_bisque_fire'] },
  submitted_to_bisque_fire: { label: 'submitted_to_bisque_fire',   kind: 'queue',  successors: ['recycled', 'bisque_fired'] },
  bisque_fired:             { label: 'bisque_fired',               kind: 'kiln',   successors: ['recycled', 'waxed', 'glazed'] },
  waxed:                    { label: 'waxed',                      kind: 'deco',   successors: ['recycled', 'glazed'] },
  glazed:                   { label: 'glazed',                     kind: 'deco',   successors: ['recycled', 'submitted_to_glaze_fire'] },
  submitted_to_glaze_fire:  { label: 'submitted_to_glaze_fire',    kind: 'queue',  successors: ['recycled', 'glaze_fired'] },
  glaze_fired:              { label: 'glaze_fired',                kind: 'kiln',   successors: ['recycled', 'sanded', 'completed'] },
  sanded:                   { label: 'sanded',                     kind: 'finish', successors: ['recycled', 'completed'] },
  completed:                { label: 'completed',                  kind: 'done',   terminal: true, successors: [] },
  recycled:                 { label: 'recycled',                   kind: 'recycle', terminal: true, successors: [] },
};

// Map an arbitrary state to its index on the main track.
function mainIndex(stateId) {
  const aliases = {
    handbuilt: 'wheel_thrown',
    slip_applied: 'trimmed',
    carved: 'trimmed',
    waxed: 'glazed',
  };
  const effective = aliases[stateId] || stateId;
  const i = MAIN_TRACK.indexOf(effective);
  return i;
}

// Label helpers
function prettyState(id) {
  if (!id) return '';
  return id.replace(/_/g, ' ');
}
function shortState(id) {
  // e.g. submitted_to_bisque_fire → subm→bisque
  const map = {
    submitted_to_bisque_fire: 'queued → bisque',
    submitted_to_glaze_fire: 'queued → glaze',
    wheel_thrown: 'wheel thrown',
    glaze_fired: 'glaze fired',
    bisque_fired: 'bisque fired',
  };
  return map[id] || prettyState(id);
}

// Seed pieces
const seedPieces = [
  {
    id: 'p1',
    name: 'Round coffee mug',
    state: 'wheel_thrown',
    created: '2026-04-11',
    modified: '2026-04-20',
    clayBody: 'B-Mix stoneware',
    clayWeight: 520,
    tags: ['commission', 'gift'],
    visited: ['designed', 'wheel_thrown'],
    palette: ['oklch(0.62 0.06 50)', 'oklch(0.50 0.05 50)'],
  },
  {
    id: 'p2',
    name: 'Coffee mug × 2',
    state: 'glazed',
    created: '2026-04-11',
    modified: '2026-04-20',
    clayBody: 'B-Mix stoneware',
    clayWeight: 580,
    glaze: 'Celadon!Shino',
    tags: ['set', 'food-safe'],
    visited: ['designed', 'wheel_thrown', 'trimmed', 'submitted_to_bisque_fire', 'bisque_fired', 'glazed'],
    palette: ['oklch(0.58 0.05 50)', 'oklch(0.44 0.04 50)'],
  },
  {
    id: 'p3',
    name: 'Carved mug',
    state: 'submitted_to_bisque_fire',
    created: '2026-04-11',
    modified: '2026-04-20',
    clayBody: 'Speckled brown',
    clayWeight: 490,
    kiln: 'Studio kiln A',
    tags: ['experimental', 'carved'],
    visited: ['designed', 'wheel_thrown', 'trimmed', 'carved', 'submitted_to_bisque_fire'],
    palette: ['oklch(0.68 0.07 60)', 'oklch(0.52 0.06 55)'],
  },
  {
    id: 'p4',
    name: 'Bowl',
    state: 'submitted_to_bisque_fire',
    created: '2026-04-15',
    modified: '2026-04-19',
    clayBody: 'Porcelain',
    clayWeight: 720,
    kiln: 'Studio kiln A',
    tags: ['porcelain'],
    visited: ['designed', 'wheel_thrown', 'trimmed', 'submitted_to_bisque_fire'],
    palette: ['oklch(0.82 0.02 80)', 'oklch(0.72 0.02 80)'],
  },
  {
    id: 'p5',
    name: 'Flat-rim ramen bowl',
    state: 'bisque_fired',
    created: '2026-04-08',
    modified: '2026-04-18',
    clayBody: 'B-Mix stoneware',
    clayWeight: 880,
    cone: '04',
    tags: ['functional'],
    visited: ['designed', 'wheel_thrown', 'trimmed', 'submitted_to_bisque_fire', 'bisque_fired'],
    palette: ['oklch(0.78 0.06 50)', 'oklch(0.66 0.05 50)'],
  },
  {
    id: 'p6',
    name: 'Faceted vase',
    state: 'trimmed',
    created: '2026-04-16',
    modified: '2026-04-20',
    clayBody: 'Stoneware dark',
    clayWeight: 1240,
    tags: ['large', 'faceted'],
    visited: ['designed', 'wheel_thrown', 'trimmed'],
    palette: ['oklch(0.38 0.03 40)', 'oklch(0.28 0.02 40)'],
  },
  {
    id: 'p7',
    name: 'Tea cup — set of 4',
    state: 'submitted_to_glaze_fire',
    created: '2026-03-28',
    modified: '2026-04-19',
    clayBody: 'Porcelain',
    glaze: 'TenmokuOverAsh',
    kiln: 'Community kiln',
    tags: ['set', 'gift', 'reduction'],
    visited: ['designed', 'wheel_thrown', 'trimmed', 'submitted_to_bisque_fire', 'bisque_fired', 'glazed', 'submitted_to_glaze_fire'],
    palette: ['oklch(0.32 0.04 30)', 'oklch(0.22 0.03 30)'],
  },
  {
    id: 'p8',
    name: 'Espresso cup',
    state: 'glaze_fired',
    created: '2026-03-22',
    modified: '2026-04-14',
    clayBody: 'B-Mix stoneware',
    glaze: 'Iron Red',
    cone: '6',
    tags: ['needs-photo'],
    visited: ['designed', 'wheel_thrown', 'trimmed', 'submitted_to_bisque_fire', 'bisque_fired', 'glazed', 'submitted_to_glaze_fire', 'glaze_fired'],
    palette: ['oklch(0.46 0.12 30)', 'oklch(0.34 0.10 30)'],
  },
  {
    id: 'p9',
    name: 'Planter, small',
    state: 'handbuilt',
    created: '2026-04-18',
    modified: '2026-04-20',
    clayBody: 'Speckled brown',
    tags: ['hand-built', 'experimental'],
    visited: ['designed', 'handbuilt'],
    palette: ['oklch(0.58 0.06 55)', 'oklch(0.46 0.05 55)'],
  },
  {
    id: 'p10',
    name: 'Noodle bowl',
    state: 'completed',
    created: '2026-02-14',
    modified: '2026-03-30',
    clayBody: 'Porcelain',
    glaze: 'Celadon',
    tags: ['sold', 'food-safe'],
    visited: ['designed', 'wheel_thrown', 'trimmed', 'submitted_to_bisque_fire', 'bisque_fired', 'glazed', 'submitted_to_glaze_fire', 'glaze_fired', 'sanded', 'completed'],
    palette: ['oklch(0.78 0.04 170)', 'oklch(0.62 0.04 170)'],
  },
  {
    id: 'p11',
    name: 'Collapsed cylinder',
    state: 'recycled',
    created: '2026-04-05',
    modified: '2026-04-06',
    clayBody: 'B-Mix stoneware',
    tags: ['failed'],
    visited: ['designed', 'wheel_thrown', 'recycled'],
    palette: ['oklch(0.55 0.02 60)', 'oklch(0.42 0.02 60)'],
  },
  {
    id: 'p12',
    name: 'Serving platter',
    state: 'sanded',
    created: '2026-03-01',
    modified: '2026-04-15',
    clayBody: 'Stoneware light',
    glaze: 'Ash blue',
    tags: ['commission', 'large'],
    visited: ['designed', 'wheel_thrown', 'trimmed', 'slip_applied', 'submitted_to_bisque_fire', 'bisque_fired', 'glazed', 'submitted_to_glaze_fire', 'glaze_fired', 'sanded'],
    palette: ['oklch(0.74 0.04 230)', 'oklch(0.60 0.04 230)'],
  },
];

Object.assign(window, {
  STATES, MAIN_TRACK, mainIndex, prettyState, shortState, seedPieces,
});

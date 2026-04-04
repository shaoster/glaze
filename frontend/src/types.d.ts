import states from '../../workflow.json'

export const STATES = states.map(({ id }) => id) as const;

export type State = typeof STATES[string];

export const SUCCESSORS = Object.fromEntries(
    STATES.map((item, index) => [item.id, item.successors])
);

// Initially a string until we know more.
type Location = string;

type PieceSummary = {
    id: string;
    name: string;
    created: Date;
    last_modified: Date;
    thumbnail: string;
    // We do not have the whole state info.
    // Just the state name.
    current_state: State;
}

type CaptionedImage = {
    url: string;
    caption: string;
    created: Date;
}

type PieceState = {
    state: State;
    notes: string;
    created: Date;
    last_modified: Date;
    location: Location;
    images: [CaptionedImage];
    previous_state?: State;
    next_state?: State;
}

type PieceDetail = PieceSummary & {
    current_state: PieceState;
    history: [PieceState];
}
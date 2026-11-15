export type TourState = { active: boolean; index: number; total: number };

export type TourAction =
  | { type: "start"; total: number }
  | { type: "next" }
  | { type: "prev" }
  | { type: "goto"; index: number }
  | { type: "exit" };

export const initialTourState: TourState = { active: false, index: 0, total: 0 };

export function tourReducer(state: TourState, action: TourAction): TourState {
  switch (action.type) {
    case "start":
      return { active: action.total > 0, index: 0, total: action.total };
    case "next":
      return state.index + 1 >= state.total
        ? { ...state, active: false }
        : { ...state, index: state.index + 1 };
    case "prev":
      return { ...state, index: Math.max(0, state.index - 1) };
    case "goto":
      return action.index >= 0 && action.index < state.total ? { ...state, index: action.index } : state;
    case "exit":
      return { ...state, active: false };
  }
}

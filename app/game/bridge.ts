export type GameState = {
  score: number;
  best: number;
  next: number;
  highest: number;
  drops: number;
  muted: boolean;
  status: "loading" | "playing" | "over" | "error";
};

export const initialState: GameState = {
  score: 0,
  best: 0,
  next: 1,
  highest: 1,
  drops: 0,
  muted: false,
  status: "loading",
};

type Events = {
  state: GameState;
  restart: undefined;
  sound: undefined;
  aim: number;
  drop: undefined;
  pause: boolean;
};

/** One bridge per mounted game. No frame-by-frame React updates. */
export class GameBridge {
  private listeners = new Map<keyof Events, Set<(value: never) => void>>();

  on<K extends keyof Events>(event: K, callback: (value: Events[K]) => void) {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(callback as (value: never) => void);
    this.listeners.set(event, listeners);
    return () => {
      listeners.delete(callback as (value: never) => void);
    };
  }

  emit<K extends keyof Events>(event: K, value: Events[K]) {
    this.listeners.get(event)?.forEach((listener) => listener(value as never));
  }
}

export const catPath = (tier: number) => `/assets/cats/${tier}-3d-ball.png`;
export const catNames = [
  "Pepper",
  "Mochi",
  "Biscuit",
  "Peaches",
  "Clover",
  "Pudding",
  "Cloud",
  "Lavender",
  "Marshmallow",
  "Your Meowjesty",
];
export const radii = [25, 31, 38, 46, 55, 65, 76, 88, 101, 116];

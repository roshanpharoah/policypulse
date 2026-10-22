import { create } from 'zustand';

interface GuidedDemoStore {
  active: boolean;
  index: number;
  /** Event log length when the tour started, used to diff "since the tour began". */
  baselineEventCount: number;
  start: (eventCount: number) => void;
  stop: () => void;
  next: () => void;
  previous: () => void;
  goTo: (index: number) => void;
}

export const useGuidedDemoStore = create<GuidedDemoStore>((set, get) => ({
  active: false,
  index: 0,
  baselineEventCount: 0,
  start: (eventCount) => set({ active: true, index: 0, baselineEventCount: eventCount }),
  stop: () => set({ active: false }),
  next: () => set({ index: get().index + 1 }),
  previous: () => set({ index: Math.max(0, get().index - 1) }),
  goTo: (index) => set({ index: Math.max(0, index) }),
}));

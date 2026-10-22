import { create } from 'zustand';

interface PresenterStore {
  presenting: boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

export const usePresenterStore = create<PresenterStore>((set, get) => ({
  presenting: false,
  start: () => set({ presenting: true }),
  stop: () => set({ presenting: false }),
  toggle: () => set({ presenting: !get().presenting }),
}));

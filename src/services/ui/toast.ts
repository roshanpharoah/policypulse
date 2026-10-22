import { create } from 'zustand';
import { nextId } from '@/lib/id';

export type ToastTone = 'info' | 'success' | 'warning' | 'danger';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: ToastTone;
  /** Milliseconds before the toast auto-dismisses. 0 keeps it until dismissed. */
  ttl: number;
}

interface ToastStore {
  toasts: Toast[];
  push: (toast: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
}

const DEFAULT_TTL = 6000;

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (input) => {
    const id = nextId('toast');
    const toast: Toast = { id, ...input };
    set({ toasts: [...get().toasts, toast] });
    if (toast.ttl > 0) {
      setTimeout(() => get().dismiss(id), toast.ttl);
    }
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((toast) => toast.id !== id) }),
}));

/** Imperative helper so non-React code (action handlers) can raise a toast. */
export const toast = (input: Omit<Toast, 'id' | 'ttl'> & { ttl?: number }): void => {
  useToastStore.getState().push({ ttl: DEFAULT_TTL, ...input });
};

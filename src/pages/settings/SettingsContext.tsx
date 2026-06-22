import { createContext, useContext } from 'react';

/**
 * Lets any settings section flash the shared "saved ✓" indicator that lives in
 * the Settings shell header, without each section owning its own toast.
 */
export const SavedContext = createContext<() => void>(() => {});

export function useFlashSaved() {
  return useContext(SavedContext);
}

"use client";

import { useState } from "react";

/**
 * Local editable state that resets whenever `source` changes (e.g. a title edited inline that
 * can also change through realtime). Uses React's "adjust state while rendering" pattern
 * instead of an effect, so there is no extra render with stale data.
 */
export function useSyncedState<T>(source: T): [T, (v: T) => void] {
  const [value, setValue] = useState(source);
  const [prev, setPrev] = useState(source);
  if (!Object.is(prev, source)) {
    setPrev(source);
    setValue(source);
  }
  return [value, setValue];
}

/** Runs `onChange` during render when `value` changes (render-phase reset for dialogs). */
export function useOnChange<T>(value: T, onChange: (v: T) => void) {
  const [prev, setPrev] = useState(value);
  if (!Object.is(prev, value)) {
    setPrev(value);
    onChange(value);
  }
}

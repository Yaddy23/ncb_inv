import { useEffect, useState, useRef } from 'react';

/** Returns `value` after it has stayed unchanged for `delay` ms. */
export function useDebounce(value, delay = 400) {
  const [debounced, setDebounced] = useState(value);
  // Use ref to track previous value for object comparison
  const prevValueRef = useRef(value);

  useEffect(() => {
    // For objects, do deep comparison; for primitives, use ===
    const isEqual = (a, b) => {
      if (a === b) return true;
      if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
      const keysA = Object.keys(a);
      const keysB = Object.keys(b);
      if (keysA.length !== keysB.length) return false;
      return keysA.every(key => isEqual(a[key], b[key]));
    };

    // Only set timer if value actually changed (deep comparison for objects)
    if (!isEqual(value, prevValueRef.current)) {
      prevValueRef.current = value;
      const t = setTimeout(() => setDebounced(value), delay);
      return () => clearTimeout(t);
    }
    // If value hasn't changed, don't restart timer - return noop cleanup
    return () => {};
  }, [value, delay]);

  return debounced;
}

import { useEffect, useRef, useState } from "react";

/**
 * True once the element has come within `margin` of the viewport, and stays true. Charts below
 * the fold mount only then, so the first render builds just what is on screen. Without
 * IntersectionObserver (jsdom, very old browsers) it is true immediately.
 */
export function useNearViewport<T extends Element>(margin = "400px") {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(() => typeof IntersectionObserver === "undefined");
  useEffect(() => {
    const el = ref.current;
    if (near || !el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, [near, margin]);
  return [ref, near] as const;
}

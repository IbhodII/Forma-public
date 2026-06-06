import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Tracks which analytics page sections have entered the viewport (or match nav hash).
 * Once a section becomes active it stays active for the session to avoid refetch churn.
 */
export function useAnalyticsSectionActive(
  sectionIds: readonly string[],
  focusedSectionId: string,
) {
  const firstId = sectionIds[0] ?? "";
  const [activated, setActivated] = useState<Set<string>>(() => new Set(firstId ? [firstId] : []));

  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementsRef = useRef<Map<string, Element>>(new Map());

  useEffect(() => {
    if (focusedSectionId) {
      setActivated((prev) => {
        if (prev.has(focusedSectionId)) return prev;
        const next = new Set(prev);
        next.add(focusedSectionId);
        return next;
      });
    }
  }, [focusedSectionId]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        setActivated((prev) => {
          let changed = false;
          const next = new Set(prev);
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const id = entry.target.getAttribute("data-analytics-section");
            if (!id || next.has(id)) continue;
            next.add(id);
            changed = true;
          }
          return changed ? next : prev;
        });
      },
      { rootMargin: "120px 0px", threshold: 0.02 },
    );
    observerRef.current = observer;
    for (const el of elementsRef.current.values()) {
      observer.observe(el);
    }
    return () => observer.disconnect();
  }, []);

  const setSectionRef = useCallback(
    (id: string) => (el: HTMLElement | null) => {
      const observer = observerRef.current;
      const prev = elementsRef.current.get(id);
      if (prev && observer) observer.unobserve(prev);
      if (el) {
        elementsRef.current.set(id, el);
        observer?.observe(el);
      } else {
        elementsRef.current.delete(id);
      }
    },
    [],
  );

  const isSectionActive = useCallback(
    (id: string) => activated.has(id) || focusedSectionId === id,
    [activated, focusedSectionId],
  );

  return { isSectionActive, setSectionRef };
}

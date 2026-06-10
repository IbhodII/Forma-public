import type { WheelEvent as ReactWheelEvent } from "react";

/** True when the element accepts wheel-driven numeric stepping. */
export function isWheelSensitiveNumberInput(el: unknown): el is HTMLInputElement {
  return (
    el instanceof HTMLInputElement &&
    el.type === "number" &&
    !el.disabled &&
    !el.readOnly
  );
}

/**
 * Prevents mouse wheel from changing a focused number input.
 * Typing and keyboard ArrowUp/ArrowDown are unaffected; spinner buttons are click-only.
 */
export function preventNumberInputWheelChange(event: WheelEvent): void {
  const active = document.activeElement;
  if (!isWheelSensitiveNumberInput(active)) return;
  if (event.target !== active && !active.contains(event.target as Node)) return;
  event.preventDefault();
}

/** Optional per-input handler (global guard in main.tsx covers the app). */
export function onNumberInputWheel(event: ReactWheelEvent<HTMLInputElement>): void {
  if (!isWheelSensitiveNumberInput(event.currentTarget)) return;
  event.preventDefault();
}

let installed = false;

/** Install once at app startup — covers all current and future number inputs. */
export function initNumberInputWheelGuard(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("wheel", preventNumberInputWheelChange, {
    capture: true,
    passive: false,
  });
}

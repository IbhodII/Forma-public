/** Короткие сигналы через Web Audio API (без файлов). */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    return audioCtx;
  } catch {
    return null;
  }
}

export function resumeStretchAudio(): void {
  try {
    const ctx = getAudioContext();
    if (ctx?.state === "suspended") {
      void ctx.resume().catch(() => undefined);
    }
  } catch {
    /* autoplay policy */
  }
}

export function playBeep(frequency: number, duration: number, volume = 0.25): void {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = frequency;
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(volume, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  } catch {
    /* ignore */
  }
}

export function playMidpointBeep(): void {
  playBeep(660, 0.12, 0.22);
}

const countdownTimeouts: number[] = [];

export function clearCountdownBeeps(): void {
  for (const id of countdownTimeouts) {
    window.clearTimeout(id);
  }
  countdownTimeouts.length = 0;
}

/** Три коротких писка с интервалом 1 с (секунды 3 → 2 → 1). */
export function playFinalCountdown(): void {
  clearCountdownBeeps();
  playBeep(880, 0.09, 0.28);
  countdownTimeouts.push(
    window.setTimeout(() => playBeep(880, 0.09, 0.28), 1000),
    window.setTimeout(() => playBeep(880, 0.09, 0.28), 2000),
  );
}

export function playCompleteBeep(): void {
  playBeep(440, 0.35, 0.3);
  window.setTimeout(() => playBeep(523, 0.25, 0.26), 180);
}

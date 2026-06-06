/** Ring buffer of startup/auth events for APK diagnostics (production-safe). */
const MAX_LINES = 200;

type LogLine = {
  ts: string;
  tag: string;
  message: string;
};

const buffer: LogLine[] = [];

export function logStartup(tag: string, message: string): void {
  const line: LogLine = {
    ts: new Date().toISOString(),
    tag,
    message,
  };
  buffer.push(line);
  if (buffer.length > MAX_LINES) {
    buffer.splice(0, buffer.length - MAX_LINES);
  }
  if (__DEV__) {
    console.log(`[startup:${tag}]`, message);
  }
}

export function getStartupLogText(): string {
  return buffer.map(l => `${l.ts} [${l.tag}] ${l.message}`).join('\n');
}

export function clearStartupLog(): void {
  buffer.length = 0;
}

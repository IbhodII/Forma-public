import { useCallback, useEffect, useRef, useState } from "react";

import type { BackgroundJobView } from "../components/BackgroundJobStatusPanel";

const DEFAULT_POLL_MS = 800;

type StoredJobSnapshot = {
  jobId: string;
  userId: number;
  view: BackgroundJobView;
  updatedAt: number;
};

function readSnapshot(storageKey: string, userId: number): StoredJobSnapshot | null {
  try {
    const raw = sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredJobSnapshot;
    if (parsed.userId !== userId || !parsed.jobId) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeSnapshot(storageKey: string, snapshot: StoredJobSnapshot): void {
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(snapshot));
  } catch {
    /* quota */
  }
}

function clearSnapshot(storageKey: string): void {
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    /* ignore */
  }
}

function isActiveStatus(status: string): boolean {
  return status === "running" || status === "pending";
}

function isTerminalStatus(status: string): boolean {
  return status === "completed" || status === "failed" || status === "cancelled";
}

function isHttpNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object" || !("response" in err)) return false;
  return (err as { response?: { status?: number } }).response?.status === 404;
}

export type UsePersistedBackgroundJobOptions<T> = {
  storageKey: string;
  userId: number;
  pollMs?: number;
  fetchStatus: (jobId: string) => Promise<T>;
  mapToView: (raw: T) => BackgroundJobView;
  resolveJobIdOnMount?: () => Promise<string | null>;
  onTerminal?: (raw: T, view: BackgroundJobView) => void;
};

export function usePersistedBackgroundJob<T>({
  storageKey,
  userId,
  pollMs = DEFAULT_POLL_MS,
  fetchStatus,
  mapToView,
  resolveJobIdOnMount,
  onTerminal,
}: UsePersistedBackgroundJobOptions<T>) {
  const [view, setView] = useState<BackgroundJobView | null>(() => {
    const snap = readSnapshot(storageKey, userId);
    return snap?.view ?? null;
  });
  const [isPolling, setIsPolling] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const jobIdRef = useRef<string | null>(view?.jobId ?? null);
  const pollLoopActiveRef = useRef(false);
  const mountedRef = useRef(true);
  const onTerminalRef = useRef(onTerminal);
  onTerminalRef.current = onTerminal;
  const terminalWaiterRef = useRef<{
    resolve: (view: BackgroundJobView) => void;
    reject: (err: Error) => void;
  } | null>(null);

  const applyView = useCallback(
    (next: BackgroundJobView) => {
      setView(next);
      jobIdRef.current = next.jobId;
      writeSnapshot(storageKey, {
        jobId: next.jobId,
        userId,
        view: next,
        updatedAt: Date.now(),
      });
    },
    [storageKey, userId],
  );

  const dismissStaleJob = useCallback(() => {
    jobIdRef.current = null;
    terminalWaiterRef.current = null;
    clearSnapshot(storageKey);
    if (mountedRef.current) {
      setView(null);
      setPollError(null);
      setIsPolling(false);
    }
  }, [storageKey]);

  const pollOnce = useCallback(
    async (jobId: string): Promise<BackgroundJobView | null> => {
      try {
        const raw = await fetchStatus(jobId);
        const next = mapToView(raw);
        if (mountedRef.current) {
          applyView(next);
          setPollError(null);
        }
        if (isTerminalStatus(next.status)) {
          onTerminalRef.current?.(raw, next);
          const waiter = terminalWaiterRef.current;
          if (waiter) {
            terminalWaiterRef.current = null;
            if (next.status === "failed") {
              waiter.reject(new Error(next.error || next.message || "Job failed"));
            } else {
              waiter.resolve(next);
            }
          }
          if (next.status === "completed") {
            clearSnapshot(storageKey);
          }
        }
        return next;
      } catch (err) {
        if (isHttpNotFound(err)) {
          dismissStaleJob();
          return null;
        }
        throw err;
      }
    },
    [applyView, dismissStaleJob, fetchStatus, mapToView, storageKey],
  );

  const runPollLoop = useCallback(
    async (jobId: string) => {
      if (pollLoopActiveRef.current) return;
      pollLoopActiveRef.current = true;
      setIsPolling(true);
      try {
        for (;;) {
          if (!mountedRef.current) break;
          let next: BackgroundJobView | null = null;
          try {
            next = await pollOnce(jobId);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (mountedRef.current) {
              setPollError(msg);
            }
            await new Promise((r) => setTimeout(r, pollMs));
            continue;
          }
          if (!next || isTerminalStatus(next.status)) break;
          await new Promise((r) => setTimeout(r, pollMs));
        }
      } finally {
        pollLoopActiveRef.current = false;
        if (mountedRef.current) {
          setIsPolling(false);
        }
      }
    },
    [pollMs, pollOnce],
  );

  const attachJob = useCallback(
    async (jobId: string, initialView?: BackgroundJobView): Promise<BackgroundJobView> => {
      if (initialView) {
        applyView(initialView);
      }
      try {
        const current = await pollOnce(jobId);
        if (current && isTerminalStatus(current.status)) {
          return current;
        }
      } catch {
        /* loop will retry */
      }
      return new Promise<BackgroundJobView>((resolve, reject) => {
        terminalWaiterRef.current = { resolve, reject };
        void runPollLoop(jobId);
      });
    },
    [applyView, pollOnce, runPollLoop],
  );

  const clearJob = useCallback(() => {
    jobIdRef.current = null;
    setView(null);
    setPollError(null);
    clearSnapshot(storageKey);
  }, [storageKey]);

  useEffect(() => {
    mountedRef.current = true;
    let cancelled = false;

    void (async () => {
      const restoredId =
        (await resolveJobIdOnMount?.()) ??
        readSnapshot(storageKey, userId)?.jobId ??
        null;
      if (!restoredId || cancelled) return;

      try {
        const raw = await fetchStatus(restoredId);
        if (cancelled || !mountedRef.current) return;
        const next = mapToView(raw);
        applyView(next);
        if (isActiveStatus(next.status) && !pollLoopActiveRef.current) {
          void runPollLoop(restoredId);
        } else if (isTerminalStatus(next.status)) {
          if (next.status === "completed") {
            clearSnapshot(storageKey);
          }
        }
      } catch (err) {
        if (isHttpNotFound(err)) {
          if (!cancelled && mountedRef.current) {
            dismissStaleJob();
          }
          return;
        }
        const snap = readSnapshot(storageKey, userId);
        if (snap && !cancelled && mountedRef.current) {
          setView(snap.view);
        }
      }
    })();

    return () => {
      cancelled = true;
      mountedRef.current = false;
    };
  }, [
    applyView,
    dismissStaleJob,
    fetchStatus,
    mapToView,
    resolveJobIdOnMount,
    runPollLoop,
    storageKey,
    userId,
  ]);

  const isActive = view != null && isActiveStatus(view.status);

  return {
    view,
    isPolling,
    isActive,
    pollError,
    attachJob,
    clearJob,
    setView: applyView,
  };
}

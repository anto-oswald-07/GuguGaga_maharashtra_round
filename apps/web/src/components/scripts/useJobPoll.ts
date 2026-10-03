"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, getJob, type Job, type JobStatus } from "@/lib/api";

const TERMINAL: JobStatus[] = ["SUCCEEDED", "FAILED"];

type UseJobPollOptions = {
  intervalMs?: number;
  onTerminal?: (job: Job) => void;
};

export function useJobPoll(
  jobId: string | null,
  options: UseJobPollOptions = {},
) {
  const { intervalMs = 1500, onTerminal } = options;
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const onTerminalRef = useRef(onTerminal);

  useEffect(() => {
    onTerminalRef.current = onTerminal;
  }, [onTerminal]);

  const stop = useCallback(() => {
    setPolling(false);
  }, []);

  useEffect(() => {
    if (!jobId) {
      const clear = window.setTimeout(() => {
        setJob(null);
        setError(null);
        setPolling(false);
      }, 0);
      return () => window.clearTimeout(clear);
    }

    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      try {
        const next = await getJob(jobId);
        if (cancelled) return;
        setJob(next);
        setError(null);
        if (TERMINAL.includes(next.status)) {
          setPolling(false);
          onTerminalRef.current?.(next);
          return;
        }
        setPolling(true);
        timer = window.setTimeout(() => {
          void tick();
        }, intervalMs);
      } catch (err) {
        if (cancelled) return;
        setPolling(false);
        setError(
          err instanceof ApiError
            ? err.message
            : err instanceof Error
              ? err.message
              : "Failed to poll job",
        );
      }
    };

    const start = window.setTimeout(() => {
      setPolling(true);
      void tick();
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(start);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [jobId, intervalMs]);

  return { job, error, polling, stop };
}

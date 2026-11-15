import { useEffect, useState } from "react";

/** Fetches one public JSON when the replay opens, validates its contract, and aborts on close. */
export function useReplayData<T>(path: string, read: (value: unknown) => T, what: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setData(null);
    setError(null);
    fetch(`${import.meta.env.BASE_URL}${path}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error(`${what} is unavailable in this installation (HTTP ${response.status}).`);
        setData(read(await response.json()));
      })
      .catch((reason: unknown) => {
        if (reason instanceof Error && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : `Could not load ${what}.`);
      });
    return () => controller.abort();
    // `read` and `what` are module constants of each replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path]);
  return { data, error };
}

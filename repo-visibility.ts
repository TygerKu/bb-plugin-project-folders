import { parseRepoRemote, repoPrivateForUrl } from "./repo-remote";

const TTL = 30 * 60 * 1000;
const MAX_ENTRIES = 512;
const CONCURRENCY = 4;

/** Opt-in, bounded, per-URL cache shared by every connected host. */
export function createRepoVisibilityCache(
  fetchVisibility = repoPrivateForUrl,
  now = Date.now,
) {
  let enabled = false;
  let active = 0;
  const queue: (() => void)[] = [];
  const entries = new Map<
    string,
    {
      at: number;
      settled: boolean;
      controller: AbortController;
      promise: Promise<boolean | null>;
    }
  >();
  const release = () => {
    const next = queue.shift();
    if (next) next();
    else active--;
  };
  const acquire = async () => {
    if (active < CONCURRENCY) active++;
    else await new Promise<void>((resolve) => queue.push(resolve));
  };
  const setEnabled = (value: boolean) => {
    if (enabled === value) return false;
    enabled = value;
    for (const entry of entries.values()) entry.controller.abort();
    entries.clear();
    return true;
  };
  const check = (url: string): Promise<boolean | null> => {
    if (!enabled || parseRepoRemote(url) !== url) return Promise.resolve(null);
    const hit = entries.get(url);
    if (hit && (!hit.settled || now() - hit.at < TTL)) return hit.promise;
    if (!hit && entries.size >= MAX_ENTRIES) {
      const oldest = [...entries].find(([, entry]) => entry.settled);
      if (!oldest) return Promise.resolve(null);
      entries.delete(oldest[0]);
    }
    const entry = {
      at: now(),
      settled: false,
      controller: new AbortController(),
      promise: Promise.resolve<boolean | null>(null),
    };
    entry.promise = (async () => {
      await acquire();
      try {
        if (entry.controller.signal.aborted) return null;
        const result = await fetchVisibility(url, entry.controller.signal);
        return entry.controller.signal.aborted ? null : result;
      } catch {
        return null;
      } finally {
        release();
        entry.at = now();
        entry.settled = true;
      }
    })();
    entries.set(url, entry);
    return entry.promise;
  };
  return { check, setEnabled, dispose: () => setEnabled(false) };
}

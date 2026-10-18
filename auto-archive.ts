import { z } from "zod";

export const autoArchiveSchema = z.object({
  enabled: z.boolean(),
  days: z.number().int().min(1).max(365),
});
export type AutoArchiveConfig = z.infer<typeof autoArchiveSchema>;

export const defaultAutoArchiveConfig: AutoArchiveConfig = {
  enabled: false,
  days: 7,
};

export function parseAutoArchiveConfig(value: unknown): AutoArchiveConfig {
  const result = autoArchiveSchema.safeParse(value);
  if (result.success) return result.data;
  const out = { ...defaultAutoArchiveConfig };
  if (value && typeof value === "object") {
    const raw = value as Record<string, unknown>;
    if (typeof raw.enabled === "boolean") out.enabled = raw.enabled;
    if (
      typeof raw.days === "number" &&
      Number.isInteger(raw.days) &&
      raw.days >= 1 &&
      raw.days <= 365
    ) {
      out.days = raw.days;
    }
  }
  return out;
}

export interface AutoArchiveThread {
  id: string;
  pinnedAt: number | null;
  archivedAt: number | null;
  deletedAt?: number | null;
  parentThreadId?: string | null;
  status: string;
  createdAt?: number;
  updatedAt: number;
  latestAttentionAt?: number;
  hasPendingInteraction?: boolean;
  queuedWork?: string;
  activity?: Record<string, number>;
  runtime?: { displayStatus?: string };
}

export interface AutoArchiveSdkSubset {
  threads: {
    list: (args?: {
      archived?: boolean;
      limit?: number;
      offset?: number;
    }) => Promise<AutoArchiveThread[]>;
    archive: (args: { threadId: string }) => Promise<unknown>;
  };
}

export interface AutoArchiveDeps {
  sdk: AutoArchiveSdkSubset;
  getConfig: () => AutoArchiveConfig;
  now?: () => number;
  setInterval?: (fn: () => void, ms: number) => any;
  clearInterval?: (handle: any) => void;
  log?: {
    debug?: (msg: string) => void;
    info?: (msg: string) => void;
    warn?: (msg: string) => void;
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;
const PAGE = 200;
const SWEEP_MS = 60 * 60 * 1000;
const QUIET = new Set(["idle", "error"]);

/** Last moment anything happened in the chat. */
export function lastActivityAt(thread: AutoArchiveThread): number {
  return Math.max(
    thread.updatedAt || 0,
    thread.latestAttentionAt || 0,
    thread.createdAt || 0,
  );
}

/**
 * A chat is archived only when it is quiet: not pinned, not a child of
 * another chat, idle or failed, nothing queued or waiting on the user, and older than
 * the configured number of days since its last activity.
 */
export function isStale(
  thread: AutoArchiveThread,
  config: AutoArchiveConfig,
  now: number,
): boolean {
  if (thread.archivedAt != null || thread.deletedAt != null) return false;
  if (thread.pinnedAt != null) return false;
  if (thread.parentThreadId) return false;
  // A chat that ended in an error is as finished as an idle one.
  if (!QUIET.has(thread.status)) return false;
  const display = thread.runtime?.displayStatus;
  if (display && !QUIET.has(display)) return false;
  if (thread.hasPendingInteraction) return false;
  if (thread.queuedWork && thread.queuedWork !== "none") return false;
  if (thread.activity && Object.values(thread.activity).some((n) => n > 0))
    return false;
  const last = lastActivityAt(thread);
  if (!last) return false;
  return now - last >= config.days * DAY_MS;
}

export function createAutoArchive(deps: AutoArchiveDeps) {
  const now = deps.now ?? (() => Date.now());
  const setIntervalFn = deps.setInterval ?? setInterval;
  const clearIntervalFn = deps.clearInterval ?? clearInterval;
  const log = deps.log;
  let running: Promise<number> | null = null;

  async function listActive(): Promise<AutoArchiveThread[]> {
    const out: AutoArchiveThread[] = [];
    const seen = new Set<string>();
    for (let offset = 0; ; offset += PAGE) {
      const page = await deps.sdk.threads.list({
        archived: false,
        limit: PAGE,
        offset,
      });
      let fresh = 0;
      for (const thread of page) {
        if (seen.has(thread.id)) continue;
        seen.add(thread.id);
        out.push(thread);
        fresh++;
      }
      // A host that ignores paging returns the same rows again.
      if (page.length < PAGE || fresh === 0) break;
    }
    return out;
  }

  async function run(): Promise<number> {
    const config = deps.getConfig();
    if (!config.enabled) return 0;
    let threads: AutoArchiveThread[];
    try {
      threads = await listActive();
    } catch (e) {
      log?.debug?.(`Auto-archive: failed to list threads: ${String(e)}`);
      return 0;
    }
    const currentNow = now();
    let archived = 0;
    for (const thread of threads) {
      if (!isStale(thread, config, currentNow)) continue;
      try {
        await deps.sdk.threads.archive({ threadId: thread.id });
        archived++;
      } catch (e) {
        log?.debug?.(`Auto-archive: archive ${thread.id} failed: ${String(e)}`);
      }
    }
    if (archived) log?.info?.(`Auto-archive: archived ${archived} chat(s)`);
    return archived;
  }

  /** One sweep at a time; a call during a sweep waits for it. */
  function sweep(): Promise<number> {
    running ??= run().finally(() => {
      running = null;
    });
    return running;
  }

  const initialPromise = sweep().catch((e) => {
    log?.debug?.(`Auto-archive: initial sweep failed: ${String(e)}`);
    return 0;
  });

  const interval = setIntervalFn(() => {
    sweep().catch((e) => {
      log?.debug?.(`Auto-archive: periodic sweep failed: ${String(e)}`);
    });
  }, SWEEP_MS);

  return {
    sweep,
    initialPromise,
    dispose: () => clearIntervalFn(interval),
  };
}

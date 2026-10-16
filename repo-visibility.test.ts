import { expect, it, vi } from "vitest";
import { createRepoVisibilityCache } from "./repo-visibility";

it("makes no requests by default, deduplicates concurrent checks and caches all outcomes for 30 minutes", async () => {
  let time = 10;
  const fetcher = vi.fn(async () => null);
  const cache = createRepoVisibilityCache(fetcher, () => time);
  const url = "https://gitlab.com/acme/sub/repo";
  expect(await cache.check(url)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  cache.setEnabled(true);
  await Promise.all([cache.check(url), cache.check(url)]);
  await cache.check(url);
  expect(fetcher).toHaveBeenCalledTimes(1);
  time += 30 * 60 * 1000;
  await cache.check(url);
  expect(fetcher).toHaveBeenCalledTimes(2);
  cache.setEnabled(false);
  await cache.check(url);
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it("limits concurrency, cancels in-flight and queued work when disabled and bounds the cache", async () => {
  let active = 0,
    peak = 0;
  const fetcher = vi.fn(async (_url: string, signal?: AbortSignal) => {
    active++;
    peak = Math.max(peak, active);
    await new Promise<void>((resolve) =>
      signal!.addEventListener("abort", () => resolve(), { once: true }),
    );
    active--;
    return true;
  });
  const cache = createRepoVisibilityCache(fetcher);
  cache.setEnabled(true);
  const pending = Array.from({ length: 520 }, (_, i) =>
    cache.check(`https://github.com/acme/repo${i}`),
  );
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(4));
  expect(peak).toBe(4);
  cache.dispose();
  expect((await Promise.all(pending)).every((r) => r === null)).toBe(true);
  expect(fetcher).toHaveBeenCalledTimes(4);
});
it("rejects credential-bearing, noncanonical and unsupported URLs before requesting", async () => {
  const fetcher = vi.fn(async () => false);
  const cache = createRepoVisibilityCache(fetcher);
  cache.setEnabled(true);
  for (const url of [
    "https://example.org/a/b",
    "https://user:token@gitlab.com/a/b",
    "https://github.com/a/b?secret=x",
    "https://github.com/a/../b",
  ])
    expect(await cache.check(url)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
  cache.dispose();
});

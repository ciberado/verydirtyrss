import { mkdtemp, rm } from 'fs/promises';
import os from 'os';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FileCache } from '../src/cache.js';

const tempDirs: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'verydirtyrss-test-cache-'));
  tempDirs.push(dir);
  return dir;
}

describe('FileCache', () => {
  it('stores and returns cached values before expiration', async () => {
    const cacheDir = await createTempDir();
    const cache = new FileCache({ cacheDir, ttlMs: 10_000 });

    await cache.set('page:1', '<html>one</html>');
    await cache.set('page:2', '<html>two</html>');

    await expect(cache.get('page:1')).resolves.toBe('<html>one</html>');
    await expect(cache.get('page:2')).resolves.toBe('<html>two</html>');
  });

  it('returns null after expiration', async () => {
    const cacheDir = await createTempDir();
    const nowSpy = vi.spyOn(Date, 'now');
    nowSpy.mockReturnValue(1_000);

    const cache = new FileCache({ cacheDir, ttlMs: 1_000 });
    await cache.set('page:1', '<html>expired</html>');

    nowSpy.mockReturnValue(2_500);
    await expect(cache.get('page:1')).resolves.toBeNull();
  });

  it('acts as a no-op when disabled', async () => {
    const cacheDir = await createTempDir();
    const cache = new FileCache({ cacheDir, enabled: false });

    await cache.set('page:1', '<html>ignored</html>');
    await expect(cache.get('page:1')).resolves.toBeNull();
  });
});

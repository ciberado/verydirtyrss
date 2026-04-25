import { createHash } from 'crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'fs/promises';
import os from 'os';
import path from 'path';

type CacheRecord = {
  value: string;
  expiresAt: number;
};

export type FileCacheOptions = {
  cacheDir?: string;
  ttlMs?: number;
  enabled?: boolean;
};

export class FileCache {
  private readonly cacheDir: string;
  private readonly ttlMs: number;
  private readonly enabled: boolean;

  constructor(options: FileCacheOptions = {}) {
    this.cacheDir = options.cacheDir || path.join(os.tmpdir(), 'verydirtyrss-cache');
    this.ttlMs = options.ttlMs ?? 15 * 60 * 1000;
    this.enabled = options.enabled ?? true;
  }

  async get(key: string): Promise<string | null> {
    if (!this.enabled) return null;

    const filePath = this.getFilePath(key);

    try {
      const raw = await readFile(filePath, 'utf8');
      const record = JSON.parse(raw) as CacheRecord;

      if (record.expiresAt <= Date.now()) {
        await this.safeUnlink(filePath);
        return null;
      }

      return record.value;
    } catch {
      return null;
    }
  }

  async set(key: string, value: string): Promise<void> {
    if (!this.enabled) return;

    await mkdir(this.cacheDir, { recursive: true });
    const filePath = this.getFilePath(key);
    const tempFilePath = `${filePath}.${Date.now()}.tmp`;
    const record: CacheRecord = {
      value,
      expiresAt: Date.now() + this.ttlMs,
    };

    await writeFile(tempFilePath, JSON.stringify(record), 'utf8');
    await rename(tempFilePath, filePath);
  }

  private getFilePath(key: string): string {
    const hash = createHash('sha256').update(key).digest('hex');
    return path.join(this.cacheDir, `${hash}.json`);
  }

  private async safeUnlink(filePath: string): Promise<void> {
    try {
      await unlink(filePath);
    } catch {
      // Ignore cleanup failures.
    }
  }
}

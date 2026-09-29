import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const dataDir = path.resolve(process.cwd(), "data");
const usageFile = path.join(dataDir, "tag-usage.json");

interface TagUsageDb {
  recent: number[];
  counts: Record<string, number>;
}

const emptyDb: TagUsageDb = { recent: [], counts: {} };

export class TagUsageStore {
  private db: TagUsageDb | null = null;

  private async load(): Promise<TagUsageDb> {
    if (this.db) {
      return this.db;
    }
    await mkdir(dataDir, { recursive: true });
    try {
      const text = await readFile(usageFile, "utf8");
      this.db = JSON.parse(text) as TagUsageDb;
      return this.db;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        this.db = emptyDb;
        return this.db;
      }
      throw error;
    }
  }

  private async save(db: TagUsageDb): Promise<void> {
    await writeFile(usageFile, JSON.stringify(db, null, 2), "utf8");
    this.db = db;
  }

  async recordTagUse(tagIds: number[]): Promise<void> {
    const db = await this.load();
    const recent = [...db.recent];
    for (const tagId of tagIds) {
      db.counts[tagId] = (db.counts[tagId] ?? 0) + 1;
      const index = recent.indexOf(tagId);
      if (index >= 0) {
        recent.splice(index, 1);
      }
      recent.unshift(tagId);
    }
    db.recent = recent.slice(0, 25);
    await this.save(db);
  }

  async getRecentIds(): Promise<number[]> {
    return (await this.load()).recent;
  }

  async getMostUsedIds(limit: number): Promise<number[]> {
    const counts = (await this.load()).counts;
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key]) => Number(key));
  }
}

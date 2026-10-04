import type { AppConfig, PaperlessTag } from "../../shared/models.js";
import { PaperlessClient } from "../clients/paperless-client.js";
import { TagUsageStore } from "./tag-usage-store.js";

export interface TagGroups {
  recent: PaperlessTag[];
  mostUsed: PaperlessTag[];
  predefined: PaperlessTag[];
  all: PaperlessTag[];
}

function makePaperlessClient(config: AppConfig): PaperlessClient {
  return new PaperlessClient(
    config.paperless.url,
    config.paperless.token,
    config.paperless.username,
    config.paperless.password
  );
}

export class TagService {
  constructor(private readonly usageStore: TagUsageStore) {}

  async getTagGroups(config: AppConfig): Promise<TagGroups> {
    const client = makePaperlessClient(config);
    const tags = await client.getTags();

    const recentIds = await this.usageStore.getRecentIds();
    const mostUsedIds = await this.usageStore.getMostUsedIds(10);
    const predefined = new Set(
      config.paperless.predefinedTags.map((value) => value.trim().toLowerCase())
    );

    const byId = new Map(tags.map((tag) => [tag.id, tag]));
    return {
      recent: recentIds.map((id) => byId.get(id)).filter((v): v is PaperlessTag => Boolean(v)),
      mostUsed: mostUsedIds.map((id) => byId.get(id)).filter((v): v is PaperlessTag => Boolean(v)),
      predefined: tags.filter((tag) => predefined.has(tag.name.trim().toLowerCase())),
      all: tags
    };
  }

  async ensureTag(config: AppConfig, rawName: string, color?: string): Promise<PaperlessTag> {
    const name = rawName.trim();
    if (!name) {
      throw new Error("Tag name is required");
    }
    const client = makePaperlessClient(config);
    const all = await client.getTags();
    const existing = all.find(
      (tag) => tag.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      if (color && color.trim() && existing.color !== color.trim()) {
        return await client.updateTagColor(existing.id, color.trim());
      return existing;
    }
    return await client.createTag(name, color);
  }

  async recordUsage(tagIds: number[]): Promise<void> {
    await this.usageStore.recordTagUse(tagIds);
  }
}

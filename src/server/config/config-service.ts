import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { AppConfig } from "../../shared/models.js";
import { defaultConfig } from "./default-config.js";

const dataDir = path.resolve(process.cwd(), "data");
const configPath = path.join(dataDir, "config.json");

function mergeDefaults(config: Partial<AppConfig>): AppConfig {
  return {
    scanserv: { ...defaultConfig.scanserv, ...config.scanserv },
    paperless: { ...defaultConfig.paperless, ...config.paperless },
    lifecycle: { ...defaultConfig.lifecycle, ...config.lifecycle }
  };
}

function validate(config: AppConfig): void {
  if (config.lifecycle.fileTtlMinutes < 1) {
    throw new Error("fileTtlMinutes must be >= 1");
  }
  if (config.lifecycle.cleanupIntervalMinutes < 1) {
    throw new Error("cleanupIntervalMinutes must be >= 1");
  }
}

export class ConfigService {
  private cachedConfig: AppConfig | null = null;

  async getConfig(): Promise<AppConfig> {
    if (this.cachedConfig) {
      return this.cachedConfig;
    }

    await mkdir(dataDir, { recursive: true });
    try {
      const text = await readFile(configPath, "utf8");
      const parsed = mergeDefaults(JSON.parse(text) as Partial<AppConfig>);
      validate(parsed);
      this.cachedConfig = parsed;
      return parsed;
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === "ENOENT") {
        this.cachedConfig = defaultConfig;
        return this.cachedConfig;
      }
      throw error;
    }
  }

  async saveConfig(config: AppConfig): Promise<void> {
    validate(config);
    await mkdir(dataDir, { recursive: true });
    await writeFile(configPath, JSON.stringify(config, null, 2), "utf8");
    this.cachedConfig = config;
  }
}

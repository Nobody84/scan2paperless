import { ConfigService } from "../config/config-service.js";
import { FileLifecycleService } from "./file-lifecycle-service.js";
import { ScanService } from "./scan-service.js";
import { TagUsageStore } from "./tag-usage-store.js";
import { TagService } from "./tag-service.js";
import { UploadService } from "./upload-service.js";

export const configService = new ConfigService();
export const fileLifecycleService = new FileLifecycleService();
export const tagService = new TagService(new TagUsageStore());
export const scanService = new ScanService(fileLifecycleService);
export const uploadService = new UploadService(fileLifecycleService, tagService);


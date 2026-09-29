import type { AppConfig, UploadPayload, UploadResult } from "../../shared/models.js";
import { PaperlessClient } from "../clients/paperless-client.js";
import { FileLifecycleService } from "./file-lifecycle-service.js";
import { TagService } from "./tag-service.js";

function makeClient(config: AppConfig): PaperlessClient {
  return new PaperlessClient(
    config.paperless.url,
    config.paperless.token,
    config.paperless.username,
    config.paperless.password
  );
}

export class UploadService {
  constructor(
    private readonly files: FileLifecycleService,
    private readonly tags: TagService
  ) {}

  async upload(config: AppConfig, payload: UploadPayload): Promise<UploadResult> {
    if (!payload.title.trim()) {
      throw new Error("Title is required");
    }

    const file = await this.files.getScanBytes(payload.scanId);
    const paperless = makeClient(config);
    const taskId = await paperless.uploadDocument({
      fileName: file.fileName,
      fileBytes: file.bytes,
      title: payload.title.trim(),
      created: payload.created,
      tagIds: payload.tagIds
    });

    let documentId: number | undefined;
    let warning: string | undefined;

    if (isUuidLike(taskId)) {
      try {
        for (let attempt = 0; attempt < 20; attempt += 1) {
          const tasks = await paperless.getTask(taskId);
          const first = tasks[0];
          if (first?.related_document) {
            documentId = first.related_document;
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
        if (!documentId) {
          warning = `Upload accepted but task ${taskId} did not expose related_document during polling`;
        }
      } catch (error) {
        warning =
          error instanceof Error
            ? `Upload accepted but task polling failed: ${error.message}`
            : "Upload accepted but task polling failed";
      }
    } else {
      warning = `Upload accepted but Paperless returned non-task response: '${taskId}'`;
    }

    await this.tags.recordUsage(payload.tagIds);
    await this.files.removeScan(payload.scanId);

    return { taskId, documentId, warning };
  }
}

function isUuidLike(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

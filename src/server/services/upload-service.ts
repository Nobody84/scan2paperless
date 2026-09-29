import type { AppConfig, UploadPayload, UploadResult } from "../../shared/models.js";
import { HttpError } from "../clients/http-error.js";
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
      throw new HttpError(
        502,
        "Paperless upload task accepted, but related document was not found via /api/tasks polling",
        { taskId, pollAttempts: 20 },
        "GET /api/tasks/?task_id=..."
      );
    }

    await this.tags.recordUsage(payload.tagIds);
    await this.files.removeScan(payload.scanId);

    return { taskId, documentId };
  }
}

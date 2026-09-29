import { HttpError } from "./http-error.js";
import type { PaperlessTag } from "../../shared/models.js";

interface PagedResponse<T> {
  next: string | null;
  results: T[];
}

interface PaperlessTask {
  related_document?: number;
}

function authorization(token: string, username: string, password: string): string {
  if (token.trim().length > 0) {
    return `Token ${token}`;
  }
  const basic = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${basic}`;
}

export class PaperlessClient {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
    private readonly username: string,
    private readonly password: string
  ) {}

  private buildUrl(path: string): string {
    return new URL(path, this.baseUrl).toString();
  }

  private getAuthHeader(): string {
    return authorization(this.token, this.username, this.password);
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(this.buildUrl(path), {
      ...init,
      headers: {
        Authorization: this.getAuthHeader(),
        ...(init?.headers ?? {})
      }
    });

    if (!response.ok) {
      const body = await response.text();
      throw new HttpError(response.status, "paperless request failed", body);
    }

    return (await response.json()) as T;
  }

  async getTags(): Promise<PaperlessTag[]> {
    const tags: PaperlessTag[] = [];
    let nextPath = "/api/tags/";

    while (nextPath) {
      const page = await this.requestJson<PagedResponse<PaperlessTag>>(nextPath);
      tags.push(...page.results);
      if (page.next) {
        const next = new URL(page.next);
        nextPath = `${next.pathname}${next.search}`;
      } else {
        nextPath = "";
      }
    }

    return tags;
  }

  async createTag(name: string): Promise<PaperlessTag> {
    return await this.requestJson<PaperlessTag>("/api/tags/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name })
    });
  }

  async uploadDocument(payload: {
    fileName: string;
    fileBytes: Buffer;
    title: string;
    created: string;
    tagIds: number[];
  }): Promise<string> {
    const form = new FormData();
    form.append(
      "document",
      new Blob([payload.fileBytes]),
      payload.fileName
    );
    form.append("title", payload.title);
    form.append("created", payload.created);
    for (const tagId of payload.tagIds) {
      form.append("tags", `${tagId}`);
    }

    const response = await fetch(this.buildUrl("/api/documents/post_document/"), {
      method: "POST",
      headers: {
        Authorization: this.getAuthHeader()
      },
      body: form
    });

    if (!response.ok) {
      const body = await response.text();
      throw new HttpError(response.status, "paperless upload failed", body);
    }

    const text = await response.text();
    const trimmed = text.trim().replace(/"/g, "");
    return trimmed;
  }

  async getTask(taskId: string): Promise<PaperlessTask[]> {
    const response = await this.requestJson<PagedResponse<PaperlessTask>>(
      `/api/tasks/?task_id=${encodeURIComponent(taskId)}`
    );
    return response.results;
  }
}


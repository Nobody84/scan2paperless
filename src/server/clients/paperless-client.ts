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

    const contentType = response.headers.get("content-type") ?? "";
    const responseText = await response.text();
    const operation = `${init?.method ?? "GET"} ${path}`;

    if (!response.ok) {
      throw new HttpError(
        response.status,
        `paperless request failed: ${operation}`,
        {
          contentType,
          bodyPreview: responseText.slice(0, 300)
        },
        operation
      );
    }

    if (!contentType.includes("application/json")) {
      throw new HttpError(
        500,
        `paperless response was not JSON for ${operation} (possible auth redirect or wrong URL)`,
        {
          contentType,
          bodyPreview: responseText.slice(0, 300)
        },
        operation
      );
    }

    try {
      return JSON.parse(responseText) as T;
    } catch (error) {
      throw new HttpError(
        500,
        `paperless returned invalid JSON for ${operation}`,
        {
          contentType,
          bodyPreview: responseText.slice(0, 300),
          parseError: error instanceof Error ? error.message : "Unknown parse error"
        },
        operation
      );
    }
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

  async createTag(name: string, color?: string): Promise<PaperlessTag> {
    const payload: { name: string; color?: string } = { name };
    if (color && color.trim()) {
      payload.color = color.trim();
    }
    return await this.requestJson<PaperlessTag>("/api/tags/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
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
      throw new HttpError(response.status, "paperless upload failed: POST /api/documents/post_document/", {
        bodyPreview: body.slice(0, 300)
      }, "POST /api/documents/post_document/");
    }

    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const body = await response.text();
      let data: string | { task_id?: string; taskId?: string; id?: string };
      try {
        data = JSON.parse(body) as string | { task_id?: string; taskId?: string; id?: string };
      } catch (error) {
        throw new HttpError(
          500,
          "paperless upload returned invalid JSON",
          {
            contentType,
            bodyPreview: body.slice(0, 300),
            parseError: error instanceof Error ? error.message : "Unknown parse error"
          },
          "POST /api/documents/post_document/"
        );
      }
      if (typeof data === "string") {
        return data;
      }
      const taskId = data.task_id ?? data.taskId ?? data.id;
      if (!taskId) {
        throw new HttpError(
          500,
          "Paperless upload response did not include task id",
          { response: data },
          "POST /api/documents/post_document/"
        );
      }
      return taskId;
    }

    const text = await response.text();
    return text.trim().replace(/^"|"$/g, "");
  }

  async getTask(taskId: string): Promise<PaperlessTask[]> {
    const response = await this.requestJson<PagedResponse<PaperlessTask>>(
      `/api/tasks/?task_id=${encodeURIComponent(taskId)}`
    );
    return response.results;
  }
}

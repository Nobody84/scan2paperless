import type {
  ScanRequestPayload,
  ScanservContext
} from "../../shared/models.js";
import { HttpError } from "./http-error.js";

interface ScanResponse {
  file?: {
    name: string;
    extension: string;
  };
  index?: number;
  image?: string;
}

function basicAuth(username: string, password: string): string {
  const value = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${value}`;
}

export class ScanservClient {
  constructor(
    private readonly baseUrl: string,
    private readonly username: string,
    private readonly password: string
  ) {}

  private buildUrl(path: string): string {
    return new URL(path, this.baseUrl).toString();
  }

  private async requestJson<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(this.buildUrl(path), {
      ...init,
      headers: {
        Authorization: basicAuth(this.username, this.password),
        "Content-Type": "application/json",
        ...(init?.headers ?? {})
      }
    });

    if (!response.ok) {
      throw new HttpError(response.status, "scanserv request failed");
    }

    return (await response.json()) as T;
  }

  async getContext(): Promise<ScanservContext> {
    return await this.requestJson<ScanservContext>("/api/v1/context");
  }

  async startScan(payload: ScanRequestPayload): Promise<ScanResponse> {
    return await this.requestJson<ScanResponse>("/api/v1/scan", {
      method: "POST",
      body: JSON.stringify(payload)
    });
  }

  async downloadFile(fileName: string): Promise<{ buffer: Buffer; mimeType: string }> {
    const response = await fetch(
      this.buildUrl(`/api/v1/files/${encodeURIComponent(fileName)}`),
      {
        headers: {
          Authorization: basicAuth(this.username, this.password)
        }
      }
    );

    if (!response.ok) {
      throw new HttpError(response.status, "scanserv file download failed");
    }

    const mimeType =
      response.headers.get("content-type") ?? "application/octet-stream";
    const buffer = Buffer.from(await response.arrayBuffer());
    return { buffer, mimeType };
  }
}


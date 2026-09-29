import type {
  AppConfig,
  PaperlessTag,
  ScanOptionSet,
  ScanRequestPayload,
  ScannedDocumentRef,
  UploadPayload,
  UploadResult
} from "../shared/models.js";

interface TagGroups {
  recent: PaperlessTag[];
  mostUsed: PaperlessTag[];
  predefined: PaperlessTag[];
  all: PaperlessTag[];
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({ message: "Request failed" }));
    throw new Error(body.message ?? "Request failed");
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export const api = {
  getSettings: async (): Promise<AppConfig> => await request<AppConfig>("/api/settings"),
  saveSettings: async (config: AppConfig): Promise<void> => {
    await request<void>("/api/settings", {
      method: "PUT",
      body: JSON.stringify(config)
    });
  },
  testScanserv: async (): Promise<void> => {
    await request<{ ok: boolean }>("/api/settings/test/scanserv", { method: "POST" });
  },
  testPaperless: async (): Promise<void> => {
    await request<{ ok: boolean }>("/api/settings/test/paperless", { method: "POST" });
  },
  getScanOptions: async (): Promise<ScanOptionSet> =>
    await request<ScanOptionSet>("/api/scan/options"),
  startScan: async (payload: ScanRequestPayload): Promise<ScannedDocumentRef> =>
    await request<ScannedDocumentRef>("/api/scan/start", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  getTags: async (): Promise<TagGroups> => await request<TagGroups>("/api/paperless/tags"),
  createTag: async (name: string): Promise<PaperlessTag> =>
    await request<PaperlessTag>("/api/paperless/tags", {
      method: "POST",
      body: JSON.stringify({ name })
    }),
  upload: async (payload: UploadPayload): Promise<UploadResult> =>
    await request<UploadResult>("/api/upload", {
      method: "POST",
      body: JSON.stringify(payload)
    })
};


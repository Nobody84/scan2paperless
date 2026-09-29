export type ScanWorkflowState =
  | { kind: "idle" }
  | { kind: "loadingOptions" }
  | { kind: "ready" }
  | { kind: "scanning" }
  | { kind: "scanCompleted"; scanId: string; mimeType: string; fileName: string }
  | { kind: "uploading"; scanId: string; mimeType: string; fileName: string }
  | {
      kind: "uploaded";
      documentId?: number;
      taskId?: string;
    }
  | { kind: "error"; phase: "scan" | "upload" | "config"; message: string };

export interface ScanservFeature {
  default?: string | number | boolean;
  options?: Array<string | number>;
  limits?: [number, number];
}

export interface ScanservDevice {
  id: string;
  name: string;
  features: Record<string, ScanservFeature>;
  settings: Record<string, ScanservFeature>;
}

export interface ScanservContext {
  version: string;
  devices: ScanservDevice[];
}

export interface ScanOptionSet {
  devices: Array<{ id: string; name: string }>;
  sources: string[];
  modes: string[];
  resolutions: number[];
  batchModes: string[];
  formats: string[];
  pipelines: string[];
}

export interface ScanRequestPayload {
  params: {
    deviceId: string;
    source?: string;
    mode?: string;
    resolution: number;
    brightness?: number;
    contrast?: number;
  };
  batch: string;
  pipeline: string;
  index: number;
}

export interface ScannedDocumentRef {
  scanId: string;
  fileName: string;
  mimeType: string;
  createdAt: string;
}

export interface PaperlessTag {
  id: number;
  name: string;
}

export interface UploadPayload {
  scanId: string;
  title: string;
  created: string;
  tagIds: number[];
}

export interface UploadResult {
  taskId: string;
  documentId?: number;
}

export interface AppConfig {
  scanserv: {
    url: string;
    username: string;
    password: string;
    defaultDevice?: string;
    defaultSource?: string;
    defaultResolution?: number;
    defaultMode?: string;
    defaultBatch?: string;
    defaultFormat?: string;
  };
  paperless: {
    url: string;
    token: string;
    username: string;
    password: string;
    predefinedTags: string[];
  };
  lifecycle: {
    fileTtlMinutes: number;
    cleanupIntervalMinutes: number;
  };
}


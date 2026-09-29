import type { AppConfig } from "../../shared/models.js";

export const defaultConfig: AppConfig = {
  scanserv: {
    url: "",
    username: "",
    password: "",
    defaultBatch: "none"
  },
  paperless: {
    url: "",
    token: "",
    username: "",
    password: "",
    predefinedTags: []
  },
  lifecycle: {
    fileTtlMinutes: 60,
    cleanupIntervalMinutes: 5
  }
};


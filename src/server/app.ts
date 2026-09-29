import express from "express";
import cors from "cors";
import type { AppConfig, ScanRequestPayload, UploadPayload } from "../shared/models.js";
import {
  configService,
  fileLifecycleService,
  scanService,
  tagService,
  uploadService
} from "./services/dependencies.js";

function sanitizeConfig(config: AppConfig): AppConfig {
  return {
    ...config,
    scanserv: {
      ...config.scanserv,
      password: config.scanserv.password ? "********" : ""
    },
    paperless: {
      ...config.paperless,
      password: config.paperless.password ? "********" : "",
      token: config.paperless.token ? "********" : ""
    }
  };
}

function assertSecretsPreserved(current: AppConfig, next: AppConfig): AppConfig {
  return {
    ...next,
    scanserv: {
      ...next.scanserv,
      password: next.scanserv.password === "********" ? current.scanserv.password : next.scanserv.password
    },
    paperless: {
      ...next.paperless,
      password: next.paperless.password === "********" ? current.paperless.password : next.paperless.password,
      token: next.paperless.token === "********" ? current.paperless.token : next.paperless.token
    }
  };
}

export function createApp(): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.get("/api/settings", async (_req, res, next) => {
    try {
      const config = await configService.getConfig();
      res.json(sanitizeConfig(config));
    } catch (error) {
      next(error);
    }
  });

  app.put("/api/settings", async (req, res, next) => {
    try {
      const current = await configService.getConfig();
      const merged = assertSecretsPreserved(current, req.body as AppConfig);
      await configService.saveConfig(merged);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/scan/options", async (_req, res, next) => {
    try {
      const config = await configService.getConfig();
      const options = await scanService.getOptions(config);
      res.json(options);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/scan/start", async (req, res, next) => {
    try {
      const config = await configService.getConfig();
      const result = await scanService.scan(config, req.body as ScanRequestPayload);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/scan/file/:scanId", async (req, res, next) => {
    try {
      const file = await fileLifecycleService.getScanBytes(req.params.scanId);
      res.setHeader("Content-Type", file.mimeType);
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${encodeURIComponent(file.fileName)}"`
      );
      res.send(file.bytes);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/paperless/tags", async (_req, res, next) => {
    try {
      const config = await configService.getConfig();
      res.json(await tagService.getTagGroups(config));
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/paperless/tags", async (req, res, next) => {
    try {
      const config = await configService.getConfig();
      const tag = await tagService.ensureTag(config, String(req.body.name ?? ""));
      res.status(201).json(tag);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/upload", async (req, res, next) => {
    try {
      const config = await configService.getConfig();
      const result = await uploadService.upload(config, req.body as UploadPayload);
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/settings/test/scanserv", async (_req, res, next) => {
    try {
      const config = await configService.getConfig();
      await scanService.getOptions(config);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/settings/test/paperless", async (_req, res, next) => {
    try {
      const config = await configService.getConfig();
      await tagService.getTagGroups(config);
      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = error instanceof Error ? error.message : "Unknown server error";
    res.status(500).json({ message });
  });

  return app;
}

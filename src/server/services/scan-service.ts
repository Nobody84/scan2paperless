import type { AppConfig, ScanOptionSet, ScanRequestPayload } from "../../shared/models.js";
import { ScanservClient } from "../clients/scanserv-client.js";
import { FileLifecycleService } from "./file-lifecycle-service.js";

function createClient(config: AppConfig): ScanservClient {
  return new ScanservClient(
    config.scanserv.url,
    config.scanserv.username,
    config.scanserv.password
  );
}

function asStringOptions(values: Array<string | number> | undefined): string[] {
  if (!values) {
    return [];
  }
  return values.map((value) => `${value}`);
}

function asNumberOptions(values: Array<string | number> | undefined): number[] {
  if (!values) {
    return [];
  }
  return values.map((value) => Number(value)).filter((value) => !Number.isNaN(value));
}

export class ScanService {
  constructor(private readonly files: FileLifecycleService) {}

  async getOptions(config: AppConfig): Promise<ScanOptionSet> {
    const context = await createClient(config).getContext();
    const firstDevice = context.devices[0];
    const features = firstDevice?.features ?? {};
    const settings = firstDevice?.settings ?? {};

    return {
      devices: context.devices.map((device) => ({ id: device.id, name: device.name })),
      sources: asStringOptions(features["--source"]?.options),
      modes: asStringOptions(features["--mode"]?.options),
      resolutions: asNumberOptions(features["--resolution"]?.options),
      batchModes: asStringOptions(settings["batchMode"]?.options),
      formats: ["pdf", "png", "jpg", "tiff", "txt"],
      pipelines: asStringOptions(settings["pipeline"]?.options)
    };
  }

  async scan(config: AppConfig, request: ScanRequestPayload): Promise<{
    scanId: string;
    fileName: string;
    mimeType: string;
    createdAt: string;
  }> {
    const client = createClient(config);
    const scan = await client.startScan(request);
    if (!scan.file?.name) {
      throw new Error("Scan did not return a final file. Try non-batch mode.");
    }
    const downloaded = await client.downloadFile(scan.file.name);
    return await this.files.registerScan(scan.file.name, downloaded.mimeType, downloaded.buffer);
  }
}


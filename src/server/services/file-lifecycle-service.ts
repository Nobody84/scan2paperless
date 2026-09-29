import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ScannedDocumentRef } from "../../shared/models.js";

const dataDir = path.resolve(process.cwd(), "data");
const scansDir = path.join(dataDir, "scans");

interface ScanRecord extends ScannedDocumentRef {
  absolutePath: string;
}

export class FileLifecycleService {
  private readonly records = new Map<string, ScanRecord>();

  async initialize(): Promise<void> {
    await mkdir(scansDir, { recursive: true });
  }

  async registerScan(fileName: string, mimeType: string, bytes: Buffer): Promise<ScannedDocumentRef> {
    await this.initialize();
    const scanId = randomUUID();
    const ext = path.extname(fileName) || ".bin";
    const safeFileName = `${scanId}${ext}`;
    const absolutePath = path.join(scansDir, safeFileName);
    await writeFile(absolutePath, bytes);

    const record: ScanRecord = {
      scanId,
      fileName,
      mimeType,
      createdAt: new Date().toISOString(),
      absolutePath
    };
    this.records.set(scanId, record);
    return {
      scanId,
      fileName,
      mimeType,
      createdAt: record.createdAt
    };
  }

  getScan(scanId: string): ScannedDocumentRef | undefined {
    const scan = this.records.get(scanId);
    if (!scan) {
      return undefined;
    }
    return {
      scanId: scan.scanId,
      fileName: scan.fileName,
      mimeType: scan.mimeType,
      createdAt: scan.createdAt
    };
  }

  async getScanBytes(scanId: string): Promise<{ bytes: Buffer; mimeType: string; fileName: string }> {
    const scan = this.records.get(scanId);
    if (!scan) {
      throw new Error("Scan not found");
    }
    const bytes = await readFile(scan.absolutePath);
    return { bytes, mimeType: scan.mimeType, fileName: scan.fileName };
  }

  async removeScan(scanId: string): Promise<void> {
    const scan = this.records.get(scanId);
    if (!scan) {
      return;
    }
    await rm(scan.absolutePath, { force: true });
    this.records.delete(scanId);
  }

  async cleanupExpired(ttlMinutes: number): Promise<void> {
    const cutoff = Date.now() - ttlMinutes * 60_000;
    for (const [scanId, record] of this.records.entries()) {
      const createdAt = new Date(record.createdAt).getTime();
      if (createdAt <= cutoff) {
        await this.removeScan(scanId);
      }
    }

    await this.cleanupOrphanFiles();
  }

  private async cleanupOrphanFiles(): Promise<void> {
    const knownPaths = new Set(Array.from(this.records.values()).map((value) => value.absolutePath));
    const entries = await readdir(scansDir);
    for (const entry of entries) {
      const fullPath = path.join(scansDir, entry);
      if (!knownPaths.has(fullPath)) {
        const fileStat = await stat(fullPath);
        if (fileStat.isFile()) {
          await rm(fullPath, { force: true });
        }
      }
    }
  }
}


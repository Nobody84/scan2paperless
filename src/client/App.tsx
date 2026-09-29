import { useEffect, useMemo, useState } from "react";
import { api } from "./api.js";
import type {
  AppConfig,
  PaperlessTag,
  ScanOptionSet,
  ScanWorkflowState,
  ScanRequestPayload,
  ScannedDocumentRef
} from "../shared/models.js";

const emptyConfig: AppConfig = {
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

type View = "scan" | "settings";
const scanPreferencesKey = "scan-to-paperless:last-scan-settings";

interface StoredScanSettings {
  deviceId: string;
  source: string;
  mode: string;
  resolution: number;
  batch: string;
  pipeline: string;
}

export function App() {
  const [view, setView] = useState<View>("scan");
  const [config, setConfig] = useState<AppConfig>(emptyConfig);
  const [options, setOptions] = useState<ScanOptionSet | null>(null);
  const [scanDoc, setScanDoc] = useState<ScannedDocumentRef | null>(null);
  const [tags, setTags] = useState<PaperlessTag[]>([]);
  const [mostUsedTags, setMostUsedTags] = useState<PaperlessTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [newTag, setNewTag] = useState("");
  const [newTagColor, setNewTagColor] = useState("#607d8b");
  const [newSettingsTag, setNewSettingsTag] = useState("");
  const [newSettingsTagColor, setNewSettingsTagColor] = useState("#607d8b");
  const [title, setTitle] = useState("");
  const [created, setCreated] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState("Loading...");
  const [workflow, setWorkflow] = useState<ScanWorkflowState>({ kind: "idle" });

  const [scanForm, setScanForm] = useState({
    deviceId: "",
    source: "",
    mode: "",
    resolution: 300,
    batch: "none",
    pipeline: ""
  });

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await api.getSettings();
        setConfig(loaded);
        setStatus("Ready");
      } catch (error) {
        setStatus(`Failed to load settings: ${(error as Error).message}`);
      }
    })();
  }, []);

  useEffect(() => {
    if (view !== "scan") {
      return;
    }
    void refreshOptionsAndTags();
  }, [view]);

  const fileUrl = useMemo(() => {
    if (!scanDoc) {
      return "";
    }
    return `/api/scan/file/${encodeURIComponent(scanDoc.scanId)}`;
  }, [scanDoc]);

  const selectedTags = useMemo(
    () => tags.filter((tag) => selectedTagIds.includes(tag.id)),
    [tags, selectedTagIds]
  );

  const availableTags = useMemo(() => {
    const predefined = new Set(config.paperless.predefinedTags.map((name) => name.trim().toLowerCase()));
    const usageRank = new Map<number, number>(
      mostUsedTags.map((tag, index) => [tag.id, index])
    );
    return tags
      .filter((tag) => !selectedTagIds.includes(tag.id))
      .sort((a, b) => {
        const aPredefined = predefined.has(a.name.trim().toLowerCase()) ? 1 : 0;
        const bPredefined = predefined.has(b.name.trim().toLowerCase()) ? 1 : 0;
        if (aPredefined !== bPredefined) {
          return bPredefined - aPredefined;
        }

        const aRank = usageRank.get(a.id);
        const bRank = usageRank.get(b.id);
        if (aRank !== undefined || bRank !== undefined) {
          if (aRank === undefined) {
            return 1;
          }
          if (bRank === undefined) {
            return -1;
          }
          return aRank - bRank;
        }
        return a.name.localeCompare(b.name);
      });
  }, [tags, selectedTagIds, mostUsedTags, config.paperless.predefinedTags]);

  const predefinedSelectedTags = useMemo(() => {
    const predefined = new Set(config.paperless.predefinedTags.map((name) => name.trim().toLowerCase()));
    return tags.filter((tag) => predefined.has(tag.name.trim().toLowerCase()));
  }, [config.paperless.predefinedTags, tags]);

  const predefinedSelectedTagIds = useMemo(
    () => predefinedSelectedTags.map((tag) => tag.id),
    [predefinedSelectedTags]
  );

  const predefinedAvailableTags = useMemo(() => {
    const selectedIds = new Set(predefinedSelectedTagIds);
    return tags.filter((tag) => !selectedIds.has(tag.id));
  }, [tags, predefinedSelectedTagIds]);

  async function refreshOptionsAndTags(): Promise<void> {
    setStatus("Loading scanner options and tags...");
    try {
      const [scanOptions, tagGroups] = await Promise.all([
        api.getScanOptions(),
        api.getTags()
      ]);
      setOptions(scanOptions);
      setTags(tagGroups.all);
      setMostUsedTags(tagGroups.mostUsed);
      const preferredDevice = config.scanserv.defaultDevice ?? scanOptions.devices[0]?.id ?? "";
      const sources = scanOptions.sources;
      const modes = scanOptions.modes;
      const resolutions = scanOptions.resolutions;
      const pipelines = scanOptions.pipelines;
      const saved = loadStoredScanSettings();
      const resolved: StoredScanSettings = {
        deviceId: resolveStringOption(saved?.deviceId, scanOptions.devices.map((device) => device.id), preferredDevice),
        source: resolveStringOption(saved?.source, sources, config.scanserv.defaultSource ?? sources[0] ?? ""),
        mode: resolveStringOption(saved?.mode, modes, config.scanserv.defaultMode ?? modes[0] ?? ""),
        resolution: resolveNumberOption(saved?.resolution, resolutions, config.scanserv.defaultResolution ?? resolutions[0] ?? 300),
        batch: resolveStringOption(saved?.batch, scanOptions.batchModes, config.scanserv.defaultBatch ?? scanOptions.batchModes[0] ?? "none"),
        pipeline: resolveStringOption(saved?.pipeline, pipelines, config.scanserv.defaultFormat ?? pipelines[0] ?? "")
      };
      setScanForm({
        deviceId: resolved.deviceId,
        source: resolved.source,
        mode: resolved.mode,
        resolution: resolved.resolution,
        batch: resolved.batch,
        pipeline: resolved.pipeline
      });
      setStatus("Ready");
    } catch (error) {
      setStatus(`Failed to load scan data: ${(error as Error).message}`);
    }
  }

  async function runScan(): Promise<void> {
    persistScanSettings(scanForm);
    setWorkflow({ kind: "scanning" });
    setStatus("Scanning...");
    try {
      const payload: ScanRequestPayload = {
        params: {
          deviceId: scanForm.deviceId,
          source: scanForm.source || undefined,
          mode: scanForm.mode || undefined,
          resolution: Number(scanForm.resolution)
        },
        batch: scanForm.batch,
        pipeline: scanForm.pipeline,
        index: 1
      };
      const document = await api.startScan(payload);
      setScanDoc(document);
      setTitle(document.fileName.replace(/\.[^.]+$/, ""));
      setWorkflow({
        kind: "scanCompleted",
        scanId: document.scanId,
        mimeType: document.mimeType,
        fileName: document.fileName
      });
      setStatus("Scan completed");
    } catch (error) {
      setWorkflow({
        kind: "error",
        phase: "scan",
        message: (error as Error).message
      });
      setStatus(`Scan failed: ${(error as Error).message}`);
    }
  }

  async function createTag(): Promise<void> {
    if (!newTag.trim()) {
      return;
    }
    try {
      const createdTag = await api.createTag(newTag.trim(), newTagColor);
      setTags((current) => [...current, createdTag]);
      setSelectedTagIds((ids) => (ids.includes(createdTag.id) ? ids : [...ids, createdTag.id]));
      setNewTag("");
      setNewTagColor("#607d8b");
    } catch (error) {
      setStatus(`Failed creating tag: ${(error as Error).message}`);
    }
  }

  async function createTagFromSettings(): Promise<void> {
    if (!newSettingsTag.trim()) {
      return;
    }
    try {
      const createdTag = await api.createTag(newSettingsTag.trim(), newSettingsTagColor);
      setTags((current) => [...current, createdTag]);
      addPredefinedTag(createdTag);
      setNewSettingsTag("");
      setNewSettingsTagColor("#607d8b");
    } catch (error) {
      setStatus(`Failed creating predefined tag: ${(error as Error).message}`);
    }
  }

  function selectTag(tagId: number): void {
    setSelectedTagIds((ids) => (ids.includes(tagId) ? ids : [...ids, tagId]));
  }

  function unselectTag(tagId: number): void {
    setSelectedTagIds((ids) => ids.filter((id) => id !== tagId));
  }

  function addPredefinedTag(tag: PaperlessTag): void {
    setConfig((current) => {
      const existing = new Set(current.paperless.predefinedTags.map((name) => name.trim().toLowerCase()));
      if (existing.has(tag.name.trim().toLowerCase())) {
        return current;
      }
      return {
        ...current,
        paperless: {
          ...current.paperless,
          predefinedTags: [...current.paperless.predefinedTags, tag.name]
        }
      };
    });

    setMostUsedTags((current) => {
      if (current.some((value) => value.id === tag.id)) {
        return current;
      }
      return [tag, ...current];
    });
  }

  function removePredefinedTag(tag: PaperlessTag): void {
    setConfig((current) => ({
      ...current,
      paperless: {
        ...current.paperless,
        predefinedTags: current.paperless.predefinedTags.filter(
          (name) => name.trim().toLowerCase() !== tag.name.trim().toLowerCase()
        )
      }
    }));
  }

  async function upload(): Promise<void> {
    if (!scanDoc) {
      setStatus("No scanned document available");
      return;
    }
    setWorkflow({
      kind: "uploading",
      scanId: scanDoc.scanId,
      mimeType: scanDoc.mimeType,
      fileName: scanDoc.fileName
    });
    setStatus("Uploading to Paperless...");
    try {
      const result = await api.upload({
        scanId: scanDoc.scanId,
        title,
        created,
        tagIds: selectedTagIds
      });
      setStatus(
        result.documentId
          ? `Upload complete. Paperless document #${result.documentId}${result.warning ? ` (${result.warning})` : ""}`
          : `Upload accepted: ${result.taskId}${result.warning ? ` (${result.warning})` : ""}`
      );
      setWorkflow({
        kind: "uploaded",
        documentId: result.documentId,
        taskId: result.taskId
      });
      setScanDoc(null);
      setSelectedTagIds([]);
      void refreshOptionsAndTags();
    } catch (error) {
      setWorkflow({
        kind: "error",
        phase: "upload",
        message: (error as Error).message
      });
      setStatus(`Upload failed: ${(error as Error).message}`);
    }
  }

  async function saveSettings(): Promise<void> {
    try {
      await api.saveSettings(config);
      if (predefinedSelectedTagIds.length > 0) {
        await api.recordTagUsage(predefinedSelectedTagIds);
      }
      await refreshOptionsAndTags();
      setStatus("Settings saved");
    } catch (error) {
      setStatus(`Saving settings failed: ${(error as Error).message}`);
    }
  }

  async function testConnections(): Promise<void> {
    try {
      setStatus("Testing connections...");
      await api.testScanserv();
      await api.testPaperless();
      setStatus("Connection tests passed");
    } catch (error) {
      setStatus(`Connection test failed: ${(error as Error).message}`);
    }
  }

  const isScanning = workflow.kind === "scanning";
  const isUploading = workflow.kind === "uploading";

  return (
    <main className="page">
      <header className="header">
        <h1>Scan to Paperless</h1>
        <nav>
          <button onClick={() => setView("scan")} disabled={view === "scan"}>
            Scan
          </button>
          <button onClick={() => setView("settings")} disabled={view === "settings"}>
            Settings
          </button>
        </nav>
      </header>

      <p className="status">{status}</p>

      {view === "settings" ? (
        <section className="card">
          <h2>scanserv settings</h2>
          <label>
            URL
            <input
              value={config.scanserv.url}
              onChange={(e) =>
                setConfig((c) => ({ ...c, scanserv: { ...c.scanserv, url: e.target.value } }))
              }
            />
          </label>
          <label>
            Username
            <input
              value={config.scanserv.username}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  scanserv: { ...c.scanserv, username: e.target.value }
                }))
              }
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={config.scanserv.password}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  scanserv: { ...c.scanserv, password: e.target.value }
                }))
              }
            />
          </label>

          <h2>Paperless settings</h2>
          <label>
            URL
            <input
              value={config.paperless.url}
              onChange={(e) =>
                setConfig((c) => ({ ...c, paperless: { ...c.paperless, url: e.target.value } }))
              }
            />
          </label>
          <label>
            Token
            <input
              type="password"
              value={config.paperless.token}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  paperless: { ...c.paperless, token: e.target.value }
                }))
              }
            />
          </label>
          <label>
            Username
            <input
              value={config.paperless.username}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  paperless: { ...c.paperless, username: e.target.value }
                }))
              }
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={config.paperless.password}
              onChange={(e) =>
                setConfig((c) => ({
                  ...c,
                  paperless: { ...c.paperless, password: e.target.value }
                }))
              }
            />
          </label>
          <div className="tag-section">
            <h4>Predefined selected tags</h4>
            <div className="chip-list" aria-label="Selected predefined tags">
              {predefinedSelectedTags.length === 0 ? (
                <p className="chip-empty">No predefined tags selected</p>
              ) : (
                predefinedSelectedTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    className={`chip ${chipClassForTag(tag, true)}`}
                    style={chipStyleForTag(tag, true)}
                    onClick={() => removePredefinedTag(tag)}
                    aria-label={`Remove predefined tag ${tag.name}`}
                  >
                    {tag.name} ×
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="tag-section">
            <h4>Available tags</h4>
            <div className="chip-list" aria-label="Available tags for predefined selection">
              {predefinedAvailableTags.length === 0 ? (
                <p className="chip-empty">No available tags</p>
              ) : (
                predefinedAvailableTags.map((tag) => (
                  <button
                    key={tag.id}
                    type="button"
                    className={`chip ${chipClassForTag(tag, false)}`}
                    style={chipStyleForTag(tag, false)}
                    onClick={() => addPredefinedTag(tag)}
                    aria-label={`Add predefined tag ${tag.name}`}
                  >
                    {tag.name}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="row">
            <input
              placeholder="Create predefined tag"
              value={newSettingsTag}
              onChange={(e) => setNewSettingsTag(e.target.value)}
            />
            <input
              type="color"
              value={newSettingsTagColor}
              onChange={(e) => setNewSettingsTagColor(e.target.value)}
              aria-label="New predefined tag color"
            />
            <button onClick={() => void createTagFromSettings()}>Create tag</button>
          </div>

          <div className="row">
            <button onClick={() => void saveSettings()}>Save settings</button>
            <button onClick={() => void testConnections()}>Test connections</button>
          </div>
        </section>
      ) : (
        <section className="card">
          <h2>Scan options</h2>
          {!options ? (
            <p>Loading options...</p>
          ) : (
            <>
              <label>
                Device
                <select
                  value={scanForm.deviceId}
                  onChange={(e) =>
                    setScanForm((current) => ({ ...current, deviceId: e.target.value }))
                  }
                >
                  {options.devices.map((device) => (
                    <option key={device.id} value={device.id}>
                      {device.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Source
                <select
                  value={scanForm.source}
                  onChange={(e) =>
                    setScanForm((current) => ({ ...current, source: e.target.value }))
                  }
                >
                  {options.sources.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Mode
                <select
                  value={scanForm.mode}
                  onChange={(e) =>
                    setScanForm((current) => ({ ...current, mode: e.target.value }))
                  }
                >
                  {options.modes.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Resolution
                <select
                  value={scanForm.resolution}
                  onChange={(e) =>
                    setScanForm((current) => ({
                      ...current,
                      resolution: Number(e.target.value)
                    }))
                  }
                >
                  {options.resolutions.map((resolution) => (
                    <option key={resolution} value={resolution}>
                      {resolution}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Batch
                <select
                  value={scanForm.batch}
                  onChange={(e) =>
                    setScanForm((current) => ({ ...current, batch: e.target.value }))
                  }
                >
                  {options.batchModes.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Output pipeline
                <select
                  value={scanForm.pipeline}
                  onChange={(e) =>
                    setScanForm((current) => ({ ...current, pipeline: e.target.value }))
                  }
                >
                  {options.pipelines.map((pipeline) => (
                    <option key={pipeline} value={pipeline}>
                      {pipeline}
                    </option>
                  ))}
                </select>
              </label>
              <button onClick={() => void runScan()} disabled={isScanning}>
                {isScanning ? "Scanning..." : "Scan"}
              </button>
            </>
          )}

          {scanDoc && (
            <>
              <h2>Scanned document</h2>
              {scanDoc.mimeType.includes("pdf") ? (
                <iframe title="Scanned document preview" src={fileUrl} className="preview" />
              ) : (
                <img src={fileUrl} alt="Scanned document preview" className="preview" />
              )}

              <h3>Metadata</h3>
              <label>
                Title
                <input value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <label>
                Date
                <input
                  type="date"
                  value={created}
                  onChange={(e) => setCreated(e.target.value)}
                />
              </label>
              <div className="tag-section">
                <h4>Selected tags</h4>
                <div className="chip-list" aria-label="Selected tags">
                  {selectedTags.length === 0 ? (
                    <p className="chip-empty">No selected tags</p>
                  ) : (
                    selectedTags.map((tag) => (
                      <button
                        type="button"
                        key={tag.id}
                        className={`chip ${chipClassForTag(tag, true)}`}
                        style={chipStyleForTag(tag, true)}
                        onClick={() => unselectTag(tag.id)}
                        aria-label={`Remove tag ${tag.name}`}
                      >
                        {tag.name} ×
                      </button>
                    ))
                  )}
                </div>
              </div>

              <div className="tag-section">
                <h4>Available tags</h4>
                <div className="chip-list" aria-label="Available tags">
                  {availableTags.length === 0 ? (
                    <p className="chip-empty">No available tags</p>
                  ) : (
                    availableTags.map((tag) => (
                      <button
                        type="button"
                        key={tag.id}
                        className={`chip ${chipClassForTag(tag, false)}`}
                        style={chipStyleForTag(tag, false)}
                        onClick={() => selectTag(tag.id)}
                        aria-label={`Select tag ${tag.name}`}
                      >
                        {tag.name}
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div className="row">
                <input
                  placeholder="Create tag"
                  value={newTag}
                  onChange={(e) => setNewTag(e.target.value)}
                />
                <input
                  type="color"
                  value={newTagColor}
                  onChange={(e) => setNewTagColor(e.target.value)}
                  aria-label="New tag color"
                />
                <button onClick={() => void createTag()}>Create tag</button>
              </div>
              <button onClick={() => void upload()} disabled={isUploading}>
                {isUploading ? "Uploading..." : "Upload to Paperless"}
              </button>
            </>
          )}
        </section>
      )}
    </main>
  );
}

function loadStoredScanSettings(): StoredScanSettings | null {
  try {
    const raw = localStorage.getItem(scanPreferencesKey);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<StoredScanSettings>;
    if (
      typeof parsed.deviceId !== "string" ||
      typeof parsed.source !== "string" ||
      typeof parsed.mode !== "string" ||
      typeof parsed.resolution !== "number" ||
      typeof parsed.batch !== "string" ||
      typeof parsed.pipeline !== "string"
    ) {
      return null;
    }
    return {
      deviceId: parsed.deviceId,
      source: parsed.source,
      mode: parsed.mode,
      resolution: parsed.resolution,
      batch: parsed.batch,
      pipeline: parsed.pipeline
    };
  } catch {
    return null;
  }
}

function persistScanSettings(settings: StoredScanSettings): void {
  try {
    localStorage.setItem(scanPreferencesKey, JSON.stringify(settings));
  } catch {
    // Ignore storage write issues in constrained/private browsing contexts.
  }
}

function resolveStringOption(candidate: string | undefined, options: string[], fallback: string): string {
  if (candidate && options.includes(candidate)) {
    return candidate;
  }
  if (options.includes(fallback)) {
    return fallback;
  }
  return options[0] ?? fallback;
}

function resolveNumberOption(candidate: number | undefined, options: number[], fallback: number): number {
  if (candidate !== undefined && options.includes(candidate)) {
    return candidate;
  }
  if (options.includes(fallback)) {
    return fallback;
  }
  return options[0] ?? fallback;
}

function chipClassForTag(tag: PaperlessTag, selected: boolean): string {
  if (hasHexColor(tag.color)) {
    return selected ? "chip-colored-selected" : "chip-colored";
  }
  return selected ? "chip-selected" : "chip-available";
}

function chipStyleForTag(tag: PaperlessTag, selected: boolean): { backgroundColor?: string; color?: string; borderColor?: string } {
  if (!hasHexColor(tag.color)) {
    return {};
  }
  const textColor = hasHexColor(tag.text_color)
    ? tag.text_color
    : getContrastingTextColor(tag.color);
  return {
    backgroundColor: tag.color,
    color: textColor,
    borderColor: selected ? "#2b2b2b" : tag.color
  };
}

function hasHexColor(value: string | null | undefined): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value.trim());
}

function getContrastingTextColor(backgroundHex: string): string {
  const clean = backgroundHex.replace("#", "");
  const red = Number.parseInt(clean.slice(0, 2), 16);
  const green = Number.parseInt(clean.slice(2, 4), 16);
  const blue = Number.parseInt(clean.slice(4, 6), 16);
  const luma = (0.299 * red) + (0.587 * green) + (0.114 * blue);
  return luma > 186 ? "#111111" : "#ffffff";
}

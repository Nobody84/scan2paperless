import { useEffect, useMemo, useRef, useState } from "react";
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

type ScanFormState = StoredScanSettings;
type ScanSettingKey = keyof ScanFormState;
type ToastTone = "info" | "success";

interface ToastState {
  message: string;
  tone: ToastTone;
}

export function App() {
  const [view, setView] = useState<View>("scan");
  const [config, setConfig] = useState<AppConfig>(emptyConfig);
  const [options, setOptions] = useState<ScanOptionSet | null>(null);
  const [scanDoc, setScanDoc] = useState<ScannedDocumentRef | null>(null);
  const [tags, setTags] = useState<PaperlessTag[]>([]);
  const [mostUsedTags, setMostUsedTags] = useState<PaperlessTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [lastSessionTagIds, setLastSessionTagIds] = useState<number[]>([]);
  const [newTag, setNewTag] = useState("");
  const [newTagColor, setNewTagColor] = useState("#607d8b");
  const [newSettingsTag, setNewSettingsTag] = useState("");
  const [newSettingsTagColor, setNewSettingsTagColor] = useState("#607d8b");
  const [title, setTitle] = useState("");
  const [created, setCreated] = useState(() => new Date().toISOString().slice(0, 10));
  const createdInputRef = useRef<HTMLInputElement | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [errorDialogMessage, setErrorDialogMessage] = useState<string | null>(null);
  const [workflow, setWorkflow] = useState<ScanWorkflowState>({ kind: "idle" });
  const [isRefreshingScanData, setIsRefreshingScanData] = useState(false);

  const [scanForm, setScanForm] = useState<ScanFormState>({
    deviceId: "",
    source: "",
    mode: "",
    resolution: 300,
    batch: "none",
    pipeline: ""
  });
  const [activeScanSetting, setActiveScanSetting] = useState<ScanSettingKey | null>(null);
  const [isCreateTagDialogOpen, setIsCreateTagDialogOpen] = useState(false);
  const [isTagPickerDialogOpen, setIsTagPickerDialogOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const loaded = await api.getSettings();
        setConfig(loaded);
      } catch (error) {
        setErrorDialogMessage(`Failed to load settings: ${(error as Error).message}`);
      }
    })();
  }, []);

  useEffect(() => {
    if (view !== "scan") {
      return;
    }
    void refreshOptionsAndTags();
  }, [view]);

  useEffect(() => {
    if (!toast) {
      return;
    }
    const timeoutId = window.setTimeout(() => setToast(null), 3000);
    return () => window.clearTimeout(timeoutId);
  }, [toast]);

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

  useEffect(() => {
    if (tags.length === 0) {
      return;
    }
    const validIds = new Set(tags.map((tag) => tag.id));
    setSelectedTagIds((current) => current.filter((id) => validIds.has(id)));
    setLastSessionTagIds((current) => current.filter((id) => validIds.has(id)));
  }, [tags]);

  useEffect(() => {
    if (!scanDoc) {
      return;
    }
    setLastSessionTagIds(selectedTagIds);
  }, [scanDoc, selectedTagIds]);

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

  const deviceChoices = useMemo(
    () => options?.devices.map((device) => ({ value: device.id, label: device.name })) ?? [],
    [options]
  );

  const activeScanSettingChoices = useMemo(() => {
    if (!options || !activeScanSetting) {
      return [];
    }
    switch (activeScanSetting) {
      case "deviceId":
        return options.devices.map((device) => ({ value: device.id, label: device.name }));
      case "source":
        return options.sources.map((source) => ({ value: source, label: source }));
      case "mode":
        return options.modes.map((mode) => ({ value: mode, label: mode }));
      case "resolution":
        return options.resolutions.map((resolution) => ({
          value: String(resolution),
          label: `${resolution} dpi`
        }));
      case "batch":
        return options.batchModes.map((mode) => ({ value: mode, label: mode }));
      case "pipeline":
        return options.pipelines.map((pipeline) => ({ value: pipeline, label: pipeline }));
      default:
        return [];
    }
  }, [activeScanSetting, options]);

  const activeScanSettingLabel = useMemo(() => {
    switch (activeScanSetting) {
      case "deviceId":
        return "Device";
      case "source":
        return "Source";
      case "mode":
        return "Mode";
      case "resolution":
        return "Resolution";
      case "batch":
        return "Batch";
      case "pipeline":
        return "Output";
      default:
        return "";
    }
  }, [activeScanSetting]);

  const selectedDeviceName = useMemo(() => {
    if (!deviceChoices.length) {
      return scanForm.deviceId || "Not set";
    }
    return deviceChoices.find((choice) => choice.value === scanForm.deviceId)?.label ?? scanForm.deviceId ?? "Not set";
  }, [deviceChoices, scanForm.deviceId]);

  function showToast(message: string, tone: ToastTone = "info"): void {
    setToast({ message, tone });
  }

  function showError(message: string): void {
    setErrorDialogMessage(message);
  }

  async function refreshOptionsAndTags(): Promise<void> {
    setIsRefreshingScanData(true);
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
    } catch (error) {
      showError(`Failed to load scan data: ${(error as Error).message}`);
    } finally {
      setIsRefreshingScanData(false);
    }
  }

  function openScanSettingDialog(settingKey: ScanSettingKey): void {
    setActiveScanSetting(settingKey);
  }

  function closeScanSettingDialog(): void {
    setActiveScanSetting(null);
  }

  function applyScanSetting(settingKey: ScanSettingKey, value: string): void {
    setScanForm((current) => ({
      ...current,
      [settingKey]: settingKey === "resolution" ? Number(value) : value
    }));
    closeScanSettingDialog();
  }

  async function runScan(): Promise<void> {
    persistScanSettings(scanForm);
    setWorkflow({ kind: "scanning" });
    showToast("Scanning...");
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
      setSelectedTagIds(lastSessionTagIds);
      showToast("Scan completed", "success");
    } catch (error) {
      setWorkflow({
        kind: "error",
        phase: "scan",
        message: (error as Error).message
      });
      showError(`Scan failed: ${(error as Error).message}`);
    }
  }

  async function createTag(): Promise<void> {
    if (!newTag.trim()) {
      return;
    }
    try {
      const createdTag = await api.createTag(newTag.trim(), newTagColor);
      setTags((current) => upsertTag(current, createdTag));
      setSelectedTagIds((ids) => (ids.includes(createdTag.id) ? ids : [...ids, createdTag.id]));
      setNewTag("");
      setNewTagColor("#607d8b");
      setIsCreateTagDialogOpen(false);
      showToast(`Tag "${createdTag.name}" created`, "success");
    } catch (error) {
      showError(`Failed creating tag: ${(error as Error).message}`);
    }
  }

  async function createTagFromSettings(): Promise<void> {
    if (!newSettingsTag.trim()) {
      return;
    }
    try {
      const createdTag = await api.createTag(newSettingsTag.trim(), newSettingsTagColor);
      setTags((current) => upsertTag(current, createdTag));
      addPredefinedTag(createdTag);
      setNewSettingsTag("");
      setNewSettingsTagColor("#607d8b");
      showToast(`Predefined tag "${createdTag.name}" created`, "success");
    } catch (error) {
      showError(`Failed creating predefined tag: ${(error as Error).message}`);
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
      showError("No scanned document available");
      return;
    }
    setWorkflow({
      kind: "uploading",
      scanId: scanDoc.scanId,
      mimeType: scanDoc.mimeType,
      fileName: scanDoc.fileName
    });
    showToast("Uploading to Paperless...");
    try {
      const result = await api.upload({
        scanId: scanDoc.scanId,
        title,
        created,
        tagIds: selectedTagIds
      });
      showToast(
        result.documentId
          ? `Upload complete. Paperless document #${result.documentId}${result.warning ? ` (${result.warning})` : ""}`
          : `Upload accepted: ${result.taskId}${result.warning ? ` (${result.warning})` : ""}`,
        "success"
      );
      setWorkflow({
        kind: "uploaded",
        documentId: result.documentId,
        taskId: result.taskId
      });
      setLastSessionTagIds(selectedTagIds);
      setScanDoc(null);
      setIsTagPickerDialogOpen(false);
      void refreshOptionsAndTags();
    } catch (error) {
      setWorkflow({
        kind: "error",
        phase: "upload",
        message: (error as Error).message
      });
      showError(`Upload failed: ${(error as Error).message}`);
    }
  }

  async function saveSettings(): Promise<void> {
    try {
      await api.saveSettings(config);
      if (predefinedSelectedTagIds.length > 0) {
        await api.recordTagUsage(predefinedSelectedTagIds);
      }
      await refreshOptionsAndTags();
      showToast("Settings saved", "success");
    } catch (error) {
      showError(`Saving settings failed: ${(error as Error).message}`);
    }
  }

  async function testConnections(): Promise<void> {
    try {
      showToast("Testing connections...");
      await api.testScanserv();
      await api.testPaperless();
      showToast("Connection tests passed", "success");
    } catch (error) {
      showError(`Connection test failed: ${(error as Error).message}`);
    }
  }

  const isScanning = workflow.kind === "scanning";
  const isUploading = workflow.kind === "uploading";

  function backToScanner(): void {
    setScanDoc(null);
    setIsTagPickerDialogOpen(false);
    setWorkflow({ kind: "ready" });
  }

  function getScanSettingDisplay(key: ScanSettingKey): string {
    switch (key) {
      case "deviceId":
        return selectedDeviceName;
      case "source":
        return scanForm.source || "Not set";
      case "mode":
        return scanForm.mode || "Not set";
      case "resolution":
        return `${scanForm.resolution} dpi`;
      case "batch":
        return scanForm.batch || "Not set";
      case "pipeline":
        return scanForm.pipeline || "Not set";
      default:
        return "";
    }
  }

  function getScanSettingValue(key: ScanSettingKey): string {
    return key === "resolution" ? String(scanForm.resolution) : scanForm[key];
  }

  function openCreatedDatePicker(): void {
    const input = createdInputRef.current;
    if (!input) {
      return;
    }
    if ("showPicker" in input && typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.focus();
  }

  return (
    <main className="page">
      <header className="header">
        {view === "settings" ? (
          <button
            type="button"
            className="icon-button"
            onClick={() => setView("scan")}
            aria-label="Back to scan page"
          >
            ←
          </button>
        ) : view === "scan" && scanDoc ? (
          <button
            type="button"
            className="icon-button"
            onClick={backToScanner}
            aria-label="Back to scanner"
          >
            ←
          </button>
        ) : (
          <span className="header-spacer" aria-hidden="true" />
        )}
        {view === "scan" ? (
          <button
            type="button"
            className="icon-button"
            onClick={() => setView("settings")}
            aria-label="Open settings"
          >
            ⚙️
          </button>
        ) : (
          <span className="header-spacer" aria-hidden="true" />
        )}
      </header>

      {view === "settings" ? (
        <section className={scanDoc ? "card scan-result-card" : "card"}>
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
          {!scanDoc && (!options || isRefreshingScanData) ? <p>Loading options...</p> : null}

          {!scanDoc && options && (
            <>
              <div className="scan-settings-summary" aria-label="Current scan settings">
                <button
                  type="button"
                  className="scan-settings-summary-row scan-settings-button"
                  onClick={() => openScanSettingDialog("deviceId")}
                >
                  <span className="scan-settings-label">Device</span>
                  <span className="scan-settings-value">{getScanSettingDisplay("deviceId")}</span>
                </button>
                <button
                  type="button"
                  className="scan-settings-summary-row scan-settings-button"
                  onClick={() => openScanSettingDialog("source")}
                >
                  <span className="scan-settings-label">Source</span>
                  <span className="scan-settings-value">{getScanSettingDisplay("source")}</span>
                </button>
                <button
                  type="button"
                  className="scan-settings-summary-row scan-settings-button"
                  onClick={() => openScanSettingDialog("mode")}
                >
                  <span className="scan-settings-label">Mode</span>
                  <span className="scan-settings-value">{getScanSettingDisplay("mode")}</span>
                </button>
                <button
                  type="button"
                  className="scan-settings-summary-row scan-settings-button"
                  onClick={() => openScanSettingDialog("resolution")}
                >
                  <span className="scan-settings-label">Resolution</span>
                  <span className="scan-settings-value">{getScanSettingDisplay("resolution")}</span>
                </button>
                <button
                  type="button"
                  className="scan-settings-summary-row scan-settings-button"
                  onClick={() => openScanSettingDialog("batch")}
                >
                  <span className="scan-settings-label">Batch</span>
                  <span className="scan-settings-value">{getScanSettingDisplay("batch")}</span>
                </button>
                <button
                  type="button"
                  className="scan-settings-summary-row scan-settings-button"
                  onClick={() => openScanSettingDialog("pipeline")}
                >
                  <span className="scan-settings-label">Output</span>
                  <span className="scan-settings-value">{getScanSettingDisplay("pipeline")}</span>
                </button>
              </div>
              <button
                className="primary-scan-button"
                onClick={() => void runScan()}
                disabled={isScanning}
              >
                {isScanning ? "Scanning..." : "Scan now"}
              </button>
            </>
          )}

          {activeScanSetting && options && (
            <div
              className="dialog-overlay"
              role="presentation"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  closeScanSettingDialog();
                }
              }}
            >
              <section
                className="dialog-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="scan-settings-dialog-title"
              >
                <h3 id="scan-settings-dialog-title">{activeScanSettingLabel}</h3>
                <div className="option-list">
                  {activeScanSettingChoices.map((choice) => {
                    const selected = choice.value === getScanSettingValue(activeScanSetting);
                    return (
                      <button
                        type="button"
                        key={choice.value}
                        className={selected ? "option-button option-button-selected" : "option-button"}
                        onClick={() => applyScanSetting(activeScanSetting, choice.value)}
                      >
                        {choice.label}
                      </button>
                    );
                  })}
                </div>
                <div className="dialog-actions">
                  <button type="button" onClick={closeScanSettingDialog}>
                    Cancel
                  </button>
                </div>
              </section>
            </div>
          )}

          {scanDoc && (
            <div className="scan-result-layout">
              <div className="scan-preview-area">
                {scanDoc.mimeType.includes("pdf") ? (
                  <iframe title="Scanned document preview" src={fileUrl} className="preview preview-dominant" />
                ) : (
                  <img src={fileUrl} alt="Scanned document preview" className="preview preview-dominant" />
                )}
              </div>

              <div className="scan-bottom-panel">
                <div className="metadata-panel">
                  <h3 className="metadata-heading">Metadata &amp; tags</h3>
                <div className="metadata-compact">
                  <div className="metadata-grid">
                    <label>
                      Title
                      <input value={title} onChange={(e) => setTitle(e.target.value)} />
                    </label>
                    <label>
                      Date
                      <div className="date-entry-row">
                        <input
                          ref={createdInputRef}
                          type="date"
                          value={created}
                          onChange={(e) => setCreated(e.target.value)}
                        />
                        <button
                          type="button"
                          className="icon-button date-picker-button"
                          onClick={openCreatedDatePicker}
                          aria-label="Open date picker"
                        >
                          📅
                        </button>
                      </div>
                    </label>
                  </div>
                  <div className="metadata-tags-header">
                    <span className="metadata-tags-label">Tags</span>
                    <button
                      type="button"
                      className="icon-button metadata-add-tag-button"
                      onClick={() => setIsCreateTagDialogOpen(true)}
                      aria-label="Create tag"
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    className="metadata-tags-trigger"
                    onClick={() => setIsTagPickerDialogOpen(true)}
                  >
                    <div className="chip-list metadata-tags-preview" aria-label="Selected tags">
                      {selectedTags.length === 0 ? (
                        <p className="chip-empty">No selected tags</p>
                      ) : (
                        selectedTags.map((tag) => (
                          <span
                            key={tag.id}
                            className={`chip ${chipClassForTag(tag, true)}`}
                            style={chipStyleForTag(tag, true)}
                          >
                            {tag.name}
                          </span>
                        ))
                      )}
                    </div>
                  </button>
                </div>
                </div>
                <button className="primary-upload-button" onClick={() => void upload()} disabled={isUploading}>
                  {isUploading ? "Uploading..." : "Upload to Paperless"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}

      {isCreateTagDialogOpen && (
        <div
          className="dialog-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsCreateTagDialogOpen(false);
            }
          }}
        >
          <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="create-tag-dialog-title">
            <h3 id="create-tag-dialog-title">Create tag</h3>
            <label>
              Name
              <input
                placeholder="Tag name"
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                autoFocus
              />
            </label>
            <label>
              Color
              <input
                type="color"
                value={newTagColor}
                onChange={(e) => setNewTagColor(e.target.value)}
                aria-label="New tag color"
              />
            </label>
            <div className="dialog-actions">
              <button type="button" onClick={() => setIsCreateTagDialogOpen(false)}>
                Cancel
              </button>
              <button type="button" onClick={() => void createTag()}>
                Create
              </button>
            </div>
          </section>
        </div>
      )}

      {isTagPickerDialogOpen && scanDoc && (
        <div
          className="dialog-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setIsTagPickerDialogOpen(false);
            }
          }}
        >
          <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby="tag-picker-dialog-title">
            <h3 id="tag-picker-dialog-title">Select tags</h3>
            <div className="chip-list" aria-label="Tag picker">
              {availableTags.concat(selectedTags).length === 0 ? (
                <p className="chip-empty">No tags available</p>
              ) : (
                [...selectedTags, ...availableTags].map((tag) => {
                  const selected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      type="button"
                      key={tag.id}
                      className={`chip ${chipClassForTag(tag, selected)}`}
                      style={chipStyleForTag(tag, selected)}
                      onClick={() => (selected ? unselectTag(tag.id) : selectTag(tag.id))}
                    >
                      {tag.name}
                    </button>
                  );
                })
              )}
            </div>
            <div className="dialog-actions">
              <button type="button" onClick={() => setIsTagPickerDialogOpen(false)}>
                Done
              </button>
            </div>
          </section>
        </div>
      )}

      {errorDialogMessage && (
        <div className="dialog-overlay" role="presentation">
          <section className="dialog-card" role="alertdialog" aria-modal="true" aria-labelledby="error-dialog-title">
            <h3 id="error-dialog-title">Error</h3>
            <p>{errorDialogMessage}</p>
            <div className="dialog-actions">
              <button type="button" onClick={() => setErrorDialogMessage(null)}>
                OK
              </button>
            </div>
          </section>
        </div>
      )}

      {toast && <div className={`toast toast-${toast.tone}`}>{toast.message}</div>}
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

function upsertTag(tags: PaperlessTag[], next: PaperlessTag): PaperlessTag[] {
  const index = tags.findIndex((tag) => tag.id === next.id);
  if (index < 0) {
    return [...tags, next];
  }
  const updated = [...tags];
  updated[index] = next;
  return updated;
}

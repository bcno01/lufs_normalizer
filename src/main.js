import { analyzeLoudness } from "./lufsMeter.js";
import { TARGET_PRESETS, CUSTOM_TARGET_MIN, CUSTOM_TARGET_MAX, CUSTOM_TARGET_DEFAULT, GAIN_CLAMP_DB } from "./presets.js";
import { encodeWav } from "./wavEncoder.js";
import { AbPlayer } from "./player.js";
import { createRuler, formatLufs } from "./ruler.js";

const stage = document.getElementById("stage");
const fileInput = document.getElementById("file-input");
const browseButton = document.getElementById("browse-button");

const analyzeFilename = document.getElementById("analyze-filename");
const analyzePercent = document.getElementById("analyze-percent");
const analyzeBar = document.getElementById("analyze-bar");
const analyzeLabel = document.getElementById("analyze-label");

const deck = document.getElementById("app-section");
const silentNote = document.getElementById("silent-note");
const fileInfoEl = document.getElementById("file-info");

const lraValueEl = document.getElementById("lra-value");

const targetListEl = document.getElementById("target-list");
const customTargetRow = document.getElementById("custom-target-row");
const customTargetRange = document.getElementById("custom-target-range");
const customTargetNumber = document.getElementById("custom-target-number");

const gainValueEl = document.getElementById("gain-value");
const clipWarningEl = document.getElementById("clip-warning");

const abOriginalButton = document.getElementById("ab-original");
const abNormalizedButton = document.getElementById("ab-normalized");
const playButton = document.getElementById("play-button");
const playLabel = document.getElementById("play-label");

const exportButton = document.getElementById("export-button");
const exportLabel = document.getElementById("export-label");
const resetButton = document.getElementById("reset-button");
const themeToggle = document.getElementById("theme-toggle");

let currentFile = null;
let audioBuffer = null;
let analysis = null; // { integratedLufs, loudnessRangeLu, samplePeakLinear }
let selectedPresetId = TARGET_PRESETS[0].id;
let customTargetLufs = CUSTOM_TARGET_DEFAULT;
let currentGainDb = 0;
let normalized = false;
let abPlayer = null;

const RULER_MIN = -40;
const RULER_MAX = 0;
const presetMarks = TARGET_PRESETS.filter((p) => p.lufs !== null).map((p) => p.lufs);
const presetNotes = TARGET_PRESETS.filter((p) => p.lufs !== null).map((p) => ({ lufs: p.lufs, label: p.label, short: p.short || p.label }));
const stageRuler = createRuler(document.getElementById("stage-ruler"), {
  min: RULER_MIN,
  max: RULER_MAX,
  marks: presetMarks,
  notes: presetNotes,
});

customTargetRange.min = CUSTOM_TARGET_MIN;
customTargetRange.max = CUSTOM_TARGET_MAX;
customTargetNumber.min = CUSTOM_TARGET_MIN;
customTargetNumber.max = CUSTOM_TARGET_MAX;
customTargetRange.value = CUSTOM_TARGET_DEFAULT;
customTargetNumber.value = CUSTOM_TARGET_DEFAULT;

function showView(name) {
  stage.dataset.state = name === "drop" ? "idle" : name === "analyze" ? "analyzing" : "ready";
  deck.classList.toggle("hidden", name !== "app");
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function formatDuration(seconds) {
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatSignedDb(db) {
  const rounded = Math.round(db * 10) / 10;
  if (rounded === 0) return "0.0";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(1)}`;
}

function setPlayState(playing) {
  playButton.classList.toggle("is-playing", playing);
  playLabel.textContent = playing ? "停止" : "再生";
}

function updateRuler(options) {
  const measured = analysis && analysis.integratedLufs > -99 ? analysis.integratedLufs : null;
  silentNote.classList.toggle("hidden", !analysis || measured !== null);
  stageRuler.update(
    {
      measured,
      playing: measured === null ? null : measured + (normalized ? currentGainDb : 0),
      playingLabel: normalized ? "ノーマライズ後" : "Integrated",
      targetLufs: measured === null ? null : getCurrentTargetLufs(),
      targetName: "目標",
    },
    options
  );
}

// --- 1. ファイル読み込み〜解析フェーズ ---

async function handleFile(file) {
  clearSession();
  currentFile = file;

  analyzeFilename.textContent = file.name;
  analyzeLabel.textContent = "読み込み中…";
  analyzeBar.style.width = "0%";
  analyzePercent.textContent = "0";
  showView("analyze");

  try {
    const arrayBuffer = await file.arrayBuffer();
    const decodeCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioBuffer = await decodeCtx.decodeAudioData(arrayBuffer);
    decodeCtx.close();

    analyzeLabel.textContent = "LUFS/LRAを計測中…";

    const channelData = [];
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      channelData.push(audioBuffer.getChannelData(ch));
    }

    analysis = await analyzeLoudness(channelData, audioBuffer.sampleRate, (ratio) => {
      const percent = Math.round(ratio * 100);
      analyzeBar.style.width = `${percent}%`;
      analyzePercent.textContent = String(percent);
    });

    abPlayer = new AbPlayer(audioBuffer);
    renderResult(file);
    showView("app");
  } catch (err) {
    console.error(err);
    alert("音声ファイルとして読み込めませんでした。対応形式か確認してください。");
    showView("drop");
  }
}

// --- 2. 結果表示・ノーマライズ設定 ---

function renderResult(file) {
  fileInfoEl.innerHTML = `
    <span class="name"></span>
    <span class="meta"><span>${formatDuration(audioBuffer.duration)}</span><span>${audioBuffer.sampleRate} Hz</span><span>${audioBuffer.numberOfChannels}ch</span><span>${formatBytes(file.size)}</span></span>
  `;
  // ファイル名は利用者が決めた文字列なので、HTMLとして解釈されないようtextContentで入れる
  fileInfoEl.querySelector(".name").textContent = file.name;

  lraValueEl.textContent = analysis.loudnessRangeLu.toFixed(1);

  setNormalized(false);
  setPlayState(false);
  updateGain({ sweep: true });
}

const targetButtons = new Map();

function buildTargetList() {
  for (const preset of TARGET_PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "segment";
    const label = document.createElement("span");
    label.textContent = preset.label;
    const value = document.createElement("span");
    value.className = "segment-value";
    value.textContent = preset.lufs === null ? "任意" : formatLufs(preset.lufs).replace(".0", "");
    button.append(label, value);
    button.addEventListener("click", () => {
      selectedPresetId = preset.id;
      syncTargetSelection();
      updateGain();
    });
    targetButtons.set(preset.id, button);
    targetListEl.appendChild(button);
  }
  syncTargetSelection();
}

function syncTargetSelection() {
  for (const [id, button] of targetButtons) {
    const active = id === selectedPresetId;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  customTargetRow.classList.toggle("hidden", selectedPresetId !== "custom");
}

buildTargetList();

function getCurrentTargetLufs() {
  const preset = TARGET_PRESETS.find((p) => p.id === selectedPresetId);
  return preset.lufs === null ? customTargetLufs : preset.lufs;
}

function updateGain(rulerOptions) {
  const target = getCurrentTargetLufs();

  // 計測不能なほど無音に近い場合、目標値との差分をそのまま適用すると非現実的な大ゲインになるため
  // ユニティゲイン(0dB)にしておく(VST版と同じ考え方)
  currentGainDb =
    analysis.integratedLufs > -99
      ? Math.max(-GAIN_CLAMP_DB, Math.min(GAIN_CLAMP_DB, target - analysis.integratedLufs))
      : 0;

  gainValueEl.textContent = formatSignedDb(currentGainDb);
  if (abPlayer) abPlayer.setNormalizeGainDb(currentGainDb);

  const resultingPeakDb =
    analysis.samplePeakLinear > 0 ? 20 * Math.log10(analysis.samplePeakLinear) + currentGainDb : -Infinity;
  clipWarningEl.classList.toggle("hidden", resultingPeakDb <= 0);
  updateRuler(rulerOptions);
}

customTargetRange.addEventListener("input", () => {
  customTargetLufs = parseFloat(customTargetRange.value);
  customTargetNumber.value = customTargetLufs;
  updateGain();
});
customTargetNumber.addEventListener("input", () => {
  const value = parseFloat(customTargetNumber.value);
  if (Number.isNaN(value)) return;
  customTargetLufs = Math.max(CUSTOM_TARGET_MIN, Math.min(CUSTOM_TARGET_MAX, value));
  customTargetRange.value = customTargetLufs;
  updateGain();
});

// --- 3. A/B試聴 ---

function setNormalized(value) {
  normalized = value;
  abOriginalButton.classList.toggle("active", !normalized);
  abNormalizedButton.classList.toggle("active", normalized);
  abOriginalButton.setAttribute("aria-pressed", String(!normalized));
  abNormalizedButton.setAttribute("aria-pressed", String(normalized));
  if (abPlayer) abPlayer.setNormalized(normalized);
  if (analysis) updateRuler();
}

abOriginalButton.addEventListener("click", () => setNormalized(false));
abNormalizedButton.addEventListener("click", () => setNormalized(true));

playButton.addEventListener("click", () => {
  if (!abPlayer) return;
  if (abPlayer.playing) {
    abPlayer.stop();
    setPlayState(false);
  } else {
    abPlayer.onEnded = () => setPlayState(false);
    abPlayer.play(0);
    setPlayState(true);
  }
});

// --- 4. WAV書き出し ---

exportButton.addEventListener("click", async () => {
  if (!audioBuffer) return;

  exportButton.disabled = true;
  exportLabel.textContent = "書き出し中…";
  await new Promise((resolve) => setTimeout(resolve, 0));

  try {
    const gainLinear = Math.pow(10, currentGainDb / 20);
    const channelData = [];
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      const src = audioBuffer.getChannelData(ch);
      const out = new Float32Array(src.length);
      for (let i = 0; i < src.length; i++) out[i] = src[i] * gainLinear;
      channelData.push(out);
    }

    const blob = encodeWav(channelData, audioBuffer.sampleRate);
    const baseName = currentFile.name.replace(/\.[^./]+$/, "");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}_normalized.wav`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  } finally {
    exportButton.disabled = false;
    exportLabel.textContent = "WAVで書き出す";
  }
});

// --- 5. ドロップ/ファイル選択 ---

browseButton.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => {
  if (fileInput.files.length > 0) handleFile(fileInput.files[0]);
  fileInput.value = "";
});

["dragenter", "dragover"].forEach((eventName) => {
  document.body.addEventListener(eventName, (e) => {
    e.preventDefault();
    document.body.classList.add("app-dragover");
  });
});
["dragleave", "drop"].forEach((eventName) => {
  document.body.addEventListener(eventName, (e) => {
    e.preventDefault();
    if (eventName === "drop") {
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    }
    document.body.classList.remove("app-dragover");
  });
});

function clearSession() {
  if (abPlayer) abPlayer.stop();
  currentFile = null;
  audioBuffer = null;
  analysis = null;
  abPlayer = null;
  normalized = false;
  setPlayState(false);
  silentNote.classList.add("hidden");
  stageRuler.update({});
}

resetButton.addEventListener("click", () => {
  clearSession();
  showView("drop");
});

// --- 6. テーマ切替 ---

const THEME_KEY = "lufsNormalizerTheme";

// 初期テーマはindex.htmlの<head>内スクリプトで確定済み。ここでは切り替えだけを扱う
themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch (e) {
    /* 保存できない環境では今回の表示だけ切り替える */
  }
});

// --- PWA: Service Worker登録 ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW登録失敗", err));
  });
}

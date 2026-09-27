import { analyzeLoudness } from "./lufsMeter.js";
import { TARGET_PRESETS, CUSTOM_TARGET_MIN, CUSTOM_TARGET_MAX, CUSTOM_TARGET_DEFAULT, GAIN_CLAMP_DB } from "./presets.js";
import { encodeWav } from "./wavEncoder.js";
import { AbPlayer } from "./player.js";

const dropSection = document.getElementById("drop-section");
const dropZone = document.getElementById("drop-zone");
const fileInput = document.getElementById("file-input");
const browseButton = document.getElementById("browse-button");

const analyzeSection = document.getElementById("analyze-section");
const analyzeFilename = document.getElementById("analyze-filename");
const analyzePercent = document.getElementById("analyze-percent");
const analyzeBar = document.getElementById("analyze-bar");
const analyzeLabel = document.getElementById("analyze-label");

const appSection = document.getElementById("app-section");
const fileInfoEl = document.getElementById("file-info");

const integratedValueEl = document.getElementById("integrated-value");
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

const exportButton = document.getElementById("export-button");
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

customTargetRange.min = CUSTOM_TARGET_MIN;
customTargetRange.max = CUSTOM_TARGET_MAX;
customTargetNumber.min = CUSTOM_TARGET_MIN;
customTargetNumber.max = CUSTOM_TARGET_MAX;
customTargetRange.value = CUSTOM_TARGET_DEFAULT;
customTargetNumber.value = CUSTOM_TARGET_DEFAULT;

function showView(name) {
  dropSection.classList.toggle("hidden", name !== "drop");
  analyzeSection.classList.toggle("hidden", name !== "analyze");
  appSection.classList.toggle("hidden", name !== "app");
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
  const sign = db >= 0 ? "+" : "";
  return `${sign}${db.toFixed(1)}`;
}

// --- 1. ファイル読み込み〜解析フェーズ ---

async function handleFile(file) {
  currentFile = file;
  audioBuffer = null;
  analysis = null;
  normalized = false;

  analyzeFilename.textContent = file.name;
  analyzeLabel.textContent = "読み込み中…";
  analyzeBar.style.width = "0%";
  analyzePercent.textContent = "0%";
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
      analyzePercent.textContent = `${percent}%`;
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
    <span class="name">${file.name}</span>
    <span class="meta">${formatDuration(audioBuffer.duration)} ・ ${audioBuffer.sampleRate} Hz ・ ${audioBuffer.numberOfChannels}ch ・ ${formatBytes(file.size)}</span>
  `;

  integratedValueEl.textContent = analysis.integratedLufs <= -99 ? "--" : analysis.integratedLufs.toFixed(1);
  lraValueEl.textContent = analysis.loudnessRangeLu.toFixed(1);

  renderTargetList();
  updateGain();

  abOriginalButton.classList.add("active");
  abNormalizedButton.classList.remove("active");
  playButton.textContent = "▶ 再生";
}

function renderTargetList() {
  targetListEl.innerHTML = "";
  for (const preset of TARGET_PRESETS) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "target-card" + (preset.id === selectedPresetId ? " active" : "");
    button.innerHTML = `
      <span class="label">${preset.label}</span>
      <span class="note">${preset.lufs === null ? "任意の値" : `${preset.lufs} LUFS`}</span>
    `;
    button.addEventListener("click", () => {
      selectedPresetId = preset.id;
      renderTargetList();
      customTargetRow.classList.toggle("hidden", preset.id !== "custom");
      updateGain();
    });
    targetListEl.appendChild(button);
  }
  customTargetRow.classList.toggle("hidden", selectedPresetId !== "custom");
}

function getCurrentTargetLufs() {
  const preset = TARGET_PRESETS.find((p) => p.id === selectedPresetId);
  return preset.lufs === null ? customTargetLufs : preset.lufs;
}

function updateGain() {
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
  if (abPlayer) abPlayer.setNormalized(normalized);
}

abOriginalButton.addEventListener("click", () => setNormalized(false));
abNormalizedButton.addEventListener("click", () => setNormalized(true));

playButton.addEventListener("click", () => {
  if (!abPlayer) return;
  if (abPlayer.playing) {
    abPlayer.stop();
    playButton.textContent = "▶ 再生";
  } else {
    abPlayer.onEnded = () => {
      playButton.textContent = "▶ 再生";
    };
    abPlayer.play(0);
    playButton.textContent = "■ 停止";
  }
});

// --- 4. WAV書き出し ---

exportButton.addEventListener("click", async () => {
  if (!audioBuffer) return;

  exportButton.disabled = true;
  exportButton.textContent = "書き出し中…";
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
    exportButton.textContent = "⬇ ノーマライズ後をWAVで書き出す";
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

resetButton.addEventListener("click", () => {
  if (abPlayer) abPlayer.stop();
  currentFile = null;
  audioBuffer = null;
  analysis = null;
  abPlayer = null;
  showView("drop");
});

// --- 6. テーマ切替 ---

const THEME_KEY = "lufsNormalizerTheme";

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeToggle.textContent = theme === "dark" ? "☀" : "🌙";
}

function initTheme() {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored === "dark" || stored === "light") {
    applyTheme(stored);
    return;
  }
  applyTheme(window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark");
}

themeToggle.addEventListener("click", () => {
  const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(next);
  localStorage.setItem(THEME_KEY, next);
});

initTheme();

// --- PWA: Service Worker登録 ---
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch((err) => console.warn("SW登録失敗", err));
  });
}

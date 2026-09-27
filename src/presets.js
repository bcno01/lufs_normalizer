// ノーマライズ目標プリセット。VST版(PluginProcessor.cpp)と同じ値。
export const TARGET_PRESETS = [
  { id: "spotify-youtube", label: "Spotify / YouTube", lufs: -14 },
  { id: "apple-music", label: "Apple Music", lufs: -16 },
  { id: "ebu-r128", label: "EBU R128", lufs: -23 },
  { id: "custom", label: "カスタム", lufs: null },
];

export const CUSTOM_TARGET_MIN = -36;
export const CUSTOM_TARGET_MAX = -6;
export const CUSTOM_TARGET_DEFAULT = -23;

// VST版と同じく、非現実的な大ゲインを避けるための上下限
export const GAIN_CLAMP_DB = 24;

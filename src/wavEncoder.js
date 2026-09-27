// ブラウザ標準APIにはWAVエンコーダがないため、16bit PCM WAV(44byteヘッダ+データ)を自前で組み立てる。

/**
 * @param {Float32Array[]} channelData チャンネルごとの全サンプル(-1〜1想定)
 * @param {number} sampleRate
 * @returns {Blob}
 */
export function encodeWav(channelData, sampleRate) {
  const numChannels = channelData.length;
  const numFrames = numChannels > 0 ? channelData[0].length : 0;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  function writeString(offset, str) {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  }

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const clamped = Math.max(-1, Math.min(1, channelData[ch][i]));
      view.setInt16(offset, Math.round(clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff), true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

# LUFS Normalizer (PWA版)

音声ファイルをドロップするだけで、**手元のブラウザだけで**Integrated LUFS / LRA(Loudness Range)を計測し、
目標ラウドネス(Spotify/YouTube -14, Apple Music -16, EBU R128 -23, カスタム)との差分ゲインを適用した
WAVファイルを書き出せるPWA。

元は[JUCE (C++)製のVST3/AUプラグイン](../../../Claude/VSTBuild/Projects/LufsNormalizer)として作られたが、
ブラウザはDAWのリアルタイム音声ストリームに触れられないため、PWA化にあたって
「ファイルを読み込む → 計測する → ノーマライズして書き出す」というファイルベースの体験に作り替えた
(2026-09-28、ユーザーとの相談でこの方針に決定)。

## コンセプトと制約

- 通信・アップロード処理は一切なし。音声のデコードはブラウザ標準の`AudioContext.decodeAudioData`を使い、
  すべてローカルで完結する。
- 対応入力は音声ファイルのみ(`accept="audio/*"`)。動画ファイルの音声トラック抽出は対象外
  (必要になった場合はsns_quality_checker同様にffmpeg.wasmの追加実装を検討)。
- Momentary(400ms)/Short-termのリアルタイムメーター表示は実装しない。ファイル全体を解析した後の
  Integrated LUFSとLRAの最終値のみを表示する(VST版のような再生中バーグラフはPWA版のスコープ外)。
- 書き出しは常に**16bit PCM WAV**(ブラウザ標準APIにWAVエンコーダがないため自前実装)。元のファイル形式
  (mp3/m4a等)に関わらずWAVになる。

## 計測アルゴリズム

VST版の`LufsMeter.cpp`(libebur128準拠)をJavaScriptにそのまま移植したものを
[src/lufsMeter.js](src/lufsMeter.js)に実装している。ロジックの由来やゲーティングの詳細はコード内コメント参照。

- Kウェイティング = プレフィルタ(ハイシェルフ)+ RLBフィルタ(ハイパス)の2段バイクアッド
- Integrated LUFS: 400msブロックを100msごとに算出し絶対ゲート(-70LUFS)通過分を蓄積、
  その平均から相対ゲート(-10LU)を計算して2パス目の平均から算出(ITU-R BS.1770-4準拠)
- LRA: 3000ms窓のShort-term値を1000msごとにサンプリングし、絶対ゲート(-70LUFS)通過分の
  相対ゲート(-20LU)を経て10/95パーセンタイルの差から算出(EBU Tech 3342準拠)
- リアルタイム処理ではないため、ファイル全体を1回のループで解析する(VST版のような
  トランスポート再生開始位置による再積算のロジックは不要で実装していない)

## ノーマライズ・A/B試聴・書き出し

- 目標LUFSと計測したIntegrated LUFSの差分ゲイン(±24dBにクランプ、VST版と同じ)を
  [src/presets.js](src/presets.js)の`GAIN_CLAMP_DB`で制御している。
- ORIGINAL/NORMALIZEDの切り替えは、同じ`AudioBufferSourceNode`を止めずに`GainNode`の値を
  80msでランプ切り替えすることで実現している([src/player.js](src/player.js))。VST版のクリックノイズ
  防止スムージングと同じ考え方。
- 書き出し時は元データにゲインを直接掛けて16bit PCMにパックするだけで、A/B試聴用のランプ処理は関係ない
  (静的な一括変換)。

## 既知の設計上の注意点

- **クリッピング**: ノーマライズゲインを適用した結果、サンプルピークが0dBFSを超える場合は警告を表示するが、
  ブリックウォールリミッター等の自動対策は行わない。書き出したWAVは0dBFSでハードクリップされる
  (VST版はDAW側の後段処理を前提としているためこの心配がなかったが、PWA版は単体で完結する書き出しファイルを
  扱うため追加した安全策)。
- サンプルピークは`decodeAudioData`後の生サンプルの絶対値の最大であり、正式な460ms fs=4倍オーバーサンプリング
  によるTrue Peak(ITU-R BS.1770のAnnex 2)ではない。あくまで簡易的な目安。
- 大きい音声ファイル(数十分単位)は解析・書き出しそれぞれで数秒かかることがある
  (進捗バーが出るのは解析フェーズのみ)。

## 技術構成

- 素のHTML/CSS/JavaScript(ES Modules)。ビルドステップなし。外部ライブラリ・CDN依存なし。
- 音声デコード・再生: Web Audio API(`AudioContext.decodeAudioData` / `AudioBufferSourceNode` / `GainNode`)
- LUFS/LRA計測: [src/lufsMeter.js](src/lufsMeter.js)(純粋関数、外部依存なし)
- WAVエンコード: [src/wavEncoder.js](src/wavEncoder.js)(自前実装)
- 配色: VST版[RackTheme.cpp](../../../Claude/VSTBuild/Projects/LufsNormalizer/Source/RackTheme.cpp)の
  ダーク/ライトパレットをCSS変数として踏襲([css/style.css](css/style.css))

## 動作確認方法

Node.js不要。プロジェクトルートで以下を実行してブラウザで開く。

```
python -m http.server 8000
```

`http://localhost:8000/` を開く。

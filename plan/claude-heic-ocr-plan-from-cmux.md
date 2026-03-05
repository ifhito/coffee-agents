# 計画: HEIC自動変換 + 画像フォーマットバリデーション（cmux読み取り）

## 取得元

- 取得日時: 2026-03-05
- 取得コマンド:
  - `cmux read-screen --workspace workspace:1 --surface surface:1 --scrollback --lines 1400`
- 対象タブ: `✳ Claude Code`

## Claude Code 側で提示されていた plan（要約転記）

### Context

- iPhone画像（HEIC）をアップロードすると、Ollama 側で `Internal Server Error` になりうる。
- OpenAI は HEIC を直接扱えるが、Ollama パスではサーバー側で JPEG 変換が必要。
- 現状は PDF など非対応形式が深い層まで進んでしまうため、早期バリデーションが必要。

### 対応方針

1. スキーマ層で MIME タイプリストによる許可制限
2. ツール層で HEIC/HEIF を JPEG へ変換（当初 sharp、最終的に heic-convert）
3. フロントエンドで非対応形式を事前拒否
4. テスト拡充（HEIC変換、フォーマットバリデーション、Ollamaエラー系）

### 変更対象（plan記載）

- `package.json`
- `src/mastra/lib/ocr-types.ts`
- `src/mastra/tools/ocr/extract-coffee-image-tool.ts`
- `src/frontend/api/coffeeOcrClient.ts`
- `tests/mastra/extract-coffee-image-tool.test.ts`

### 実行ログ上の重要な方針変更

- `sharp` で HEIC デコード時に `No decoding plugin installed` が発生。
- そのため `heic-convert` に切り替え（WASM版 libheif を使い環境依存を低減）。

## 続き実装で反映した内容（このセッション）

1. `ChatApp` で `validateImageFormat(file)` を実際に呼び出すよう接続
2. `MessageInput` の `accept` を許可フォーマットに限定
3. `validateImageFormat` 用ユニットテストを新規追加

## 現在の実装状況（plan突合）

- [x] サーバー側 HEIC/HEIF -> JPEG 変換（`heic-convert`）
- [x] `ingestionInputSchema` の MIME 許可リスト
- [x] フロントエンド検証関数の実装（`validateImageFormat`）
- [x] フロントエンド送信経路での検証呼び出し
- [x] OCRツール側テスト拡充
- [x] フロント検証の単体テスト追加
- [ ] 実機ファイルでの手動 E2E 確認（HEIC/JPEG/非対応拡張子）


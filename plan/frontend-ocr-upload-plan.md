# 計画: Reactフロントエンドから画像添付でOCR取込ワークフローを呼び出す

## Context

既存のチャットUI（`src/frontend/`）に対して、コーヒーラベル画像をアップロードし
バックエンドの `POST /api/coffee/ocr/ingest` を呼び出す機能を追加する。
認証機能がないため、user_id は localStorage で UUID を永続化して使用する。

---

## 変更・作成ファイル一覧

| ファイル | 種別 | 変更概要 |
|---|---|---|
| `src/frontend/types.ts` | 変更（小） | `OcrResult` 型を追加 |
| `src/frontend/api/coffeeOcrClient.ts` | **新規作成** | OCR API クライアント一式 |
| `src/frontend/components/MessageInput.tsx` | 変更（中） | 画像ボタン・プレビューUI追加 |
| `src/frontend/components/ChatApp.tsx` | 変更（中） | `handleSendImage` 追加 |
| `src/frontend/styles.css` | 変更（小） | 追記のみ（既存CSS変更なし） |

---

## Step 1: `src/frontend/types.ts` に型追加

`OcrResult` 型を末尾に追加:

```typescript
export type OcrResult = {
  inserted: boolean;
  extracted: {
    bean_name: string | null;
    bean_type: string | null;
    roast_level: string | null;
    shop_name: string | null;
    shop_address: string | null;
    acidity: number | null;
    aroma: number | null;
    bitterness: number | null;
    overall_rating: number | null;
  } | null;
  reason?: string;
};
```

---

## Step 2: 新規作成 `src/frontend/api/coffeeOcrClient.ts`

4つの関数をエクスポート:

### `getOrCreateUserId(): string`
```typescript
const USER_ID_KEY = 'coffee_user_id';
export function getOrCreateUserId(): string {
  const stored = localStorage.getItem(USER_ID_KEY);
  if (stored) return stored;
  const newId = crypto.randomUUID();
  localStorage.setItem(USER_ID_KEY, newId);
  return newId;
}
```

### `fileToBase64(file: File): Promise<string>`
```typescript
export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file); // → "data:image/jpeg;base64,..." 形式で返る
  });
}
```

### `sendImageForOcr(imageBase64, userId, isPublic): Promise<OcrResult>`
- `coffeeAgentClient.ts` と同じ `fetch` パターンで実装
- `baseUrl = import.meta.env.VITE_MASTRA_BASE_URL ?? ''`
- `POST ${baseUrl}/api/coffee/ocr/ingest`
- Body: `{ imageBase64, user_id: userId, is_public: isPublic }`

### `formatOcrResult(result: OcrResult): string`
結果を Markdown テーブルに整形して返す（markdown-it はデフォルトでテーブルをサポート済み）:
```
**コーヒーラベルを登録しました！** または **取り込みに失敗しました**

| 項目 | 内容 |
|------|------|
| 豆名 | エチオピア イルガチェフェ |
| 酸味 | ★★★★☆ |
...
```
失敗時: `**画像の取り込みに失敗しました**\n\n理由: ${result.reason ?? '不明'}`

---

## Step 3: `src/frontend/components/MessageInput.tsx` の変更

### Props 変更
```typescript
type MessageInputProps = {
  onSend: (message: string) => void;
  onSendImage: (file: File, message?: string) => void;  // 追加
  disabled?: boolean;
};
```

### 追加 state と ref
```typescript
const [previewUrl, setPreviewUrl] = useState<string | null>(null);
const [selectedFile, setSelectedFile] = useState<File | null>(null);
const fileInputRef = useRef<HTMLInputElement>(null);
```

### JSX 構造変更
現在の `grid-template-columns: 1fr auto` のフォームに、プレビューエリアと画像ボタンを追加。
`message-form` の grid を `auto 1fr auto`（画像ボタン・textarea・送信ボタン）に変更し、
プレビューエリアは `grid-column: 1 / -1` で全幅に配置する（条件付き描画）:

```jsx
<form className="message-form" onSubmit={handleSubmit}>
  {/* 画像プレビュー（選択時のみ表示）: 全幅 */}
  {previewUrl && (
    <div className="image-preview">
      <img src={previewUrl} alt="選択した画像" />
      <button type="button" className="image-preview-clear" onClick={clearImage} aria-label="画像を削除">✕</button>
    </div>
  )}
  {/* hidden file input */}
  <input
    type="file"
    ref={fileInputRef}
    accept="image/*"
    onChange={handleFileChange}
    hidden
  />
  {/* 画像アップロードボタン */}
  <button
    type="button"
    className="image-upload-btn"
    onClick={() => fileInputRef.current?.click()}
    disabled={disabled}
    aria-label="画像を選択"
  >
    <svg .../>  {/* カメラアイコン */}
  </button>
  {/* 既存 textarea */}
  <textarea .../>
  {/* 既存 送信ボタン */}
  <button type="submit" disabled={disabled || (!value.trim() && !selectedFile)}>
    送信
  </button>
</form>
```

### handleSubmit の変更
画像が選択されていれば `onSendImage(selectedFile, text?)` を呼ぶ、なければ既存の `onSend(text)` を呼ぶ:
```typescript
if (selectedFile) {
  onSendImage(selectedFile, value.trim() || undefined);
  setValue('');
  clearImage();
} else {
  if (!value.trim()) return;
  onSend(value.trim());
  setValue('');
}
```

### clearImage
```typescript
const clearImage = () => {
  setSelectedFile(null);
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  setPreviewUrl(null);
  if (fileInputRef.current) fileInputRef.current.value = '';
};
```

---

## Step 4: `src/frontend/components/ChatApp.tsx` の変更

### 追加インポート
```typescript
import { sendImageForOcr, fileToBase64, formatOcrResult, getOrCreateUserId } from '../api/coffeeOcrClient';
import type { OcrResult } from '../types';
```

### handleSendImage を追加
```typescript
const handleSendImage = async (file: File, text?: string) => {
  const userMessage: ChatMessage = {
    id: crypto.randomUUID(),
    role: 'user',
    content: text ? `[画像] ${text}` : '[コーヒーラベル画像をアップロードしました]',
    timestamp: new Date(),
  };
  setMessages((prev) => [...prev, userMessage]);
  setError(null);
  setIsLoading(true);

  try {
    const imageBase64 = await fileToBase64(file);
    const userId = getOrCreateUserId();
    const result = await sendImageForOcr(imageBase64, userId, false);
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: formatOcrResult(result),
        timestamp: new Date(),
      },
    ]);
  } catch (err) {
    setError(err instanceof Error ? err.message : '画像の送信に失敗しました。');
  } finally {
    setIsLoading(false);
  }
};
```

### MessageInput に onSendImage を渡す
```tsx
<MessageInput onSend={handleSend} onSendImage={handleSendImage} disabled={isLoading} />
```

---

## Step 5: `src/frontend/styles.css` への追記（末尾）

### `.message-form` の grid を3列に変更
**既存の** `grid-template-columns: 1fr auto` を `auto 1fr auto` に変更（画像ボタン追加）。
また、画像プレビューが `grid-column: 1 / -1` で全幅に収まるよう対応。

モバイル `@media (max-width: 640px)` も `grid-template-columns: auto 1fr` に調整し、
送信ボタンは `grid-column: 1 / -1; width: 100%` に変更。

### 追加クラス
```css
/* 画像ボタン: .message-form button の orange pill スタイルを上書き */
.image-upload-btn {
  background: var(--card);
  border: 1px solid var(--border);
  color: var(--muted);
  border-radius: 12px;
  padding: 10px 12px;
  box-shadow: none;
  font-size: 1.1rem;
  line-height: 1;
  transition: background 0.15s ease, color 0.15s ease;
}
.image-upload-btn:hover:not(:disabled) {
  background: rgba(224, 107, 58, 0.1);
  color: var(--accent);
  transform: none;
  box-shadow: none;
}

/* 画像プレビュー */
.image-preview {
  grid-column: 1 / -1;    /* 全幅 */
  position: relative;
  display: inline-block;
}
.image-preview img {
  display: block;
  max-height: 100px;
  max-width: 160px;
  border-radius: 10px;
  border: 1px solid var(--border);
  object-fit: cover;
}
.image-preview-clear {
  position: absolute;
  top: -8px; right: -8px;
  width: 20px; height: 20px;
  border-radius: 50%;
  border: none;
  background: var(--accent);
  color: #fff;
  font-size: 0.65rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* OCR結果テーブル */
.message-content table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.88rem;
  margin: 4px 0;
}
.message-content th,
.message-content td {
  border: 1px solid var(--border);
  padding: 5px 10px;
  text-align: left;
}
.message-content th {
  background: rgba(224, 107, 58, 0.08);
  font-weight: 600;
}
```

---

## 検証方法

1. `npm run dev`（バックエンド）と `npm run frontend:dev`（フロントエンド）を別ターミナルで起動
2. ブラウザで `http://localhost:5173` を開く
3. カメラアイコンボタンをクリック → 画像ファイルを選択
4. サムネイルプレビューが表示されることを確認
5. 送信ボタンをクリック
6. チャット欄にOCR結果テーブルが表示されることを確認
7. OCR_PROVIDER=openai / ollama 両方で動作確認
8. `localStorage` に `coffee_user_id` が保存されていることをDevToolsで確認

# プラン: OCRレビューステップの追加

## Context
現在、画像アップロード後にOCRで抽出したデータが即座にSupabaseに書き込まれる。
ユーザーが抽出内容を確認・修正してから登録できるよう、DB書き込み前にレビューステップを挟む。

## 現在のフロー
```
画像アップロード → OCR抽出 → 即DB INSERT → チャットに結果表示
```

## 変更後のフロー
```
画像アップロード → OCR抽出 → レビューモーダル表示 → ユーザー確認/修正 → DB INSERT → チャットに結果表示
```

---

## 実装ステップ

### Step 1: APIハンドラファイルを新規作成
**`src/mastra/api/ocr-handlers.ts`** (新規作成)

`index.ts`への変更を最小化するため、2つの新ハンドラをここに定義する。

- `handleCoffeeOcrExtract`: `POST /api/coffee/ocr/extract`
  - `ingestionInputSchema`でバリデーション
  - `extractCoffeeFromImageTool.execute()`を直接呼び出し
  - 戻り値: `{ success, extracted, message }`

- `handleCoffeeOcrConfirm`: `POST /api/coffee/ocr/confirm`
  - 新規スキーマ（`extracted` + `user_id` + `is_public`）でバリデーション
  - `insertCoffeeEvaluationTool.execute()`を直接呼び出し
  - 戻り値: `{ inserted, extracted, reason? }`

```typescript
// confirmのリクエストスキーマ (このファイル内に定義)
const confirmRequestSchema = z.object({
  extracted: extractedCoffeeSchema,
  user_id:   z.string().uuid(),
  is_public: z.boolean().default(false),
});
```

### Step 2: index.ts に2つのルートを追加
**`src/mastra/index.ts`** (変更: 2箇所のみ)

変更1: インポート追加
```typescript
import { handleCoffeeOcrExtract, handleCoffeeOcrConfirm } from './api/ocr-handlers';
```

変更2: `apiRoutes[]`に2エントリ追加
```typescript
{ path: '/api/coffee/ocr/extract', method: 'POST', handler: handleCoffeeOcrExtract },
{ path: '/api/coffee/ocr/confirm', method: 'POST', handler: handleCoffeeOcrConfirm },
```

既存の `/api/coffee/ocr/ingest` は変更しない（後方互換性を維持）。

### Step 3: フロントエンドAPIクライアントを新規作成
**`src/frontend/api/coffeeOcrReviewClient.ts`** (新規作成)

既存の `coffeeOcrClient.ts` は変更しない。

```typescript
export async function extractImageForReview(
  imageBase64: string, userId: string, isPublic: boolean
): Promise<{ success: boolean; extracted: ExtractedCoffee | null; message: string }>

export async function confirmOcrInsert(
  extracted: ExtractedCoffee, userId: string, isPublic: boolean
): Promise<{ inserted: boolean; extracted: ExtractedCoffee | null; reason?: string }>
```

### Step 4: レビューモーダルコンポーネントを新規作成
**`src/frontend/components/OcrReviewModal.tsx`** (新規作成)

```typescript
type OcrReviewModalProps = {
  extracted: ExtractedCoffee;
  onConfirm: (edited: ExtractedCoffee) => void;
  onCancel: () => void;
  isSubmitting: boolean;
};
```

- 全フィールドを編集可能なフォームとして表示
- `roast_level`: `<select>` (6つのenum値 + 空白)
- 評価値 (acidity等): `<input type="number" min="1" max="5">`
- `bean_name` または `overall_rating` が空の場合、登録ボタンを disabled
- `isSubmitting=true` 中は全フィールド・ボタンを disabled
- 既存の CSS 変数 (`--card`, `--border`, `--accent` 等) を使用

### Step 5: ChatApp.tsx を2フェーズフローに変更
**`src/frontend/components/ChatApp.tsx`** (変更)

追加するstate:
```typescript
const [pendingReview, setPendingReview] = useState<{
  extracted: ExtractedCoffee;
  userId: string;
  isPublic: boolean;
} | null>(null);
const [isConfirming, setIsConfirming] = useState(false);
```

`handleSendImage` の変更:
- `sendImageForOcr()` → `extractImageForReview()` に置き換え
- 成功時: `setPendingReview(...)` でモーダルを開く（DBには書き込まない）
- 失敗時: 既存と同様にチャットにエラーメッセージを表示

新規追加ハンドラ:
- `handleReviewConfirm(editedExtracted)`: `confirmOcrInsert()` を呼び出し → モーダルを閉じ → チャットに結果表示
- `handleReviewCancel()`: `setPendingReview(null)` でモーダルを閉じる（DBには書き込まない）

JSXに追加:
```tsx
{pendingReview && (
  <OcrReviewModal
    extracted={pendingReview.extracted}
    onConfirm={handleReviewConfirm}
    onCancel={handleReviewCancel}
    isSubmitting={isConfirming}
  />
)}
```

`MessageInput` の `disabled` を `isLoading || pendingReview !== null` に変更（モーダル中は入力を防ぐ）。

---

## 変更ファイル一覧

| ファイル | 操作 |
|---------|------|
| `src/mastra/api/ocr-handlers.ts` | 新規作成 |
| `src/mastra/index.ts` | 変更（2箇所のみ） |
| `src/frontend/api/coffeeOcrReviewClient.ts` | 新規作成 |
| `src/frontend/components/OcrReviewModal.tsx` | 新規作成 |
| `src/frontend/components/ChatApp.tsx` | 変更 |

### 変更しないファイル
- `src/mastra/workflows/coffee-ingestion-workflow.ts` (既存の1ステップフロー維持)
- `src/mastra/tools/ocr/extract-coffee-image-tool.ts`
- `src/mastra/tools/ocr/insert-coffee-evaluation-tool.ts`
- `src/mastra/lib/ocr-types.ts`
- `src/frontend/api/coffeeOcrClient.ts`
- 全推薦システムファイル (coffee-agent.ts 等)

---

## 検証方法

1. **開発サーバー起動**: `npm run dev`
2. **手動テスト**:
   - 画像アップロード → レビューモーダルが表示されること
   - フィールドを編集して「登録する」→ チャットに成功メッセージ
   - 「キャンセル」→ モーダルが閉じ、DBに何も書き込まれていないこと
3. **API直接テスト** (curl):
   - `POST /api/coffee/ocr/extract` が `{ success, extracted }` を返すこと
   - `POST /api/coffee/ocr/confirm` が `{ inserted: true }` を返すこと
4. **既存テスト**: `npm test` で全テスト通過を確認

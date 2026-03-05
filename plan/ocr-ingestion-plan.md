# OCR取込ワークフロー 実装計画（エージェントチーム向け）

## 概要

画像1枚からコーヒー情報をOCR抽出し、`coffee_evaluations` テーブルに登録するワークフローを新設する。
既存の推薦系（`coffeeAgent` / `coffee-tool.ts` / `/api/coffee/generate`）は**一切変更しない**。

---

## エージェントチーム構成

| エージェント | 担当 | 依存 |
|---|---|---|
| **Agent-Infra** | 共有型・Supabaseシングルトン | なし（最初に実行） |
| **Agent-Tool-OCR** | OCR + 構造化ツール | Agent-Infra の成果物 |
| **Agent-Tool-Insert** | DB登録ツール | Agent-Infra の成果物 |
| **Agent-Workflow** | ワークフロー統合 | Agent-Tool-OCR・Agent-Tool-Insert の成果物 |
| **Agent-API** | APIルート追加・index.ts 更新 | Agent-Workflow の成果物 |
| **Agent-Test** | テスト実装 | Agent-API の成果物 |

## 実行フェーズ（依存関係グラフ）

```
Phase 1 ─── Agent-Infra
                 │
         ┌───────┴───────┐
Phase 2  Agent-Tool-OCR  Agent-Tool-Insert  ← 並列実行可
         └───────┬───────┘
Phase 3 ─── Agent-Workflow
                 │
Phase 4 ─── Agent-API
                 │
         ┌───────┼──────────┐
Phase 5  Test-Unit  Test-Int  Test-Regression  ← 並列実行可
```

---

## 絶対に変更してはいけないファイル

以下のファイルはいかなる理由があっても編集禁止とする。

```
src/mastra/agents/coffee-agent.ts
src/mastra/tools/coffee-tool.ts
src/mastra/tools/coffee-comparison-tool.ts
src/mastra/workflows/coffee-comparison-workflow.ts
src/mastra/agents/weather-agent.ts
src/mastra/tools/weather-tool.ts
src/mastra/workflows/weather-workflow.ts
```

`src/mastra/index.ts` は **Phase 4 の Agent-API のみ**が編集する。
他のエージェントはこのファイルに触れない。

---

## OCRモデル選定

### 採用方針

| 優先度 | モデル | 方式 | サイズ | 導入方法 |
|---|---|---|---|---|
| 第1推奨 | `qwen2.5vl:7b` | VLM（Vision LLM） | ~6GB | `ollama pull qwen2.5vl` |
| 第2推奨 | `minicpm-v` | VLM（Vision LLM） | ~5.5GB | `ollama pull minicpm-v` |
| フォールバック | GPT-4o-mini Vision | クラウドVLM | — | 既存 `OPENAI_API_KEY` 流用 |

- **Tesseractは採用しない**: 多段パイプライン・日本語精度・複雑レイアウトの3点で劣る
- VLMは画像を直接受け取り、OCR・構造化・正規化を**単一パス**で処理できる
- `qwen2.5vl:7b` は日本語を公式サポートしており、コーヒーラベル・レシートの日英混在テキストに対応

### モデル切り替え

環境変数 `OCR_MODEL` でモデル名を指定する。デフォルトは `qwen2.5vl`。

```
OCR_MODEL=qwen2.5vl          # Ollamaモデル名
OCR_PROVIDER=ollama           # "ollama" or "openai"
```

---

## Phase 1: Agent-Infra

### 担当ファイル（新規作成のみ）

```
src/mastra/lib/supabase-client.ts   ← 新規作成
src/mastra/lib/ocr-types.ts         ← 新規作成
```

### タスク 1-A: `src/mastra/lib/supabase-client.ts`

既存コードでは `coffee-tool.ts` と `coffee-comparison-workflow.ts` がそれぞれ独立して
`createClient()` を呼んでいる。OCR用のINSERTには `service_role` キーが必要なため、
管理用クライアントをシングルトンとして新設する。

**実装仕様:**

```typescript
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// 既存の推薦系ツールが使う anon キー（読み取り専用相当）
// ※ 既存ファイルはこのクライアントに移行しない（既存変更禁止のため）
const supabaseUrl = process.env.SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

if (!supabaseUrl) {
  console.warn('[supabase-client] SUPABASE_URL が未設定です');
}

// OCR INSERT用: RLSをバイパスするサービスロールクライアント
// サーバーサイド専用 - フロントエンドに露出禁止
export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;
```

**受け入れ条件:**
- `supabaseAdmin` が `null` の場合でもimportでクラッシュしない
- フロントエンドコード（`src/frontend/`）からはimportしない

---

### タスク 1-B: `src/mastra/lib/ocr-types.ts`

Agent-Tool-OCR と Agent-Tool-Insert が共有するZodスキーマと型定義。
このファイルで確定したスキーマからは勝手に変更しない。

**実装仕様:**

```typescript
import { z } from 'zod';

// coffee_evaluations テーブルの数値カラムのスケール: 1-5
const ratingSchema = z.number().int().min(1).max(5);

// VLMが構造化して返すコーヒー評価データ
// null は「画像から読み取れなかった」を意味する
export const extractedCoffeeSchema = z.object({
  bean_name:    z.string().nullable().describe('豆名（例: エチオピア イルガチェフェ）'),
  bean_type:    z.string().nullable().describe('品種（例: アラビカ, ゲイシャ）'),
  roast_level:  z.enum(['浅煎り', '中煎り', '深煎り', 'light', 'medium', 'dark']).nullable(),
  shop_name:    z.string().nullable().describe('購入店舗名'),
  shop_address: z.string().nullable().describe('店舗住所'),
  acidity:      ratingSchema.nullable().describe('酸味 1-5'),
  aroma:        ratingSchema.nullable().describe('香り 1-5'),
  bitterness:   ratingSchema.nullable().describe('苦味 1-5'),
  overall_rating: ratingSchema.nullable().describe('総合評価 1-5'),
});

export type ExtractedCoffee = z.infer<typeof extractedCoffeeSchema>;

// INSERT時に必須とするカラム（これが揃わなければ登録しない）
export const REQUIRED_FIELDS: (keyof ExtractedCoffee)[] = [
  'bean_name',
  'overall_rating',
];

// APIリクエストで受け取るメタデータ（画像から取得できない情報）
export const ingestRequestMetaSchema = z.object({
  user_id:   z.string().uuid('user_id はUUID形式で指定してください'),
  is_public: z.boolean().default(false),
});

export type IngestRequestMeta = z.infer<typeof ingestRequestMetaSchema>;

// ワークフロー全体の入力スキーマ
// imageBase64: data URL形式 ("data:image/jpeg;base64,...")
export const ingestionInputSchema = z.object({
  imageBase64: z.string().min(1, '画像データが空です'),
  user_id:     z.string().uuid(),
  is_public:   z.boolean().default(false),
});

export type IngestionInput = z.infer<typeof ingestionInputSchema>;

// ワークフロー全体の出力スキーマ
export const ingestionOutputSchema = z.object({
  inserted:  z.boolean(),
  extracted: extractedCoffeeSchema.nullable(),
  reason:    z.string().optional().describe('inserted=false の理由'),
});

export type IngestionOutput = z.infer<typeof ingestionOutputSchema>;
```

**受け入れ条件:**
- このファイルの `extractedCoffeeSchema` / `ingestionInputSchema` / `ingestionOutputSchema` は
  後続エージェントが変更しない
- エクスポートされた型は全て `z.infer` 由来であり、手書きのinterfaceを定義しない

---

## Phase 2: Agent-Tool-OCR（Agent-Infra 完了後に開始）

### 担当ファイル（新規作成のみ）

```
src/mastra/tools/ocr/extract-coffee-image-tool.ts   ← 新規作成
```

### タスク 2-A: `extractCoffeeFromImageTool`

VLMに画像を渡し、OCR・構造化・正規化を単一パスで実行するツール。
`parseCoffeeTextTool` / `normalizeCoffeeDataTool` は作成しない（VLMで代替できるため）。

**参照すべき既存パターン:**
- `src/mastra/tools/coffee-tool.ts` の `createTool` の書き方（inputSchema / outputSchema / execute）
- `coffee-comparison-workflow.ts` の `createStep` の書き方

**実装仕様:**

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { generateObject } from 'ai';
import { createOllama } from 'ollama-ai-provider';
import { openai } from '@ai-sdk/openai';
import 'dotenv/config';
import { extractedCoffeeSchema } from '../../../lib/ocr-types.js';

const OCR_MODEL    = process.env.OCR_MODEL    ?? 'qwen2.5vl';
const OCR_PROVIDER = process.env.OCR_PROVIDER ?? 'ollama';

function getVisionModel() {
  if (OCR_PROVIDER === 'openai') {
    return openai('gpt-4o-mini');
  }
  const ollama = createOllama({
    baseURL: process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/api',
  });
  return ollama(OCR_MODEL);
}

export const extractCoffeeFromImageTool = createTool({
  id: 'extractCoffeeFromImage',
  description: 'コーヒー画像からOCRでテキストを抽出し、構造化JSONに変換する',
  inputSchema: z.object({
    imageBase64: z.string().describe('data URL形式の画像 (data:image/jpeg;base64,...)'),
  }),
  outputSchema: z.object({
    success:   z.boolean(),
    extracted: extractedCoffeeSchema.nullable(),
    message:   z.string(),
  }),
  execute: async ({ context }) => {
    const model = getVisionModel();
    const systemPrompt = `
あなたはコーヒーのラベル・パッケージ・レシートの画像からテキストを読み取り、
指定されたJSONスキーマに従ってデータを抽出するAIです。
読み取れなかった項目は null にしてください。
数値の評価（acidity, aroma, bitterness, overall_rating）は
画像内に記載がない場合は null にしてください。
roast_level は '浅煎り', '中煎り', '深煎り', 'light', 'medium', 'dark' のいずれかに正規化してください。
`.trim();

    try {
      const { object } = await generateObject({
        model,
        schema: extractedCoffeeSchema,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: systemPrompt },
              { type: 'image', image: context.imageBase64 },
            ],
          },
        ],
      });
      return { success: true, extracted: object, message: 'OCR完了' };
    } catch (err) {
      return {
        success: false,
        extracted: null,
        message: `OCRエラー: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  },
});
```

**受け入れ条件:**
- `generateObject` を使って `extractedCoffeeSchema` に準拠したオブジェクトを返す
- OCR失敗時でも例外を throw せず `success: false` で正常終了する
- `OCR_MODEL` / `OCR_PROVIDER` 環境変数でモデルを切り替えられる

---

## Phase 2: Agent-Tool-Insert（Agent-Infra 完了後に並列実行可）

### 担当ファイル（新規作成のみ）

```
src/mastra/tools/ocr/insert-coffee-evaluation-tool.ts   ← 新規作成
```

### タスク 2-B: `insertCoffeeEvaluationTool`

構造化済みデータをSupabaseにINSERTするツール。
必須項目チェックもこのツールが担う。

**実装仕様:**

```typescript
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabaseAdmin } from '../../../lib/supabase-client.js';
import {
  extractedCoffeeSchema,
  ingestionOutputSchema,
  REQUIRED_FIELDS,
} from '../../../lib/ocr-types.js';

export const insertCoffeeEvaluationTool = createTool({
  id: 'insertCoffeeEvaluation',
  description: '抽出されたコーヒー情報をSupabaseに登録する。必須項目が不足している場合は登録しない。',
  inputSchema: z.object({
    extracted: extractedCoffeeSchema,
    user_id:   z.string().uuid(),
    is_public: z.boolean(),
  }),
  outputSchema: ingestionOutputSchema,
  execute: async ({ context }) => {
    const { extracted, user_id, is_public } = context;

    // 必須項目チェック
    const missingFields = REQUIRED_FIELDS.filter(
      (field) => extracted[field] === null || extracted[field] === undefined
    );
    if (missingFields.length > 0) {
      return {
        inserted: false,
        extracted,
        reason: `必須項目が不足しています: ${missingFields.join(', ')}`,
      };
    }

    if (!supabaseAdmin) {
      return {
        inserted: false,
        extracted,
        reason: 'SUPABASE_SERVICE_ROLE_KEY が未設定のためDB登録できません',
      };
    }

    const { error } = await supabaseAdmin
      .from('coffee_evaluations')
      .insert({
        bean_name:      extracted.bean_name,
        bean_type:      extracted.bean_type,
        roast_level:    extracted.roast_level,
        shop_name:      extracted.shop_name,
        shop_address:   extracted.shop_address,
        acidity:        extracted.acidity,
        aroma:          extracted.aroma,
        bitterness:     extracted.bitterness,
        overall_rating: extracted.overall_rating,
        user_id,
        is_public,
      });

    if (error) {
      return {
        inserted: false,
        extracted,
        reason: `DB登録エラー: ${error.message}`,
      };
    }

    return { inserted: true, extracted };
  },
});
```

**受け入れ条件:**
- `REQUIRED_FIELDS` に定義されていないカラムのチェックは行わない（柔軟性確保）
- `supabaseAdmin` が `null` でも例外を throw しない
- `coffee_evaluations` テーブルへの `select` はこのツールは行わない（単方向）

---

## Phase 3: Agent-Workflow（Phase 2 完了後に開始）

### 担当ファイル（新規作成のみ）

```
src/mastra/workflows/coffee-ingestion-workflow.ts   ← 新規作成
```

### タスク 3: `coffeeIngestionWorkflow`

**参照すべき既存パターン:** `src/mastra/workflows/coffee-comparison-workflow.ts`
- `createStep` / `createWorkflow` は `@mastra/core/workflows` からimport
- ワークフロー末尾で `.commit()` を呼ぶ

**実装仕様:**

```typescript
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { z } from 'zod';
import { extractCoffeeFromImageTool } from '../tools/ocr/extract-coffee-image-tool.js';
import { insertCoffeeEvaluationTool } from '../tools/ocr/insert-coffee-evaluation-tool.js';
import {
  ingestionInputSchema,
  ingestionOutputSchema,
  extractedCoffeeSchema,
} from '../../lib/ocr-types.js';

// Step 1: OCR + 構造化
const ocrStep = createStep({
  id: 'ocr-extract',
  description: 'VLMで画像からコーヒー情報を抽出・構造化する',
  inputSchema: ingestionInputSchema,
  outputSchema: z.object({
    success:   z.boolean(),
    extracted: extractedCoffeeSchema.nullable(),
    message:   z.string(),
    // 後続ステップに渡すためのパススルー
    user_id:   z.string().uuid(),
    is_public: z.boolean(),
  }),
  execute: async ({ inputData }) => {
    const result = await extractCoffeeFromImageTool.execute({
      context: { imageBase64: inputData.imageBase64 },
    });
    return {
      ...result,
      user_id:   inputData.user_id,
      is_public: inputData.is_public,
    };
  },
});

// Step 2: DB登録（OCR失敗時はスキップ）
const insertStep = createStep({
  id: 'db-insert',
  description: '構造化データをSupabaseに登録する',
  inputSchema: z.object({
    success:   z.boolean(),
    extracted: extractedCoffeeSchema.nullable(),
    message:   z.string(),
    user_id:   z.string().uuid(),
    is_public: z.boolean(),
  }),
  outputSchema: ingestionOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData.success || !inputData.extracted) {
      return {
        inserted: false,
        extracted: null,
        reason: `OCR失敗のため登録スキップ: ${inputData.message}`,
      };
    }
    return insertCoffeeEvaluationTool.execute({
      context: {
        extracted: inputData.extracted,
        user_id:   inputData.user_id,
        is_public: inputData.is_public,
      },
    });
  },
});

export const coffeeIngestionWorkflow = createWorkflow({
  id: 'coffee-ingestion-workflow',
  description: '画像からコーヒー情報をOCRで抽出しSupabaseに登録するワークフロー',
  inputSchema:  ingestionInputSchema,
  outputSchema: ingestionOutputSchema,
})
  .then(ocrStep)
  .then(insertStep);

coffeeIngestionWorkflow.commit();
```

**受け入れ条件:**
- `coffeeComparisonWorkflow` と同じパターン（`createStep` + `.then()` + `.commit()`）に従う
- ツールの `execute` を直接呼ぶのではなく、ステップ内でラップする
- OCR失敗時でも `insertStep` に到達し、`inserted: false` で正常終了する

---

## Phase 4: Agent-API（Phase 3 完了後に開始）

### 担当ファイル

```
src/mastra/index.ts                           ← 既存ファイルを最小限編集
.env.example                                  ← 新規環境変数を追記
```

### タスク 4-A: `src/mastra/index.ts` の更新

**変更ルール:**
- 既存のimport・`handleCoffeeRequest`・`weatherWorkflow`・`coffeeComparisonWorkflow`・`agents` の定義には一切触れない
- 追加するのは以下の3点のみ

```typescript
// 追加import（既存importの下に追記）
import { coffeeIngestionWorkflow } from './workflows/coffee-ingestion-workflow';

// handleCoffeeOcrIngest ハンドラ（handleCoffeeRequest の下に追記）
const handleCoffeeOcrIngest = async (c: {
  req: { json: () => Promise<unknown> };
  json: (body: unknown, status?: number) => unknown;
}) => {
  const body = await c.req.json();
  const parsed = ingestionInputSchema.safeParse(body);

  if (!parsed.success) {
    return c.json({ error: parsed.error.flatten() }, 400);
  }

  try {
    const run = coffeeIngestionWorkflow.createRun();
    const result = await run.start({ inputData: parsed.data });
    const output = result.results?.['db-insert'] ?? result.results?.['ocr-extract'];
    return c.json(output ?? { inserted: false, reason: 'ワークフロー結果が取得できませんでした' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
};
```

```typescript
// Mastra() コンストラクタの workflows に coffeeIngestionWorkflow を追加
// apiRoutes 配列に新ルートを追加
// ※ 既存エントリはそのまま維持する

workflows: { weatherWorkflow, coffeeComparisonWorkflow, coffeeIngestionWorkflow },
// ...
apiRoutes: [
  { path: '/api/coffee/chat',       method: 'POST', handler: handleCoffeeRequest },
  { path: '/api/coffee/generate',   method: 'POST', handler: handleCoffeeRequest },
  { path: '/api/coffee/ocr/ingest', method: 'POST', handler: handleCoffeeOcrIngest }, // 追加
],
```

**受け入れ条件:**
- `handleCoffeeRequest` の中身を変更しない
- `agents` オブジェクトに `coffeeIngestionWorkflow` 関連のエージェントを追加しない（ワークフローのみ）
- `ingestionInputSchema` のimportを忘れない

---

### タスク 4-B: `.env.example` への追記

```
# --- OCR取込ワークフロー用 ---
SUPABASE_SERVICE_ROLE_KEY=   # INSERT用サービスロールキー (RLS回避)
OCR_MODEL=qwen2.5vl          # Ollamaモデル名 (デフォルト: qwen2.5vl)
OCR_PROVIDER=ollama          # "ollama" or "openai"
```

---

## Phase 5: Agent-Test（Phase 4 完了後、並列実行可）

テストフレームワーク: **vitest** (`npm run test`)

### タスク 5-A: Unit テスト

```
src/mastra/tools/ocr/__tests__/extract-coffee-image-tool.test.ts
src/mastra/tools/ocr/__tests__/insert-coffee-evaluation-tool.test.ts
src/mastra/lib/__tests__/ocr-types.test.ts
```

**テストケース（extract-coffee-image-tool）:**

| ケース | 期待結果 |
|---|---|
| VLMが正常なJSONを返す | `success: true`, `extracted` が `extractedCoffeeSchema` に適合 |
| VLMが例外を投げる | `success: false`, `extracted: null`, 例外を再throwしない |
| `OCR_PROVIDER=openai` 環境 | OpenAIモデルが選択される |

**テストケース（insert-coffee-evaluation-tool）:**

| ケース | 期待結果 |
|---|---|
| 全必須項目あり、Supabase成功 | `inserted: true` |
| `bean_name` が null | `inserted: false`, reason に 'bean_name' を含む |
| `overall_rating` が null | `inserted: false` |
| `supabaseAdmin` が null | `inserted: false`, 例外なし |
| Supabase がエラーを返す | `inserted: false`, reason に error.message を含む |

**テストケース（ocr-types）:**

| ケース | 期待結果 |
|---|---|
| `acidity: 6` | Zodバリデーション失敗 |
| `roast_level: 'espresso'` | Zodバリデーション失敗 |
| `user_id: 'not-a-uuid'` | `ingestRequestMetaSchema` パース失敗 |

---

### タスク 5-B: Integration テスト

```
src/mastra/workflows/__tests__/coffee-ingestion-workflow.test.ts
```

**テストケース:**

| ケース | 期待結果 |
|---|---|
| 正常フロー（OCR成功・全必須項目あり） | `inserted: true`, DBに1件追加 |
| OCR失敗（VLM例外） | `inserted: false`, DBに追加なし |
| 必須項目不足（bean_name null） | `inserted: false`, reason あり, DBに追加なし |
| Supabase INSERT エラー | `inserted: false`, reason に error.message |
| MIMEタイプ不正（PDF base64など） | VLMがエラーを返し `inserted: false` |
| ファイルサイズ超過（>10MB） | APIレイヤーで400を返す |

**APIエンドポイントテスト (`POST /api/coffee/ocr/ingest`):**

| ケース | 期待結果 |
|---|---|
| 正常リクエスト | 200 + `{ inserted: true, extracted: {...} }` |
| `user_id` 未指定 | 400 + バリデーションエラー |
| `user_id` がUUID形式でない | 400 + バリデーションエラー |
| `imageBase64` が空文字 | 400 + バリデーションエラー |

---

### タスク 5-C: Regression テスト（分離保証）

```
src/mastra/workflows/__tests__/regression-isolation.test.ts
```

**テストケース:**

| ケース | 確認方法 |
|---|---|
| `coffeeAgent` のツール数が3本のまま | `coffeeAgent.tools` の keys が `['searchCoffee', 'getPopularCoffee', 'compareCoffee']` と一致 |
| `POST /api/coffee/generate` が変更前後で同等の応答構造 | レスポンスに `text`, `toolCalls`, `_debug` キーを含む |
| `POST /api/coffee/chat` が変更前後で同等の応答構造 | 同上 |
| `coffee-tool.ts` にINSERT系コードが存在しない | ファイル内容に `'insert'` / `'upsert'` が含まれないことをgrepで確認 |

---

## 新規ファイル一覧（まとめ）

```
src/
└── mastra/
    ├── lib/
    │   ├── supabase-client.ts                           ← Agent-Infra
    │   └── ocr-types.ts                                 ← Agent-Infra
    ├── tools/
    │   └── ocr/
    │       ├── extract-coffee-image-tool.ts             ← Agent-Tool-OCR
    │       └── insert-coffee-evaluation-tool.ts         ← Agent-Tool-Insert
    └── workflows/
        └── coffee-ingestion-workflow.ts                 ← Agent-Workflow
```

## 変更ファイル一覧（まとめ）

```
src/mastra/index.ts   ← Agent-API のみ編集（3箇所の追加のみ）
.env.example          ← Agent-API が3行追記
```

---

## 前提事項

- ローカルVLM構成を優先（`qwen2.5vl:7b` on Ollama）、GPU不足時は `OCR_PROVIDER=openai` に切り替え
- 入力は「1枚手動アップロード（base64 data URL）」
- 自動登録は `REQUIRED_FIELDS`（`bean_name` + `overall_rating`）が揃った場合のみ
- `supabaseAdmin`（`SUPABASE_SERVICE_ROLE_KEY`）はサーバーサイド専用。フロントエンドに露出しない
- 数値評価スコア（acidity/aroma/bitterness/overall_rating）が画像にない場合は `null` で登録可

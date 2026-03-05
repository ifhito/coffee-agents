# Coffee Recommender Bot (test-mastra)

> **注意: このリポジトリは検証用です。**
> Mastra フレームワークの機能検証・プロトタイピングを目的としたリポジトリであり、本番運用を想定したものではありません。

Supabase に保存されたコーヒー評価データをもとに、ユーザーの好みに合ったコーヒーを推薦するチャットボットです。コーヒーラベルの画像を撮影してデータ登録する OCR 取込機能も備えています。

---

## 主な機能

- **コーヒー推薦チャット**: 酸味・苦味・香りの好みをヒアリングし、Supabase に蓄積された評価データから最適な豆を提案
- **コーヒー比較**: 2 つの豆を並べて評価スコアを比較
- **OCR 取込**: コーヒーラベルの画像（JPEG / PNG / WebP / HEIC）をアップロードし、VLM で情報を自動抽出して Supabase に登録
- **レビュー確認フロー**: OCR 抽出結果をユーザーが確認・編集してから登録する 2 ステップ方式

---

## アーキテクチャ

```
┌─────────────────────────────────┐
│  フロントエンド (React + Vite)   │  localhost:5173
│  - チャット UI                  │
│  - 画像アップロード              │
│  - OCR レビューモーダル          │
└────────────┬────────────────────┘
             │ HTTP
┌────────────▼────────────────────┐
│  バックエンド (Mastra)           │  localhost:4111
│  - coffeeAgent (Ollama LLM)     │
│  - OCR 取込ワークフロー          │
│    Step 1: 画像 → 構造化抽出     │
│    Step 2: Supabase 登録        │
│  - 比較ワークフロー              │
└────────────┬────────────────────┘
             │
┌────────────▼────────────────────┐
│  Supabase (coffee_evaluations)  │
└─────────────────────────────────┘
```

### ディレクトリ構成

```
src/
├── frontend/                    # React フロントエンド
│   ├── components/
│   │   ├── ChatApp.tsx          # メインチャット画面
│   │   ├── MessageList.tsx      # メッセージ一覧
│   │   ├── MessageInput.tsx     # 入力欄 + 画像アップロード
│   │   └── OcrReviewModal.tsx   # OCR 確認モーダル
│   └── api/                     # バックエンド呼び出しクライアント
└── mastra/
    ├── agents/
    │   ├── coffee-agent.ts      # コーヒー推薦エージェント (Ollama)
    │   ├── weather-agent.ts     # 天気エージェント (検証用)
    │   └── mcpAgent.ts          # MCP エージェント (検証用)
    ├── tools/
    │   ├── coffee-tool.ts       # Supabase 検索ツール
    │   ├── coffee-comparison-tool.ts
    │   └── ocr/
    │       ├── extract-coffee-image-tool.ts  # VLM による画像解析
    │       └── insert-coffee-evaluation-tool.ts
    ├── workflows/
    │   ├── coffee-ingestion-workflow.ts  # OCR → DB 登録
    │   └── coffee-comparison-workflow.ts
    ├── lib/
    │   ├── ocr-types.ts         # Zod スキーマ定義
    │   ├── supabase-client.ts
    │   └── timeout.ts
    ├── api/
    │   └── ocr-handlers.ts      # カスタム API ハンドラ
    └── index.ts                 # Mastra 設定・API ルート定義
```

---

## セットアップ

### 前提条件

- Node.js >= 22.13.0
- [Ollama](https://ollama.com/) がローカルで起動していること
- Supabase プロジェクト (`simple-coffee-collections`) へのアクセス権

### インストール

```bash
git clone <this-repo>
cd test-mastra
npm install
```

### 環境変数

`.env` ファイルをプロジェクトルートに作成し、以下を設定してください。

```env
# Supabase
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_ANON_KEY=your-anon-key

# OpenAI (OCR の VLM に使用)
OPENAI_API_KEY=your-openai-api-key

# Ollama (コーヒー推薦エージェント)
OLLAMA_BASE_URL=http://localhost:11434/api   # デフォルト値
OLLAMA_MODEL=qwen3:8b                        # デフォルト値

# タイムアウト設定 (任意)
COFFEE_CHAT_TIMEOUT_MS=120000
OCR_INGEST_TIMEOUT_MS=120000
MASTRA_SERVER_TIMEOUT_MS=300000
```

---

## 起動方法

バックエンドとフロントエンドを **別々のターミナル** で起動してください。

```bash
# バックエンド (Mastra サーバー) - localhost:4111
npm run dev

# フロントエンド (Vite) - localhost:5173
npm run frontend:dev
```

ブラウザで `http://localhost:5173` を開くとチャット UI が表示されます。

---

## その他のコマンド

```bash
# テスト実行
npm test

# プロダクションビルド
npm run build
npm run start

# フロントエンドビルド
npm run frontend:build
```

---

## データベーススキーマ (coffee_evaluations)

| カラム            | 型        | 説明            |
| ----------------- | --------- | --------------- |
| `bean_name`       | text      | 豆の名前        |
| `bean_type`       | text      | 豆の種類        |
| `roast_level`     | text      | 焙煎度          |
| `shop_name`       | text      | 購入店舗名      |
| `shop_address`    | text      | 店舗住所        |
| `acidity`         | int (1-5) | 酸味            |
| `aroma`           | int (1-5) | 香り            |
| `bitterness`      | int (1-5) | 苦味            |
| `overall_rating`  | int (1-5) | 総合評価        |
| `is_public`       | boolean   | 公開フラグ      |
| `user_id`         | uuid      | ユーザー ID     |
| `google_place_id` | text      | Google Place ID |

---

## API エンドポイント

| メソッド | パス                      | 説明                              |
| -------- | ------------------------- | --------------------------------- |
| POST     | `/api/coffee/chat`        | コーヒー推薦チャット              |
| POST     | `/api/coffee/ocr/ingest`  | 画像 OCR → Supabase 一括登録     |
| POST     | `/api/coffee/ocr/extract` | 画像 OCR のみ（確認フロー用）     |
| POST     | `/api/coffee/ocr/confirm` | OCR 結果を確認後に Supabase 登録  |

---

## 検証内容

このリポジトリで検証している主なトピック:

- Mastra フレームワークによるエージェント・ワークフロー・ツールの構築
- Ollama (ローカル LLM) を使った推薦エージェントの動作確認
- VLM (OpenAI) を用いた画像からの構造化データ抽出
- HEIC 形式を含む画像フォーマットの処理
- Mastra カスタム API ルートと React フロントエンドの連携
- タイムアウト制御・エラーハンドリングのパターン

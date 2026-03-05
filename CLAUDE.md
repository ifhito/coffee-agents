# Coffee Recommender Bot - Mastra Project

## Purpose
Supabaseに保存されたコーヒー評価データを基に、ユーザーの好みに合ったコーヒーを推薦するAPIチャットボット。

## Tech Stack
- **Framework**: Mastra (TypeScript AI Agent Framework)
- **Database**: Supabase PostgreSQL (別プロジェクト `simple-coffee-collections`)
- **LLM**: OpenAI GPT-4o-mini / Ollama (ローカル)

## Database Schema (coffee_evaluations)
```
bean_name, bean_type, roast_level, shop_name, shop_address
acidity (1-5), aroma (1-5), bitterness (1-5), overall_rating (1-5)
is_public (boolean), user_id, google_place_id
```

## Project Structure
```
src/mastra/
├── agents/coffee-agent.ts    # 推薦エージェント
├── tools/coffee-tool.ts      # Supabase検索ツール
├── tools/preference-tool.ts  # ユーザー好み分析
└── index.ts                  # Mastra設定
```

## Implementation Guidelines

### Agent Design
- 日本語で応答、フレンドリーなトーン
- ユーザーの好み（酸味/苦味/香り）を聞き取り、マッチするコーヒーを提案
- 評価データに基づいた具体的な推薦理由を説明

### Tool Implementation
- `createTool`でZodスキーマ必須
- Supabase接続: `@supabase/supabase-js`使用
- 環境変数: `SUPABASE_URL`, `SUPABASE_ANON_KEY`

### Query Patterns
```typescript
// 好みに基づく検索例
.from('coffee_evaluations')
.select('*')
.gte('acidity', minAcidity)
.lte('bitterness', maxBitterness)
.order('overall_rating', { ascending: false })
```

## Commands
```bash
npm run dev    # 開発サーバー (localhost:4111)
npm run build  # ビルド
npm run start  # 本番起動
```

## Environment Variables
```
OPENAI_API_KEY=
SUPABASE_URL=
SUPABASE_ANON_KEY=
OLLAMA_BASE_URL=http://localhost:11434/api  # optional
OLLAMA_MODEL=qwen3:8b                        # optional
```

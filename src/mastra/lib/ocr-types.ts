import { z } from 'zod';

// coffee_evaluations テーブルの数値カラムのスケール: 1-5
const ratingSchema = z.number().int().min(1).max(5);

// VLMが構造化して返すコーヒー評価データ
// null は「画像から読み取れなかった」を意味する
export const extractedCoffeeSchema = z.object({
  bean_name:      z.string().nullable().describe('豆名（例: エチオピア イルガチェフェ）'),
  bean_type:      z.string().nullable().describe('品種（例: アラビカ, ゲイシャ）'),
  roast_level:    z.enum(['浅煎り', '中煎り', '深煎り', 'light', 'medium', 'dark']).nullable(),
  shop_name:      z.string().nullable().describe('購入店舗名'),
  shop_address:   z.string().nullable().describe('店舗住所'),
  acidity:        ratingSchema.nullable().describe('酸味 1-5'),
  aroma:          ratingSchema.nullable().describe('香り 1-5'),
  bitterness:     ratingSchema.nullable().describe('苦味 1-5'),
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

const ALLOWED_MIME_TYPES = ['jpeg', 'jpg', 'png', 'webp', 'gif', 'heic', 'heif'];

// ワークフロー全体の入力スキーマ
// imageBase64: data URL形式 ("data:image/jpeg;base64,...")
export const ingestionInputSchema = z.object({
  imageBase64: z.string()
    .min(1, '画像データが空です')
    .refine(
      (v) => {
        const match = v.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,/);
        return match !== null && ALLOWED_MIME_TYPES.includes(match[1].toLowerCase());
      },
      '対応していない画像フォーマットです。JPEG・PNG・WebP・GIF・HEICのみ使用できます',
    ),
  user_id:   z.string().uuid(),
  is_public: z.boolean().default(false),
});

export type IngestionInput = z.infer<typeof ingestionInputSchema>;

// ワークフロー全体の出力スキーマ
export const ingestionOutputSchema = z.object({
  inserted:  z.boolean(),
  extracted: extractedCoffeeSchema.nullable(),
  reason:    z.string().optional().describe('inserted=false の理由'),
});

export type IngestionOutput = z.infer<typeof ingestionOutputSchema>;

import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabaseAdmin } from '../../lib/supabase-client.js';
import {
  extractedCoffeeSchema,
  ingestionOutputSchema,
  REQUIRED_FIELDS,
} from '../../lib/ocr-types.js';

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

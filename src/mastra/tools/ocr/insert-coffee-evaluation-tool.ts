import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { supabaseAdmin, supabaseAnon } from '../../lib/supabase-client.js';
import {
  extractedCoffeeSchema,
  ingestionOutputSchema,
  REQUIRED_FIELDS,
} from '../../lib/ocr-types.js';

function getErrorMessage(err: unknown): string {
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    if (cause instanceof Error) return `${err.message} (cause: ${cause.message})`;
    if (typeof cause === 'string' && cause.trim().length > 0) {
      return `${err.message} (cause: ${cause})`;
    }
    return err.message;
  }
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err && typeof err.message === 'string') {
    return err.message;
  }
  return String(err);
}

function formatDbInsertError(err: unknown): string {
  const detail = getErrorMessage(err);
  const lower = detail.toLowerCase();
  const supabaseUrl = process.env.SUPABASE_URL ?? '';

  if (
    lower.includes('no suitable key')
    || lower.includes('wrong key type')
    || lower.includes('invalid api key')
    || lower.includes('invalid jwt')
  ) {
    return (
      `DB登録エラー: ${detail}。` +
      `SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY の組み合わせが一致していない可能性があります (SUPABASE_URL=${supabaseUrl || '未設定'})。` +
      '同一プロジェクトの service_role キーを設定してください。ローカル環境では `supabase status` でキーを再確認してください。'
    );
  }

  if (lower.includes('fetch failed')) {
    if (/127\.0\.0\.1|localhost/.test(supabaseUrl)) {
      return (
        `DB登録エラー: ${detail}。` +
        `Supabaseに接続できません (SUPABASE_URL=${supabaseUrl})。` +
        'ローカルSupabaseを起動 (supabase start) するか、正しいプロジェクトURLへ変更してください。'
      );
    }

    return (
      `DB登録エラー: ${detail}。` +
      `Supabaseに接続できません (SUPABASE_URL=${supabaseUrl || '未設定'})。` +
      'URLとネットワーク疎通を確認してください。'
    );
  }

  return `DB登録エラー: ${detail}`;
}

function isAuthKeyError(err: unknown): boolean {
  const lower = getErrorMessage(err).toLowerCase();
  return lower.includes('no suitable key') || lower.includes('wrong key type');
}

type InsertError = { message: string } | null;
type SupabaseLikeClient = {
  from: (table: string) => {
    insert: (payload: Record<string, unknown>) => Promise<{ error: InsertError }>;
  };
};

async function tryInsert(
  client: SupabaseLikeClient,
  payload: Record<string, unknown>,
): Promise<InsertError> {
  try {
    const { error } = await client
      .from('coffee_evaluations')
      .insert(payload);
    return error;
  } catch (err) {
    return { message: getErrorMessage(err) };
  }
}

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

    if (!supabaseAdmin && !supabaseAnon) {
      return {
        inserted: false,
        extracted,
        reason: 'SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY が未設定のためDB登録できません',
      };
    }

    const insertPayload = {
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
    };

    if (supabaseAdmin) {
      const adminError = await tryInsert(supabaseAdmin as unknown as SupabaseLikeClient, insertPayload);
      if (!adminError) return { inserted: true, extracted };

      // service_roleキー不整合時のみ anon でフォールバック
      if (isAuthKeyError(adminError) && supabaseAnon) {
        const anonError = await tryInsert(supabaseAnon as unknown as SupabaseLikeClient, insertPayload);
        if (!anonError) return { inserted: true, extracted };
        return {
          inserted: false,
          extracted,
          reason: formatDbInsertError(
            `service_role認証失敗: ${adminError.message}; anon再試行失敗: ${anonError.message}`,
          ),
        };
      }

      return {
        inserted: false,
        extracted,
        reason: formatDbInsertError(adminError),
      };
    }

    // service_role未設定時は anon で試行（RLSポリシー次第）
    const anonError = await tryInsert(supabaseAnon as unknown as SupabaseLikeClient, insertPayload);
    if (anonError) {
      return {
        inserted: false,
        extracted,
        reason: formatDbInsertError(
          `SUPABASE_SERVICE_ROLE_KEY未設定のため anon で登録を試行しましたが失敗: ${anonError.message}`,
        ),
      };
    }

    return { inserted: true, extracted };
  },
});

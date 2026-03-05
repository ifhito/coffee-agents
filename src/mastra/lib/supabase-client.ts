import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

// 既存の推薦系ツールが使う anon キー（読み取り専用相当）
// ※ 既存ファイルはこのクライアントに移行しない（既存変更禁止のため）
const supabaseUrl = process.env.SUPABASE_URL ?? '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl) {
  console.warn('[supabase-client] SUPABASE_URL が未設定です');
}

// OCR INSERT用: RLSをバイパスするサービスロールクライアント
// サーバーサイド専用 - フロントエンドに露出禁止
export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : null;

// フォールバック用: anonクライアント（RLSポリシー次第でINSERT可能）
export const supabaseAnon = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

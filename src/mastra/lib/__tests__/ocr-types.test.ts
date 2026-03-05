import { describe, it, expect } from 'vitest';
import {
  extractedCoffeeSchema,
  ingestionInputSchema,
  ingestRequestMetaSchema,
  ingestionOutputSchema,
} from '../ocr-types.js';

describe('extractedCoffeeSchema', () => {
  it('有効なデータを受け付ける', () => {
    const result = extractedCoffeeSchema.safeParse({
      bean_name:      'エチオピア イルガチェフェ',
      bean_type:      'アラビカ',
      roast_level:    '浅煎り',
      shop_name:      'テスト珈琲店',
      shop_address:   '東京都渋谷区',
      acidity:        4,
      aroma:          5,
      bitterness:     2,
      overall_rating: 4,
    });
    expect(result.success).toBe(true);
  });

  it('全フィールドnullを受け付ける', () => {
    const result = extractedCoffeeSchema.safeParse({
      bean_name:      null,
      bean_type:      null,
      roast_level:    null,
      shop_name:      null,
      shop_address:   null,
      acidity:        null,
      aroma:          null,
      bitterness:     null,
      overall_rating: null,
    });
    expect(result.success).toBe(true);
  });

  it('acidity: 6 はバリデーション失敗', () => {
    const result = extractedCoffeeSchema.safeParse({
      bean_name: 'テスト', bean_type: null, roast_level: null,
      shop_name: null, shop_address: null,
      acidity: 6, aroma: null, bitterness: null, overall_rating: null,
    });
    expect(result.success).toBe(false);
  });

  it('acidity: 0 はバリデーション失敗', () => {
    const result = extractedCoffeeSchema.safeParse({
      bean_name: 'テスト', bean_type: null, roast_level: null,
      shop_name: null, shop_address: null,
      acidity: 0, aroma: null, bitterness: null, overall_rating: null,
    });
    expect(result.success).toBe(false);
  });

  it('roast_level: "espresso" はバリデーション失敗', () => {
    const result = extractedCoffeeSchema.safeParse({
      bean_name: 'テスト', bean_type: null, roast_level: 'espresso',
      shop_name: null, shop_address: null,
      acidity: null, aroma: null, bitterness: null, overall_rating: null,
    });
    expect(result.success).toBe(false);
  });

  it('overall_rating に小数は失敗（int要件）', () => {
    const result = extractedCoffeeSchema.safeParse({
      bean_name: 'テスト', bean_type: null, roast_level: null,
      shop_name: null, shop_address: null,
      acidity: null, aroma: null, bitterness: null, overall_rating: 3.5,
    });
    expect(result.success).toBe(false);
  });
});

describe('ingestRequestMetaSchema', () => {
  it('有効なUUIDとbooleaを受け付ける', () => {
    const result = ingestRequestMetaSchema.safeParse({
      user_id:   '550e8400-e29b-41d4-a716-446655440000',
      is_public: true,
    });
    expect(result.success).toBe(true);
  });

  it('user_id: "not-a-uuid" はパース失敗', () => {
    const result = ingestRequestMetaSchema.safeParse({
      user_id:   'not-a-uuid',
      is_public: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.user_id).toBeDefined();
    }
  });

  it('is_public省略時はデフォルトfalse', () => {
    const result = ingestRequestMetaSchema.safeParse({
      user_id: '550e8400-e29b-41d4-a716-446655440000',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.is_public).toBe(false);
    }
  });
});

describe('ingestionInputSchema', () => {
  it('imageBase64 が空文字はバリデーション失敗', () => {
    const result = ingestionInputSchema.safeParse({
      imageBase64: '',
      user_id:     '550e8400-e29b-41d4-a716-446655440000',
      is_public:   false,
    });
    expect(result.success).toBe(false);
  });

  it('user_id がUUID形式でなければ失敗', () => {
    const result = ingestionInputSchema.safeParse({
      imageBase64: 'data:image/jpeg;base64,abc123',
      user_id:     'invalid-id',
      is_public:   false,
    });
    expect(result.success).toBe(false);
  });
});

describe('ingestionOutputSchema', () => {
  it('inserted: true, extracted あり', () => {
    const result = ingestionOutputSchema.safeParse({
      inserted: true,
      extracted: {
        bean_name: 'テスト豆', bean_type: null, roast_level: 'light',
        shop_name: null, shop_address: null,
        acidity: 3, aroma: 4, bitterness: 2, overall_rating: 4,
      },
    });
    expect(result.success).toBe(true);
  });

  it('inserted: false, extracted: null, reason あり', () => {
    const result = ingestionOutputSchema.safeParse({
      inserted:  false,
      extracted: null,
      reason:    '必須項目が不足しています',
    });
    expect(result.success).toBe(true);
  });
});

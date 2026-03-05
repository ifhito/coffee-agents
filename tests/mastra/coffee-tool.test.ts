import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseClientMock } from '../helpers/supabaseMock';

let mockClient: ReturnType<typeof createSupabaseClientMock>['client'];
const createClientMock = vi.fn(() => mockClient);

vi.mock('@supabase/supabase-js', () => ({
  createClient: (...args: unknown[]) => createClientMock(...args),
}));

describe('coffee-tool', () => {
  const baseEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...baseEnv };
    createClientMock.mockClear();
  });

  it('returns an error when Supabase env vars are missing', async () => {
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;

    const { searchCoffeeTool } = await import('../../src/mastra/tools/coffee-tool');
    const result = await searchCoffeeTool.execute({ context: {} });

    expect(result.success).toBe(false);
    expect(result.message).toContain('Supabase接続が設定されていません');
    expect(createClientMock).not.toHaveBeenCalled();
  });

  it('builds query filters for searchCoffeeTool', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-key';

    const { client, calls } = createSupabaseClientMock({
      data: [
        {
          bean_name: 'Test Bean',
          bean_type: 'Arabica',
          roast_level: '中煎り',
          shop_name: 'Sample Shop',
          shop_address: 'Tokyo',
          acidity: 4,
          aroma: 3,
          bitterness: 2,
          overall_rating: 5,
        },
      ],
      error: null,
    });
    mockClient = client;

    const { searchCoffeeTool } = await import('../../src/mastra/tools/coffee-tool');
    const result = await searchCoffeeTool.execute({
      context: {
        minAcidity: 3,
        maxBitterness: 2,
        minAroma: 2,
        roastLevel: '中煎り',
        limit: 3,
      },
    });

    expect(result.success).toBe(true);
    expect(calls.from).toEqual([['coffee_evaluations']]);
    expect(calls.eq).toEqual([
      ['is_public', true],
      ['roast_level', '中煎り'],
    ]);
    expect(calls.gte).toEqual([
      ['acidity', 3],
      ['aroma', 2],
    ]);
    expect(calls.lte).toEqual([['bitterness', 2]]);
    expect(calls.order).toEqual([['overall_rating', { ascending: false }]]);
    expect(calls.limit).toEqual([[3]]);
  });

  it('normalizes roast level aliases before querying', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-key';

    const { client, calls } = createSupabaseClientMock({
      data: [],
      error: null,
    });
    mockClient = client;

    const { searchCoffeeTool } = await import('../../src/mastra/tools/coffee-tool');
    const result = await searchCoffeeTool.execute({
      context: {
        roastLevel: 'medium-dark',
        limit: 1,
      },
    });

    expect(result.success).toBe(true);
    expect(calls.eq).toContainEqual(['roast_level', 'dark']);
  });

  it('builds query filters for getPopularCoffeeTool', async () => {
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_ANON_KEY = 'test-key';

    const { client, calls } = createSupabaseClientMock({
      data: [
        {
          bean_name: 'Popular Bean',
          bean_type: 'Blend',
          roast_level: '深煎り',
          shop_name: 'Popular Shop',
          acidity: 2,
          aroma: 4,
          bitterness: 4,
          overall_rating: 5,
        },
      ],
      error: null,
    });
    mockClient = client;

    const { getPopularCoffeeTool } = await import('../../src/mastra/tools/coffee-tool');
    const result = await getPopularCoffeeTool.execute({ context: { limit: 2 } });

    expect(result.success).toBe(true);
    expect(calls.eq).toEqual([['is_public', true]]);
    expect(calls.order).toEqual([['overall_rating', { ascending: false }]]);
    expect(calls.limit).toEqual([[2]]);
  });
});

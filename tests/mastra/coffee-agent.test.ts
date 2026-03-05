import { beforeEach, describe, expect, it, vi } from 'vitest';

const createOllamaMock = vi.fn(() => vi.fn(() => ({ modelId: 'mock' })));

vi.mock('ollama-ai-provider', () => ({
  createOllama: createOllamaMock,
}));

vi.mock('@mastra/libsql', () => ({
  LibSQLStore: class LibSQLStoreMock {},
}));

// ワークフローをモック
const mockStart = vi.fn();
const mockCreateRun = vi.fn(() => ({ start: mockStart }));

vi.mock('../../src/mastra/workflows/coffee-comparison-workflow', () => ({
  coffeeComparisonWorkflow: {
    createRun: mockCreateRun,
  },
}));

describe('coffeeAgent', () => {
  const baseEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...baseEnv,
      SUPABASE_URL: 'https://example.supabase.co',
      SUPABASE_ANON_KEY: 'test-key',
      OLLAMA_BASE_URL: 'http://ollama.test',
      OLLAMA_MODEL: 'test-model',
    };
    createOllamaMock.mockClear();
    mockStart.mockReset();
    mockCreateRun.mockClear();
  });

  it('registers tools and memory', async () => {
    const { coffeeAgent } = await import('../../src/mastra/agents/coffee-agent');
    const { getPopularCoffeeTool, searchCoffeeTool } = await import(
      '../../src/mastra/tools/coffee-tool'
    );
    const { compareCoffeeWorkflowTool } = await import(
      '../../src/mastra/tools/coffee-comparison-tool'
    );

    expect(coffeeAgent.tools).toMatchObject({
      compareCoffeeWorkflowTool,
      searchCoffeeTool,
      getPopularCoffeeTool,
    });
    expect(coffeeAgent.hasOwnMemory()).toBe(true);

    const memory = await coffeeAgent.getMemory();
    expect(memory).toBeDefined();
  });

  it('invokes the comparison tool from the agent registry', async () => {
    mockStart.mockResolvedValue({
      status: 'success',
      result: { report: '比較レポート' },
    });

    const { coffeeAgent } = await import('../../src/mastra/agents/coffee-agent');

    const result = await coffeeAgent.tools.compareCoffeeWorkflowTool.execute({
      context: { coffeeNameA: 'コーヒーA', coffeeNameB: 'コーヒーB' },
    });

    expect(result.success).toBe(true);
    expect(result.report).toBe('比較レポート');
    expect(mockCreateRun).toHaveBeenCalledTimes(1);
  });

  it('initializes Ollama using env configuration', async () => {
    await import('../../src/mastra/agents/coffee-agent');

    expect(createOllamaMock).toHaveBeenCalledWith({
      baseURL: 'http://ollama.test',
    });
    const modelFactory = createOllamaMock.mock.results[0]?.value as ReturnType<typeof createOllamaMock>;
    expect(modelFactory).toHaveBeenCalledWith('test-model');
  });
});

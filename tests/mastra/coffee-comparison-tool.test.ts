import { beforeEach, describe, expect, it, vi } from 'vitest';

// ワークフローをモック
const mockStart = vi.fn();
const mockCreateRun = vi.fn(() => ({ start: mockStart }));

vi.mock('../../src/mastra/workflows/coffee-comparison-workflow', () => ({
  coffeeComparisonWorkflow: {
    createRun: mockCreateRun,
  },
}));

describe('compareCoffeeWorkflowTool', () => {
  beforeEach(() => {
    vi.resetModules();
    mockStart.mockReset();
    mockCreateRun.mockClear();
  });

  it('runs the comparison workflow and returns the report', async () => {
    const report = '比較レポートのテスト';
    mockStart.mockResolvedValue({
      status: 'success',
      result: { report },
    });

    const { compareCoffeeWorkflowTool } = await import(
      '../../src/mastra/tools/coffee-comparison-tool'
    );

    const result = await compareCoffeeWorkflowTool.execute({
      context: { coffeeNameA: 'コーヒーA', coffeeNameB: 'コーヒーB' },
    });

    expect(mockCreateRun).toHaveBeenCalledTimes(1);
    expect(mockStart).toHaveBeenCalledWith({
      inputData: { coffeeNameA: 'コーヒーA', coffeeNameB: 'コーヒーB' },
    });
    expect(result).toEqual({
      success: true,
      report: '比較レポートのテスト',
      message: 'コーヒーA と コーヒーB の比較レポートを生成しました',
    });
  });

  it('returns an error when workflow execution status is not success', async () => {
    mockStart.mockResolvedValue({
      status: 'failed',
    });

    const { compareCoffeeWorkflowTool } = await import(
      '../../src/mastra/tools/coffee-comparison-tool'
    );

    const result = await compareCoffeeWorkflowTool.execute({
      context: { coffeeNameA: 'コーヒーA', coffeeNameB: 'コーヒーB' },
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('failed');
  });

  it('returns an error when workflow execution throws', async () => {
    mockStart.mockRejectedValue(new Error('ワークフローエラー'));

    const { compareCoffeeWorkflowTool } = await import(
      '../../src/mastra/tools/coffee-comparison-tool'
    );

    const result = await compareCoffeeWorkflowTool.execute({
      context: { coffeeNameA: 'コーヒーA', coffeeNameB: 'コーヒーB' },
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain('ワークフローエラー');
  });

  it('returns fallback message when result has no report', async () => {
    mockStart.mockResolvedValue({
      status: 'success',
      result: {},
    });

    const { compareCoffeeWorkflowTool } = await import(
      '../../src/mastra/tools/coffee-comparison-tool'
    );

    const result = await compareCoffeeWorkflowTool.execute({
      context: { coffeeNameA: 'コーヒーA', coffeeNameB: 'コーヒーB' },
    });

    expect(result.success).toBe(true);
    expect(result.report).toBe('レポートの生成に失敗しました');
  });
});

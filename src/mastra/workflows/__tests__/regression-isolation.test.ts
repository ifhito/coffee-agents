import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('regression-isolation: 既存コードが変更されていないことを確認', () => {
  it('coffeeAgent のツールが3本のまま', async () => {
    const { coffeeAgent } = await import('../../agents/coffee-agent.js');
    const toolKeys = Object.keys(coffeeAgent.tools ?? {});
    expect(toolKeys).toHaveLength(3);
    expect(toolKeys).toContain('searchCoffee');
    expect(toolKeys).toContain('getPopularCoffee');
    expect(toolKeys).toContain('compareCoffee');
  });

  it('coffee-tool.ts に INSERT/UPSERT 系コードが存在しない', () => {
    const coffeeToolPath = resolve(
      process.cwd(),
      'src/mastra/tools/coffee-tool.ts'
    );
    const content = readFileSync(coffeeToolPath, 'utf-8').toLowerCase();
    expect(content).not.toContain('insert');
    expect(content).not.toContain('upsert');
  });

  it('coffee-comparison-workflow.ts が編集されていない（INSERT を含まない）', () => {
    const path = resolve(
      process.cwd(),
      'src/mastra/workflows/coffee-comparison-workflow.ts'
    );
    const content = readFileSync(path, 'utf-8').toLowerCase();
    expect(content).not.toContain('insertcoffeeevaluation');
    expect(content).not.toContain('ocr');
  });

  it('OCR ワークフローが coffeeAgent のツールに影響を与えていない', async () => {
    // インポートするだけで既存エージェントのツールセットが変わっていないことを確認
    await import('../../workflows/coffee-ingestion-workflow.js');
    const { coffeeAgent } = await import('../../agents/coffee-agent.js');
    const toolKeys = Object.keys(coffeeAgent.tools ?? {});
    expect(toolKeys).toHaveLength(3);
  });
});

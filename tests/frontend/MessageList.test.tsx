import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MessageList } from '../../src/frontend/components/MessageList';
import type { ChatMessage } from '../../src/frontend/types';

describe('MessageList', () => {
  it('renders messages', () => {
    const messages: ChatMessage[] = [
      {
        id: '1',
        role: 'user',
        content: 'こんにちは',
        timestamp: new Date('2025-01-01T10:00:00Z'),
      },
      {
        id: '2',
        role: 'assistant',
        content: 'おすすめはこちらです',
        timestamp: new Date('2025-01-01T10:01:00Z'),
      },
    ];

    render(<MessageList messages={messages} isLoading={false} error={null} />);

    expect(screen.getByText('こんにちは')).toBeInTheDocument();
    expect(screen.getByText('おすすめはこちらです')).toBeInTheDocument();
  });

  it('renders markdown content as HTML', () => {
    const messages: ChatMessage[] = [
      {
        id: '1',
        role: 'assistant',
        content: '## タイトル\n\n- 項目A\n- 項目B\n\n`code`',
        timestamp: new Date('2025-01-01T10:00:00Z'),
      },
    ];

    const { container } = render(
      <MessageList messages={messages} isLoading={false} error={null} />
    );

    expect(container.querySelector('h2')).toHaveTextContent('タイトル');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('code')).toHaveTextContent('code');
  });

  it('sanitizes script tags in markdown', () => {
    const messages: ChatMessage[] = [
      {
        id: '1',
        role: 'assistant',
        content: '安全な文章<script>alert(\"x\")</script>',
        timestamp: new Date('2025-01-01T10:00:00Z'),
      },
    ];

    const { container } = render(
      <MessageList messages={messages} isLoading={false} error={null} />
    );

    expect(container.querySelector('script')).toBeNull();
    expect(screen.getByText('安全な文章')).toBeInTheDocument();
  });

  it('renders loading and error states', () => {
    render(<MessageList messages={[]} isLoading error="送信に失敗しました" />);

    expect(document.querySelectorAll('.message-loading .dot')).toHaveLength(3);
    expect(screen.getByRole('alert')).toHaveTextContent('送信に失敗しました');
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const sendMessageMock = vi.fn();

describe('ChatApp', () => {
  beforeEach(() => {
    sendMessageMock.mockReset();
    sendMessageMock.mockResolvedValue({
      text: 'おすすめのコーヒーはこちらです。',
      threadId: 'thread-1',
    });
    vi.resetModules();
    vi.doMock('../../src/frontend/api/coffeeAgentClient', () => ({
      sendMessage: sendMessageMock,
    }));
  });

  it('renders header and initial assistant message', async () => {
    const { ChatApp } = await import('../../src/frontend/components/ChatApp');
    render(<ChatApp />);

    expect(screen.getByText('あなたの今日の一杯を探そう')).toBeInTheDocument();
    expect(
      screen.getByText(
        'こんにちは。コーヒーの好みを教えてください。酸味・苦味・香りのどれを重視しますか？'
      )
    ).toBeInTheDocument();
  });

  it('sends user message and renders assistant response', async () => {
    const { ChatApp } = await import('../../src/frontend/components/ChatApp');
    render(<ChatApp />);

    const textarea = screen.getByLabelText('メッセージを入力');
    fireEvent.change(textarea, { target: { value: '酸味が強めでお願いします' } });

    fireEvent.click(screen.getByRole('button', { name: '送信' }));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith('酸味が強めでお願いします', undefined);
    });

    expect(screen.getByText('おすすめのコーヒーはこちらです。')).toBeInTheDocument();
  });

  it('renders assistant markdown response', async () => {
    sendMessageMock.mockResolvedValueOnce({
      text: '### 見出し\\n\\n- A\\n- B',
      threadId: 'thread-2',
    });
    const { ChatApp } = await import('../../src/frontend/components/ChatApp');
    const { container } = render(<ChatApp />);

    const textarea = screen.getByLabelText('メッセージを入力');
    fireEvent.change(textarea, { target: { value: 'おすすめは？' } });

    fireEvent.click(screen.getByRole('button', { name: '送信' }));

    await waitFor(() => {
      expect(sendMessageMock).toHaveBeenCalledWith('おすすめは？', undefined);
    });

    expect(container.querySelector('h3')).toHaveTextContent('見出し');
    expect(container.querySelectorAll('li')).toHaveLength(2);
  });
});

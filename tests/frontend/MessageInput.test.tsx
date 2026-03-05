import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { MessageInput } from '../../src/frontend/components/MessageInput';

describe('MessageInput', () => {
  it('submits trimmed input', () => {
    const onSend = vi.fn();
    render(<MessageInput onSend={onSend} />);

    const textarea = screen.getByLabelText('メッセージを入力');
    fireEvent.change(textarea, { target: { value: '  テスト  ' } });

    fireEvent.submit(textarea.closest('form')!);

    expect(onSend).toHaveBeenCalledWith('テスト');
  });

  it('disables submit when disabled', () => {
    render(<MessageInput onSend={() => undefined} disabled />);

    const button = screen.getByRole('button', { name: '送信' });
    expect(button).toBeDisabled();
  });
});

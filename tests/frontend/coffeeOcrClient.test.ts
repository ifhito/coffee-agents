import { describe, expect, it } from 'vitest';
import { validateImageFormat } from '../../src/frontend/api/coffeeOcrClient';

function makeFile(name: string, type: string): File {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

describe('validateImageFormat', () => {
  it('JPEG MIMEタイプを許可する', () => {
    expect(() => validateImageFormat(makeFile('coffee.jpg', 'image/jpeg'))).not.toThrow();
  });

  it('MIMEが空でも HEIC 拡張子を許可する', () => {
    expect(() => validateImageFormat(makeFile('iphone.heic', ''))).not.toThrow();
  });

  it('非対応フォーマットを拒否する', () => {
    expect(() => validateImageFormat(makeFile('label.pdf', 'application/pdf'))).toThrow(
      /対応していない画像フォーマット/,
    );
  });
});

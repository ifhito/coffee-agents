import { useState } from 'react';
import { sendMessage } from '../api/coffeeAgentClient';
import { fileToBase64, formatOcrResult, getOrCreateUserId, validateImageFormat } from '../api/coffeeOcrClient';
import { extractImageForReview, confirmOcrInsert } from '../api/coffeeOcrReviewClient';
import type { ExtractedCoffee } from '../api/coffeeOcrReviewClient';
import type { ChatMessage } from '../types';
import { MessageInput } from './MessageInput';
import { MessageList } from './MessageList';
import { OcrReviewModal } from './OcrReviewModal';

const initialMessages: ChatMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    content: 'こんにちは。コーヒーの好みを教えてください。酸味・苦味・香りのどれを重視しますか？',
    timestamp: new Date(),
  },
];

export function ChatApp() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [threadId, setThreadId] = useState<string | undefined>();
  const [pendingReview, setPendingReview] = useState<{
    extracted: ExtractedCoffee;
    userId: string;
    isPublic: boolean;
  } | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  const handleSend = async (message: string) => {
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const nextMessage: ChatMessage = {
      id,
      role: 'user',
      content: message,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, nextMessage]);
    setError(null);
    setIsLoading(true);

    try {
      const response = await sendMessage(message, threadId);
      const assistantMessage: ChatMessage = {
        id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-assistant`,
        role: 'assistant',
        content: response.text,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
      setThreadId(response.threadId ?? threadId);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : '送信に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendImage = async (file: File, text?: string) => {
    try {
      validateImageFormat(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : '画像フォーマットの検証に失敗しました。');
      return;
    }

    const userMessage: ChatMessage = {
      id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      role: 'user',
      content: text ? `[画像] ${text}` : '[コーヒーラベル画像をアップロードしました]',
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setError(null);
    setIsLoading(true);

    try {
      const imageBase64 = await fileToBase64(file);
      const userId = getOrCreateUserId();
      const result = await extractImageForReview(imageBase64, userId, false);
      if (result.success && result.extracted) {
        setPendingReview({ extracted: result.extracted, userId, isPublic: false });
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-assistant`,
            role: 'assistant',
            content: `**画像の読み取りに失敗しました**\n\n理由: ${result.message}`,
            timestamp: new Date(),
          },
        ]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '画像の送信に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReviewConfirm = async (editedExtracted: ExtractedCoffee) => {
    if (!pendingReview) return;
    setIsConfirming(true);
    try {
      const result = await confirmOcrInsert(editedExtracted, pendingReview.userId, pendingReview.isPublic);
      setPendingReview(null);
      setMessages((prev) => [
        ...prev,
        {
          id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-assistant`,
          role: 'assistant',
          content: formatOcrResult(result),
          timestamp: new Date(),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : '登録に失敗しました。');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleReviewCancel = () => {
    setPendingReview(null);
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <p className="app-eyebrow">Coffee Recommender</p>
        <h1 className="app-title">あなたの今日の一杯を探そう</h1>
        <p className="app-subtitle">
          酸味・苦味・香りのバランスから、好みに合う豆を提案します。
        </p>
      </header>
      <main className="chat-panel">
        <MessageList messages={messages} isLoading={isLoading} error={error} />
      </main>
      <footer className="chat-input">
        <MessageInput onSend={handleSend} onSendImage={handleSendImage} disabled={isLoading || pendingReview !== null} />
      </footer>
      {pendingReview && (
        <OcrReviewModal
          extracted={pendingReview.extracted}
          onConfirm={handleReviewConfirm}
          onCancel={handleReviewCancel}
          isSubmitting={isConfirming}
        />
      )}
    </div>
  );
}

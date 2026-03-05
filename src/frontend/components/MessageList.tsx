import type { ChatMessage } from '../types';
import { renderMarkdown } from '../utils/markdown';

const formatTime = (date: Date) =>
  date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

type MessageListProps = {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
};

export function MessageList({ messages, isLoading, error }: MessageListProps) {
  return (
    <div className="message-list" aria-live="polite">
      {messages.map((message) => (
        <div key={message.id} className={`message message-${message.role}`}>
          <div className="message-bubble">
            <div
              className="message-content"
              dangerouslySetInnerHTML={{ __html: renderMarkdown(message.content) }}
            />
            <span className="message-time">{formatTime(message.timestamp)}</span>
          </div>
        </div>
      ))}
      {isLoading ? (
        <div className="message message-assistant">
          <div className="message-bubble message-loading">
            <span className="dot" />
            <span className="dot" />
            <span className="dot" />
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="message message-error" role="alert">
          <div className="message-bubble">
            <p>{error}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

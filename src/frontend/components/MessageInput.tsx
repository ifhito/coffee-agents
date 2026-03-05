import { useRef, useState } from 'react';

const ACCEPTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.gif',
  '.heic',
  '.heif',
].join(',');

type MessageInputProps = {
  onSend: (message: string) => void;
  onSendImage: (file: File, message?: string) => void;
  disabled?: boolean;
};

export function MessageInput({ onSend, onSendImage, disabled = false }: MessageInputProps) {
  const [value, setValue] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const clearImage = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;

    if (selectedFile) {
      onSendImage(selectedFile, value.trim() || undefined);
      setValue('');
      clearImage();
    } else {
      if (!value.trim()) return;
      onSend(value.trim());
      setValue('');
    }
  };

  return (
    <form className="message-form" onSubmit={handleSubmit}>
      {previewUrl && (
        <div className="image-preview">
          <img src={previewUrl} alt="選択した画像" />
          <button
            type="button"
            className="image-preview-clear"
            onClick={clearImage}
            aria-label="画像を削除"
          >
            ✕
          </button>
        </div>
      )}
      <input
        type="file"
        ref={fileInputRef}
        accept={ACCEPTED_IMAGE_TYPES}
        onChange={handleFileChange}
        hidden
      />
      <button
        type="button"
        className="image-upload-btn"
        onClick={() => fileInputRef.current?.click()}
        disabled={disabled}
        aria-label="画像を選択"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      </button>
      <label className="sr-only" htmlFor="message">
        メッセージを入力
      </label>
      <textarea
        id="message"
        name="message"
        placeholder="好みや気分を入力してください"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        rows={2}
        disabled={disabled}
      />
      <button type="submit" disabled={disabled || (!value.trim() && !selectedFile)}>
        送信
      </button>
    </form>
  );
}

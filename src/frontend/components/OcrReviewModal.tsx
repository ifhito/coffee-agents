import { useState } from 'react';
import type { ExtractedCoffee } from '../api/coffeeOcrReviewClient';

type OcrReviewModalProps = {
  extracted: ExtractedCoffee;
  onConfirm: (edited: ExtractedCoffee) => void;
  onCancel: () => void;
  isSubmitting: boolean;
};

const ROAST_LEVELS = ['浅煎り', '中煎り', '深煎り', 'light', 'medium', 'dark'] as const;

export function OcrReviewModal({ extracted, onConfirm, onCancel, isSubmitting }: OcrReviewModalProps) {
  const [form, setForm] = useState<ExtractedCoffee>(extracted);

  const setField = <K extends keyof ExtractedCoffee>(key: K, value: ExtractedCoffee[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const parseRating = (raw: string): number | null => {
    const n = parseInt(raw, 10);
    if (isNaN(n)) return null;
    return Math.min(5, Math.max(1, n));
  };

  const canSubmit = Boolean(form.bean_name?.trim()) && form.overall_rating !== null;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2 style={styles.heading}>OCR結果を確認・修正</h2>
        <p style={styles.hint}>内容を確認・編集してから登録してください。</p>

        <div style={styles.fields}>
          <Field label="豆名 *">
            <input
              style={styles.input}
              type="text"
              value={form.bean_name ?? ''}
              onChange={(e) => setField('bean_name', e.target.value || null)}
              disabled={isSubmitting}
              placeholder="例: エチオピア イルガチェフェ"
            />
          </Field>

          <Field label="品種">
            <input
              style={styles.input}
              type="text"
              value={form.bean_type ?? ''}
              onChange={(e) => setField('bean_type', e.target.value || null)}
              disabled={isSubmitting}
              placeholder="例: アラビカ"
            />
          </Field>

          <Field label="焙煎度">
            <select
              style={styles.input}
              value={form.roast_level ?? ''}
              onChange={(e) => setField('roast_level', (e.target.value as ExtractedCoffee['roast_level']) || null)}
              disabled={isSubmitting}
            >
              <option value="">— 未設定 —</option>
              {ROAST_LEVELS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </Field>

          <Field label="ショップ名">
            <input
              style={styles.input}
              type="text"
              value={form.shop_name ?? ''}
              onChange={(e) => setField('shop_name', e.target.value || null)}
              disabled={isSubmitting}
            />
          </Field>

          <Field label="住所">
            <input
              style={styles.input}
              type="text"
              value={form.shop_address ?? ''}
              onChange={(e) => setField('shop_address', e.target.value || null)}
              disabled={isSubmitting}
            />
          </Field>

          <div style={styles.ratingRow}>
            <RatingField
              label="酸味"
              value={form.acidity}
              onChange={(v) => setField('acidity', v)}
              disabled={isSubmitting}
            />
            <RatingField
              label="香り"
              value={form.aroma}
              onChange={(v) => setField('aroma', v)}
              disabled={isSubmitting}
            />
            <RatingField
              label="苦味"
              value={form.bitterness}
              onChange={(v) => setField('bitterness', v)}
              disabled={isSubmitting}
            />
            <RatingField
              label="総合評価 *"
              value={form.overall_rating}
              onChange={(v) => setField('overall_rating', v)}
              disabled={isSubmitting}
            />
          </div>
        </div>

        <div style={styles.actions}>
          <button
            style={styles.cancelBtn}
            onClick={onCancel}
            disabled={isSubmitting}
          >
            キャンセル
          </button>
          <button
            style={{ ...styles.confirmBtn, ...((!canSubmit || isSubmitting) ? styles.disabledBtn : {}) }}
            onClick={() => onConfirm(form)}
            disabled={!canSubmit || isSubmitting}
          >
            {isSubmitting ? '登録中…' : '登録する'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={styles.label}>{label}</label>
      {children}
    </div>
  );
}

function RatingField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  disabled: boolean;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1 }}>
      <label style={styles.label}>{label}</label>
      <input
        style={{ ...styles.input, textAlign: 'center' }}
        type="number"
        min={1}
        max={5}
        value={value ?? ''}
        onChange={(e) => {
          const n = parseInt(e.target.value, 10);
          onChange(isNaN(n) ? null : Math.min(5, Math.max(1, n)));
        }}
        disabled={disabled}
        placeholder="1–5"
      />
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(45, 31, 22, 0.55)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    backdropFilter: 'blur(4px)',
  },
  modal: {
    background: 'var(--card)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    boxShadow: 'var(--shadow)',
    padding: '28px 32px',
    width: '100%',
    maxWidth: 520,
    maxHeight: '90vh',
    overflowY: 'auto',
    fontFamily: 'var(--font-sans)',
  },
  heading: {
    fontFamily: 'var(--font-display)',
    fontSize: '1.3rem',
    margin: '0 0 6px',
    color: 'var(--ink)',
  },
  hint: {
    fontSize: '0.85rem',
    color: 'var(--muted)',
    margin: '0 0 20px',
  },
  fields: {
    display: 'flex',
    flexDirection: 'column',
    gap: 14,
  },
  label: {
    fontSize: '0.78rem',
    fontWeight: 600,
    color: 'var(--muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
  },
  input: {
    padding: '9px 12px',
    borderRadius: 10,
    border: '1px solid var(--border)',
    fontFamily: 'var(--font-sans)',
    fontSize: '0.95rem',
    background: '#fff',
    color: 'var(--ink)',
    width: '100%',
  },
  ratingRow: {
    display: 'flex',
    gap: 10,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: 10,
    marginTop: 24,
  },
  cancelBtn: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 999,
    padding: '10px 20px',
    fontFamily: 'var(--font-sans)',
    fontWeight: 600,
    fontSize: '0.9rem',
    cursor: 'pointer',
    color: 'var(--muted)',
  },
  confirmBtn: {
    background: 'var(--accent)',
    border: 'none',
    borderRadius: 999,
    padding: '10px 24px',
    fontFamily: 'var(--font-sans)',
    fontWeight: 600,
    fontSize: '0.9rem',
    cursor: 'pointer',
    color: '#fff',
    boxShadow: '0 8px 20px rgba(224, 107, 58, 0.3)',
  },
  disabledBtn: {
    opacity: 0.5,
    cursor: 'not-allowed',
    boxShadow: 'none',
  },
};

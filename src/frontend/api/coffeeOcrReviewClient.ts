import type { OcrResult } from '../types';

export type ExtractedCoffee = {
  bean_name: string | null;
  bean_type: string | null;
  roast_level: 'light' | 'medium' | 'dark' | '浅煎り' | '中煎り' | '深煎り' | null;
  shop_name: string | null;
  shop_address: string | null;
  acidity: number | null;
  aroma: number | null;
  bitterness: number | null;
  overall_rating: number | null;
};

export type ExtractResult = {
  success: boolean;
  extracted: ExtractedCoffee | null;
  message: string;
};

const baseUrl = import.meta.env.VITE_MASTRA_BASE_URL ?? '';

export async function extractImageForReview(
  imageBase64: string,
  userId: string,
  isPublic: boolean,
): Promise<ExtractResult> {
  const response = await fetch(`${baseUrl}/api/coffee/ocr/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, user_id: userId, is_public: isPublic }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as ExtractResult;
}

export async function confirmOcrInsert(
  extracted: ExtractedCoffee,
  userId: string,
  isPublic: boolean,
): Promise<OcrResult> {
  const response = await fetch(`${baseUrl}/api/coffee/ocr/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ extracted, user_id: userId, is_public: isPublic }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(errorBody || `Request failed with status ${response.status}`);
  }

  return (await response.json()) as OcrResult;
}

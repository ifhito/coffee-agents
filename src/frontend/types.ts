export type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
};

export type AgentResponse = {
  text: string;
  threadId?: string;
  toolCalls?: {
    toolName: string;
    args: Record<string, unknown>;
    result: unknown;
  }[];
};

export type OcrResult = {
  inserted: boolean;
  extracted: {
    bean_name: string | null;
    bean_type: string | null;
    roast_level: string | null;
    shop_name: string | null;
    shop_address: string | null;
    acidity: number | null;
    aroma: number | null;
    bitterness: number | null;
    overall_rating: number | null;
  } | null;
  reason?: string;
};

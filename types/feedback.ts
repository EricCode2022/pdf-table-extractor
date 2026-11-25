import type { TableData } from './table';

export interface FeedbackReview {
  level: 'high' | 'medium' | 'low';
  score: number;
  reasons: string[];
  reviewedAt: string;
}

export interface FeedbackTable extends TableData {
  review?: FeedbackReview;
}

export interface FeedbackEntry {
  id: string;
  submittedAt: string;
  sourceFile: string;
  clientId?: string;
  tableCount: number;
  tables: FeedbackTable[];
}

export interface FeedbackSummary {
  id: string;
  submittedAt: string;
  sourceFile: string;
  clientId?: string;
  tableCount: number;
}

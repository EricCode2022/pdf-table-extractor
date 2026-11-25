import { NextRequest, NextResponse } from 'next/server';
import { saveFeedback, listFeedback } from '@/lib/feedback/store';
import { requireAdmin } from '@/lib/feedback/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  return NextResponse.json({ entries: await listFeedback() });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      sourceFile?: string;
      clientId?: string;
      tables?: unknown[];
    };
    if (!Array.isArray(body.tables) || body.tables.length === 0) {
      return NextResponse.json({ error: 'No tables in feedback' }, { status: 400 });
    }
    if (body.tables.length > 200) {
      return NextResponse.json({ error: 'Too many tables' }, { status: 400 });
    }
    const entry = await saveFeedback({
      sourceFile: String(body.sourceFile ?? 'unknown.pdf').slice(0, 200),
      clientId: body.clientId ? String(body.clientId).slice(0, 100) : undefined,
      tableCount: body.tables.length,
      tables: body.tables as never,
    });
    return NextResponse.json({ id: entry.id, submittedAt: entry.submittedAt });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save feedback' },
      { status: 500 }
    );
  }
}

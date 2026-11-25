import { NextRequest, NextResponse } from 'next/server';
import { getFeedback } from '@/lib/feedback/store';
import { requireAdmin } from '@/lib/feedback/auth';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = requireAdmin(req);
  if (denied) return denied;
  const { id } = await params;
  const entry = await getFeedback(id);
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(entry);
}

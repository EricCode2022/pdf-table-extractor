import { NextResponse } from 'next/server';
import { isVercel } from '@/lib/storage';

export const runtime = 'nodejs';

export function GET() {
  return NextResponse.json({ uploadMode: isVercel ? 'blob' : 'local' });
}

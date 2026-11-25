import { NextRequest, NextResponse } from 'next/server';

/** Guard admin-only feedback reads with a shared password from env. */
export function requireAdmin(req: NextRequest): NextResponse | null {
  const configured = process.env.ADMIN_PASSWORD;
  if (!configured) return null; // local dev without a password set
  const provided = req.headers.get('x-admin-password') ?? '';
  if (provided !== configured) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

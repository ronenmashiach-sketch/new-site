import { NextResponse } from 'next/server';
import { readSiteBranding } from '@/lib/site-branding.server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const branding = await readSiteBranding();
    return NextResponse.json(branding);
  } catch {
    return NextResponse.json({ logoSizePx: 40 }, { status: 500 });
  }
}


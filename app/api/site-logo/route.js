import { NextResponse } from 'next/server';
import { readSiteLogoState } from '@/lib/site-logo.server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { logoUrl, updatedAt } = await readSiteLogoState();
    return NextResponse.json({
      logoUrl,
      updatedAt,
    });
  } catch {
    return NextResponse.json({ logoUrl: null, updatedAt: null }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { readFlasherTickerSettings } from '@/lib/flasher-ticker-settings.server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const settings = await readFlasherTickerSettings();
    return NextResponse.json(settings);
  } catch {
    return NextResponse.json({ speedLevel: 4, maxFlashersDisplay: 15 }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { getMatches } from '@/lib/football';

export async function GET() {
  try {
    const matches = await getMatches();
    return NextResponse.json(matches);
  } catch (error) {
    console.error('API Error fetching matches:', error);
    return NextResponse.json({ error: 'Failed to fetch matches' }, { status: 500 });
  }
}

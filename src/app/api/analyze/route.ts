import { NextResponse } from 'next/server';
import { analyzeMatch } from '@/lib/gemini';
import { getMatchAnalysisContext } from '@/lib/football';

export async function POST(request: Request) {
  try {
    const matchDetails = await request.json();
    const analysisContext = await getMatchAnalysisContext(matchDetails);
    const analysis = await analyzeMatch(matchDetails, analysisContext);
    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('API Error analyzing match:', error);
    const message = error instanceof Error ? error.message : 'Failed to analyze match';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

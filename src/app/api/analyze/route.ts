import { NextResponse } from 'next/server';
import { analyzeMatch } from '@/lib/gemini';
import { getMatchAnalysisContext } from '@/lib/football';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const matchDetails = body?.matchDetails || body;
    const options = body?.options || {};
    const analysisContext = await getMatchAnalysisContext(matchDetails);
    const result = await analyzeMatch(matchDetails, analysisContext, options);
    return NextResponse.json(result);
  } catch (error) {
    console.error('API Error analyzing match:', error);
    const message = error instanceof Error ? error.message : 'Failed to analyze match';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

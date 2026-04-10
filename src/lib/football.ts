import axios from 'axios';
import { format, addDays } from 'date-fns';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '61997511aemshdaf4b252a720079p181ed3jsn75e06d011c45';
const RAPIDAPI_HOST = 'api-football-v1.p.rapidapi.com';
const BASE_URL = 'https://api-football-v1.p.rapidapi.com/v3';

const footballApi = axios.create({
  baseURL: BASE_URL,
  timeout: 12000,
  headers: {
    'x-rapidapi-key': RAPIDAPI_KEY,
    'x-rapidapi-host': RAPIDAPI_HOST,
  },
});

export interface MatchAnalysisContext {
  prediction: any | null;
  h2h: any[];
  lineups: any[];
  injuries: { home: any[]; away: any[] };
  recentForm: { home: any[]; away: any[] };
  xgSummary: {
    home: { avgXG: number | null; avgXGA: number | null; samples: number };
    away: { avgXG: number | null; avgXGA: number | null; samples: number };
  };
}

async function safeApiGet(path: string, params: Record<string, any>) {
  try {
    const response = await footballApi.get(path, { params });
    return response?.data?.response || [];
  } catch (error) {
    console.error(`RapidAPI call failed: ${path}`, error);
    return [];
  }
}

function parseStatNumber(value: any) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseFloat(String(value).replace('%', '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

async function getTeamXgSummary(teamId: number, fixtures: any[]) {
  const finishedFixtures = fixtures.filter((fixture) => fixture?.fixture?.status?.short === 'FT').slice(0, 3);
  if (finishedFixtures.length === 0) return { avgXG: null, avgXGA: null, samples: 0 };

  const statsResults = await Promise.allSettled(
    finishedFixtures.map((fixture) => safeApiGet('/fixtures/statistics', { fixture: fixture?.fixture?.id }))
  );

  let totalXgFor = 0;
  let totalXgAgainst = 0;
  let xgSamples = 0;

  for (const result of statsResults) {
    if (result.status !== 'fulfilled') continue;
    const entries = result.value;
    if (!Array.isArray(entries) || entries.length < 2) continue;

    const teamStats = entries.find((entry: any) => entry?.team?.id === teamId);
    const opponentStats = entries.find((entry: any) => entry?.team?.id !== teamId);
    if (!teamStats || !opponentStats) continue;

    const teamXg = parseStatNumber(teamStats?.statistics?.find((stat: any) => stat?.type === 'Expected Goals')?.value);
    const oppXg = parseStatNumber(opponentStats?.statistics?.find((stat: any) => stat?.type === 'Expected Goals')?.value);

    if (teamXg !== null && oppXg !== null) {
      totalXgFor += teamXg;
      totalXgAgainst += oppXg;
      xgSamples += 1;
    }
  }

  if (xgSamples === 0) return { avgXG: null, avgXGA: null, samples: 0 };
  return {
    avgXG: Number((totalXgFor / xgSamples).toFixed(2)),
    avgXGA: Number((totalXgAgainst / xgSamples).toFixed(2)),
    samples: xgSamples,
  };
}

export async function getMatches() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  try {
    const [todayResult, tomorrowResult] = await Promise.allSettled([
      footballApi.get('/fixtures', { params: { date: today } }),
      footballApi.get('/fixtures', { params: { date: tomorrow } }),
    ]);

    const todayMatches = todayResult.status === 'fulfilled' ? todayResult.value.data.response || [] : [];
    const tomorrowMatches = tomorrowResult.status === 'fulfilled' ? tomorrowResult.value.data.response || [] : [];
    const allMatches = [...todayMatches, ...tomorrowMatches];

    if (allMatches.length === 0) {
      console.log('No matches found from RapidAPI. Using mock data.');
      return getMockMatches();
    }

    return allMatches.map((match: any) => ({
      id: match.fixture.id,
      utcDate: match.fixture.date,
      status: match.fixture.status.short,
      matchday: match.league?.round || 'Ismeretlen',
      homeTeam: {
        id: match.teams?.home?.id || null,
        name: match.teams?.home?.name || 'Ismeretlen',
        shortName: match.teams?.home?.name || 'Ismeretlen',
        tla: match.teams?.home?.name?.substring(0, 3).toUpperCase() || 'UNK',
        crest: match.teams?.home?.logo || ''
      },
      awayTeam: {
        id: match.teams?.away?.id || null,
        name: match.teams?.away?.name || 'Ismeretlen',
        shortName: match.teams?.away?.name || 'Ismeretlen',
        tla: match.teams?.away?.name?.substring(0, 3).toUpperCase() || 'UNK',
        crest: match.teams?.away?.logo || ''
      },
      competition: {
        id: match.league?.id || null,
        country: match.league?.country || null,
        season: match.league?.season || null,
        name: match.league?.name || 'Egyéb mérkőzések',
        emblem: match.league?.logo || ''
      },
    }));
  } catch (error) {
    console.error('Error fetching football matches from RapidAPI:', error);
    console.log('Falling back to mock matches due to error.');
    return getMockMatches();
  }
}

export async function getMatchAnalysisContext(matchDetails: any): Promise<MatchAnalysisContext> {
  const fixtureId = matchDetails?.id;
  const homeTeamId = matchDetails?.homeTeam?.id;
  const awayTeamId = matchDetails?.awayTeam?.id;
  const season = matchDetails?.competition?.season || new Date(matchDetails?.utcDate || Date.now()).getFullYear();

  const defaultContext: MatchAnalysisContext = {
    prediction: null,
    h2h: [],
    lineups: [],
    injuries: { home: [], away: [] },
    recentForm: { home: [], away: [] },
    xgSummary: {
      home: { avgXG: null, avgXGA: null, samples: 0 },
      away: { avgXG: null, avgXGA: null, samples: 0 },
    },
  };

  if (!fixtureId || !homeTeamId || !awayTeamId) return defaultContext;

  const [prediction, h2h, lineups, homeInjuries, awayInjuries, homeRecent, awayRecent] = await Promise.all([
    safeApiGet('/predictions', { fixture: fixtureId }),
    safeApiGet('/fixtures/headtohead', { h2h: `${homeTeamId}-${awayTeamId}`, last: 5 }),
    safeApiGet('/fixtures/lineups', { fixture: fixtureId }),
    safeApiGet('/injuries', { team: homeTeamId, season }),
    safeApiGet('/injuries', { team: awayTeamId, season }),
    safeApiGet('/fixtures', { team: homeTeamId, last: 5 }),
    safeApiGet('/fixtures', { team: awayTeamId, last: 5 }),
  ]);

  const [homeXg, awayXg] = await Promise.all([
    getTeamXgSummary(homeTeamId, homeRecent),
    getTeamXgSummary(awayTeamId, awayRecent),
  ]);

  return {
    prediction: prediction[0] || null,
    h2h,
    lineups,
    injuries: { home: homeInjuries, away: awayInjuries },
    recentForm: { home: homeRecent, away: awayRecent },
    xgSummary: { home: homeXg, away: awayXg },
  };
}

function getMockMatches() {
  const season = new Date().getFullYear();
  return [
    {
      id: 1,
      utcDate: new Date().toISOString(),
      status: 'TIMED',
      matchday: 30,
      homeTeam: { id: 50, name: 'Manchester City', shortName: 'Man City', tla: 'MCI', crest: 'https://crests.football-data.org/65.png' },
      awayTeam: { id: 40, name: 'Liverpool FC', shortName: 'Liverpool', tla: 'LIV', crest: 'https://crests.football-data.org/64.png' },
      competition: { id: 39, country: 'England', season, name: 'Premier League', emblem: 'https://crests.football-data.org/PL.png' },
    },
    {
      id: 2,
      utcDate: addDays(new Date(), 1).toISOString(),
      status: 'TIMED',
      matchday: 28,
      homeTeam: { id: 541, name: 'Real Madrid CF', shortName: 'Real Madrid', tla: 'RMA', crest: 'https://crests.football-data.org/86.png' },
      awayTeam: { id: 529, name: 'FC Barcelona', shortName: 'Barcelona', tla: 'BAR', crest: 'https://crests.football-data.org/81.png' },
      competition: { id: 140, country: 'Spain', season, name: 'La Liga', emblem: 'https://crests.football-data.org/PD.png' },
    },
  ];
}

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
  probabilities: { home: number; draw: number; away: number };
  h2h: any[];
  lineups: any[];
  injuries: { home: any[]; away: any[] };
  recentForm: { home: any[]; away: any[] };
  teamIntel: {
    home: {
      ppg: number | null;
      goalsForPerMatch: number | null;
      goalsAgainstPerMatch: number | null;
      cleanSheetRate: number | null;
      failedToScoreRate: number | null;
      likelyFormation: string | null;
      missingPlayers: string[];
    };
    away: {
      ppg: number | null;
      goalsForPerMatch: number | null;
      goalsAgainstPerMatch: number | null;
      cleanSheetRate: number | null;
      failedToScoreRate: number | null;
      likelyFormation: string | null;
      missingPlayers: string[];
    };
  };
  xgSummary: {
    home: { avgXG: number | null; avgXGA: number | null; samples: number };
    away: { avgXG: number | null; avgXGA: number | null; samples: number };
  };
  dataAvailability: {
    prediction: boolean;
    h2h: boolean;
    lineups: boolean;
    injuries: boolean;
    xg: boolean;
    teamStats: boolean;
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

function toSafeNumber(value: any) {
  const parsed = Number.parseFloat(String(value ?? '').replace('%', '').replace(',', '.'));
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

function normalizeTo100(home: number, draw: number, away: number) {
  const total = home + draw + away;
  if (!Number.isFinite(total) || total <= 0) return { home: 33, draw: 34, away: 33 };
  const scale = 100 / total;
  let h = Math.round(home * scale);
  let d = Math.round(draw * scale);
  let a = Math.round(away * scale);
  a += 100 - (h + d + a);
  return { home: h, draw: d, away: a };
}

function blendProbabilities(
  primary: { home: number; draw: number; away: number },
  secondary: { home: number; draw: number; away: number },
  primaryWeight = 0.65
) {
  const p = Math.max(0, Math.min(1, primaryWeight));
  const s = 1 - p;
  return normalizeTo100(
    primary.home * p + secondary.home * s,
    primary.draw * p + secondary.draw * s,
    primary.away * p + secondary.away * s
  );
}

function getPredictionProbabilities(prediction: any) {
  const percent = prediction?.predictions?.percent;
  const toNumber = (v: any) => Number.parseFloat(String(v ?? '').replace('%', '').replace(',', '.'));
  const home = toNumber(percent?.home);
  const draw = toNumber(percent?.draw);
  const away = toNumber(percent?.away);
  if (!Number.isFinite(home) || !Number.isFinite(draw) || !Number.isFinite(away)) return null;
  return normalizeTo100(home, draw, away);
}

function getTeamRecentStrength(teamId: number, fixtures: any[]) {
  let score = 0;
  for (const fixture of fixtures.slice(0, 5)) {
    const homeId = fixture?.teams?.home?.id;
    const awayId = fixture?.teams?.away?.id;
    const goalsHome = fixture?.goals?.home;
    const goalsAway = fixture?.goals?.away;
    if (!Number.isFinite(goalsHome) || !Number.isFinite(goalsAway)) continue;

    const isHome = homeId === teamId;
    const goalsFor = isHome ? goalsHome : goalsAway;
    const goalsAgainst = isHome ? goalsAway : goalsHome;

    if (goalsFor > goalsAgainst) score += 3;
    else if (goalsFor === goalsAgainst) score += 1;
    score += Math.max(-1, Math.min(1, (goalsFor - goalsAgainst) * 0.2));
  }
  return score;
}

function getRecentGoalProfile(teamId: number, fixtures: any[]) {
  let played = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  for (const fixture of fixtures.slice(0, 5)) {
    const homeId = fixture?.teams?.home?.id;
    const awayId = fixture?.teams?.away?.id;
    const goalsHome = fixture?.goals?.home;
    const goalsAway = fixture?.goals?.away;
    if (!Number.isFinite(goalsHome) || !Number.isFinite(goalsAway)) continue;
    const isHome = homeId === teamId;
    goalsFor += isHome ? goalsHome : goalsAway;
    goalsAgainst += isHome ? goalsAway : goalsHome;
    played += 1;
  }
  if (played === 0) return { gf: 1.1, ga: 1.1 };
  return { gf: goalsFor / played, ga: goalsAgainst / played };
}

function deriveFallbackProbabilities(
  homeTeamId: number,
  awayTeamId: number,
  homeRecent: any[],
  awayRecent: any[],
  xgSummary?: MatchAnalysisContext['xgSummary']
) {
  const homeStrength = getTeamRecentStrength(homeTeamId, homeRecent);
  const awayStrength = getTeamRecentStrength(awayTeamId, awayRecent);
  const deltaForm = homeStrength - awayStrength;

  const homeGoals = getRecentGoalProfile(homeTeamId, homeRecent);
  const awayGoals = getRecentGoalProfile(awayTeamId, awayRecent);

  const homeXg = xgSummary?.home?.avgXG;
  const homeXga = xgSummary?.home?.avgXGA;
  const awayXg = xgSummary?.away?.avgXG;
  const awayXga = xgSummary?.away?.avgXGA;

  const attackDelta = (homeGoals.gf - awayGoals.ga) - (awayGoals.gf - homeGoals.ga);
  const xgDelta =
    Number.isFinite(homeXg as number) && Number.isFinite(homeXga as number) && Number.isFinite(awayXg as number) && Number.isFinite(awayXga as number)
      ? ((homeXg as number) - (homeXga as number)) - ((awayXg as number) - (awayXga as number))
      : 0;

  // Home advantage + form + scoring profile + xG correction
  const scoreDelta = 0.9 + deltaForm * 0.11 + attackDelta * 0.75 + xgDelta * 0.65;

  let home = 41 + scoreDelta * 11;
  let away = 31 - scoreDelta * 9;
  let draw = 28 - Math.abs(scoreDelta) * 4.5;

  // Clamp to realistic ranges
  home = Math.max(12, Math.min(74, home));
  away = Math.max(8, Math.min(66, away));
  draw = Math.max(10, Math.min(40, draw));

  return normalizeTo100(home, draw, away);
}

function buildTeamIntel(teamStats: any, injuries: any[], lineups: any[], teamId: number) {
  const played = toSafeNumber(teamStats?.fixtures?.played?.total) || 0;
  const wins = toSafeNumber(teamStats?.fixtures?.wins?.total) || 0;
  const draws = toSafeNumber(teamStats?.fixtures?.draws?.total) || 0;
  const goalsFor = toSafeNumber(teamStats?.goals?.for?.total?.total);
  const goalsAgainst = toSafeNumber(teamStats?.goals?.against?.total?.total);
  const cleanSheets = toSafeNumber(teamStats?.clean_sheet?.total);
  const failedToScore = toSafeNumber(teamStats?.failed_to_score?.total);

  const ppg = played > 0 ? Number(((wins * 3 + draws) / played).toFixed(2)) : null;
  const goalsForPerMatch = played > 0 && goalsFor !== null ? Number((goalsFor / played).toFixed(2)) : null;
  const goalsAgainstPerMatch = played > 0 && goalsAgainst !== null ? Number((goalsAgainst / played).toFixed(2)) : null;
  const cleanSheetRate = played > 0 && cleanSheets !== null ? Number(((cleanSheets / played) * 100).toFixed(1)) : null;
  const failedToScoreRate = played > 0 && failedToScore !== null ? Number(((failedToScore / played) * 100).toFixed(1)) : null;

  const lineup = lineups.find((item: any) => item?.team?.id === teamId);
  const likelyFormation = lineup?.formation || null;

  const missingPlayers = (injuries || [])
    .slice(0, 8)
    .map((item: any) => {
      const name = item?.player?.name;
      const reason = item?.player?.reason || item?.player?.type;
      return name ? `${name}${reason ? ` (${reason})` : ''}` : null;
    })
    .filter(Boolean);

  return {
    ppg,
    goalsForPerMatch,
    goalsAgainstPerMatch,
    cleanSheetRate,
    failedToScoreRate,
    likelyFormation,
    missingPlayers,
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
    probabilities: { home: 33, draw: 34, away: 33 },
    h2h: [],
    lineups: [],
    injuries: { home: [], away: [] },
    recentForm: { home: [], away: [] },
    teamIntel: {
      home: {
        ppg: null, goalsForPerMatch: null, goalsAgainstPerMatch: null, cleanSheetRate: null, failedToScoreRate: null, likelyFormation: null, missingPlayers: [],
      },
      away: {
        ppg: null, goalsForPerMatch: null, goalsAgainstPerMatch: null, cleanSheetRate: null, failedToScoreRate: null, likelyFormation: null, missingPlayers: [],
      },
    },
    xgSummary: {
      home: { avgXG: null, avgXGA: null, samples: 0 },
      away: { avgXG: null, avgXGA: null, samples: 0 },
    },
    dataAvailability: {
      prediction: false,
      h2h: false,
      lineups: false,
      injuries: false,
      xg: false,
      teamStats: false,
    },
  };

  if (!fixtureId || !homeTeamId || !awayTeamId) return defaultContext;

  const leagueId = matchDetails?.competition?.id;

  const [prediction, h2h, lineups, homeInjuries, awayInjuries, homeRecent, awayRecent, homeTeamStats, awayTeamStats] = await Promise.all([
    safeApiGet('/predictions', { fixture: fixtureId }),
    safeApiGet('/fixtures/headtohead', { h2h: `${homeTeamId}-${awayTeamId}`, last: 5 }),
    safeApiGet('/fixtures/lineups', { fixture: fixtureId }),
    safeApiGet('/injuries', { team: homeTeamId, season }),
    safeApiGet('/injuries', { team: awayTeamId, season }),
    safeApiGet('/fixtures', { team: homeTeamId, last: 5 }),
    safeApiGet('/fixtures', { team: awayTeamId, last: 5 }),
    leagueId ? safeApiGet('/teams/statistics', { league: leagueId, season, team: homeTeamId }) : Promise.resolve([]),
    leagueId ? safeApiGet('/teams/statistics', { league: leagueId, season, team: awayTeamId }) : Promise.resolve([]),
  ]);

  const [homeXg, awayXg] = await Promise.all([
    getTeamXgSummary(homeTeamId, homeRecent),
    getTeamXgSummary(awayTeamId, awayRecent),
  ]);

  const predictionFirst = prediction[0] || null;
  const fallbackProbabilities = deriveFallbackProbabilities(
    homeTeamId,
    awayTeamId,
    homeRecent,
    awayRecent,
    { home: homeXg, away: awayXg }
  );
  const predictionProbabilities = getPredictionProbabilities(predictionFirst);
  const probabilities = predictionProbabilities
    ? blendProbabilities(predictionProbabilities, fallbackProbabilities, 0.62)
    : fallbackProbabilities;

  const hasTeamStats = Boolean(homeTeamStats && awayTeamStats);
  const hasLineups = Array.isArray(lineups) && lineups.length > 0;
  const hasH2H = Array.isArray(h2h) && h2h.length > 0;
  const hasInjuries = (homeInjuries?.length || 0) + (awayInjuries?.length || 0) > 0;
  const hasXg = (homeXg.samples || 0) > 0 || (awayXg.samples || 0) > 0;

  return {
    prediction: predictionFirst,
    probabilities,
    h2h,
    lineups,
    injuries: { home: homeInjuries, away: awayInjuries },
    recentForm: { home: homeRecent, away: awayRecent },
    teamIntel: {
      home: buildTeamIntel(homeTeamStats, homeInjuries, lineups, homeTeamId),
      away: buildTeamIntel(awayTeamStats, awayInjuries, lineups, awayTeamId),
    },
    xgSummary: { home: homeXg, away: awayXg },
    dataAvailability: {
      prediction: Boolean(predictionProbabilities),
      h2h: hasH2H,
      lineups: hasLineups,
      injuries: hasInjuries,
      xg: hasXg,
      teamStats: hasTeamStats,
    },
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

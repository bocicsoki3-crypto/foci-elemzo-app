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

const UNDERSTAT_LEAGUE_MAP: Record<string, string> = {
  'premier league': 'EPL',
  'la liga': 'La_liga',
  'bundesliga': 'Bundesliga',
  'serie a': 'Serie_A',
  'ligue 1': 'Ligue_1',
};

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
      avgCorners: number | null;
      avgYellowCards: number | null;
      avgRedCards: number | null;
      cleanSheetRate: number | null;
      failedToScoreRate: number | null;
      likelyFormation: string | null;
      missingPlayers: string[];
    };
    away: {
      ppg: number | null;
      goalsForPerMatch: number | null;
      goalsAgainstPerMatch: number | null;
      avgCorners: number | null;
      avgYellowCards: number | null;
      avgRedCards: number | null;
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
    news: boolean;
  };
  monteCarlo: {
    iterations: number;
    homeWinPct: number;
    drawPct: number;
    awayWinPct: number;
    bttsYesPct: number;
    over25Pct: number;
    over35Pct: number;
    expectedHomeGoals: number;
    expectedAwayGoals: number;
    mostLikelyScore: string;
  };
  newsIntel: Array<{
    title: string;
    source: string;
    url: string;
    publishedAt: string | null;
  }>;
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

const TRUSTED_NEWS_DOMAINS = [
  'reuters.com',
  'bbc.com',
  'skysports.com',
  'espn.com',
  'theathletic.com',
  'uefa.com',
  'fifa.com',
  'bundesliga.com',
  'premierleague.com',
  'ligue1.com',
  'seriea.com',
  'laliga.com',
];

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractTag(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match?.[1] ? decodeHtml(match[1].trim()) : '';
}

async function fetchTrustedMatchNews(homeTeam: string, awayTeam: string) {
  try {
    const query = encodeURIComponent(`"${homeTeam}" "${awayTeam}" injury lineup football`);
    const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
    const response = await fetch(rssUrl, { method: 'GET' });
    if (!response.ok) return [];

    const xml = await response.text();
    const itemBlocks = xml.match(/<item>[\s\S]*?<\/item>/gi) || [];
    const parsed = itemBlocks
      .map((item) => {
        const title = extractTag(item, 'title');
        const link = extractTag(item, 'link');
        const pubDate = extractTag(item, 'pubDate');
        const source = extractTag(item, 'source');
        return {
          title,
          url: link,
          source: source || 'unknown',
          publishedAt: pubDate || null,
        };
      })
      .filter((entry) => entry.title && entry.url)
      .filter((entry) => TRUSTED_NEWS_DOMAINS.some((domain) => entry.url.includes(domain)))
      .slice(0, 8);

    return parsed;
  } catch (error) {
    console.error('Failed to fetch trusted news fallback:', error);
    return [];
  }
}

function parseStatNumber(value: any) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number.parseFloat(String(value).replace('%', '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeTeamName(value: string) {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(fc|cf|ac|as|ssc|sc|afc|deportivo|club)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getUnderstatLeagueKey(competitionName: string) {
  const key = (competitionName || '').toLowerCase().trim();
  return UNDERSTAT_LEAGUE_MAP[key] || null;
}

async function getUnderstatTeamXg(
  competitionName: string,
  season: number,
  homeTeamName: string,
  awayTeamName: string
) {
  const leagueKey = getUnderstatLeagueKey(competitionName);
  if (!leagueKey) return null;

  try {
    const url = `https://understat.com/league/${leagueKey}/${season}`;
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok) return null;
    const html = await response.text();

    const match = html.match(/teamsData\s*=\s*JSON\.parse\('([\s\S]*?)'\)/);
    if (!match?.[1]) return null;

    const decodedJson = match[1]
      .replace(/\\'/g, "'")
      .replace(/\\\\/g, '\\')
      .replace(/\\"/g, '"');
    const teamsObj = JSON.parse(decodedJson);
    const teams = Object.values(teamsObj) as any[];
    if (!Array.isArray(teams) || teams.length === 0) return null;

    const homeNorm = normalizeTeamName(homeTeamName);
    const awayNorm = normalizeTeamName(awayTeamName);
    const findTeam = (target: string) =>
      teams.find((team) => {
        const title = normalizeTeamName(String(team?.title || ''));
        return title === target || title.includes(target) || target.includes(title);
      });

    const home = findTeam(homeNorm);
    const away = findTeam(awayNorm);
    if (!home || !away) return null;

    const homeMatches = Number.parseFloat(String(home?.history?.length || 0));
    const awayMatches = Number.parseFloat(String(away?.history?.length || 0));

    const hxg = parseStatNumber(home?.xG);
    const hxga = parseStatNumber(home?.xGA);
    const axg = parseStatNumber(away?.xG);
    const axga = parseStatNumber(away?.xGA);
    if (hxg === null || hxga === null || axg === null || axga === null) return null;

    return {
      home: {
        avgXG: homeMatches > 0 ? Number((hxg / homeMatches).toFixed(2)) : null,
        avgXGA: homeMatches > 0 ? Number((hxga / homeMatches).toFixed(2)) : null,
        samples: homeMatches > 0 ? Math.round(homeMatches) : 0,
      },
      away: {
        avgXG: awayMatches > 0 ? Number((axg / awayMatches).toFixed(2)) : null,
        avgXGA: awayMatches > 0 ? Number((axga / awayMatches).toFixed(2)) : null,
        samples: awayMatches > 0 ? Math.round(awayMatches) : 0,
      },
      source: 'understat',
    };
  } catch (error) {
    console.error('Understat xG fallback failed:', error);
    return null;
  }
}

function toSafeNumber(value: any) {
  const parsed = Number.parseFloat(String(value ?? '').replace('%', '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : null;
}

function factorial(n: number) {
  if (n <= 1) return 1;
  let result = 1;
  for (let i = 2; i <= n; i++) result *= i;
  return result;
}

function poissonProb(lambda: number, k: number) {
  if (!Number.isFinite(lambda) || lambda < 0) return 0;
  return Math.exp(-lambda) * Math.pow(lambda, k) / factorial(k);
}

function clampExpectedGoals(value: number) {
  if (!Number.isFinite(value)) return 1.25;
  return Math.max(0.2, Math.min(3.8, value));
}

function getExpectedGoalsInputs(
  homeIntel: MatchAnalysisContext['teamIntel']['home'],
  awayIntel: MatchAnalysisContext['teamIntel']['away'],
  xg: MatchAnalysisContext['xgSummary']
) {
  const homeAttack = homeIntel.goalsForPerMatch ?? 1.2;
  const homeDefense = homeIntel.goalsAgainstPerMatch ?? 1.2;
  const awayAttack = awayIntel.goalsForPerMatch ?? 1.1;
  const awayDefense = awayIntel.goalsAgainstPerMatch ?? 1.2;

  const homeXg = xg.home.avgXG ?? homeAttack;
  const awayXg = xg.away.avgXG ?? awayAttack;
  const homeXga = xg.home.avgXGA ?? homeDefense;
  const awayXga = xg.away.avgXGA ?? awayDefense;

  // Weighted blend: form-based GF/GA + xG/xGA + home advantage.
  const expHome = clampExpectedGoals(
    homeAttack * 0.28 + awayDefense * 0.17 + homeXg * 0.35 + awayXga * 0.2 + 0.18
  );
  const expAway = clampExpectedGoals(
    awayAttack * 0.3 + homeDefense * 0.18 + awayXg * 0.34 + homeXga * 0.18 - 0.08
  );

  return { expHome, expAway };
}

function runMonteCarlo(
  homeIntel: MatchAnalysisContext['teamIntel']['home'],
  awayIntel: MatchAnalysisContext['teamIntel']['away'],
  xg: MatchAnalysisContext['xgSummary'],
  iterations = 12000
) {
  const { expHome, expAway } = getExpectedGoalsInputs(homeIntel, awayIntel, xg);
  const maxGoals = 8;

  const homeDist = Array.from({ length: maxGoals + 1 }, (_, k) =>
    k === maxGoals
      ? 1 - Array.from({ length: maxGoals }, (_, i) => poissonProb(expHome, i)).reduce((a, b) => a + b, 0)
      : poissonProb(expHome, k)
  );
  const awayDist = Array.from({ length: maxGoals + 1 }, (_, k) =>
    k === maxGoals
      ? 1 - Array.from({ length: maxGoals }, (_, i) => poissonProb(expAway, i)).reduce((a, b) => a + b, 0)
      : poissonProb(expAway, k)
  );

  const homeCum: number[] = [];
  const awayCum: number[] = [];
  homeDist.reduce((acc, v, i) => (homeCum[i] = acc + v, acc + v), 0);
  awayDist.reduce((acc, v, i) => (awayCum[i] = acc + v, acc + v), 0);

  const drawFromCum = (cum: number[]) => {
    const r = Math.random();
    const idx = cum.findIndex((p) => r <= p);
    return idx === -1 ? cum.length - 1 : idx;
  };

  let homeWin = 0;
  let draw = 0;
  let awayWin = 0;
  let bttsYes = 0;
  let over25 = 0;
  let over35 = 0;
  let totalHomeGoals = 0;
  let totalAwayGoals = 0;
  const scoreCounter: Record<string, number> = {};

  for (let i = 0; i < iterations; i++) {
    const hg = drawFromCum(homeCum);
    const ag = drawFromCum(awayCum);
    totalHomeGoals += hg;
    totalAwayGoals += ag;

    if (hg > ag) homeWin++;
    else if (hg === ag) draw++;
    else awayWin++;

    if (hg > 0 && ag > 0) bttsYes++;
    if (hg + ag > 2.5) over25++;
    if (hg + ag > 3.5) over35++;

    const score = `${hg}-${ag}`;
    scoreCounter[score] = (scoreCounter[score] || 0) + 1;
  }

  const mostLikelyScore = Object.entries(scoreCounter).sort((a, b) => b[1] - a[1])[0]?.[0] || '1-1';

  return {
    iterations,
    homeWinPct: Number(((homeWin / iterations) * 100).toFixed(1)),
    drawPct: Number(((draw / iterations) * 100).toFixed(1)),
    awayWinPct: Number(((awayWin / iterations) * 100).toFixed(1)),
    bttsYesPct: Number(((bttsYes / iterations) * 100).toFixed(1)),
    over25Pct: Number(((over25 / iterations) * 100).toFixed(1)),
    over35Pct: Number(((over35 / iterations) * 100).toFixed(1)),
    expectedHomeGoals: Number((totalHomeGoals / iterations).toFixed(2)),
    expectedAwayGoals: Number((totalAwayGoals / iterations).toFixed(2)),
    mostLikelyScore,
  };
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

async function getTeamRecentDisciplineAndCorners(teamId: number, fixtures: any[]) {
  const finishedFixtures = fixtures.filter((fixture) => fixture?.fixture?.status?.short === 'FT').slice(0, 5);
  if (finishedFixtures.length === 0) {
    return { avgCorners: null, avgYellowCards: null, avgRedCards: null, samples: 0 };
  }

  const statsResults = await Promise.allSettled(
    finishedFixtures.map((fixture) => safeApiGet('/fixtures/statistics', { fixture: fixture?.fixture?.id }))
  );

  let corners = 0;
  let yellow = 0;
  let red = 0;
  let samples = 0;

  for (const result of statsResults) {
    if (result.status !== 'fulfilled') continue;
    const entries = result.value;
    if (!Array.isArray(entries) || entries.length < 2) continue;

    const teamStats = entries.find((entry: any) => entry?.team?.id === teamId);
    if (!teamStats) continue;

    const cornerValue = parseStatNumber(teamStats?.statistics?.find((stat: any) => stat?.type === 'Corner Kicks')?.value);
    const yellowValue = parseStatNumber(teamStats?.statistics?.find((stat: any) => stat?.type === 'Yellow Cards')?.value);
    const redValue = parseStatNumber(teamStats?.statistics?.find((stat: any) => stat?.type === 'Red Cards')?.value);

    if (cornerValue !== null || yellowValue !== null || redValue !== null) {
      corners += cornerValue ?? 0;
      yellow += yellowValue ?? 0;
      red += redValue ?? 0;
      samples += 1;
    }
  }

  if (samples === 0) return { avgCorners: null, avgYellowCards: null, avgRedCards: null, samples: 0 };
  return {
    avgCorners: Number((corners / samples).toFixed(2)),
    avgYellowCards: Number((yellow / samples).toFixed(2)),
    avgRedCards: Number((red / samples).toFixed(2)),
    samples,
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
    .filter((item: any) => !item?.team?.id || item?.team?.id === teamId)
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
    avgCorners: null,
    avgYellowCards: null,
    avgRedCards: null,
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
        ppg: null, goalsForPerMatch: null, goalsAgainstPerMatch: null, avgCorners: null, avgYellowCards: null, avgRedCards: null, cleanSheetRate: null, failedToScoreRate: null, likelyFormation: null, missingPlayers: [],
      },
      away: {
        ppg: null, goalsForPerMatch: null, goalsAgainstPerMatch: null, avgCorners: null, avgYellowCards: null, avgRedCards: null, cleanSheetRate: null, failedToScoreRate: null, likelyFormation: null, missingPlayers: [],
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
      news: false,
    },
    monteCarlo: {
      iterations: 0,
      homeWinPct: 33.3,
      drawPct: 33.4,
      awayWinPct: 33.3,
      bttsYesPct: 50,
      over25Pct: 50,
      over35Pct: 28,
      expectedHomeGoals: 1.2,
      expectedAwayGoals: 1.1,
      mostLikelyScore: '1-1',
    },
    newsIntel: [],
  };

  if (!fixtureId || !homeTeamId || !awayTeamId) return defaultContext;

  const leagueId = matchDetails?.competition?.id;

  const [prediction, h2h, lineups, homeInjuries, awayInjuries, homeRecent, awayRecent, homeTeamStats, awayTeamStats, newsIntel] = await Promise.all([
    safeApiGet('/predictions', { fixture: fixtureId }),
    safeApiGet('/fixtures/headtohead', { h2h: `${homeTeamId}-${awayTeamId}`, last: 5 }),
    safeApiGet('/fixtures/lineups', { fixture: fixtureId }),
    safeApiGet('/injuries', { team: homeTeamId, season }),
    safeApiGet('/injuries', { team: awayTeamId, season }),
    safeApiGet('/fixtures', { team: homeTeamId, last: 5 }),
    safeApiGet('/fixtures', { team: awayTeamId, last: 5 }),
    leagueId ? safeApiGet('/teams/statistics', { league: leagueId, season, team: homeTeamId }) : Promise.resolve([]),
    leagueId ? safeApiGet('/teams/statistics', { league: leagueId, season, team: awayTeamId }) : Promise.resolve([]),
    fetchTrustedMatchNews(matchDetails?.homeTeam?.name || '', matchDetails?.awayTeam?.name || ''),
  ]);

  const [homeXg, awayXg] = await Promise.all([
    getTeamXgSummary(homeTeamId, homeRecent),
    getTeamXgSummary(awayTeamId, awayRecent),
  ]);
  const understatXg = await getUnderstatTeamXg(
    matchDetails?.competition?.name || '',
    Number(season),
    matchDetails?.homeTeam?.name || '',
    matchDetails?.awayTeam?.name || ''
  );
  const finalHomeXg =
    (homeXg.samples || 0) > 0
      ? homeXg
      : understatXg?.home || { avgXG: null, avgXGA: null, samples: 0 };
  const finalAwayXg =
    (awayXg.samples || 0) > 0
      ? awayXg
      : understatXg?.away || { avgXG: null, avgXGA: null, samples: 0 };
  const [homeDiscipline, awayDiscipline] = await Promise.all([
    getTeamRecentDisciplineAndCorners(homeTeamId, homeRecent),
    getTeamRecentDisciplineAndCorners(awayTeamId, awayRecent),
  ]);

  const predictionFirst = prediction[0] || null;
  const fallbackProbabilities = deriveFallbackProbabilities(
    homeTeamId,
    awayTeamId,
    homeRecent,
    awayRecent,
    { home: finalHomeXg, away: finalAwayXg }
  );
  const predictionProbabilities = getPredictionProbabilities(predictionFirst);
  const probabilities = predictionProbabilities
    ? blendProbabilities(predictionProbabilities, fallbackProbabilities, 0.62)
    : fallbackProbabilities;

  const hasTeamStats = Boolean(homeTeamStats && awayTeamStats);
  const hasLineups = Array.isArray(lineups) && lineups.length > 0;
  const hasH2H = Array.isArray(h2h) && h2h.length > 0;
  const hasInjuries = (homeInjuries?.length || 0) + (awayInjuries?.length || 0) > 0;
  const hasXg = (finalHomeXg.samples || 0) > 0 || (finalAwayXg.samples || 0) > 0;

  const homeIntel = buildTeamIntel(homeTeamStats, homeInjuries, lineups, homeTeamId);
  const awayIntel = buildTeamIntel(awayTeamStats, awayInjuries, lineups, awayTeamId);
  homeIntel.avgCorners = homeDiscipline.avgCorners;
  homeIntel.avgYellowCards = homeDiscipline.avgYellowCards;
  homeIntel.avgRedCards = homeDiscipline.avgRedCards;
  awayIntel.avgCorners = awayDiscipline.avgCorners;
  awayIntel.avgYellowCards = awayDiscipline.avgYellowCards;
  awayIntel.avgRedCards = awayDiscipline.avgRedCards;
  const monteCarlo = runMonteCarlo(homeIntel, awayIntel, { home: finalHomeXg, away: finalAwayXg });

  return {
    prediction: predictionFirst,
    probabilities,
    h2h,
    lineups,
    injuries: { home: homeInjuries, away: awayInjuries },
    recentForm: { home: homeRecent, away: awayRecent },
    teamIntel: {
      home: homeIntel,
      away: awayIntel,
    },
    xgSummary: { home: finalHomeXg, away: finalAwayXg },
    dataAvailability: {
      prediction: Boolean(predictionProbabilities),
      h2h: hasH2H,
      lineups: hasLineups,
      injuries: hasInjuries,
      xg: hasXg,
      teamStats: hasTeamStats,
      news: Array.isArray(newsIntel) && newsIntel.length > 0,
    },
    monteCarlo,
    newsIntel,
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

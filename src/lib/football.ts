import axios from 'axios';
import { format, addDays } from 'date-fns';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || '61997511aemshdaf4b252a720079p181ed3jsn75e06d011c45';
const RAPIDAPI_HOST = 'api-football-v1.p.rapidapi.com';
const BASE_URL = 'https://api-football-v1.p.rapidapi.com/v3';

const footballApi = axios.create({
  baseURL: BASE_URL,
  headers: {
    'x-rapidapi-key': RAPIDAPI_KEY,
    'x-rapidapi-host': RAPIDAPI_HOST,
  },
});

export async function getMatches() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  try {
    // API-Football v3 uses /fixtures?date=YYYY-MM-DD
    const [todayResponse, tomorrowResponse] = await Promise.all([
      footballApi.get('/fixtures', { params: { date: today } }),
      footballApi.get('/fixtures', { params: { date: tomorrow } }),
    ]);

    const todayMatches = todayResponse.data.response || [];
    const tomorrowMatches = tomorrowResponse.data.response || [];
    const allMatches = [...todayMatches, ...tomorrowMatches];

    if (allMatches.length === 0) {
      console.log('No matches found from RapidAPI. Using mock data.');
      return getMockMatches();
    }

    return allMatches.map((match: any) => ({
      id: match.fixture.id,
      utcDate: match.fixture.date,
      status: match.fixture.status.short,
      matchday: match.league.round,
      homeTeam: { 
        name: match.teams.home.name, 
        shortName: match.teams.home.name, 
        tla: match.teams.home.name.substring(0, 3).toUpperCase(), 
        crest: match.teams.home.logo 
      },
      awayTeam: { 
        name: match.teams.away.name, 
        shortName: match.teams.away.name, 
        tla: match.teams.away.name.substring(0, 3).toUpperCase(), 
        crest: match.teams.away.logo 
      },
      competition: { 
        name: match.league.name, 
        emblem: match.league.logo 
      },
    }));

  } catch (error) {
    console.error('Error fetching football matches from RapidAPI:', error);
    console.log('Falling back to mock matches due to error.');
    return getMockMatches();
  }
}

function getMockMatches() {
  return [
    {
      id: 1,
      utcDate: new Date().toISOString(),
      status: 'TIMED',
      matchday: 30,
      homeTeam: { name: 'Manchester City', shortName: 'Man City', tla: 'MCI', crest: 'https://crests.football-data.org/65.png' },
      awayTeam: { name: 'Liverpool FC', shortName: 'Liverpool', tla: 'LIV', crest: 'https://crests.football-data.org/64.png' },
      competition: { name: 'Premier League', emblem: 'https://crests.football-data.org/PL.png' },
    },
    {
      id: 2,
      utcDate: addDays(new Date(), 1).toISOString(),
      status: 'TIMED',
      matchday: 28,
      homeTeam: { name: 'Real Madrid CF', shortName: 'Real Madrid', tla: 'RMA', crest: 'https://crests.football-data.org/86.png' },
      awayTeam: { name: 'FC Barcelona', shortName: 'Barcelona', tla: 'BAR', crest: 'https://crests.football-data.org/81.png' },
      competition: { name: 'La Liga', emblem: 'https://crests.football-data.org/PD.png' },
    },
  ];
}

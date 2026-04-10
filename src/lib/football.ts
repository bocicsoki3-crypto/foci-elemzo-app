import axios from 'axios';
import { format, addDays } from 'date-fns';

const API_KEY = process.env.FOOTBALL_API_KEY;
const BASE_URL = 'https://api.football-data.org/v4';

const footballApi = axios.create({
  baseURL: BASE_URL,
  headers: {
    'X-Auth-Token': API_KEY,
  },
});

export async function getMatches() {
  const today = format(new Date(), 'yyyy-MM-dd');
  const tomorrow = format(addDays(new Date(), 1), 'yyyy-MM-dd');

  try {
    const response = await footballApi.get(`/matches`, {
      params: {
        dateFrom: today,
        dateTo: tomorrow,
      },
    });

    return response.data.matches;
  } catch (error) {
    console.error('Error fetching football matches:', error);
    // Return mock data if API key is missing or error occurs
    if (!API_KEY || API_KEY === 'your_football_api_key_here') {
      return getMockMatches();
    }
    throw error;
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

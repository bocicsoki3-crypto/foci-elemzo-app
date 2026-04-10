'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { format, isToday, isTomorrow } from 'date-fns';
import { Calendar, RefreshCw, Trophy, Bot, Info, ShieldCheck, ChevronDown, ChevronUp, ListFilter } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MatchCard from '@/components/MatchCard';
import AnalysisResult from '@/components/AnalysisResult';

export default function Home() {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'today' | 'tomorrow'>('today');
  const [expandedLeagues, setExpandedLeagues] = useState<Set<string>>(new Set());

  const toggleLeague = (leagueName: string) => {
    const newExpanded = new Set(expandedLeagues);
    if (newExpanded.has(leagueName)) {
      newExpanded.delete(leagueName);
    } else {
      newExpanded.add(leagueName);
    }
    setExpandedLeagues(newExpanded);
  };

  const fetchMatches = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.get('/api/matches');
      setMatches(response.data);
    } catch (err) {
      console.error('Error fetching matches:', err);
      setError('Nem sikerült betölteni a mérkőzéseket. Kérlek próbáld újra később!');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMatch = async (match: any) => {
    setSelectedMatch(match);
    setAnalysis(null);
    setAnalysisLoading(true);
    
    try {
      const response = await axios.post('/api/analyze', match);
      setAnalysis(response.data.analysis);
    } catch (err) {
      console.error('Error analyzing match:', err);
      setAnalysis('Hiba történt az elemzés során. Kérlek próbáld újra!');
    } finally {
      setAnalysisLoading(false);
    }
  };

  const handleRefreshAnalysis = () => {
    if (selectedMatch) {
      handleSelectMatch(selectedMatch);
    }
  };

  useEffect(() => {
    fetchMatches();
  }, []);

  const filteredMatches = matches.filter(match => {
    const matchDate = new Date(match.utcDate);
    if (activeTab === 'today') return isToday(matchDate);
    if (activeTab === 'tomorrow') return isTomorrow(matchDate);
    return false;
  });

  const groupedMatches = filteredMatches.reduce((groups, match) => {
    const leagueName = match?.competition?.name || 'Egyéb mérkőzések';
    if (!groups[leagueName]) {
      groups[leagueName] = [];
    }
    groups[leagueName].push(match);
    return groups;
  }, {} as Record<string, any[]>);

  const sortedLeagueNames = Object.keys(groupedMatches).sort((a, b) => a.localeCompare(b));

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-30 w-full border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Trophy className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-900 sm:text-2xl uppercase">Foci<span className="text-blue-600">Elemző</span> AI</h1>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={fetchMatches}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Frissítés
            </button>
            <div className="h-8 w-[1px] bg-slate-200 hidden sm:block"></div>
            <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              Saját használatra
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          
          {/* Left Column: Match List */}
          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-fit">
                  <button
                    onClick={() => setActiveTab('today')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                      activeTab === 'today' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Mai Meccsek
                  </button>
                  <button
                    onClick={() => setActiveTab('tomorrow')}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                      activeTab === 'tomorrow' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    Holnapi Meccsek
                  </button>
                </div>
                <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-500">
                  <ListFilter className="w-4 h-4" />
                  Összesen: {filteredMatches.length}
                </div>
              </div>

              <div className="flex flex-col gap-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-2 custom-scrollbar">
                <AnimatePresence mode="popLayout">
                  {loading ? (
                    [...Array(6)].map((_, i) => (
                      <div key={i} className="h-16 w-full bg-slate-200/50 animate-pulse rounded-xl"></div>
                    ))
                  ) : error ? (
                    <div className="p-8 text-center bg-red-50 text-red-600 rounded-2xl border border-red-100 font-medium">
                      <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      {error}
                    </div>
                  ) : sortedLeagueNames.length === 0 ? (
                    <div className="p-12 text-center bg-white border border-slate-100 rounded-2xl text-slate-400 font-medium">
                      Nincs elérhető mérkőzés ezen a napon.
                    </div>
                  ) : (
                    sortedLeagueNames.map((leagueName) => {
                      const isExpanded = expandedLeagues.has(leagueName);
                      const leagueMatches = groupedMatches[leagueName];
                      const emblem = leagueMatches[0]?.competition?.emblem;

                      return (
                        <div key={leagueName} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-3">
                          <button
                            onClick={() => toggleLeague(leagueName)}
                            className="w-full flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              {emblem && (
                                <img src={emblem} alt={leagueName} className="w-6 h-6 object-contain" />
                              )}
                              <span className="font-bold text-slate-800">{leagueName}</span>
                              <span className="bg-white px-2 py-0.5 rounded-full text-xs font-semibold text-slate-500 border border-slate-200">
                                {leagueMatches.length}
                              </span>
                            </div>
                            {isExpanded ? (
                              <ChevronUp className="w-5 h-5 text-slate-400" />
                            ) : (
                              <ChevronDown className="w-5 h-5 text-slate-400" />
                            )}
                          </button>

                          <AnimatePresence>
                            {isExpanded && (
                              <motion.div
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                className="overflow-hidden"
                              >
                                <div className="p-4 flex flex-col gap-3 border-t border-slate-100 bg-white">
                                  {leagueMatches.map((match) => (
                                    <MatchCard
                                      key={match.id}
                                      match={match}
                                      onSelect={handleSelectMatch}
                                      isSelected={selectedMatch?.id === match.id}
                                    />
                                  ))}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })
                  )}
                </AnimatePresence>
              </div>
            </div>
          </div>

          {/* Right Column: Analysis */}
          <div className="lg:col-span-7">
            <div className="sticky top-24">
              <AnalysisResult
                analysis={analysis}
                loading={analysisLoading}
                onRefresh={handleRefreshAnalysis}
                selectedMatch={selectedMatch}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white py-8">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 text-center text-slate-400 text-sm">
          <p>© 2026 FociElemző AI - Privát verzió</p>
          <p className="mt-1">Készült Gemini-vel és Trae IDE-vel</p>
        </div>
      </footer>

      <style jsx global>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #E2E8F0;
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #CBD5E1;
        }
      `}</style>
    </div>
  );
}

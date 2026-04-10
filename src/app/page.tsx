'use client';

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { RefreshCw, Trophy, Info, ShieldCheck, ChevronDown, ChevronUp, ListFilter, Search, X, History } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MatchCard from '@/components/MatchCard';
import AnalysisResult from '@/components/AnalysisResult';
import type { StructuredAnalysis, RiskProfile } from '@/lib/gemini';

interface SavedAnalysis {
  id: string;
  createdAt: string;
  leagueName: string;
  homeTeam: string;
  awayTeam: string;
  matchId: number | string;
  analysis: string;
  structuredAnalysis?: StructuredAnalysis | null;
  riskProfile?: RiskProfile;
  monteCarlo?: any;
}

const SAVED_ANALYSES_KEY = 'foci_saved_analyses_v1';

function force1X2InAnalysis(
  analysis: string,
  probs?: { home?: number; draw?: number; away?: number }
) {
  if (!analysis || !probs) return analysis;
  const home = Number.isFinite(probs.home) ? Number(probs.home) : null;
  const draw = Number.isFinite(probs.draw) ? Number(probs.draw) : null;
  const away = Number.isFinite(probs.away) ? Number(probs.away) : null;
  if (home === null || draw === null || away === null) return analysis;

  let updated = analysis;
  const homeRegex = /Hazai:\s*\d+(?:[.,]\d+)?%/i;
  const drawRegex = /D[oö]ntetlen:\s*\d+(?:[.,]\d+)?%/i;
  const awayRegex = /Vend[eé]g:\s*\d+(?:[.,]\d+)?%/i;

  if (homeRegex.test(updated)) updated = updated.replace(homeRegex, `Hazai: ${home}%`);
  if (drawRegex.test(updated)) updated = updated.replace(drawRegex, `Döntetlen: ${draw}%`);
  if (awayRegex.test(updated)) updated = updated.replace(awayRegex, `Vendeg: ${away}%`);
  return updated;
}

export default function Home() {
  const [matches, setMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMatch, setSelectedMatch] = useState<any | null>(null);
  const [analysis, setAnalysis] = useState<string | null>(null);
  const [structuredAnalysis, setStructuredAnalysis] = useState<StructuredAnalysis | null>(null);
  const [monteCarlo, setMonteCarlo] = useState<any | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [riskProfile, setRiskProfile] = useState<RiskProfile>('kiegyensulyozott');
  const [bankroll, setBankroll] = useState<number>(100);
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLeagues, setExpandedLeagues] = useState<Set<string>>(new Set());
  const [savedAnalyses, setSavedAnalyses] = useState<SavedAnalysis[]>([]);
  const [isAnalysisModalOpen, setIsAnalysisModalOpen] = useState(false);
  const [activeModalAnalysis, setActiveModalAnalysis] = useState<SavedAnalysis | null>(null);

  const isSavableAnalysis = (value: string) =>
    !value.includes('Hiba történt') &&
    !value.includes('Kérlek add meg a Gemini API kulcsodat') &&
    !value.includes('A Gemini szolgáltatás most nem elérhető');

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
    let didTimeout = false;
    const loadingFailSafe = setTimeout(() => {
      didTimeout = true;
      setLoading(false);
      setError('A meccsek betöltése túl sokáig tartott. Kérlek próbáld újra a Frissítés gombbal!');
    }, 17000);

    try {
      const response = await axios.get('/api/matches', { timeout: 15000 });
      if (didTimeout) return;
      if (Array.isArray(response.data)) {
        setMatches(response.data);
      } else {
        setError('Hibás válasz érkezett a szervertől. Próbáld újra később!');
      }
    } catch (err) {
      if (didTimeout) return;
      console.error('Error fetching matches:', err);
      setError('Nem sikerült betölteni a mérkőzéseket. Kérlek próbáld újra később!');
    } finally {
      clearTimeout(loadingFailSafe);
      if (!didTimeout) {
        setLoading(false);
      }
    }
  };

  const handleSelectMatch = async (match: any) => {
    setSelectedMatch(match);
    setAnalysis(null);
    setStructuredAnalysis(null);
    setMonteCarlo(null);
    setAnalysisLoading(true);
    
    try {
      const response = await axios.post('/api/analyze', {
        matchDetails: match,
        options: { riskProfile, bankroll },
      });
      const fixedAnalysis = force1X2InAnalysis(response.data.analysis, response.data.probabilities);
      setAnalysis(fixedAnalysis);
      setStructuredAnalysis(response.data.structuredAnalysis || null);
      setMonteCarlo(response.data.monteCarlo || null);
    } catch (err) {
      console.error('Error analyzing match:', err);
      if (axios.isAxiosError(err)) {
        const apiError = typeof err.response?.data?.error === 'string' ? err.response.data.error : null;
        setAnalysis(apiError || 'Hiba történt az elemzés során. Kérlek próbáld újra!');
      } else {
        setAnalysis('Hiba történt az elemzés során. Kérlek próbáld újra!');
      }
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

  // Safety net: if data is already present, never keep skeleton stuck.
  useEffect(() => {
    if (loading && matches.length > 0) {
      setLoading(false);
    }
  }, [loading, matches]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(SAVED_ANALYSES_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setSavedAnalyses(parsed);
      }
    } catch (err) {
      console.error('Failed to load saved analyses:', err);
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SAVED_ANALYSES_KEY, JSON.stringify(savedAnalyses));
    } catch (err) {
      console.error('Failed to persist saved analyses:', err);
    }
  }, [savedAnalyses]);

  useEffect(() => {
    if (!analysis || !selectedMatch || !isSavableAnalysis(analysis)) return;

    const newEntry: SavedAnalysis = {
      id: `${selectedMatch.id}-${Date.now()}`,
      createdAt: new Date().toISOString(),
      leagueName: selectedMatch?.competition?.name || 'Ismeretlen liga',
      homeTeam: selectedMatch?.homeTeam?.name || 'Hazai',
      awayTeam: selectedMatch?.awayTeam?.name || 'Vendég',
      matchId: selectedMatch?.id || 'unknown',
      analysis,
      structuredAnalysis,
      riskProfile,
      monteCarlo,
    };

    setSavedAnalyses((prev) => {
      const withoutSameMatch = prev.filter((item) => item.matchId !== newEntry.matchId);
      return [newEntry, ...withoutSameMatch].slice(0, 40);
    });
  }, [analysis, structuredAnalysis, selectedMatch, riskProfile, monteCarlo]);

  const openLiveAnalysisModal = () => {
    if (!analysis || !selectedMatch || !isSavableAnalysis(analysis)) return;
    setActiveModalAnalysis({
      id: `live-${selectedMatch.id}`,
      createdAt: new Date().toISOString(),
      leagueName: selectedMatch?.competition?.name || 'Ismeretlen liga',
      homeTeam: selectedMatch?.homeTeam?.name || 'Hazai',
      awayTeam: selectedMatch?.awayTeam?.name || 'Vendég',
      matchId: selectedMatch?.id || 'unknown',
      analysis,
      structuredAnalysis,
      riskProfile,
      monteCarlo,
    });
    setIsAnalysisModalOpen(true);
  };

  const openArchiveModal = () => {
    setActiveModalAnalysis(savedAnalyses[0] || null);
    setIsAnalysisModalOpen(true);
  };

  const normalizedQuery = searchQuery.trim().toLocaleLowerCase('hu');
  const filteredMatches = matches.filter((match) => {
    if (!normalizedQuery) return true;
    const homeName = (match?.homeTeam?.shortName || match?.homeTeam?.name || '').toLocaleLowerCase('hu');
    const awayName = (match?.awayTeam?.shortName || match?.awayTeam?.name || '').toLocaleLowerCase('hu');
    return homeName.includes(normalizedQuery) || awayName.includes(normalizedQuery);
  });

  const groupedMatches = filteredMatches.reduce((groups, match) => {
    const leagueName = match?.competition?.name || 'Egyéb mérkőzések';
    if (!groups[leagueName]) {
      groups[leagueName] = [];
    }
    groups[leagueName].push(match);
    return groups;
  }, {} as Record<string, any[]>);

  const getMatchLabel = (match: any) => {
    const home = match?.homeTeam?.shortName || match?.homeTeam?.name || '';
    const away = match?.awayTeam?.shortName || match?.awayTeam?.name || '';
    return `${home} - ${away}`;
  };

  const sortedLeagueEntries = Object.entries(groupedMatches)
    .sort(([leagueA], [leagueB]) => leagueA.localeCompare(leagueB, 'hu', { sensitivity: 'base' }))
    .map(([leagueName, leagueMatches]) => [
      leagueName,
      [...leagueMatches].sort((matchA, matchB) =>
        getMatchLabel(matchA).localeCompare(getMatchLabel(matchB), 'hu', { sensitivity: 'base' })
      ),
    ] as [string, any[]]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 font-sans">
      {/* Header */}
      <header className="sticky top-0 z-30 w-full border-b border-slate-700 bg-slate-900/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-200">
              <Trophy className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-100 sm:text-2xl uppercase">Foci<span className="text-blue-400">Elemző</span> AI</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800/70 px-2 py-1">
              <select
                value={riskProfile}
                onChange={(e) => setRiskProfile(e.target.value as RiskProfile)}
                className="bg-transparent text-xs font-semibold text-slate-200 outline-none"
                title="Kockázati profil"
              >
                <option value="konzervativ">Konzervatív</option>
                <option value="kiegyensulyozott">Kiegyensúlyozott</option>
                <option value="agressziv">Agresszív</option>
              </select>
              <input
                type="number"
                min={10}
                step={10}
                value={bankroll}
                onChange={(e) => setBankroll(Math.max(10, Number(e.target.value) || 100))}
                className="w-20 rounded-md border border-slate-700 bg-slate-900 px-2 py-1 text-xs font-semibold text-slate-200"
                title="Bankroll"
              />
            </div>
            <button
              onClick={fetchMatches}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold text-slate-200 hover:text-blue-300 hover:bg-slate-800 rounded-lg transition-all"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Frissítés
            </button>
            <div className="h-8 w-[1px] bg-slate-700 hidden sm:block"></div>
            <div className="hidden sm:flex items-center gap-2 text-xs font-medium text-slate-300">
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
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 bg-slate-800/70 px-3 py-2 rounded-xl border border-slate-700 shadow-sm flex-1">
                  <Search className="w-4 h-4 text-slate-400" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Keresés csapatnévre (pl. Barcelona)"
                    className="w-full bg-transparent text-sm font-medium text-slate-100 placeholder:text-slate-400 outline-none"
                  />
                </div>
                <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-slate-800/70 border border-slate-700 rounded-xl text-xs font-medium text-slate-300">
                  <ListFilter className="w-4 h-4" />
                  Összesen: {filteredMatches.length}
                </div>
              </div>

              <div className="flex flex-col gap-3 max-h-[calc(100vh-280px)] overflow-y-auto pr-2 custom-scrollbar">
                <AnimatePresence mode="popLayout">
                  {loading && matches.length === 0 ? (
                    [...Array(6)].map((_, i) => (
                      <div key={i} className="h-16 w-full bg-slate-200/50 animate-pulse rounded-xl"></div>
                    ))
                  ) : error ? (
                    <div className="p-8 text-center bg-red-50 text-red-600 rounded-2xl border border-red-100 font-medium">
                      <Info className="w-8 h-8 mx-auto mb-2 opacity-50" />
                      {error}
                    </div>
                  ) : sortedLeagueEntries.length === 0 ? (
                    <div className="p-12 text-center bg-white border border-slate-100 rounded-2xl text-slate-400 font-medium">
                      Nincs találat erre a csapatnévre.
                    </div>
                  ) : (
                    sortedLeagueEntries.map(([leagueName, leagueMatches]) => {
                      const isExpanded = expandedLeagues.has(leagueName);
                      const emblem = leagueMatches[0]?.competition?.emblem;

                      return (
                        <div key={leagueName} className="bg-slate-900/70 rounded-xl border border-slate-700 shadow-sm overflow-hidden mb-3">
                          <button
                            onClick={() => toggleLeague(leagueName)}
                            className="w-full flex items-center justify-between p-4 bg-slate-800/60 hover:bg-slate-800 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              {emblem && (
                                <img src={emblem} alt={leagueName} className="w-6 h-6 object-contain" />
                              )}
                              <span className="font-bold text-slate-100">{leagueName}</span>
                              <span className="bg-slate-900 px-2 py-0.5 rounded-full text-xs font-semibold text-slate-300 border border-slate-700">
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
                                <div className="p-4 flex flex-col gap-3 border-t border-slate-700 bg-slate-900/60">
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
                structuredAnalysis={structuredAnalysis}
                monteCarlo={monteCarlo}
                loading={analysisLoading}
                onRefresh={handleRefreshAnalysis}
                selectedMatch={selectedMatch}
                onOpenModal={openLiveAnalysisModal}
                onOpenArchive={openArchiveModal}
              />
            </div>
          </div>
        </div>
      </main>

      <AnimatePresence>
        {isAnalysisModalOpen && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.96, opacity: 0 }}
              className="w-full max-w-6xl max-h-[92vh] overflow-hidden rounded-2xl border border-slate-700 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950 text-slate-100 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-700 px-6 py-4">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-400">Mentett elemzések</p>
                  <h3 className="text-lg font-bold text-white">
                    {activeModalAnalysis
                      ? `${activeModalAnalysis.homeTeam} vs ${activeModalAnalysis.awayTeam}`
                      : 'Nincs kiválasztott elemzés'}
                  </h3>
                </div>
                <button
                  onClick={() => setIsAnalysisModalOpen(false)}
                  className="rounded-lg p-2 text-slate-300 hover:bg-slate-800 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 h-[calc(92vh-76px)]">
                <div className="lg:col-span-8 overflow-y-auto p-6 custom-scrollbar">
                  {activeModalAnalysis ? (
                    <div className="space-y-4">
                      <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/10 p-4">
                        <p className="text-xs text-indigo-300">{activeModalAnalysis.leagueName}</p>
                        <p className="text-sm text-slate-300">
                          Mentve: {new Date(activeModalAnalysis.createdAt).toLocaleString('hu-HU')}
                        </p>
                      </div>
                      {activeModalAnalysis.analysis.split('\n').map((line, idx) => {
                        const cleanLine = line.trim();
                        if (!cleanLine) return null;
                        if (cleanLine.startsWith('## ')) {
                          return (
                            <h4 key={idx} className="mt-6 mb-2 inline-flex rounded-full bg-cyan-500/20 px-3 py-1 text-sm font-semibold text-cyan-200">
                              {cleanLine.replace('## ', '')}
                            </h4>
                          );
                        }
                        if (cleanLine.startsWith('- ') || cleanLine.startsWith('* ')) {
                          return (
                            <div key={idx} className="flex gap-2 text-sm text-slate-200">
                              <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-cyan-400" />
                              <p>{cleanLine.replace(/^[-*]\s*/, '')}</p>
                            </div>
                          );
                        }
                        return <p key={idx} className="text-sm text-slate-200 leading-relaxed">{cleanLine}</p>;
                      })}
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-center text-slate-400">
                      Válassz egy mentett elemzést a jobb oldali listából.
                    </div>
                  )}
                </div>

                <div className="lg:col-span-4 border-l border-slate-700 bg-slate-950/60 overflow-y-auto custom-scrollbar">
                  <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
                    <History className="w-4 h-4 text-slate-300" />
                    <span className="text-sm font-semibold text-slate-200">Elemzés előzmények</span>
                  </div>
                  <div className="p-3 space-y-2">
                    {savedAnalyses.length === 0 ? (
                      <div className="rounded-lg border border-slate-700 p-3 text-xs text-slate-400">
                        Még nincs mentett elemzés.
                      </div>
                    ) : (
                      savedAnalyses.map((item) => (
                        <button
                          key={item.id}
                          onClick={() => setActiveModalAnalysis(item)}
                          className={`w-full rounded-lg border p-3 text-left transition ${
                            activeModalAnalysis?.id === item.id
                              ? 'border-cyan-500 bg-cyan-500/10'
                              : 'border-slate-700 hover:border-slate-500 hover:bg-slate-800/40'
                          }`}
                        >
                          <p className="text-sm font-semibold text-slate-100">{item.homeTeam} vs {item.awayTeam}</p>
                          <p className="text-xs text-slate-400">{item.leagueName}</p>
                          <p className="text-[11px] text-slate-500 mt-1">
                            {new Date(item.createdAt).toLocaleString('hu-HU')}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-700 bg-slate-900/70 py-8">
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

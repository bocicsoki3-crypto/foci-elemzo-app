'use client';

import React from 'react';
import { Bot, Sparkles, Loader2, RefreshCw, Expand, History, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StructuredAnalysis } from '@/lib/gemini';

interface AnalysisResultProps {
  analysis: string | null;
  structuredAnalysis: StructuredAnalysis | null;
  monteCarlo: any | null;
  loading: boolean;
  onRefresh: () => void;
  selectedMatch: any | null;
  onOpenModal: () => void;
  onOpenArchive: () => void;
}

function hasNum(v: number | null | undefined) {
  return Number.isFinite(v as number);
}

function val(v: number | null | undefined, d = 1) {
  if (!hasNum(v)) return null;
  return Number(v).toFixed(d);
}

function buildValueBets(structuredAnalysis: StructuredAnalysis, monteCarlo: any | null) {
  const values: Array<{ market: string; selection: string; prob: number }> = [];
  if (monteCarlo) {
    values.push(
      { market: '1X2', selection: 'Hazai', prob: Number(monteCarlo.homeWinPct) || 0 },
      { market: '1X2', selection: 'Döntetlen', prob: Number(monteCarlo.drawPct) || 0 },
      { market: '1X2', selection: 'Vendég', prob: Number(monteCarlo.awayWinPct) || 0 },
      { market: 'BTTS', selection: 'Igen', prob: Number(monteCarlo.bttsYesPct) || 0 },
      { market: 'BTTS', selection: 'Nem', prob: 100 - (Number(monteCarlo.bttsYesPct) || 0) },
      { market: 'O/U 2.5', selection: 'Over 2.5', prob: Number(monteCarlo.over25Pct) || 0 },
      { market: 'O/U 2.5', selection: 'Under 2.5', prob: 100 - (Number(monteCarlo.over25Pct) || 0) },
      { market: 'O/U 3.5', selection: 'Over 3.5', prob: Number(monteCarlo.over35Pct) || 0 },
      { market: 'O/U 3.5', selection: 'Under 3.5', prob: 100 - (Number(monteCarlo.over35Pct) || 0) },
    );
  }
  return values
    .filter((item) => item.prob >= 52)
    .sort((a, b) => b.prob - a.prob)
    .slice(0, 3)
    .map((item, idx) => ({ ...item, stakePct: Math.max(1, 4 - idx) }));
}

function MetricCard({ title, value, subtitle }: { title: string; value: string; subtitle?: string }) {
  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-900/75 p-4 shadow-[0_8px_24px_rgba(2,6,23,0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/70 hover:shadow-[0_14px_30px_rgba(34,211,238,0.2)]">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{title}</p>
      <p className="mt-1 text-3xl font-black text-white">{value}</p>
      {subtitle ? <p className="mt-1 text-xs text-slate-400">{subtitle}</p> : null}
    </div>
  );
}

function BarRow({ label, value }: { label: string; value: number }) {
  const width = Math.max(0, Math.min(100, value));
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-semibold text-slate-600">
        <span>{label}</span>
        <span>{value.toFixed(1)}%</span>
      </div>
      <div className="h-2 rounded-full bg-slate-700/70 overflow-hidden">
        <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" style={{ width: `${width}%` }} />
      </div>
    </div>
  );
}

export default function AnalysisResult({
  analysis,
  structuredAnalysis,
  monteCarlo,
  loading,
  onRefresh,
  selectedMatch,
  onOpenModal,
  onOpenArchive,
}: AnalysisResultProps) {
  const exportAnalysis = () => {
    if (!analysis) return;
    const payload = {
      match: selectedMatch ? `${selectedMatch.homeTeam.name} vs ${selectedMatch.awayTeam.name}` : 'unknown',
      generatedAt: new Date().toISOString(),
      structuredAnalysis,
      markdown: analysis,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analysis-${selectedMatch?.id || 'match'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!selectedMatch) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-slate-900/75 rounded-3xl border border-slate-700 text-center shadow-[0_12px_40px_rgba(2,6,23,0.45)]">
        <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mb-4">
          <Bot className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-white mb-2">Válassz egy mérkőzést</h3>
        <p className="text-slate-300 max-w-md">Válaszd ki a listából azt a mérkőzést, amit a Gemini AI-val szeretnél kielemeztetni.</p>
        <button
          onClick={onOpenArchive}
          className="mt-5 inline-flex items-center gap-2 rounded-xl border border-slate-600 bg-slate-800/80 px-4 py-2 text-sm font-semibold text-slate-100 hover:border-cyan-400/70 hover:text-cyan-300 hover:bg-slate-800 transition-all"
        >
          <History className="w-4 h-4" />
          Elemzés előzmények megnyitása
        </button>
      </div>
    );
  }

  const card = 'rounded-2xl border border-slate-700 bg-slate-900/78 p-4 shadow-[0_8px_24px_rgba(2,6,23,0.45)] transition-all duration-200 hover:-translate-y-0.5 hover:border-cyan-400/70 hover:shadow-[0_14px_30px_rgba(34,211,238,0.2)]';

  return (
    <div className="bg-gradient-to-b from-slate-900 via-slate-900 to-indigo-950 rounded-3xl border border-slate-700 shadow-[0_22px_55px_rgba(2,6,23,0.6)] overflow-hidden flex flex-col min-h-[500px]">
      <div className="p-6 border-b border-slate-700 bg-gradient-to-r from-slate-900 via-slate-900 to-indigo-900/50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white leading-tight">Gemini AI Elemzés</h2>
            <p className="text-xs text-cyan-300 font-medium">{selectedMatch.homeTeam.name} vs {selectedMatch.awayTeam.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={onOpenArchive} className="p-2 text-slate-300 hover:text-cyan-300 hover:bg-slate-800 rounded-lg transition-all" title="Mentett elemzések"><History className="w-5 h-5" /></button>
          <button onClick={exportAnalysis} disabled={!analysis} className="p-2 text-slate-300 hover:text-cyan-300 hover:bg-slate-800 rounded-lg transition-all disabled:opacity-40" title="Elemzés export"><Download className="w-5 h-5" /></button>
          <button onClick={onOpenModal} disabled={!analysis} className="p-2 text-slate-300 hover:text-cyan-300 hover:bg-slate-800 rounded-lg transition-all disabled:opacity-40" title="Elemzés megnyitása"><Expand className="w-5 h-5" /></button>
          <button onClick={onRefresh} disabled={loading} className="p-2 text-slate-300 hover:text-cyan-300 hover:bg-slate-800 rounded-lg transition-all disabled:opacity-50" title="Elemzés frissítése"><RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center justify-center py-20 text-center">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
              <p className="text-slate-200 font-medium">Gemini éppen elemzi a mérkőzést...</p>
            </motion.div>
          ) : structuredAnalysis ? (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
              {(() => {
                const valueBets = buildValueBets(structuredAnalysis, monteCarlo);
                const topProb = valueBets[0]?.prob || 0;
                const betAllowed = topProb >= 58 && structuredAnalysis.dataQuality.confidenceLabel !== 'alacsony';
                return (
                  <div className={card}>
                    <p className="text-xs uppercase tracking-wide text-slate-400">{betAllowed ? 'Bet Signal' : 'No Bet Signal'}</p>
                    <p className="text-lg font-bold text-white">{betAllowed ? 'Statisztikai előny látszik.' : 'Nincs elég edge, passz.'}</p>
                    {valueBets.length > 0 && (
                      <div className="mt-3 grid gap-2">
                        {valueBets.map((bet, idx) => (
                          <div key={`${bet.market}-${bet.selection}`} className="rounded-lg border border-slate-700 bg-slate-950/60 px-3 py-2 text-xs text-slate-200">
                            #{idx + 1} {bet.market} - {bet.selection} | {bet.prob.toFixed(1)}% | tét: {bet.stakePct}% bankroll
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })()}

              {monteCarlo && (
                <div className={card}>
                  <p className="text-sm font-semibold text-white mb-3">Monte Carlo ({monteCarlo.iterations} futás)</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <BarRow label="Hazai győzelem" value={Number(monteCarlo.homeWinPct) || 0} />
                    <BarRow label="Döntetlen" value={Number(monteCarlo.drawPct) || 0} />
                    <BarRow label="Vendég győzelem" value={Number(monteCarlo.awayWinPct) || 0} />
                    <BarRow label="BTTS igen" value={Number(monteCarlo.bttsYesPct) || 0} />
                    <BarRow label="Over 2.5" value={Number(monteCarlo.over25Pct) || 0} />
                    <BarRow label="Over 3.5" value={Number(monteCarlo.over35Pct) || 0} />
                  </div>
                  <p className="mt-3 text-xs text-slate-300">
                    xG becslés: {monteCarlo.expectedHomeGoals} - {monteCarlo.expectedAwayGoals} | Legvalószínűbb: {monteCarlo.mostLikelyScore}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <MetricCard title="Hazai %" value={`${structuredAnalysis.probabilities.home}`} />
                <MetricCard title="Döntetlen %" value={`${structuredAnalysis.probabilities.draw}`} />
                <MetricCard title="Vendég %" value={`${structuredAnalysis.probabilities.away}`} />
                <MetricCard title="Bizalom" value={`${structuredAnalysis.correctScore.confidence}/10`} />
              </div>

              {(hasNum(structuredAnalysis.keyMetrics.xg.home) || hasNum(structuredAnalysis.keyMetrics.xg.away) || hasNum(structuredAnalysis.keyMetrics.xg.xgaHome) || hasNum(structuredAnalysis.keyMetrics.xg.xgaAway)) && (
                <div className={card}>
                  <p className="text-sm font-semibold text-white mb-2">xG / xGA</p>
                  <div className="grid grid-cols-3 gap-1 text-xs text-slate-300">
                    <p></p><p>Hazai</p><p>Vendég</p>
                    <p>xG</p><p>{val(structuredAnalysis.keyMetrics.xg.home, 2) ?? '-'}</p><p>{val(structuredAnalysis.keyMetrics.xg.away, 2) ?? '-'}</p>
                    <p>xGA</p><p>{val(structuredAnalysis.keyMetrics.xg.xgaHome, 2) ?? '-'}</p><p>{val(structuredAnalysis.keyMetrics.xg.xgaAway, 2) ?? '-'}</p>
                  </div>
                </div>
              )}

              {(hasNum(structuredAnalysis.keyMetrics.ppg.home) || hasNum(structuredAnalysis.keyMetrics.ppg.away)) && (
                <div className={card}>
                  <p className="text-sm font-semibold text-white mb-2">PPG / Gólátlag</p>
                  <div className="grid grid-cols-3 gap-1 text-xs text-slate-300">
                    <p></p><p>Hazai</p><p>Vendég</p>
                    <p>PPG</p><p>{val(structuredAnalysis.keyMetrics.ppg.home, 2) ?? '-'}</p><p>{val(structuredAnalysis.keyMetrics.ppg.away, 2) ?? '-'}</p>
                    <p>GF/meccs</p><p>{val(structuredAnalysis.keyMetrics.goalsPerMatch.homeFor, 2) ?? '-'}</p><p>{val(structuredAnalysis.keyMetrics.goalsPerMatch.awayFor, 2) ?? '-'}</p>
                    <p>GA/meccs</p><p>{val(structuredAnalysis.keyMetrics.goalsPerMatch.homeAgainst, 2) ?? '-'}</p><p>{val(structuredAnalysis.keyMetrics.goalsPerMatch.awayAgainst, 2) ?? '-'}</p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {!!structuredAnalysis.goalMarkets.btts.pick && <div className={card}><p className="text-[11px] text-slate-400">BTTS</p><p className="text-lg font-bold text-white">{structuredAnalysis.goalMarkets.btts.pick}</p></div>}
                {!!structuredAnalysis.goalMarkets.overUnder25.pick && <div className={card}><p className="text-[11px] text-slate-400">Over/Under 2.5</p><p className="text-lg font-bold text-white">{structuredAnalysis.goalMarkets.overUnder25.pick}</p></div>}
                {!!structuredAnalysis.goalMarkets.overUnder35.pick && <div className={card}><p className="text-[11px] text-slate-400">Over/Under 3.5</p><p className="text-lg font-bold text-white">{structuredAnalysis.goalMarkets.overUnder35.pick}</p></div>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {!!structuredAnalysis.goalMarkets.firstHalf.pick && <div className={card}><p className="text-[11px] text-slate-400">Félidő tipp</p><p className="text-lg font-bold text-white">{structuredAnalysis.goalMarkets.firstHalf.pick}</p></div>}
                {!!structuredAnalysis.goalMarkets.corners.pick && <div className={card}><p className="text-[11px] text-slate-400">Szöglet tipp (O/U {structuredAnalysis.goalMarkets.corners.line})</p><p className="text-lg font-bold text-white">{structuredAnalysis.goalMarkets.corners.pick}</p></div>}
                {!!structuredAnalysis.goalMarkets.cards.pick && <div className={card}><p className="text-[11px] text-slate-400">Lap tipp (O/U {structuredAnalysis.goalMarkets.cards.line})</p><p className="text-lg font-bold text-white">{structuredAnalysis.goalMarkets.cards.pick}</p></div>}
                {!!structuredAnalysis.correctScore.prediction && <div className={card}><p className="text-[11px] text-slate-400">Pontos eredmény</p><p className="text-lg font-bold text-white">{structuredAnalysis.correctScore.prediction}</p></div>}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {!!structuredAnalysis.tipsByRisk.konzervativ.tip && <div className={card}><p className="text-[11px] text-slate-400">Konzervatív tipp</p><p className="text-base font-semibold text-white">{structuredAnalysis.tipsByRisk.konzervativ.tip}</p></div>}
                {!!structuredAnalysis.tipsByRisk.kiegyensulyozott.tip && <div className={card}><p className="text-[11px] text-slate-400">Kiegyensúlyozott tipp</p><p className="text-base font-semibold text-white">{structuredAnalysis.tipsByRisk.kiegyensulyozott.tip}</p></div>}
                {!!structuredAnalysis.tipsByRisk.agressziv.tip && <div className={card}><p className="text-[11px] text-slate-400">Agresszív tipp</p><p className="text-base font-semibold text-white">{structuredAnalysis.tipsByRisk.agressziv.tip}</p></div>}
              </div>

              {!!structuredAnalysis.committee && (
                <div className={card}>
                  <p className="text-sm font-semibold text-white mb-3">AI Bizottság (6 tag)</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                    <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                      <p className="text-slate-300 font-semibold">1) Adatgyűjtő</p>
                      {(structuredAnalysis.committee.statistician.findings || []).slice(0, 3).map((item, idx) => (
                        <p key={`st-${idx}`} className="text-slate-300 mt-1">- {item}</p>
                      ))}
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                      <p className="text-slate-300 font-semibold">2) Taktikai elemző</p>
                      {(structuredAnalysis.committee.tacticalCoach.findings || []).slice(0, 3).map((item, idx) => (
                        <p key={`ta-${idx}`} className="text-slate-300 mt-1">- {item}</p>
                      ))}
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                      <p className="text-slate-300 font-semibold">3) Hírszerző</p>
                      {(structuredAnalysis.committee.newsroomScout.findings || []).slice(0, 3).map((item, idx) => (
                        <p key={`nw-${idx}`} className="text-slate-300 mt-1">- {item}</p>
                      ))}
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                      <p className="text-slate-300 font-semibold">4) Ördög ügyvédje</p>
                      {(structuredAnalysis.committee.devilsAdvocate.findings || []).slice(0, 3).map((item, idx) => (
                        <p key={`dv-${idx}`} className="text-slate-300 mt-1">- {item}</p>
                      ))}
                    </div>
                    <div className="rounded-lg border border-slate-700 bg-slate-950/60 p-3">
                      <p className="text-slate-300 font-semibold">5) Matekos</p>
                      {(structuredAnalysis.committee.oddsQuant.findings || []).slice(0, 3).map((item, idx) => (
                        <p key={`oq-${idx}`} className="text-slate-300 mt-1">- {item}</p>
                      ))}
                      {(structuredAnalysis.committee.oddsQuant.valueAngles || []).slice(0, 2).map((item, idx) => (
                        <p key={`va-${idx}`} className="text-cyan-300 mt-1">- Value: {item}</p>
                      ))}
                    </div>
                    <div className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 p-3">
                      <p className="text-cyan-200 font-semibold">6) Elnök</p>
                      <p className="text-white mt-1">{structuredAnalysis.committee.chairman.finalVerdict}</p>
                      {(structuredAnalysis.committee.chairman.rationale || []).slice(0, 3).map((item, idx) => (
                        <p key={`ch-${idx}`} className="text-slate-200 mt-1">- {item}</p>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {(structuredAnalysis.keyMetrics.availability.homeMissing > 0 || structuredAnalysis.keyMetrics.availability.awayMissing > 0 || structuredAnalysis.keyMetrics.formations.home || structuredAnalysis.keyMetrics.formations.away) && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {structuredAnalysis.keyMetrics.availability.homeMissing > 0 && <div className={card}><p className="text-[11px] text-slate-400">Hiányzók (H)</p><p className="text-xl font-black text-white">{structuredAnalysis.keyMetrics.availability.homeMissing}</p></div>}
                  {structuredAnalysis.keyMetrics.availability.awayMissing > 0 && <div className={card}><p className="text-[11px] text-slate-400">Hiányzók (V)</p><p className="text-xl font-black text-white">{structuredAnalysis.keyMetrics.availability.awayMissing}</p></div>}
                  {!!structuredAnalysis.keyMetrics.formations.home && <div className={card}><p className="text-[11px] text-slate-400">Felállás (H)</p><p className="text-base font-semibold text-white">{structuredAnalysis.keyMetrics.formations.home}</p></div>}
                  {!!structuredAnalysis.keyMetrics.formations.away && <div className={card}><p className="text-[11px] text-slate-400">Felállás (V)</p><p className="text-base font-semibold text-white">{structuredAnalysis.keyMetrics.formations.away}</p></div>}
                </div>
              )}

              <div className={card}>
                <p className="text-xs font-semibold text-slate-300 mb-2">Adatforrás állapot</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                  {Object.entries({
                    prediction: structuredAnalysis.dataQuality.sourceCoverage.includes('prediction'),
                    h2h: structuredAnalysis.dataQuality.sourceCoverage.includes('h2h'),
                    injuries: structuredAnalysis.dataQuality.sourceCoverage.includes('injuries'),
                    lineups: structuredAnalysis.dataQuality.sourceCoverage.includes('lineups'),
                    xg: structuredAnalysis.dataQuality.sourceCoverage.some((x) => x.toLowerCase().includes('xg')),
                    teamStats: structuredAnalysis.dataQuality.sourceCoverage.includes('teamStats'),
                    news: structuredAnalysis.dataQuality.sourceCoverage.includes('news'),
                  }).map(([k, ok]) => (
                    <div key={k} className={`rounded-md border px-2 py-1 ${ok ? 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-900/70 text-slate-500'}`}>
                      {k}: {ok ? 'ok' : 'nincs'}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          ) : (
            <div className="text-center py-20 text-slate-400 italic">Nincs elérhető elemzés. Kattints a frissítésre!</div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-4 bg-slate-900 text-[10px] text-slate-500 text-center border-t border-slate-700">
        Az elemzés mesterséges intelligencia segítségével készült. Kérjük, felelősségteljesen fogadj!
      </div>
    </div>
  );
}

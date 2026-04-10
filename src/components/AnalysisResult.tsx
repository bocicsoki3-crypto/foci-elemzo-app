'use client';

import React from 'react';
import { Bot, Sparkles, Loader2, RefreshCw, Expand, History, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { StructuredAnalysis } from '@/lib/gemini';

interface AnalysisResultProps {
  analysis: string | null;
  structuredAnalysis: StructuredAnalysis | null;
  loading: boolean;
  onRefresh: () => void;
  selectedMatch: any | null;
  onOpenModal: () => void;
  onOpenArchive: () => void;
}

function parseSections(analysis: string) {
  const lines = analysis.split('\n');
  const sections: Array<{ title: string; lines: string[] }> = [];
  let current = { title: 'Elemzés', lines: [] as string[] };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith('## ')) {
      sections.push(current);
      current = { title: line.replace(/^##\s*/, ''), lines: [] };
      continue;
    }
    current.lines.push(rawLine);
  }
  sections.push(current);
  return sections.filter((section) => section.lines.join('').trim() || section.title !== 'Elemzés');
}

function v(value: number | null | undefined, suffix = '') {
  if (value === null || value === undefined || Number.isNaN(value)) return '-';
  return `${value}${suffix}`;
}

export default function AnalysisResult({
  analysis,
  structuredAnalysis,
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
      <div className="flex flex-col items-center justify-center p-12 bg-slate-900/70 rounded-2xl border-2 border-dashed border-slate-700 text-center">
        <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
          <Bot className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-slate-100 mb-2">Válassz egy mérkőzést</h3>
        <p className="text-slate-400 max-w-md">Válaszd ki a listából azt a mérkőzést, amit a Gemini AI-val szeretnél kielemeztetni.</p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/70 rounded-2xl border border-slate-700 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
      <div className="p-6 border-b border-slate-700 bg-gradient-to-r from-slate-800 to-indigo-900/40 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-100 leading-tight">Gemini AI Elemzés</h2>
            <p className="text-xs text-blue-300 font-medium">{selectedMatch.homeTeam.name} vs {selectedMatch.awayTeam.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenArchive}
            className="p-2 text-slate-300 hover:text-blue-300 hover:bg-slate-800 rounded-lg transition-all"
            title="Mentett elemzések"
          >
            <History className="w-5 h-5" />
          </button>
          <button
            onClick={exportAnalysis}
            disabled={!analysis}
            className="p-2 text-slate-300 hover:text-blue-300 hover:bg-slate-800 rounded-lg transition-all disabled:opacity-40"
            title="Elemzés export"
          >
            <Download className="w-5 h-5" />
          </button>
          <button
            onClick={onOpenModal}
            disabled={!analysis}
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-white rounded-lg transition-all disabled:opacity-40"
            title="Elemzés megnyitása"
          >
            <Expand className="w-5 h-5" />
          </button>
          <button
            onClick={onRefresh}
            disabled={loading}
            className="p-2 text-slate-300 hover:text-blue-300 hover:bg-slate-800 rounded-lg transition-all disabled:opacity-50"
            title="Elemzés frissítése"
          >
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="p-6 flex-1 overflow-y-auto">
        <AnimatePresence mode="wait">
          {loading ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex flex-col items-center justify-center py-20 text-center"
            >
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin mb-4" />
              <p className="text-slate-200 font-medium">Gemini éppen elemzi a mérkőzést...</p>
              <p className="text-xs text-slate-400 mt-2">Ez eltarthat pár másodpercig</p>
            </motion.div>
          ) : analysis ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {structuredAnalysis && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                      <p className="text-[11px] font-semibold text-emerald-700">Hazai %</p>
                      <p className="text-xl font-black text-emerald-800">{structuredAnalysis.probabilities.home}</p>
                    </div>
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                      <p className="text-[11px] font-semibold text-amber-700">Döntetlen %</p>
                      <p className="text-xl font-black text-amber-800">{structuredAnalysis.probabilities.draw}</p>
                    </div>
                    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3">
                      <p className="text-[11px] font-semibold text-blue-700">Vendég %</p>
                      <p className="text-xl font-black text-blue-800">{structuredAnalysis.probabilities.away}</p>
                    </div>
                    <div className="rounded-xl border border-violet-200 bg-violet-50 p-3">
                      <p className="text-[11px] font-semibold text-violet-700">Bizalom</p>
                      <p className="text-xl font-black text-violet-800">{structuredAnalysis.correctScore.confidence}/10</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-3">
                      <p className="text-xs font-semibold text-slate-300 mb-2">xG / xGA</p>
                      <div className="grid grid-cols-3 text-xs text-slate-300 gap-1">
                        <p></p><p className="font-semibold">Hazai</p><p className="font-semibold">Vendég</p>
                        <p>xG</p><p>{v(structuredAnalysis.keyMetrics.xg.home)}</p><p>{v(structuredAnalysis.keyMetrics.xg.away)}</p>
                        <p>xGA</p><p>{v(structuredAnalysis.keyMetrics.xg.xgaHome)}</p><p>{v(structuredAnalysis.keyMetrics.xg.xgaAway)}</p>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-3">
                      <p className="text-xs font-semibold text-slate-300 mb-2">PPG / Gólátlag</p>
                      <div className="grid grid-cols-3 text-xs text-slate-300 gap-1">
                        <p></p><p className="font-semibold">Hazai</p><p className="font-semibold">Vendég</p>
                        <p>PPG</p><p>{v(structuredAnalysis.keyMetrics.ppg.home)}</p><p>{v(structuredAnalysis.keyMetrics.ppg.away)}</p>
                        <p>GF/meccs</p><p>{v(structuredAnalysis.keyMetrics.goalsPerMatch.homeFor)}</p><p>{v(structuredAnalysis.keyMetrics.goalsPerMatch.awayFor)}</p>
                        <p>GA/meccs</p><p>{v(structuredAnalysis.keyMetrics.goalsPerMatch.homeAgainst)}</p><p>{v(structuredAnalysis.keyMetrics.goalsPerMatch.awayAgainst)}</p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                      <p className="text-[11px] font-semibold text-red-700">Hiányzók (H)</p>
                      <p className="text-lg font-black text-red-800">{structuredAnalysis.keyMetrics.availability.homeMissing}</p>
                    </div>
                    <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                      <p className="text-[11px] font-semibold text-red-700">Hiányzók (V)</p>
                      <p className="text-lg font-black text-red-800">{structuredAnalysis.keyMetrics.availability.awayMissing}</p>
                    </div>
                    <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                      <p className="text-[11px] font-semibold text-cyan-700">Felállás (H)</p>
                      <p className="text-sm font-bold text-cyan-800">{structuredAnalysis.keyMetrics.formations.home || '-'}</p>
                    </div>
                    <div className="rounded-xl border border-cyan-200 bg-cyan-50 p-3">
                      <p className="text-[11px] font-semibold text-cyan-700">Felállás (V)</p>
                      <p className="text-sm font-bold text-cyan-800">{structuredAnalysis.keyMetrics.formations.away || '-'}</p>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-700 bg-slate-800/70 p-3">
                    <p className="text-xs font-semibold text-slate-300 mb-2">Adatforrás állapot</p>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                      {Object.entries({
                        prediction: structuredAnalysis.dataQuality.sourceCoverage.includes('prediction'),
                        h2h: structuredAnalysis.dataQuality.sourceCoverage.includes('h2h'),
                        injuries: structuredAnalysis.dataQuality.sourceCoverage.includes('injuries'),
                        lineups: structuredAnalysis.dataQuality.sourceCoverage.includes('lineups'),
                        xg: structuredAnalysis.dataQuality.sourceCoverage.some((v) => v.toLowerCase().includes('xg')),
                        teamStats: structuredAnalysis.dataQuality.sourceCoverage.includes('teamStats'),
                        news: structuredAnalysis.dataQuality.sourceCoverage.includes('news'),
                      }).map(([key, ok]) => (
                        <div
                          key={key}
                          className={`rounded-md px-2 py-1 border ${
                            ok ? 'border-emerald-700 bg-emerald-950/40 text-emerald-300' : 'border-rose-700 bg-rose-950/30 text-rose-300'
                          }`}
                        >
                          {key}: {ok ? 'ok' : 'nincs'}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              {parseSections(analysis).slice(0, 2).map((section, sectionIndex) => (
                <div
                  key={`${section.title}-${sectionIndex}`}
                  className="rounded-xl border border-slate-700 bg-slate-800/60 p-4 shadow-sm"
                >
                  <div className="mb-3 inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                    {section.title}
                  </div>

                  <div className="space-y-2 text-sm text-slate-200 leading-relaxed">
                    {section.lines.map((rawLine, lineIndex) => {
                      const line = rawLine.trim();
                      if (!line) return null;

                      if (line.startsWith('- ') || line.startsWith('* ')) {
                        return (
                          <div key={lineIndex} className="flex gap-2">
                            <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-blue-500" />
                            <p>{line.replace(/^[-*]\s*/, '')}</p>
                          </div>
                        );
                      }

                      if (/^Forr[aá]s:/i.test(line)) {
                        return (
                          <p
                            key={lineIndex}
                            className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 border border-amber-200"
                          >
                            {line}
                          </p>
                        );
                      }

                      return <p key={lineIndex}>{line}</p>;
                    })}
                  </div>
                </div>
              ))}
            </motion.div>
          ) : (
            <div className="text-center py-20 text-slate-400 italic">Nincs elérhető elemzés. Kattints a frissítésre!</div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-4 bg-slate-900 text-[10px] text-slate-500 text-center">
        Az elemzés mesterséges intelligencia segítségével készült. Kérjük, felelősségteljesen fogadj!
      </div>
    </div>
  );
}

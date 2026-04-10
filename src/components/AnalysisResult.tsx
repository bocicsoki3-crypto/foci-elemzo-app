'use client';

import React from 'react';
import { Bot, Sparkles, Loader2, RefreshCw, Expand, History } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface AnalysisResultProps {
  analysis: string | null;
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

export default function AnalysisResult({
  analysis,
  loading,
  onRefresh,
  selectedMatch,
  onOpenModal,
  onOpenArchive,
}: AnalysisResultProps) {
  if (!selectedMatch) {
    return (
      <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl border-2 border-dashed border-gray-100 text-center">
        <div className="w-16 h-16 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
          <Bot className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-gray-800 mb-2">Válassz egy mérkőzést</h3>
        <p className="text-gray-500 max-w-md">Válaszd ki a listából azt a mérkőzést, amit a Gemini AI-val szeretnél kielemeztetni.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
      <div className="p-6 border-b border-gray-50 bg-gradient-to-r from-blue-50 to-indigo-50 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-blue-200">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 leading-tight">Gemini AI Elemzés</h2>
            <p className="text-xs text-blue-600 font-medium">{selectedMatch.homeTeam.name} vs {selectedMatch.awayTeam.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onOpenArchive}
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-white rounded-lg transition-all"
            title="Mentett elemzések"
          >
            <History className="w-5 h-5" />
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
            className="p-2 text-gray-500 hover:text-blue-600 hover:bg-white rounded-lg transition-all disabled:opacity-50"
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
              <p className="text-gray-600 font-medium">Gemini éppen elemzi a mérkőzést...</p>
              <p className="text-xs text-gray-400 mt-2">Ez eltarthat pár másodpercig</p>
            </motion.div>
          ) : analysis ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {parseSections(analysis).map((section, sectionIndex) => (
                <div
                  key={`${section.title}-${sectionIndex}`}
                  className="rounded-xl border border-slate-200 bg-slate-50/60 p-4 shadow-sm"
                >
                  <div className="mb-3 inline-flex rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
                    {section.title}
                  </div>

                  <div className="space-y-2 text-sm text-slate-700 leading-relaxed">
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
            <div className="text-center py-20 text-gray-400 italic">Nincs elérhető elemzés. Kattints a frissítésre!</div>
          )}
        </AnimatePresence>
      </div>

      <div className="p-4 bg-gray-50 text-[10px] text-gray-400 text-center">
        Az elemzés mesterséges intelligencia segítségével készült. Kérjük, felelősségteljesen fogadj!
      </div>
    </div>
  );
}

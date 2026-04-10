'use client';

import React from 'react';
import { format } from 'date-fns';
import { Calendar, Clock, Trophy, ChevronRight } from 'lucide-react';
import { motion } from 'framer-motion';

interface MatchCardProps {
  match: any;
  onSelect: (match: any) => void;
  isSelected: boolean;
}

export default function MatchCard({ match, onSelect, isSelected }: MatchCardProps) {
  const date = new Date(match.utcDate);

  return (
    <motion.div
      whileHover={{ scale: 1.012, y: -3 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(match)}
      className={`p-3 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? 'bg-slate-900/95 border-cyan-400/80 shadow-[0_12px_28px_rgba(34,211,238,0.2)] ring-1 ring-cyan-400/60'
          : 'bg-slate-900/75 border-slate-700 hover:border-cyan-400/70 hover:shadow-[0_12px_28px_rgba(34,211,238,0.14)]'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-[11px] font-medium text-slate-300">
          <Trophy className="w-3 h-3" />
          <span>{match.competition.name}</span>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <Clock className="w-3 h-3" />
          <span>{format(date, 'HH:mm')}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col items-center flex-1 text-center">
          <img src={match.homeTeam.crest} alt={match.homeTeam.name} className="w-10 h-10 mb-1.5 object-contain" />
          <span className="text-xs font-bold text-slate-100 line-clamp-1">{match.homeTeam.shortName || match.homeTeam.name}</span>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-[11px] font-bold text-slate-400">VS</span>
        </div>

        <div className="flex flex-col items-center flex-1 text-center">
          <img src={match.awayTeam.crest} alt={match.awayTeam.name} className="w-10 h-10 mb-1.5 object-contain" />
          <span className="text-xs font-bold text-slate-100 line-clamp-1">{match.awayTeam.shortName || match.awayTeam.name}</span>
        </div>
      </div>

      <div className="mt-3 pt-2 border-t border-slate-700 flex justify-end">
        <div className="flex items-center text-cyan-300 text-xs font-semibold">
          Elemzés kérése
          <ChevronRight className="w-4 h-4 ml-1" />
        </div>
      </div>
    </motion.div>
  );
}

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
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={() => onSelect(match)}
      className={`p-4 rounded-xl border transition-all cursor-pointer ${
        isSelected
          ? 'bg-blue-50 border-blue-500 shadow-md ring-1 ring-blue-500'
          : 'bg-white border-gray-100 hover:border-blue-200 hover:shadow-sm'
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 text-xs font-medium text-gray-500">
          <Trophy className="w-3 h-3" />
          <span>{match.competition.name}</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Clock className="w-3 h-3" />
          <span>{format(date, 'HH:mm')}</span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col items-center flex-1 text-center">
          <img src={match.homeTeam.crest} alt={match.homeTeam.name} className="w-12 h-12 mb-2 object-contain" />
          <span className="text-sm font-bold text-gray-800 line-clamp-1">{match.homeTeam.shortName || match.homeTeam.name}</span>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-xs font-bold text-gray-400">VS</span>
        </div>

        <div className="flex flex-col items-center flex-1 text-center">
          <img src={match.awayTeam.crest} alt={match.awayTeam.name} className="w-12 h-12 mb-2 object-contain" />
          <span className="text-sm font-bold text-gray-800 line-clamp-1">{match.awayTeam.shortName || match.awayTeam.name}</span>
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-gray-50 flex justify-end">
        <div className="flex items-center text-blue-600 text-xs font-semibold">
          Elemzés kérése
          <ChevronRight className="w-4 h-4 ml-1" />
        </div>
      </div>
    </motion.div>
  );
}

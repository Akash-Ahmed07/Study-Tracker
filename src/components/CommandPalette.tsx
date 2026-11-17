import React, { useEffect, useMemo, useState } from 'react';
import { Command, Search, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { NavSection } from '../lib/types.ts';

export interface CommandItem {
  id: string;
  label: string;
  shortcut?: string;
  category: string;
  action: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (section: NavSection) => void;
  onStartQuickTimer: () => void;
  onOpenQuickNote: () => void;
  onToggleTheme: () => void;
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  open,
  onClose,
  onNavigate,
  onStartQuickTimer,
  onOpenQuickNote,
  onToggleTheme,
}) => {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) {
      setQuery('');
    }
  }, [open]);

  const commands = useMemo<CommandItem[]>(
    () => [
      {
        id: 'nav-1',
        label: '1. Overview & Dashboard',
        shortcut: '1',
        category: 'Navigate',
        action: () => onNavigate('overview'),
      },
      {
        id: 'nav-2',
        label: '2. Courses & Syllabus',
        shortcut: '2',
        category: 'Navigate',
        action: () => onNavigate('courses'),
      },
      {
        id: 'nav-3',
        label: '3. Study Sessions & Timer',
        shortcut: '3',
        category: 'Navigate',
        action: () => onNavigate('sessions'),
      },
      {
        id: 'nav-4',
        label: '4. Notes & Files (Upload / Text Note)',
        shortcut: '4',
        category: 'Navigate',
        action: () => onNavigate('notes'),
      },
      {
        id: 'nav-5',
        label: '5. CGPA & What-If Projections',
        shortcut: '5',
        category: 'Navigate',
        action: () => onNavigate('cgpa'),
      },
      {
        id: 'nav-6',
        label: '6. Friends & Study Together',
        shortcut: '6',
        category: 'Navigate',
        action: () => onNavigate('friends'),
      },
      {
        id: 'nav-7',
        label: '7. Feature Requests & Google Forms',
        shortcut: '7',
        category: 'Navigate',
        action: () => onNavigate('requests'),
      },
      {
        id: 'act-timer',
        label: 'Start or inspect live study timer',
        shortcut: 'T',
        category: 'Action',
        action: () => onStartQuickTimer(),
      },
      {
        id: 'act-note',
        label: 'Write dot-terminated quick text note',
        shortcut: 'N',
        category: 'Action',
        action: () => onOpenQuickNote(),
      },
      {
        id: 'act-theme',
        label: 'Toggle light / dark theme',
        shortcut: 'D',
        category: 'Preferences',
        action: () => onToggleTheme(),
      },
    ],
    [onNavigate, onOpenQuickNote, onStartQuickTimer, onToggleTheme]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return commands;
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q) ||
        c.shortcut?.toLowerCase() === q
    );
  }, [commands, query]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-24 bg-slate-950/60 backdrop-blur-xs p-4"
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.97, y: -8 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose();
              if (e.key === 'Enter' && filtered.length > 0) {
                filtered[0].action();
                onClose();
              }
            }}
            placeholder="Type a menu number (1-7) or command..."
            className="w-full bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none font-mono"
          />
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1"
            aria-label="Close command palette"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
          {filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-slate-500">
              No matching command found.
            </div>
          ) : (
            filtered.map((cmd) => (
              <button
                key={cmd.id}
                type="button"
                onClick={() => {
                  cmd.action();
                  onClose();
                }}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/70 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Command className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                    {cmd.label}
                  </span>
                </div>
                <span className="text-xs text-slate-400 font-mono shrink-0 ml-4">
                  {cmd.category}
                  {cmd.shortcut ? ` · ${cmd.shortcut}` : ''}
                </span>
              </button>
            ))
          )}
        </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

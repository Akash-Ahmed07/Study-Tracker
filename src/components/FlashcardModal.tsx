import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Eye, RotateCw, X } from 'lucide-react';
import { NoteOrFile } from '../lib/types.ts';

interface FlashcardModalProps {
  note: NoteOrFile | null;
  onClose: () => void;
}

interface Flashcard {
  front: string;
  back: string;
}

function parseNoteIntoCards(note: NoteOrFile): Flashcard[] {
  const raw = note.textContent.trim();
  if (!raw) return [];
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const cards: Flashcard[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.includes('::')) {
      const [front, ...rest] = line.split('::');
      cards.push({ front: front.trim(), back: rest.join('::').trim() || 'Review note' });
    } else if (/^q:\s*/i.test(line) && i + 1 < lines.length && /^a:\s*/i.test(lines[i + 1])) {
      cards.push({
        front: line.replace(/^q:\s*/i, '').trim(),
        back: lines[i + 1].replace(/^a:\s*/i, '').trim(),
      });
      i += 1;
    } else if (line.includes(' - ') && line.length > 10) {
      const idx = line.indexOf(' - ');
      cards.push({
        front: line.slice(0, idx).trim(),
        back: line.slice(idx + 3).trim(),
      });
    }
  }

  if (cards.length > 0) return cards;

  // Fallback: split note into recall prompts per line/paragraph
  return lines.map((line, idx) => ({
    front: `${note.title} — Key Point ${idx + 1}`,
    back: line,
  }));
}

export const FlashcardModal: React.FC<FlashcardModalProps> = ({ note, onClose }) => {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const cards = useMemo(() => (note ? parseNoteIntoCards(note) : []), [note]);

  if (!note) return null;

  const current = cards[index] || cards[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
              Active Recall — {note.title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Tip: Use "Term :: Definition" or "Q: / A:" lines in notes for custom flashcards
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {cards.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              This note has no text lines to study as flashcards yet.
            </p>
          ) : (
            <>
              <div className="flex items-center justify-between text-xs text-slate-500 font-mono tabular-nums">
                <span>
                  Card {index + 1} of {cards.length}
                </span>
                <span>{revealed ? 'Answer shown' : 'Recall prompt'}</span>
              </div>

              <button
                type="button"
                onClick={() => setRevealed((v) => !v)}
                className="w-full min-h-[180px] p-6 text-left bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl flex flex-col justify-between hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
              >
                <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  {revealed ? 'Answer / Explanation' : 'Prompt'}
                </div>
                <div className="text-base font-medium text-slate-900 dark:text-slate-100 leading-relaxed my-3">
                  {revealed ? current.back : current.front}
                </div>
                <div className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <Eye className="w-3.5 h-3.5" />
                  Click card to {revealed ? 'hide answer' : 'reveal answer'}
                </div>
              </button>

              <div className="flex items-center justify-between">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => {
                    setIndex((i) => Math.max(0, i - 1));
                    setRevealed(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-lg disabled:opacity-40"
                >
                  <ChevronLeft className="w-4 h-4" />
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setRevealed((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  Flip Card
                </button>
                <button
                  type="button"
                  disabled={index >= cards.length - 1}
                  onClick={() => {
                    setIndex((i) => Math.min(cards.length - 1, i + 1));
                    setRevealed(false);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-40"
                >
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

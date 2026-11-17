import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ExternalLink,
  Eye,
  FileText,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Search,
  Square,
  Volume2,
} from 'lucide-react';
import { getIdToken } from '../lib/firebase.ts';
import { SoundscapeType } from '../lib/soundscape.ts';
import { Course, NoteOrFile, SyllabusTopic } from '../lib/types.ts';
import {
  fetchDriveFileBlobUrl,
  getDriveDirectDownloadUrl,
  getDrivePreviewEmbedUrl,
} from '../lib/workspace.ts';
import { TimerPreset } from './SessionsView.tsx';

interface FocusZoomModalProps {
  open: boolean;
  onClose: () => void;
  courses: Course[];
  topics: SyllabusTopic[];
  notes: NoteOrFile[];
  timerRunning: boolean;
  timerSeconds: number;
  timerPreset: TimerPreset;
  timerCourseId: string;
  timerTopicId: string;
  soundscape: SoundscapeType;
  soundVolume: number;
  accessToken: string | null;
  onRequestAuth: () => void;
  onSetTimerPreset: (preset: TimerPreset) => void;
  onSetTimerTarget: (courseId: string, topicId: string) => void;
  onStartTimer: () => void;
  onPauseTimer: () => void;
  onStopAndSaveTimer: (note: string) => Promise<void>;
  onResetTimer: () => void;
  onChangeSoundscape: (type: SoundscapeType) => void;
  onChangeSoundVolume: (vol: number) => void;
  onNotify: (msg: string) => void;
}

function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const FocusZoomModal: React.FC<FocusZoomModalProps> = ({
  open,
  onClose,
  courses,
  topics,
  notes,
  timerRunning,
  timerSeconds,
  timerPreset,
  timerCourseId,
  timerTopicId,
  soundscape,
  soundVolume,
  accessToken,
  onRequestAuth,
  onSetTimerPreset,
  onSetTimerTarget,
  onStartTimer,
  onPauseTimer,
  onStopAndSaveTimer,
  onResetTimer,
  onChangeSoundscape,
  onChangeSoundVolume,
  onNotify,
}) => {
  const [sessionNote, setSessionNote] = useState('');
  const [noteSearch, setNoteSearch] = useState('');
  const [selectedNote, setSelectedNote] = useState<NoteOrFile | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [driveEmbedUrl, setDriveEmbedUrl] = useState<string | null>(null);
  const [loadingReader, setLoadingReader] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);
  const [textFontSize, setTextFontSize] = useState<'sm' | 'base' | 'lg'>('base');

  const activeTopics = useMemo(
    () => topics.filter((t) => t.courseId === timerCourseId),
    [timerCourseId, topics]
  );

  const sortedNotes = useMemo(() => {
    const q = noteSearch.trim().toLowerCase();
    const list = notes.filter((n) => {
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.courseCode.toLowerCase().includes(q) ||
        n.originalFilename.toLowerCase().includes(q) ||
        n.textContent.toLowerCase().includes(q)
      );
    });
    if (!timerCourseId) return list;
    return [...list].sort((a, b) => {
      const aMatch = a.courseId === timerCourseId ? 0 : 1;
      const bMatch = b.courseId === timerCourseId ? 0 : 1;
      return aMatch - bMatch;
    });
  }, [noteSearch, notes, timerCourseId]);

  useEffect(() => {
    return () => {
      if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
    };
  }, [previewBlobUrl]);

  const handleOpenStudyNote = async (note: NoteOrFile) => {
    setSelectedNote(note);
    setReaderError(null);
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
    setDriveEmbedUrl(null);

    if (note.kind === 'text') return;

    setLoadingReader(true);
    try {
      if (note.driveFileId) {
        if (accessToken) {
          try {
            const url = await fetchDriveFileBlobUrl(accessToken, note.driveFileId, note.mimeType);
            setPreviewBlobUrl(url);
            return;
          } catch {
            // Fall through to Google Drive embed viewer
          }
        }
        setDriveEmbedUrl(getDrivePreviewEmbedUrl(note.driveFileId));
        return;
      }

      if (note.storageKey) {
        const idToken = await getIdToken();
        const url = `/api/files/${encodeURIComponent(note.userId)}/${encodeURIComponent(
          note.storageKey
        )}?mime=${encodeURIComponent(note.mimeType)}&name=${encodeURIComponent(note.originalFilename)}`;
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) {
          throw new Error('Could not load local file preview on this host.');
        }
        const blob = await res.blob();
        setPreviewBlobUrl(URL.createObjectURL(blob));
      } else {
        setReaderError('No file source attached to this note.');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unable to open file in Focus Reader.';
      setReaderError(msg);
      onNotify(msg);
    } finally {
      setLoadingReader(false);
    }
  };

  if (!open) return null;

  const targetSeconds =
    timerPreset === 'pomodoro25' ? 25 * 60 : timerPreset === 'deep50' ? 50 * 60 : null;
  const remainingSeconds =
    targetSeconds !== null ? Math.max(0, targetSeconds - timerSeconds) : null;
  const displaySeconds = remainingSeconds !== null ? remainingSeconds : timerSeconds;
  const activeCourse = courses.find((c) => c.id === timerCourseId);

  return (
    <div
      className="fixed inset-0 z-50 bg-gradient-to-br from-slate-100/95 via-blue-50/90 to-slate-200/95 dark:from-slate-950/95 dark:via-slate-900/95 dark:to-slate-950/95 backdrop-blur-xl flex flex-col overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-label="Zoomed Focus Timer & Notes Reader"
    >
      {/* Header Bar */}
      <div className="px-6 py-3.5 border-b border-slate-200/70 dark:border-slate-800/80 glass-panel rounded-none flex items-center justify-between gap-4 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
          <div className="min-w-0">
            <h2 className="font-display text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 truncate">
              Focus Study Screen · {activeCourse ? `${activeCourse.code} — ${activeCourse.title}` : 'General Study'}
            </h2>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 glass-subtle hover:bg-white dark:hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0"
        >
          <Minimize2 className="w-4 h-4" />
          Minimize to Dashboard
        </button>
      </div>

      {/* Main Split Workspace */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 h-full min-h-[540px]">
          {/* Left: Zoomed Timer Controls */}
          <div className="lg:col-span-5 glass-panel rounded-2xl p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  {timerRunning ? 'Timer Running' : timerSeconds > 0 ? 'Timer Paused' : 'Ready to Focus'}
                </span>
                <div className="flex items-center gap-1 p-1 bg-slate-100/90 dark:bg-slate-800/90 rounded-lg">
                  {(
                    [
                      { id: 'free', label: 'Free' },
                      { id: 'pomodoro25', label: '25m' },
                      { id: 'deep50', label: '50m' },
                    ] as { id: TimerPreset; label: string }[]
                  ).map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => onSetTimerPreset(p.id)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                        timerPreset === p.id
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="py-6 sm:py-8 border-y border-slate-200/70 dark:border-slate-800 text-center space-y-2">
                <div className="font-mono text-6xl sm:text-7xl font-bold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">
                  {formatClock(displaySeconds)}
                </div>
                {targetSeconds !== null && (
                  <div className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    Elapsed {formatClock(timerSeconds)} / {Math.round(targetSeconds / 60)}m goal
                  </div>
                )}
              </div>

              {/* Primary Timer Actions */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                {!timerRunning ? (
                  <button
                    type="button"
                    onClick={onStartTimer}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm"
                  >
                    <Play className="w-4 h-4" />
                    {timerSeconds > 0 ? 'Resume' : 'Start Focus'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onPauseTimer}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-slate-800 dark:text-slate-100 bg-white/80 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>
                )}

                {timerSeconds > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        await onStopAndSaveTimer(sessionNote);
                        setSessionNote('');
                        onClose();
                      }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm"
                    >
                      <Square className="w-4 h-4" />
                      Finish & Log
                    </button>
                    <button
                      type="button"
                      onClick={onResetTimer}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reset
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Course & Note Reflection + Soundscape */}
            <div className="space-y-3 pt-4 border-t border-slate-200/70 dark:border-slate-800">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <select
                  value={timerCourseId}
                  onChange={(e) => onSetTimerTarget(e.target.value, '')}
                  className="px-3 py-2 text-xs bg-white/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="">General Study</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.code} — {c.title}
                    </option>
                  ))}
                </select>
                <select
                  value={timerTopicId}
                  onChange={(e) => onSetTimerTarget(timerCourseId, e.target.value)}
                  className="px-3 py-2 text-xs bg-white/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="">Any topic</option>
                  {activeTopics.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
              </div>

              <input
                type="text"
                value={sessionNote}
                onChange={(e) => setSessionNote(e.target.value)}
                placeholder="Pages or concepts covered (saved when you log)..."
                className="w-full px-3 py-2 text-xs bg-white/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg"
              />

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-1 p-1 bg-slate-100/90 dark:bg-slate-800/90 rounded-lg">
                  {(
                    [
                      { id: 'off', label: 'Audio Off' },
                      { id: 'rain', label: 'Rain' },
                      { id: 'brown', label: 'Brown' },
                      { id: 'binaural', label: 'Tone' },
                    ] as { id: SoundscapeType; label: string }[]
                  ).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => onChangeSoundscape(s.id)}
                      className={`px-2 py-1 text-[11px] font-medium rounded-md transition-colors ${
                        soundscape === s.id
                          ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                {soundscape !== 'off' && (
                  <div className="flex items-center gap-2">
                    <Volume2 className="w-3.5 h-3.5 text-slate-400" />
                    <input
                      type="range"
                      min="0.05"
                      max="0.55"
                      step="0.05"
                      value={soundVolume}
                      onChange={(e) => onChangeSoundVolume(Number(e.target.value))}
                      aria-label="Audio volume"
                      className="w-20 accent-blue-600"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Integrated PDF & Study Notes Reader */}
          <div className="lg:col-span-7 glass-panel rounded-2xl flex flex-col overflow-hidden min-h-[460px]">
            {selectedNote ? (
              <>
                <div className="px-5 py-3.5 border-b border-slate-200/70 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => {
                        if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
                        setPreviewBlobUrl(null);
                        setDriveEmbedUrl(null);
                        setSelectedNote(null);
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 glass-subtle rounded-lg shrink-0"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      All Notes
                    </button>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {selectedNote.title}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {selectedNote.courseCode || 'GENERAL'} ·{' '}
                        {selectedNote.kind === 'text' ? 'Text Note' : selectedNote.originalFilename}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {selectedNote.kind === 'text' && (
                      <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">
                        {(['sm', 'base', 'lg'] as const).map((sz) => (
                          <button
                            key={sz}
                            type="button"
                            onClick={() => setTextFontSize(sz)}
                            className={`px-2 py-0.5 text-[11px] font-mono rounded-sm ${
                              textFontSize === sz
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100'
                                : 'text-slate-500'
                            }`}
                          >
                            {sz === 'sm' ? 'A-' : sz === 'base' ? 'A' : 'A+'}
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedNote.driveFileId && (
                      <a
                        href={getDriveDirectDownloadUrl(selectedNote.driveFileId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 glass-subtle rounded-lg"
                      >
                        Drive
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                <div className="flex-1 p-5 overflow-y-auto bg-white/50 dark:bg-slate-950/50">
                  {selectedNote.kind === 'text' ? (
                    <pre
                      className={`whitespace-pre-wrap font-mono text-slate-800 dark:text-slate-200 leading-relaxed ${
                        textFontSize === 'sm'
                          ? 'text-xs'
                          : textFontSize === 'lg'
                            ? 'text-base'
                            : 'text-sm'
                      }`}
                    >
                      {selectedNote.textContent}
                    </pre>
                  ) : loadingReader ? (
                    <div className="py-20 text-center text-sm text-slate-500">
                      Loading document reader...
                    </div>
                  ) : previewBlobUrl && selectedNote.mimeType.startsWith('image/') ? (
                    <img
                      src={previewBlobUrl}
                      alt={selectedNote.title}
                      className="max-w-full max-h-[65vh] mx-auto rounded-lg"
                    />
                  ) : previewBlobUrl ? (
                    <iframe
                      src={previewBlobUrl}
                      title={selectedNote.title}
                      className="w-full h-[65vh] rounded-lg border border-slate-200 dark:border-slate-800 bg-white"
                    />
                  ) : driveEmbedUrl ? (
                    <div className="space-y-3 h-full flex flex-col">
                      <iframe
                        src={driveEmbedUrl}
                        title={selectedNote.title}
                        className="w-full h-[60vh] rounded-lg border border-slate-200 dark:border-slate-800 bg-white"
                        allow="autoplay"
                      />
                      {!accessToken && (
                        <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                          <span>Private Drive file? Connect Google Drive for direct inline loading.</span>
                          <button
                            type="button"
                            onClick={onRequestAuth}
                            className="px-3 py-1 font-medium text-blue-600 dark:text-blue-400 underline"
                          >
                            Connect Google Drive
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="py-16 text-center text-sm text-slate-500">
                      {readerError || 'Select another PDF or note to read during your study block.'}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <div className="px-5 py-4 border-b border-slate-200/70 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="font-display text-base font-semibold text-slate-900 dark:text-slate-100">
                      Study Notes & PDF Reader
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Open any lecture PDF or text note to study right beside your timer
                    </p>
                  </div>
                  <div className="relative sm:w-64">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={noteSearch}
                      onChange={(e) => setNoteSearch(e.target.value)}
                      placeholder="Filter PDFs or notes..."
                      className="w-full pl-8 pr-3 py-1.5 text-xs bg-white/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80">
                  {sortedNotes.length === 0 ? (
                    <div className="p-12 text-center space-y-2">
                      <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                        No notes or PDFs available yet
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Upload PDFs or write notes in 4. Notes &amp; Files to read them inside Focus Mode.
                      </p>
                    </div>
                  ) : (
                    sortedNotes.map((item) => {
                      const isCourseMatch = Boolean(timerCourseId && item.courseId === timerCourseId);
                      return (
                        <div
                          key={item.id}
                          className={`px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-white/60 dark:hover:bg-slate-800/40 transition-colors ${
                            isCourseMatch ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''
                          }`}
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {item.title}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {item.courseCode || 'GENERAL'}
                              {isCourseMatch ? ' (Active course)' : ''}
                              {' · '}
                              {item.kind === 'text' ? 'Text Note' : item.originalFilename}
                              {item.driveFileId ? ' · Google Drive' : ''}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleOpenStudyNote(item)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shrink-0 whitespace-nowrap"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Read Now
                          </button>
                        </div>
                      );
                    })
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

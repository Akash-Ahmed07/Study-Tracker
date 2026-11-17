import React, { useMemo, useState } from 'react';
import { Download, Flame, HeartHandshake, Pause, Play, Plus, Square, Target, Trash2 } from 'lucide-react';
import {
  computeStreakDays,
  computeWeeklyMinutes,
  deleteStudySession,
  logStudySession,
  updateUserPreferences,
} from '../lib/studyData.ts';
import { Course, StudySession, SyllabusTopic, UserProfile } from '../lib/types.ts';
import { StudyConsistencyHeatmap } from './StudyCharts.tsx';

export type TimerPreset = 'free' | 'pomodoro25' | 'deep50';

interface SessionsViewProps {
  profile: UserProfile;
  courses: Course[];
  topics: SyllabusTopic[];
  sessions: StudySession[];
  timerRunning: boolean;
  timerSeconds: number;
  timerPreset: TimerPreset;
  timerCourseId: string;
  timerTopicId: string;
  onSetTimerPreset: (preset: TimerPreset) => void;
  onSetTimerTarget: (courseId: string, topicId: string) => void;
  onStartTimer: () => void;
  onPauseTimer: () => void;
  onStopAndSaveTimer: (note: string) => Promise<void>;
  onResetTimer: () => void;
  onNotify: (msg: string) => void;
}

function formatClock(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const SessionsView: React.FC<SessionsViewProps> = ({
  profile,
  courses,
  topics,
  sessions,
  timerRunning,
  timerSeconds,
  timerPreset,
  timerCourseId,
  timerTopicId,
  onSetTimerPreset,
  onSetTimerTarget,
  onStartTimer,
  onPauseTimer,
  onStopAndSaveTimer,
  onResetTimer,
  onNotify,
}) => {
  const [timerNote, setTimerNote] = useState('');
  const [manualCourseId, setManualCourseId] = useState(courses[0]?.id || '');
  const [manualDuration, setManualDuration] = useState('45');
  const [manualDate, setManualDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [manualNote, setManualNote] = useState('');
  const [goalHoursInput, setGoalHoursInput] = useState(
    String(Math.round((profile.weeklyGoalMinutes || 600) / 60))
  );
  const [savingGoal, setSavingGoal] = useState(false);

  const weeklyMinutes = computeWeeklyMinutes(sessions);
  const streakDays = computeStreakDays(sessions);
  const goalMinutes = profile.weeklyGoalMinutes || 600;
  const goalPct = Math.min(100, Math.round((weeklyMinutes / goalMinutes) * 100));

  const timerTopics = useMemo(
    () => topics.filter((t) => t.courseId === timerCourseId),
    [timerCourseId, topics]
  );

  // Last 7 days study minutes breakdown
  const last7Days = useMemo(() => {
    const days: { key: string; label: string; minutes: number }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString(undefined, { weekday: 'short' });
      const minutes = sessions
        .filter((s) => (s.startedAt || '').slice(0, 10) === key)
        .reduce((sum, s) => sum + (Number(s.durationMinutes) || 0), 0);
      days.push({ key, label, minutes });
    }
    return days;
  }, [sessions]);

  const maxDayMinutes = Math.max(60, ...last7Days.map((d) => d.minutes));

  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const mins = Math.max(1, Math.min(1440, Number(manualDuration) || 0));
    const selectedCourse = courses.find((c) => c.id === manualCourseId);
    const isoDate = `${manualDate}T12:00:00.000Z`;
    await logStudySession(profile.uid, {
      courseId: selectedCourse?.id || '',
      courseCode: selectedCourse?.code || 'GENERAL',
      topicId: '',
      durationMinutes: mins,
      startedAt: isoDate,
      endedAt: isoDate,
      source: 'manual',
      groupSessionId: '',
      note: manualNote.trim(),
    });
    setManualNote('');
    onNotify(`Logged ${mins} minute study session.`);
  };

  const handleSaveGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingGoal(true);
    try {
      const hours = Math.max(1, Math.min(168, Number(goalHoursInput) || 10));
      await updateUserPreferences(profile.uid, {
        displayName: profile.displayName,
        gradingScale: profile.gradingScale,
        weeklyGoalMinutes: Math.round(hours * 60),
      });
      onNotify(`Weekly goal updated to ${hours} hours.`);
    } finally {
      setSavingGoal(false);
    }
  };

  const handleExportCsv = () => {
    if (!sessions.length) return;
    const header = ['Date', 'Course', 'DurationMinutes', 'Source', 'Note'];
    const rows = sessions.map((s) => [
      (s.startedAt || '').slice(0, 10),
      `"${(s.courseCode || 'GENERAL').replace(/"/g, '""')}"`,
      String(s.durationMinutes),
      s.source,
      `"${(s.note || '').replace(/"/g, '""')}"`,
    ]);
    const csv = [header.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `study_sessions_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('Exported study sessions as CSV.');
  };

  const targetSeconds =
    timerPreset === 'pomodoro25' ? 25 * 60 : timerPreset === 'deep50' ? 50 * 60 : null;
  const remainingSeconds = targetSeconds !== null ? Math.max(0, targetSeconds - timerSeconds) : null;
  const showHealthyBreakReminder = timerSeconds >= 90 * 60 || Number(manualDuration) > 240;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
          Study Sessions, Timer & Streaks
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
          Run a live focus timer or log manual study sessions to build your daily streak and weekly target.
        </p>
      </div>

      {/* Top Grid: Live Timer + Weekly Goal & Streak */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-7 bg-white/85 dark:bg-slate-900/85 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-xl p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Live Focus Timer
            </h2>
            <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
              {(
                [
                  { id: 'free', label: 'Free Timer' },
                  { id: 'pomodoro25', label: 'Pomodoro 25m' },
                  { id: 'deep50', label: 'Deep Focus 50m' },
                ] as { id: TimerPreset; label: string }[]
              ).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSetTimerPreset(p.id)}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Course
              </label>
              <select
                value={timerCourseId}
                onChange={(e) => onSetTimerTarget(e.target.value, '')}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <option value="">General Study</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Syllabus Topic (optional)
              </label>
              <select
                value={timerTopicId}
                onChange={(e) => onSetTimerTarget(timerCourseId, e.target.value)}
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <option value="">No specific topic</option>
                {timerTopics.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="py-4 border-y border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="font-mono text-5xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">
                {formatClock(remainingSeconds !== null ? remainingSeconds : timerSeconds)}
              </div>
              {targetSeconds !== null && (
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
                  {remainingSeconds === 0
                    ? 'Interval complete — take a 5–10 minute break & hydrate'
                    : `Elapsed: ${formatClock(timerSeconds)} / ${Math.round(targetSeconds / 60)}m target`}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!timerRunning ? (
                <button
                  type="button"
                  onClick={onStartTimer}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                >
                  <Play className="w-4 h-4" />
                  {timerSeconds > 0 ? 'Resume' : 'Start'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onPauseTimer}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
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
                      await onStopAndSaveTimer(timerNote);
                      setTimerNote('');
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                  >
                    <Square className="w-4 h-4" />
                    Stop & Log
                  </button>
                  <button
                    type="button"
                    onClick={onResetTimer}
                    className="px-3 py-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                  >
                    Reset
                  </button>
                </>
              )}
            </div>
          </div>

          {showHealthyBreakReminder && (
            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-lg flex items-start gap-2.5 text-xs text-emerald-800 dark:text-emerald-200">
              <HeartHandshake className="w-4 h-4 shrink-0 mt-0.5" />
              <span>
                Healthy study check-in: Long uninterrupted blocks reduce retention. Remember to rest your eyes, stretch, and drink water between sessions.
              </span>
            </div>
          )}

          <input
            type="text"
            value={timerNote}
            onChange={(e) => setTimerNote(e.target.value)}
            placeholder="Session reflection or pages covered (saved when you stop)..."
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
          />
        </div>

        <div className="lg:col-span-5 glass-panel rounded-xl p-6 flex flex-col justify-between space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Flame className="w-3.5 h-3.5 text-amber-600" />
                Current Streak
              </div>
              <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {streakDays} {streakDays === 1 ? 'day' : 'days'}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                <Target className="w-3.5 h-3.5 text-blue-600" />
                This Week
              </div>
              <div className="mt-1 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                {(weeklyMinutes / 60).toFixed(1)}h ({goalPct}%)
              </div>
            </div>
          </div>

          {/* 7-Day Activity Bars */}
          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Last 7 Days
            </div>
            <div className="grid grid-cols-7 gap-2 items-end h-28 pt-2">
              {last7Days.map((day) => {
                const hPct = Math.round((day.minutes / maxDayMinutes) * 100);
                return (
                  <div key={day.key} className="flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="text-[11px] font-mono tabular-nums text-slate-500">
                      {day.minutes > 0 ? `${day.minutes}m` : ''}
                    </span>
                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-sm h-16 flex items-end overflow-hidden">
                      <div
                        className="w-full bg-blue-600 rounded-sm transition-all"
                        style={{ height: `${Math.max(day.minutes > 0 ? 12 : 0, hPct)}%` }}
                      />
                    </div>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400">
                      {day.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <form onSubmit={(e) => void handleSaveGoal(e)} className="flex items-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div className="flex-1">
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Weekly Goal (hours)
              </label>
              <input
                type="number"
                min="1"
                max="168"
                value={goalHoursInput}
                onChange={(e) => setGoalHoursInput(e.target.value)}
                className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>
            <button
              type="submit"
              disabled={savingGoal}
              className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap"
            >
              {savingGoal ? 'Saving...' : 'Update Goal'}
            </button>
          </form>
        </div>
      </div>

      {/* 28-Day Visual Consistency Map */}
      <StudyConsistencyHeatmap sessions={sessions} />

      {/* Manual Logger */}
      <form
        onSubmit={(e) => void handleManualSubmit(e)}
        className="glass-panel rounded-xl p-6 space-y-4"
      >
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Log Manual Study Session
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <select
            value={manualCourseId}
            onChange={(e) => setManualCourseId(e.target.value)}
            className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
          >
            <option value="">General Study</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} — {c.title}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            max="1440"
            required
            value={manualDuration}
            onChange={(e) => setManualDuration(e.target.value)}
            placeholder="Minutes"
            className="px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
          />
          <input
            type="date"
            required
            value={manualDate}
            onChange={(e) => setManualDate(e.target.value)}
            className="px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
          />
          <input
            type="text"
            value={manualNote}
            onChange={(e) => setManualNote(e.target.value)}
            placeholder="What did you cover?"
            className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
          />
          <button
            type="submit"
            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Log Session
          </button>
        </div>
      </form>

      {/* Session History Table */}
      <div className="bg-white/85 dark:bg-slate-900/85 backdrop-blur-md border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Session History
            </h2>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {sessions.length} entries
            </span>
          </div>
          {sessions.length > 0 && (
            <button
              type="button"
              onClick={handleExportCsv}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          )}
        </div>
        {sessions.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No study sessions logged yet. Start the timer above or add a manual session.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-6 font-medium">Date</th>
                  <th className="py-3 px-4 font-medium">Course</th>
                  <th className="py-3 px-4 font-medium">Source</th>
                  <th className="py-3 px-4 font-medium">Note</th>
                  <th className="py-3 px-4 font-medium text-right">Duration</th>
                  <th className="py-3 px-6 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                    <td className="py-3 px-6 font-mono text-xs tabular-nums text-slate-600 dark:text-slate-400 whitespace-nowrap">
                      {(s.startedAt || '').slice(0, 10)}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800 dark:text-slate-200 whitespace-nowrap">
                      {s.courseCode || 'GENERAL'}
                    </td>
                    <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 capitalize whitespace-nowrap">
                      {s.source}
                    </td>
                    <td className="py-3 px-4 text-slate-600 dark:text-slate-300 max-w-xs truncate">
                      {s.note || '—'}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-right text-slate-900 dark:text-slate-100 whitespace-nowrap">
                      {s.durationMinutes} min
                    </td>
                    <td className="py-3 px-6 text-right">
                      <button
                        type="button"
                        onClick={() => void deleteStudySession(profile.uid, s.id)}
                        className="p-1 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                        aria-label="Delete session"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

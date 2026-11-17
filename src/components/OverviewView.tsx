import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Calculator,
  CalendarClock,
  Clock,
  Droplets,
  FileText,
  Flame,
  Mail,
  Maximize2,
  Play,
  RefreshCw,
  Square,
  Users,
  Volume2,
} from 'lucide-react';
import { computeGpaReport, getLowMidtermCourses, getMidtermPercent } from '../lib/gpa.ts';
import { SoundscapeType } from '../lib/soundscape.ts';
import { computeStreakDays, computeWeeklyMinutes } from '../lib/studyData.ts';
import {
  Course,
  NavSection,
  NoteOrFile,
  StudySession,
  SyllabusTopic,
  UserProfile,
} from '../lib/types.ts';
import { GmailMessageSummary, listRecentStudyEmails } from '../lib/workspace.ts';
import { BubbleVibeMode } from './AmbientBubbles.tsx';
import { StudyOverviewCharts } from './StudyCharts.tsx';

interface OverviewViewProps {
  profile: UserProfile;
  courses: Course[];
  topics: SyllabusTopic[];
  sessions: StudySession[];
  notes: NoteOrFile[];
  friendCount: number;
  timerRunning: boolean;
  timerSeconds: number;
  timerCourseCode: string;
  hasWorkspaceToken: boolean;
  accessToken: string | null;
  bubbleMode: BubbleVibeMode;
  soundscape: SoundscapeType;
  soundVolume: number;
  onChangeBubbleMode: (mode: BubbleVibeMode) => void;
  onChangeSoundscape: (type: SoundscapeType) => void;
  onChangeSoundVolume: (vol: number) => void;
  onReconnectWorkspace: () => void;
  onStartQuickTimer: () => void;
  onStopAndSaveTimer: () => void;
  onOpenFocusZoom: () => void;
  onStartCourseRecoveryFocus: (courseId: string) => void;
  onNavigate: (section: NavSection) => void;
}

function formatDurationClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function formatDueCountdown(dueDateStr: string): { label: string; urgent: boolean } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(`${dueDateStr}T00:00:00`);
  if (Number.isNaN(due.getTime())) return { label: dueDateStr, urgent: false };
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return { label: `${Math.abs(diffDays)}d overdue`, urgent: true };
  if (diffDays === 0) return { label: 'Due today', urgent: true };
  if (diffDays === 1) return { label: 'Due tomorrow', urgent: true };
  return { label: `In ${diffDays} days`, urgent: diffDays <= 3 };
}

export const OverviewView: React.FC<OverviewViewProps> = ({
  profile,
  courses,
  topics,
  sessions,
  notes,
  friendCount,
  timerRunning,
  timerSeconds,
  timerCourseCode,
  hasWorkspaceToken,
  accessToken,
  bubbleMode,
  soundscape,
  soundVolume,
  onChangeBubbleMode,
  onChangeSoundscape,
  onChangeSoundVolume,
  onReconnectWorkspace,
  onStartQuickTimer,
  onStopAndSaveTimer,
  onOpenFocusZoom,
  onStartCourseRecoveryFocus,
  onNavigate,
}) => {
  const [emails, setEmails] = useState<GmailMessageSummary[]>([]);
  const [loadingEmails, setLoadingEmails] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const weeklyMinutes = computeWeeklyMinutes(sessions);
  const streakDays = computeStreakDays(sessions);
  const goalMinutes = profile.weeklyGoalMinutes || 600;
  const goalPercent = Math.min(100, Math.round((weeklyMinutes / goalMinutes) * 100));
  const gpaReport = computeGpaReport(courses, profile.gradingScale, undefined, {
    priorCgpa: profile.priorCgpa,
    priorCredits: profile.priorCredits,
  });
  const lowMidCourses = useMemo(() => getLowMidtermCourses(courses), [courses]);

  const activeTopics = topics.filter((t) => t.status !== 'done').slice(0, 5);
  const doneTopicsCount = topics.filter((t) => t.status === 'done').length;

  const upcomingDeadlines = useMemo(() => {
    return topics
      .filter((t) => t.status !== 'done' && Boolean(t.dueDate))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .slice(0, 5);
  }, [topics]);

  const handleLoadStudyEmails = async () => {
    if (!accessToken) {
      onReconnectWorkspace();
      return;
    }
    setLoadingEmails(true);
    setEmailError(null);
    try {
      const msgs = await listRecentStudyEmails(accessToken);
      setEmails(msgs);
    } catch (err) {
      setEmailError(err instanceof Error ? err.message : 'Unable to fetch study emails.');
    } finally {
      setLoadingEmails(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Welcome back, {profile.displayName}
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Friend code <span className="font-mono text-slate-800 dark:text-slate-200">{profile.friendCode}</span> · Press <kbd className="font-mono px-1.5 py-0.5 text-xs border border-slate-200 dark:border-slate-700 rounded">/</kbd> for quick commands
          </p>
        </div>

        {!hasWorkspaceToken && (
          <button
            type="button"
            onClick={onReconnectWorkspace}
            className="px-4 py-2 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50/90 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors whitespace-nowrap shrink-0"
          >
            Authorize Drive, Gmail & Tasks
          </button>
        )}
      </div>

      {/* Low Midterm Persistent Study Reminder */}
      {lowMidCourses.length > 0 && (
        <div className="glass-panel border border-amber-300/80 dark:border-amber-700/70 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Midterm Recovery Reminder — Keep Studying Daily
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                {lowMidCourses
                  .map((c) => `${c.code} (${c.midtermScore}/${c.midtermMax} · ${getMidtermPercent(c)}%)`)
                  .join(', ')}{' '}
                scored below 60% in midterm. Extra daily sessions will help pull up your final grade.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onStartCourseRecoveryFocus(lowMidCourses[0].id)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg whitespace-nowrap shrink-0"
          >
            <Play className="w-3.5 h-3.5" />
            Study {lowMidCourses[0].code} Now
          </button>
        </div>
      )}

      {/* 4-Column Metric Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="glass-panel rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Weekly Study Goal</span>
            <Clock className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {(weeklyMinutes / 60).toFixed(1)}h / {(goalMinutes / 60).toFixed(1)}h
          </div>
          <div className="mt-3 w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-600 rounded-full transition-all duration-300"
              style={{ width: `${goalPercent}%` }}
            />
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {goalPercent}% of weekly target
          </div>
        </div>

        <div className="glass-panel rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Study Streak</span>
            <Flame className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {streakDays} {streakDays === 1 ? 'day' : 'days'}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {sessions.length} total logged sessions
          </div>
        </div>

        <div className="glass-panel rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Syllabus Progress</span>
            <BookOpen className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {doneTopicsCount} / {topics.length}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {courses.length} courses · {notes.length} notes & files
          </div>
        </div>

        <div className="glass-panel rounded-xl p-5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Private CGPA ({profile.gradingScale === 'bd' ? 'BD 4.00' : 'US 4.0'})</span>
            <Calculator className="w-4 h-4 text-slate-400" />
          </div>
          <div className="mt-2 font-mono text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">
            {gpaReport.completedCredits > 0 ? gpaReport.cgpa.toFixed(2) : '—'}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {gpaReport.completedCredits} credits graded · Hidden from friends
          </div>
        </div>
      </div>

      {/* Focus Atmosphere Bar (Realistic Glass Bubbles + Soundscape) */}
      <div className="glass-panel rounded-xl px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Droplets className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          <div>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Study Atmosphere
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Calm ambient bubbles and focus audio synthesized locally in your browser
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(['off', 'subtle', 'lively'] as BubbleVibeMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onChangeBubbleMode(m)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize transition-colors ${
                  bubbleMode === m
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Bubbles: {m}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
            {(
              [
                { id: 'off', label: 'Audio Off' },
                { id: 'rain', label: 'Soft Rain' },
                { id: 'brown', label: 'Brown Noise' },
                { id: 'binaural', label: 'Calm Tone' },
              ] as { id: SoundscapeType; label: string }[]
            ).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onChangeSoundscape(s.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
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
                aria-label="Focus audio volume"
                className="w-20 accent-blue-600"
              />
            </div>
          )}
        </div>
      </div>

      {/* Visual Analytics: 7-Day Pace, Syllabus Breakdown & Course Time Ring */}
      <StudyOverviewCharts
        courses={courses}
        topics={topics}
        sessions={sessions}
        weeklyGoalMinutes={goalMinutes}
      />

      {/* Main Split: Live Timer & Active Syllabus Queue */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        <div className="lg:col-span-5 glass-panel rounded-xl p-6 flex flex-col justify-between space-y-6">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Live Study Timer
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {timerRunning
                ? `Active focus session · ${timerCourseCode || 'General study'}`
                : 'Start a live session or switch to Study Sessions for Pomodoro 25/5 & 50/10 pacing.'}
            </p>
          </div>

          <div className="py-4 border-y border-slate-100 dark:border-slate-800">
            <div className="font-mono text-4xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">
              {formatDurationClock(timerSeconds)}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {!timerRunning ? (
              <button
                type="button"
                onClick={onStartQuickTimer}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
              >
                <Play className="w-4 h-4" />
                Start Timer
              </button>
            ) : (
              <button
                type="button"
                onClick={onStopAndSaveTimer}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
              >
                <Square className="w-4 h-4" />
                Finish &amp; Log
              </button>
            )}
            <button
              type="button"
              onClick={onOpenFocusZoom}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium text-blue-700 dark:text-blue-300 glass-subtle hover:bg-white/80 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Zoom + Notes
            </button>
            <button
              type="button"
              onClick={() => onNavigate('sessions')}
              className="px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
            >
              Sessions
            </button>
          </div>
        </div>

        <div className="lg:col-span-7 glass-panel rounded-xl p-6 flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Up Next in Syllabus
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Topics currently in todo or doing
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('courses')}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
            >
              All Courses
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {activeTopics.length === 0 ? (
            <div className="py-8 text-center space-y-3">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No pending syllabus topics yet. Add a course and break down your syllabus to track progress.
              </p>
              <button
                type="button"
                onClick={() => onNavigate('courses')}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Add First Course
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {activeTopics.map((topic) => {
                const course = courses.find((c) => c.id === topic.courseId);
                return (
                  <div
                    key={topic.id}
                    className="py-3 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {topic.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {course?.code || 'Course'} · {topic.status === 'doing' ? 'In Progress' : 'To Do'}
                        {topic.dueDate ? ` · Due ${topic.dueDate}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigate('courses')}
                      className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 whitespace-nowrap shrink-0"
                    >
                      Open
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500 dark:text-slate-400">
            <button
              type="button"
              onClick={() => onNavigate('notes')}
              className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              4. Notes & Files ({notes.length})
            </button>
            <button
              type="button"
              onClick={() => onNavigate('friends')}
              className="inline-flex items-center gap-1.5 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
            >
              <Users className="w-3.5 h-3.5" />
              Friends Connected ({friendCount})
            </button>
          </div>
        </div>
      </div>

      {/* Useful Split: Upcoming Deadlines Countdown + Gmail Course Announcements */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 glass-panel rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Upcoming Deadlines
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-mono tabular-nums">
              {upcomingDeadlines.length} scheduled
            </span>
          </div>

          {upcomingDeadlines.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
              Add due dates to syllabus topics in Courses & Syllabus to see countdown reminders here.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {upcomingDeadlines.map((topic) => {
                const course = courses.find((c) => c.id === topic.courseId);
                const countdown = formatDueCountdown(topic.dueDate);
                return (
                  <div key={topic.id} className="py-3 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
                        {topic.title}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {course?.code || 'Course'} · {topic.dueDate}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-mono tabular-nums whitespace-nowrap shrink-0 ${
                        countdown.urgent
                          ? 'text-amber-600 dark:text-amber-400 font-semibold'
                          : 'text-slate-500 dark:text-slate-400'
                      }`}
                    >
                      {countdown.label}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-7 glass-panel rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Course & Exam Emails (Gmail)
              </h2>
            </div>
            <button
              type="button"
              disabled={loadingEmails}
              onClick={() => void handleLoadStudyEmails()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingEmails ? 'animate-spin' : ''}`} />
              {emails.length > 0 ? 'Refresh' : 'Check Study Emails'}
            </button>
          </div>

          {emailError && (
            <p className="text-xs text-red-600 dark:text-red-400">{emailError}</p>
          )}

          {emails.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
              Click "Check Study Emails" to surface recent syllabus, assignment, and exam messages from your Gmail inbox without leaving your study workspace.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {emails.map((msg) => (
                <div key={msg.id} className="py-3 space-y-0.5">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {msg.subject}
                    </p>
                    <span className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">
                      {msg.date.slice(0, 16)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {msg.from}
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-1">
                    {msg.snippet}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

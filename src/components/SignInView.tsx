import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  BookOpen,
  Calculator,
  Check,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  Pause,
  Play,
  RotateCcw,
  Sun,
  Moon,
  Users,
} from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';
import { computeRequiredGpa } from '../lib/gpa.ts';
import { soundEngine } from '../lib/soundscape.ts';
import { AmbientBubbles } from './AmbientBubbles.tsx';

interface SignInViewProps {
  onSignIn: () => void;
  isSigningIn: boolean;
  errorMessage?: string | null;
  pendingInviteCode?: string | null;
  darkMode?: boolean;
  onToggleDarkMode?: () => void;
  onOpenLegal?: (mode: 'privacy' | 'terms') => void;
}

function formatTimerClock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export const SignInView: React.FC<SignInViewProps> = ({
  onSignIn,
  isSigningIn,
  errorMessage,
  pendingInviteCode,
  darkMode = false,
  onToggleDarkMode,
  onOpenLegal,
}) => {
  // Public Guest Focus Timer (works without login!)
  const [guestTargetMins, setGuestTargetMins] = useState(25);
  const [guestRemaining, setGuestRemaining] = useState(25 * 60);
  const [guestRunning, setGuestRunning] = useState(false);

  // Public Guest Target-CGPA Quick Calculator (works without login!)
  const [guestScale, setGuestScale] = useState<'bd' | 'us'>('bd');
  const [currentCgpa, setCurrentCgpa] = useState('3.45');
  const [completedCr, setCompletedCr] = useState('60');
  const [targetCgpa, setTargetCgpa] = useState('3.65');
  const [remainingCr, setRemainingCr] = useState('30');
  const [copiedHost, setCopiedHost] = useState(false);

  const currentHost = typeof window !== 'undefined' ? window.location.hostname : '';
  const isUnauthorizedDomainError =
    Boolean(errorMessage) &&
    (errorMessage?.includes('unauthorized-domain') ||
      errorMessage?.includes('not authorized in Firebase Authentication'));

  useEffect(() => {
    if (!guestRunning) return;
    const id = setInterval(() => {
      setGuestRemaining((prev) => {
        if (prev <= 1) {
          setGuestRunning(false);
          soundEngine.playGentleChime();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [guestRunning]);

  const guestRequired = useMemo(
    () =>
      computeRequiredGpa(
        Math.max(0, Math.min(4.0, Number(currentCgpa) || 0)),
        Math.max(0, Number(completedCr) || 0),
        Math.max(0, Math.min(4.0, Number(targetCgpa) || 0)),
        Math.max(0, Number(remainingCr) || 0)
      ),
    [completedCr, currentCgpa, remainingCr, targetCgpa]
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50/40 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between relative overflow-x-hidden">
      <AmbientBubbles mode="subtle" darkMode={darkMode} />

      <header className="w-full max-w-6xl mx-auto px-6 py-5 flex items-center justify-between border-b border-white/50 dark:border-slate-800/80 relative z-10 backdrop-blur-md">
        <span className="font-display text-lg font-bold tracking-tight whitespace-nowrap shrink-0">
          Study Tracker
        </span>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline text-xs text-slate-500 dark:text-slate-400">
            University Academic Workspace
          </span>
          {onToggleDarkMode && (
            <button
              type="button"
              onClick={onToggleDarkMode}
              className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-lg transition-colors"
              aria-label="Toggle color theme"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={onSignIn}
            disabled={isSigningIn}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
          >
            {isSigningIn ? 'Signing in...' : 'Sign In'}
          </button>
        </div>
      </header>

      <main className="w-full max-w-6xl mx-auto px-6 py-10 space-y-12 relative z-10">
        {pendingInviteCode && (
          <div className="glass-panel rounded-xl px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <p className="text-sm text-slate-800 dark:text-slate-100">
              You opened a friend invite link with code{' '}
              <span className="font-mono font-semibold text-blue-700 dark:text-blue-300">
                {pendingInviteCode}
              </span>
              . Sign in with Google to send your friend request.
            </p>
            <button
              type="button"
              onClick={onSignIn}
              disabled={isSigningIn}
              className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap self-start"
            >
              Sign in & Connect
            </button>
          </div>
        )}

        {/* Asymmetric Hero Section with Generated Editorial Study Image */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6 space-y-6"
          >
            <h1
              className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-slate-900 dark:text-slate-50 leading-tight"
              style={{ textWrap: 'balance' }}
            >
              Your courses, study streaks, notes, and CGPA in one calm glass workspace.
            </h1>
            <p className="text-base text-slate-600 dark:text-slate-300 leading-relaxed max-w-xl">
              Track syllabus topics, run focus timers, share PDFs in WhatsApp-style study groups, and project your CGPA privately. No account yet or blocked from Google login? Use the free Guest Focus Timer & CGPA Calculator right below.
            </p>

            <div className="pt-1 space-y-3">
              <button
                type="button"
                onClick={onSignIn}
                disabled={isSigningIn}
                className="gsi-material-button"
              >
                <div className="gsi-material-button-content-wrapper">
                  <div className="gsi-material-button-icon">
                    <svg
                      version="1.1"
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 48 48"
                      style={{ display: 'block' }}
                    >
                      <path
                        fill="#EA4335"
                        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                      />
                      <path
                        fill="#4285F4"
                        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                      />
                      <path
                        fill="#34A853"
                        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                      />
                      <path fill="none" d="M0 0h48v48H0z" />
                    </svg>
                  </div>
                  <span>{isSigningIn ? 'Signing in...' : 'Sign in with Google'}</span>
                </div>
              </button>

              {errorMessage && (
                <div className="glass-subtle border border-red-200 dark:border-red-900/60 rounded-xl p-3.5 space-y-2.5 text-sm text-red-700 dark:text-red-300">
                  <p>{errorMessage}</p>
                  {isUnauthorizedDomainError && currentHost && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(currentHost).then(() => {
                            setCopiedHost(true);
                            setTimeout(() => setCopiedHost(false), 2000);
                          });
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono font-medium bg-white/90 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 rounded-md hover:bg-white"
                      >
                        {copiedHost ? (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        {copiedHost ? 'Copied!' : `Copy "${currentHost}"`}
                      </button>
                      <a
                        href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/settings`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-md"
                      >
                        Open Firebase Authorized Domains
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  )}
                </div>
              )}
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Tip: If sign-in is blocked by popup blockers or a restricted university email, allow popups or use the guest tools below.
              </p>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.4, delay: 0.08, ease: [0.16, 1, 0.3, 1] }}
            className="lg:col-span-6"
          >
            <div className="glass-panel rounded-2xl p-3">
              <div className="relative overflow-hidden rounded-xl aspect-video bg-slate-900">
                <img
                  src="/src/assets/images/study_home_hero_1794905802815.jpg"
                  alt="Calm dusk university study desk beside a rain-streaked window with notebook and analytics screen"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="px-2 pt-3 pb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span>Private CGPA · 2 GB Drive PDFs · Real-Time Study Groups</span>
                <span className="font-mono text-blue-600 dark:text-blue-400">
                  Drive · Gmail · Tasks · Forms
                </span>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Guest Study Tools (Immediately usable without logging in) */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, delay: 0.14, ease: [0.16, 1, 0.3, 1] }}
          className="space-y-4"
        >
          <div>
            <h2 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">
              No-Login Guest Study Tools
            </h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Can&apos;t sign in right now? Run a Pomodoro focus block or calculate your target CGPA directly in your browser.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Guest Pomodoro Timer */}
            <div className="lg:col-span-5 glass-panel rounded-2xl p-6 flex flex-col justify-between space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Guest Focus Timer
                  </h3>
                </div>
                <div className="flex items-center gap-1 p-1 glass-subtle rounded-lg">
                  {[25, 50].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setGuestRunning(false);
                        setGuestTargetMins(m);
                        setGuestRemaining(m * 60);
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                        guestTargetMins === m
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {m}m
                    </button>
                  ))}
                </div>
              </div>

              <div className="py-4 border-y border-slate-200/60 dark:border-slate-800/70 text-center">
                <div className="font-mono text-5xl font-semibold tabular-nums tracking-tight text-slate-900 dark:text-slate-50">
                  {formatTimerClock(guestRemaining)}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  {guestRemaining === 0
                    ? 'Focus block complete — stretch & hydrate'
                    : `${guestTargetMins}-minute focus block`}
                </div>
              </div>

              <div className="flex items-center justify-center gap-3">
                {!guestRunning ? (
                  <button
                    type="button"
                    onClick={() => {
                      if (guestRemaining === 0) setGuestRemaining(guestTargetMins * 60);
                      setGuestRunning(true);
                    }}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                  >
                    <Play className="w-4 h-4" />
                    {guestRemaining < guestTargetMins * 60 && guestRemaining > 0
                      ? 'Resume'
                      : 'Start Timer'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setGuestRunning(false)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-800 dark:text-slate-100 bg-white/80 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    <Pause className="w-4 h-4" />
                    Pause
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setGuestRunning(false);
                    setGuestRemaining(guestTargetMins * 60);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset
                </button>
              </div>
            </div>

            {/* Guest Target-CGPA Calculator */}
            <div className="lg:col-span-7 glass-panel rounded-2xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Calculator className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                    Quick Target-CGPA Calculator
                  </h3>
                </div>
                <div className="flex items-center gap-1 p-1 glass-subtle rounded-lg">
                  <button
                    type="button"
                    onClick={() => setGuestScale('bd')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md ${
                      guestScale === 'bd'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                        : 'text-slate-500'
                    }`}
                  >
                    Bangladesh 4.00
                  </button>
                  <button
                    type="button"
                    onClick={() => setGuestScale('us')}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md ${
                      guestScale === 'us'
                        ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                        : 'text-slate-500'
                    }`}
                  >
                    US 4.0
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Current CGPA
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="4"
                    value={currentCgpa}
                    onChange={(e) => setCurrentCgpa(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Completed Credits
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="300"
                    value={completedCr}
                    onChange={(e) => setCompletedCr(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Target CGPA
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="4"
                    value={targetCgpa}
                    onChange={(e) => setTargetCgpa(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-slate-500 mb-1">
                    Remaining Credits
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="200"
                    value={remainingCr}
                    onChange={(e) => setRemainingCr(e.target.value)}
                    className="w-full px-3 py-1.5 text-sm font-mono tabular-nums bg-white/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                </div>
              </div>

              <div className="p-4 glass-subtle rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    Required GPA across remaining {remainingCr} credits ({guestScale === 'bd' ? 'BD 4.00' : 'US 4.0'})
                  </div>
                  <div className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                    {guestRequired.feasible
                      ? 'Achievable with consistent semester performance.'
                      : 'Target exceeds the 4.00 ceiling — adjust target or remaining credits.'}
                  </div>
                </div>
                <div
                  className={`font-mono text-3xl font-bold tabular-nums shrink-0 ${
                    guestRequired.feasible
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-red-600 dark:text-red-400'
                  }`}
                >
                  {Math.max(0, guestRequired.requiredGpa).toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </motion.section>

        {/* Workspace Feature Overview Cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <div className="glass-panel rounded-xl p-5 space-y-2">
            <BookOpen className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Courses, Visual Charts & Tasks
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Track todo/doing/done topics, inspect 7-day study pace & 28-day consistency maps, and sync deadlines with Google Tasks.
            </p>
          </div>
          <div className="glass-panel rounded-xl p-5 space-y-2">
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Notes, 2 GB Drive PDFs &amp; Study Groups
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Write dot-terminated notes, import/export with Google Drive, and share PDFs inside WhatsApp-style course study groups.
            </p>
          </div>
          <div className="glass-panel rounded-xl p-5 space-y-2">
            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Invite Links, Leaderboard & Forms
            </h3>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              Invite classmates with direct links + codes, compare study hours (grades stay private), and send feature requests via Google Forms.
            </p>
          </div>
        </section>
      </main>

      <footer className="w-full max-w-6xl mx-auto px-6 py-5 border-t border-white/50 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2 relative z-10">
        <span>Study Tracker · University Academic Workspace</span>
        <div className="flex flex-wrap items-center gap-4">
          <a
            href="/privacy"
            onClick={(e) => {
              if (onOpenLegal) {
                e.preventDefault();
                onOpenLegal('privacy');
              }
            }}
            className="text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 underline underline-offset-2"
          >
            Privacy Policy
          </a>
          <a
            href="/terms"
            onClick={(e) => {
              if (onOpenLegal) {
                e.preventDefault();
                onOpenLegal('terms');
              }
            }}
            className="text-slate-600 dark:text-slate-300 hover:text-blue-600 dark:hover:text-blue-400 underline underline-offset-2"
          >
            Terms of Service
          </a>
          <span>Private grades · Guest tools ready</span>
        </div>
      </footer>
    </div>
  );
};

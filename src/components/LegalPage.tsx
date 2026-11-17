import React from 'react';
import { ArrowLeft, Lock, ShieldCheck } from 'lucide-react';
import { ADMIN_SUPPORT_EMAIL } from '../lib/types.ts';
import { AmbientBubbles } from './AmbientBubbles.tsx';

export type LegalDocMode = 'privacy' | 'terms';

interface LegalPageProps {
  mode: LegalDocMode;
  onNavigateHome: () => void;
  onSwitchMode: (mode: LegalDocMode) => void;
}

export const LegalPage: React.FC<LegalPageProps> = ({
  mode,
  onNavigateHome,
  onSwitchMode,
}) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50/40 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100 flex flex-col justify-between relative overflow-x-hidden">
      <AmbientBubbles mode="subtle" darkMode={false} />

      <header className="w-full max-w-4xl mx-auto px-6 py-5 flex items-center justify-between border-b border-white/50 dark:border-slate-800/80 relative z-10 backdrop-blur-md">
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onNavigateHome();
          }}
          className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50"
        >
          Study Tracker
        </a>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onSwitchMode('privacy')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              mode === 'privacy'
                ? 'bg-blue-600 text-white'
                : 'glass-subtle text-slate-700 dark:text-slate-200'
            }`}
          >
            Privacy Policy
          </button>
          <button
            type="button"
            onClick={() => onSwitchMode('terms')}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              mode === 'terms'
                ? 'bg-blue-600 text-white'
                : 'glass-subtle text-slate-700 dark:text-slate-200'
            }`}
          >
            Terms of Service
          </button>
          <button
            type="button"
            onClick={onNavigateHome}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium glass-subtle rounded-lg text-slate-700 dark:text-slate-200 hover:bg-white/80"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Home
          </button>
        </div>
      </header>

      <main className="w-full max-w-4xl mx-auto px-6 py-10 relative z-10 flex-1">
        <article className="glass-panel rounded-2xl p-6 sm:p-8 space-y-6">
          {mode === 'privacy' ? (
            <>
              <div className="flex items-center gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
                <ShieldCheck className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0" />
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
                    Privacy Policy — Study Tracker
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Effective Date: November 17, 2026 · Contact: {ADMIN_SUPPORT_EMAIL}
                  </p>
                </div>
              </div>

              <section className="space-y-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  1. Information We Collect
                </h2>
                <p>
                  When you sign in to Study Tracker using Google Authentication, we receive your basic account profile (name, email address, and profile photo) to create and secure your personal academic workspace.
                </p>
                <p>
                  Inside the workspace, you may optionally store courses, syllabus topics, study session logs, CGPA inputs, text notes, uploaded study files, friend connections, and study group messages. Guest tools on the homepage (Focus Timer and Target-CGPA Calculator) run locally in your browser without requiring sign-in or server storage.
                </p>
              </section>

              <section className="space-y-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  2. How We Use Information &amp; Grade Privacy
                </h2>
                <p>
                  Your academic grades and CGPA calculations are strictly private to your account and are never shared with friends, study groups, or third parties. Only anonymized study activity metrics (weekly study minutes, streak, and syllabus completion count) are shared when you explicitly accept friend connections or join a study group.
                </p>
              </section>

              <section className="space-y-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  3. Optional Google Workspace API Access
                </h2>
                <p>
                  Study Tracker offers optional integrations with Google Drive, Gmail, Google Tasks, and Google Forms. Access tokens are requested only when you click a Workspace integration action, kept strictly in browser memory for the active session, and never persisted to browser storage or sold to third parties.
                </p>
                <p>
                  Study Tracker&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{' '}
                  <a
                    href="https://developers.google.com/terms/api-services-user-data-policy"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 underline"
                  >
                    Google API Services User Data Policy
                  </a>
                  , including the Limited Use requirements.
                </p>
              </section>

              <section className="space-y-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  4. Data Storage, Security &amp; Deletion
                </h2>
                <p>
                  Application records are stored in Google Cloud Firestore protected by Firebase Authentication and per-user security rules. You may delete your courses, notes, sessions, or leave study groups at any time inside the app, or request full account data deletion by emailing{' '}
                  <a
                    href={`mailto:${ADMIN_SUPPORT_EMAIL}`}
                    className="text-blue-600 dark:text-blue-400 underline"
                  >
                    {ADMIN_SUPPORT_EMAIL}
                  </a>
                  .
                </p>
              </section>
            </>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-slate-200/70 dark:border-slate-800 pb-4">
                <Lock className="w-6 h-6 text-blue-600 dark:text-blue-400 shrink-0" />
                <div>
                  <h1 className="font-display text-2xl font-bold text-slate-900 dark:text-slate-50">
                    Terms of Service — Study Tracker
                  </h1>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Effective Date: November 17, 2026 · Support: {ADMIN_SUPPORT_EMAIL}
                  </p>
                </div>
              </div>

              <section className="space-y-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  1. Acceptable Academic Use
                </h2>
                <p>
                  Study Tracker is provided as a personal university study planner, focus timer, GPA projection tool, and collaborative note-sharing workspace. You are responsible for the files and messages you upload or share in study groups.
                </p>
              </section>

              <section className="space-y-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  2. Availability &amp; Support
                </h2>
                <p>
                  The workspace is provided &quot;as is&quot; for educational productivity. Always retain personal backups of critical academic documents. For support or feature requests, contact{' '}
                  <a
                    href={`mailto:${ADMIN_SUPPORT_EMAIL}`}
                    className="text-blue-600 dark:text-blue-400 underline"
                  >
                    {ADMIN_SUPPORT_EMAIL}
                  </a>
                  .
                </p>
              </section>
            </>
          )}
        </article>
      </main>

      <footer className="w-full max-w-4xl mx-auto px-6 py-5 border-t border-white/50 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between relative z-10">
        <span>Study Tracker · {ADMIN_SUPPORT_EMAIL}</span>
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            onNavigateHome();
          }}
          className="text-blue-600 dark:text-blue-400 hover:underline"
        >
          Return to Home
        </a>
      </footer>
    </div>
  );
};

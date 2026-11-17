import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Calculator,
  Database,
  Download,
  Radar,
  Sparkles,
} from 'lucide-react';
import { computeGpaReport, getMidtermPercent } from '../lib/gpa.ts';
import { downloadWeeklySeabornPdf } from '../lib/reports.ts';
import { computeStreakDays, computeWeeklyMinutes } from '../lib/studyData.ts';
import {
  Course,
  NavSection,
  NoteOrFile,
  StudySession,
  SyllabusTopic,
  UserProfile,
} from '../lib/types.ts';

interface FuturisticTelemetryPanelProps {
  profile: UserProfile;
  courses: Course[];
  topics: SyllabusTopic[];
  sessions: StudySession[];
  notes: NoteOrFile[];
  onNavigate?: (section: NavSection) => void;
  onNotify?: (msg: string) => void;
}

export const FuturisticTelemetryPanel: React.FC<FuturisticTelemetryPanelProps> = ({
  profile,
  courses,
  topics,
  sessions,
  notes,
  onNavigate,
  onNotify,
}) => {
  const [downloadingPdf, setDownloadingPdf] = useState(false);

  const telemetry = useMemo(() => {
    const gpaReport = computeGpaReport(courses, profile.gradingScale, undefined, {
      priorCgpa: profile.priorCgpa,
      priorCredits: profile.priorCredits,
    });
    const weeklyMinutes = computeWeeklyMinutes(sessions);
    const goalMinutes = Math.max(30, profile.weeklyGoalMinutes || 600);
    const streakDays = computeStreakDays(sessions);

    const doneTopics = topics.filter((t) => t.status === 'done').length;
    const totalTopics = topics.length;
    const syllabusPct = totalTopics > 0 ? Math.round((doneTopics / totalTopics) * 100) : 0;

    // 14-day active days consistency
    const daySet14 = new Set<string>();
    const cutoff14 = Date.now() - 14 * 86400000;
    for (const s of sessions) {
      const t = Date.parse(s.startedAt || '');
      if (!Number.isNaN(t) && t >= cutoff14) {
        daySet14.add((s.startedAt || '').slice(0, 10));
      }
    }
    const consistencyPct = Math.round((daySet14.size / 14) * 100);

    // Midterm average across courses with scores
    const midtermPcts = courses
      .map((c) => getMidtermPercent(c))
      .filter((v): v is number => v !== null);
    const midtermAvg =
      midtermPcts.length > 0
        ? Math.round(midtermPcts.reduce((a, b) => a + b, 0) / midtermPcts.length)
        : Math.min(100, Math.round((streakDays / 7) * 100));

    const cgpaPct =
      gpaReport.completedCredits > 0 ? Math.min(100, Math.round((gpaReport.cgpa / 4.0) * 100)) : 0;
    const pacePct = Math.min(100, Math.round((weeklyMinutes / goalMinutes) * 100));

    const axes = [
      { label: 'CGPA 4.00', value: cgpaPct, display: gpaReport.completedCredits > 0 ? gpaReport.cgpa.toFixed(2) : '—' },
      { label: 'Weekly Pace', value: pacePct, display: `${pacePct}%` },
      { label: 'Syllabus', value: syllabusPct, display: `${syllabusPct}%` },
      { label: 'Consistency', value: consistencyPct, display: `${daySet14.size}/14d` },
      {
        label: midtermPcts.length > 0 ? 'Midterms' : '7d Streak',
        value: midtermAvg,
        display: midtermPcts.length > 0 ? `${midtermAvg}%` : `${streakDays}d`,
      },
    ];

    const avgSessionMins =
      sessions.length > 0
        ? Math.round(
            sessions.reduce((acc, s) => acc + (Number(s.durationMinutes) || 0), 0) /
              sessions.length
          )
        : 0;

    let standing = 'No Graded Credits';
    if (gpaReport.completedCredits > 0) {
      if (gpaReport.cgpa >= 3.85) standing = 'Summa / First Class Honors';
      else if (gpaReport.cgpa >= 3.5) standing = "Dean's Honors Standing";
      else if (gpaReport.cgpa >= 3.0) standing = 'Good Academic Standing';
      else standing = 'Recovery & Focus Mode';
    }

    return {
      gpaReport,
      weeklyMinutes,
      goalMinutes,
      streakDays,
      avgSessionMins,
      standing,
      axes,
      cgpaPct,
      pacePct,
    };
  }, [courses, profile.gradingScale, profile.priorCgpa, profile.priorCredits, profile.weeklyGoalMinutes, sessions, topics]);

  // Compute SVG Radar Polygon points
  const radarSize = 230;
  const cx = radarSize / 2;
  const cy = radarSize / 2;
  const maxR = 74;
  const angleStep = (Math.PI * 2) / 5;

  const getPoint = (idx: number, pct: number) => {
    const angle = -Math.PI / 2 + idx * angleStep;
    const r = (Math.max(8, pct) / 100) * maxR;
    return {
      x: cx + r * Math.cos(angle),
      y: cy + r * Math.sin(angle),
      lx: cx + (maxR + 24) * Math.cos(angle),
      ly: cy + (maxR + 20) * Math.sin(angle),
      outerX: cx + maxR * Math.cos(angle),
      outerY: cy + maxR * Math.sin(angle),
    };
  };

  const dataPolygon = telemetry.axes
    .map((ax, i) => {
      const pt = getPoint(i, ax.value);
      return `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`;
    })
    .join(' ');

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      await downloadWeeklySeabornPdf({
        profile,
        courses,
        topics,
        sessions,
        notes,
      });
      onNotify?.('Weekly Performance PDF generated with Python Seaborn & downloaded.');
    } catch (err) {
      onNotify?.(
        err instanceof Error ? err.message : 'Failed to generate weekly performance PDF.'
      );
    } finally {
      setDownloadingPdf(false);
    }
  };

  return (
    <section
      aria-label="Academic Telemetry and Seaborn PDF Studio"
      className="relative overflow-hidden rounded-2xl border border-cyan-500/25 dark:border-cyan-400/20 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 text-slate-100 p-6 shadow-lg"
    >
      {/* Subtle geometric futuristic grid overlay */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            'linear-gradient(to right, rgba(56,189,248,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(56,189,248,0.12) 1px, transparent 1px)',
          backgroundSize: '28px 28px',
        }}
      />

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        {/* Left: 5-Axis Holographic Academic Radar */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center">
          <div className="w-full flex items-center justify-between text-xs text-cyan-300/90 font-mono mb-2">
            <span className="inline-flex items-center gap-1.5">
              <Radar className="w-3.5 h-3.5" />
              5-Axis Performance Radar
            </span>
            <span className="text-slate-400 tabular-nums">Live Sync</span>
          </div>

          <svg
            viewBox={`0 0 ${radarSize} ${radarSize}`}
            className="w-full max-w-[250px] h-auto"
            role="img"
            aria-label="5-axis academic performance radar"
          >
            {[25, 50, 75, 100].map((ring) => {
              const pts = telemetry.axes
                .map((_, idx) => {
                  const p = getPoint(idx, ring);
                  return `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
                })
                .join(' ');
              return (
                <polygon
                  key={ring}
                  points={pts}
                  fill="none"
                  stroke="rgba(148,163,184,0.22)"
                  strokeWidth="1"
                />
              );
            })}

            {telemetry.axes.map((ax, idx) => {
              const p = getPoint(idx, 100);
              return (
                <g key={ax.label}>
                  <line
                    x1={cx}
                    y1={cy}
                    x2={p.outerX}
                    y2={p.outerY}
                    stroke="rgba(148,163,184,0.24)"
                    strokeWidth="1"
                  />
                  <text
                    x={p.lx}
                    y={p.ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-slate-300 text-[8.5px] font-mono"
                  >
                    {ax.label}
                  </text>
                  <text
                    x={p.lx}
                    y={p.ly + 10}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-cyan-300 text-[8.5px] font-mono font-bold"
                  >
                    {ax.display}
                  </text>
                </g>
              );
            })}

            <motion.polygon
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
              points={dataPolygon}
              fill="rgba(6, 182, 212, 0.25)"
              stroke="#22d3ee"
              strokeWidth="2"
              style={{ transformOrigin: `${cx}px ${cy}px` }}
            />

            {telemetry.axes.map((ax, idx) => {
              const pt = getPoint(idx, ax.value);
              return (
                <circle
                  key={`${ax.label}-dot`}
                  cx={pt.x}
                  cy={pt.y}
                  r="3.2"
                  fill="#38bdf8"
                  stroke="#0f172a"
                  strokeWidth="1.2"
                />
              );
            })}
          </svg>
        </div>

        {/* Right: CGPA 4.00 Standing + Persistent Cloud Sync + Seaborn PDF Export */}
        <div className="lg:col-span-7 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-mono text-cyan-300">
                <Sparkles className="w-3.5 h-3.5" />
                Academic Telemetry &amp; Seaborn Report Engine
              </div>
              <h2 className="font-display text-lg sm:text-xl font-bold text-white mt-1">
                Weekly Performance &amp; CGPA 4.00 Studio
              </h2>
              <p className="text-xs text-slate-300 mt-1">
                Download a multi-page vector PDF built with Python Seaborn &amp; Matplotlib containing your 7-day pace, 28-day heatmap, CGPA 4.00 trajectory, courses, sessions, and notes.
              </p>
            </div>
          </div>

          {/* 4.00 CGPA Scale Progress Bar */}
          <div className="p-4 rounded-xl bg-slate-900/75 border border-slate-700/60 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-medium text-slate-300">
                Cumulative CGPA Standing ({profile.gradingScale === 'bd' ? 'BD 4.00' : 'US 4.00'})
              </span>
              <span className="font-mono font-bold text-cyan-300 tabular-nums">
                {telemetry.gpaReport.completedCredits > 0
                  ? `${telemetry.gpaReport.cgpa.toFixed(2)} / 4.00`
                  : '0.00 / 4.00'}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-slate-800 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-emerald-400 transition-all duration-500"
                style={{ width: `${telemetry.cgpaPct}%` }}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400 tabular-nums">
              <span>{telemetry.standing}</span>
              <span className="font-mono">
                {telemetry.gpaReport.completedCredits} credits · Avg session {telemetry.avgSessionMins}m
              </span>
            </div>
          </div>

          {/* Action Row */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                disabled={downloadingPdf}
                onClick={() => void handleDownloadPdf()}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-950 bg-gradient-to-r from-cyan-400 to-sky-400 hover:from-cyan-300 hover:to-sky-300 rounded-xl shadow-sm transition-all disabled:opacity-60 whitespace-nowrap"
              >
                <Download className={`w-4 h-4 ${downloadingPdf ? 'animate-bounce' : ''}`} />
                {downloadingPdf
                  ? 'Building Seaborn PDF...'
                  : 'Download Weekly Report (Seaborn PDF)'}
              </button>

              {onNavigate && (
                <button
                  type="button"
                  onClick={() => onNavigate('cgpa')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-medium text-slate-200 bg-slate-800/80 hover:bg-slate-800 border border-slate-700 rounded-xl transition-colors whitespace-nowrap"
                >
                  <Calculator className="w-3.5 h-3.5 text-cyan-400" />
                  CGPA 4.00 Lab
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
              <Database className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Firestore Persistent · Updates Safe</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

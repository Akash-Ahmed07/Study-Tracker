import React, { useMemo } from 'react';
import { SemesterGpaSummary } from '../lib/gpa.ts';
import { Course, StudySession, SyllabusTopic } from '../lib/types.ts';

// 1. Overview: 7-Day Pace Chart + Course Distribution Ring + Syllabus Stacked Bar
export const StudyOverviewCharts: React.FC<{
  courses: Course[];
  topics: SyllabusTopic[];
  sessions: StudySession[];
  weeklyGoalMinutes: number;
}> = ({ courses, topics, sessions, weeklyGoalMinutes }) => {
  const dailyTarget = Math.max(15, Math.round((weeklyGoalMinutes || 600) / 7));

  const last7Days = useMemo(() => {
    const out: { key: string; label: string; minutes: number }[] = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      const label = d.toLocaleDateString(undefined, { weekday: 'short' });
      const minutes = sessions
        .filter((s) => (s.startedAt || '').slice(0, 10) === key)
        .reduce((sum, s) => sum + (Number(s.durationMinutes) || 0), 0);
      out.push({ key, label, minutes });
    }
    return out;
  }, [sessions]);

  const maxDayMins = Math.max(dailyTarget, ...last7Days.map((d) => d.minutes), 60);

  const courseBreakdown = useMemo(() => {
    const palette = ['#2563eb', '#059669', '#d97706', '#7c3aed', '#db2777', '#0891b2'];
    const totals = new Map<string, { code: string; minutes: number; color: string }>();

    sessions.forEach((s) => {
      const code = s.courseCode || 'GENERAL';
      const matchingCourse = courses.find((c) => c.id === s.courseId || c.code === code);
      const existing = totals.get(code);
      const color =
        matchingCourse?.color ||
        palette[Array.from(code).reduce((a, ch) => a + ch.charCodeAt(0), 0) % palette.length];

      if (existing) {
        existing.minutes += Number(s.durationMinutes) || 0;
      } else {
        totals.set(code, {
          code,
          minutes: Number(s.durationMinutes) || 0,
          color,
        });
      }
    });

    const sorted = Array.from(totals.values()).sort((a, b) => b.minutes - a.minutes);
    const totalMinutes = sorted.reduce((acc, item) => acc + item.minutes, 0);
    return { items: sorted.slice(0, 5), totalMinutes };
  }, [courses, sessions]);

  const topicStats = useMemo(() => {
    const done = topics.filter((t) => t.status === 'done').length;
    const doing = topics.filter((t) => t.status === 'doing').length;
    const todo = topics.filter((t) => t.status === 'todo').length;
    const total = topics.length;
    return { done, doing, todo, total };
  }, [topics]);

  // Donut segments calculation (r = 40, circumference = 2 * pi * 40 ≈ 251.33)
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  let runningOffset = 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* 7-Day Study Pace Bar Chart */}
      <div className="lg:col-span-7 glass-panel rounded-xl p-6 flex flex-col justify-between space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              7-Day Study Pace
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Daily focus minutes compared to {dailyTarget} min/day target
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
            Target: {dailyTarget}m/d
          </span>
        </div>

        <div className="relative h-44 pt-4 flex items-end gap-3">
          {/* Dashed daily target guide */}
          <div
            className="absolute inset-x-0 border-t border-dashed border-amber-500/70 pointer-events-none"
            style={{
              bottom: `${24 + Math.min(100, Math.round((dailyTarget / maxDayMins) * 100)) * 1.15}px`,
            }}
          />
          {last7Days.map((day) => {
            const pct = Math.round((day.minutes / maxDayMins) * 100);
            const hitTarget = day.minutes >= dailyTarget;
            return (
              <div
                key={day.key}
                className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full"
                title={`${day.key}: ${day.minutes} minutes`}
              >
                <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 h-4">
                  {day.minutes > 0 ? `${day.minutes}m` : ''}
                </span>
                <div className="w-full max-w-[38px] h-[115px] bg-slate-100 dark:bg-slate-800/80 rounded-md flex items-end overflow-hidden">
                  <div
                    className={`w-full rounded-md transition-all duration-300 ${
                      hitTarget
                        ? 'bg-emerald-500 dark:bg-emerald-500'
                        : 'bg-blue-600 dark:bg-blue-500'
                    }`}
                    style={{
                      height: `${day.minutes > 0 ? Math.max(8, pct) : 0}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-slate-500 dark:text-slate-400">{day.label}</span>
              </div>
            );
          })}
        </div>

        {/* Syllabus Mastery Breakdown Bar */}
        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              Syllabus Distribution
            </span>
            <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {topicStats.done} Done · {topicStats.doing} Doing · {topicStats.todo} Todo
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-md overflow-hidden flex">
            {topicStats.total > 0 && (
              <>
                <div
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${(topicStats.done / topicStats.total) * 100}%` }}
                />
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{ width: `${(topicStats.doing / topicStats.total) * 100}%` }}
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Time by Course Donut Chart */}
      <div className="lg:col-span-5 glass-panel rounded-xl p-6 flex flex-col justify-between space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Time by Course
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Distribution across all logged study sessions
          </p>
        </div>

        {courseBreakdown.totalMinutes === 0 ? (
          <div className="py-12 text-center text-sm text-slate-500 dark:text-slate-400">
            Log a timer or manual study session to visualize your time split across courses.
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-center gap-6">
            <div className="relative w-32 h-32 shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 100 100" className="w-full h-full -rotate-90">
                <circle
                  cx="50"
                  cy="50"
                  r={radius}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="12"
                  className="text-slate-100 dark:text-slate-800"
                />
                {courseBreakdown.items.map((item) => {
                  const segLength =
                    (item.minutes / courseBreakdown.totalMinutes) * circumference;
                  const dashArray = `${segLength} ${circumference - segLength}`;
                  const dashOffset = -runningOffset;
                  runningOffset += segLength;
                  return (
                    <circle
                      key={item.code}
                      cx="50"
                      cy="50"
                      r={radius}
                      fill="none"
                      stroke={item.color}
                      strokeWidth="12"
                      strokeDasharray={dashArray}
                      strokeDashoffset={dashOffset}
                    />
                  );
                })}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-mono text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {(courseBreakdown.totalMinutes / 60).toFixed(1)}h
                </span>
                <span className="text-[10px] uppercase tracking-wider text-slate-500">
                  Total
                </span>
              </div>
            </div>

            <div className="flex-1 w-full space-y-2.5">
              {courseBreakdown.items.map((item) => {
                const pct = Math.round((item.minutes / courseBreakdown.totalMinutes) * 100);
                return (
                  <div key={item.code} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: item.color }}
                      />
                      <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                        {item.code}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400 shrink-0">
                      {(item.minutes / 60).toFixed(1)}h ({pct}%)
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// 2. Sessions: 28-Day Study Consistency Heatmap
export const StudyConsistencyHeatmap: React.FC<{ sessions: StudySession[] }> = ({ sessions }) => {
  const days = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of sessions) {
      const k = (s.startedAt || '').slice(0, 10);
      if (k) map.set(k, (map.get(k) || 0) + (Number(s.durationMinutes) || 0));
    }
    const list: { key: string; label: string; minutes: number }[] = [];
    for (let i = 27; i >= 0; i -= 1) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      list.push({
        key,
        label: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
        minutes: map.get(key) || 0,
      });
    }
    return list;
  }, [sessions]);

  const activeDays = days.filter((d) => d.minutes > 0).length;

  const toneForMinutes = (m: number) => {
    if (m === 0) return 'bg-slate-100 dark:bg-slate-800 text-slate-400';
    if (m < 30) return 'bg-blue-200 dark:bg-blue-900/70 text-blue-900 dark:text-blue-200';
    if (m < 90) return 'bg-blue-400 dark:bg-blue-700 text-white';
    return 'bg-blue-600 dark:bg-blue-500 text-white';
  };

  return (
    <div className="glass-panel rounded-xl p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            28-Day Consistency Map
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {activeDays} of last 28 days had logged study activity
          </p>
        </div>
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <span>Less</span>
          <span className="w-3 h-3 rounded-xs bg-slate-100 dark:bg-slate-800" />
          <span className="w-3 h-3 rounded-xs bg-blue-200 dark:bg-blue-900/70" />
          <span className="w-3 h-3 rounded-xs bg-blue-400 dark:bg-blue-700" />
          <span className="w-3 h-3 rounded-xs bg-blue-600 dark:bg-blue-500" />
          <span>More</span>
        </div>
      </div>

      <div className="grid grid-cols-7 sm:grid-cols-14 gap-2">
        {days.map((d) => (
          <div
            key={d.key}
            title={`${d.label}: ${d.minutes} min`}
            className={`h-9 rounded-md flex flex-col items-center justify-center text-[10px] font-mono tabular-nums ${toneForMinutes(
              d.minutes
            )}`}
          >
            <span>{d.key.slice(8)}</span>
            {d.minutes > 0 && <span className="text-[9px] opacity-90">{d.minutes}m</span>}
          </div>
        ))}
      </div>
    </div>
  );
};

// 3. CGPA: Semester SGPA & Cumulative CGPA Trajectory Chart
export const CgpaTrajectoryChart: React.FC<{
  semesters: SemesterGpaSummary[];
  targetCgpa: number;
}> = ({ semesters, targetCgpa }) => {
  const points = useMemo(() => {
    let cumCredits = 0;
    let cumGradePts = 0;
    return semesters.map((sem) => {
      cumCredits += sem.credits;
      cumGradePts += sem.sgpa * sem.credits;
      const cumCgpa = cumCredits > 0 ? cumGradePts / cumCredits : 0;
      return {
        semester: sem.semester,
        sgpa: sem.sgpa,
        cgpa: cumCgpa,
      };
    });
  }, [semesters]);

  if (points.length === 0) {
    return null;
  }

  const width = 620;
  const height = 210;
  const padX = 44;
  const padY = 22;
  const plotW = width - padX * 2;
  const plotH = height - padY * 2;

  const yForGpa = (gpa: number) => {
    const clamped = Math.max(0, Math.min(4.0, gpa));
    return padY + plotH - (clamped / 4.0) * plotH;
  };

  const xForIndex = (idx: number) => {
    if (points.length === 1) return padX + plotW / 2;
    return padX + (idx / (points.length - 1)) * plotW;
  };

  const sgpaLine = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xForIndex(i).toFixed(1)} ${yForGpa(p.sgpa).toFixed(1)}`)
    .join(' ');
  const cgpaLine = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${xForIndex(i).toFixed(1)} ${yForGpa(p.cgpa).toFixed(1)}`)
    .join(' ');
  const targetY = yForGpa(targetCgpa);

  return (
    <div className="glass-panel rounded-xl p-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Semester SGPA & Cumulative CGPA Trend
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Visual trajectory against your {targetCgpa.toFixed(2)} target GPA
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-blue-600 inline-block" />
            Cumulative CGPA
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 bg-emerald-500 inline-block" />
            Semester SGPA
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-3 h-0.5 border-t border-dashed border-amber-500 inline-block" />
            Target ({targetCgpa.toFixed(2)})
          </span>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[440px] h-52">
          {[1.0, 2.0, 3.0, 4.0].map((tick) => {
            const y = yForGpa(tick);
            return (
              <g key={tick}>
                <line
                  x1={padX}
                  y1={y}
                  x2={width - padX}
                  y2={y}
                  stroke="currentColor"
                  className="text-slate-100 dark:text-slate-800"
                />
                <text
                  x={padX - 8}
                  y={y + 3}
                  textAnchor="end"
                  className="fill-slate-400 text-[10px] font-mono"
                >
                  {tick.toFixed(1)}
                </text>
              </g>
            );
          })}

          {/* Target reference line */}
          <line
            x1={padX}
            y1={targetY}
            x2={width - padX}
            y2={targetY}
            stroke="#f59e0b"
            strokeWidth="1.5"
            strokeDasharray="4 4"
          />

          {points.length > 1 && (
            <>
              <path d={sgpaLine} fill="none" stroke="#10b981" strokeWidth="2" />
              <path d={cgpaLine} fill="none" stroke="#2563eb" strokeWidth="2.5" />
            </>
          )}

          {points.map((p, idx) => {
            const cx = xForIndex(idx);
            const cySgpa = yForGpa(p.sgpa);
            const cyCgpa = yForGpa(p.cgpa);
            return (
              <g key={p.semester}>
                <circle cx={cx} cy={cySgpa} r="4" fill="#10b981" />
                <circle cx={cx} cy={cyCgpa} r="4.5" fill="#2563eb" />
                <text
                  x={cx}
                  y={height - 4}
                  textAnchor="middle"
                  className="fill-slate-500 dark:fill-slate-400 text-[10px]"
                >
                  {p.semester}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
};

// 4. Friends: Visual Weekly Hours Comparison Bar Chart
export const FriendsHoursComparisonChart: React.FC<{
  rows: { uid: string; displayName: string; weeklyMinutes: number; isMe: boolean }[];
}> = ({ rows }) => {
  if (rows.length === 0) return null;
  const maxMins = Math.max(60, ...rows.map((r) => r.weeklyMinutes));

  return (
    <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
        Visual Hours Comparison
      </div>
      <div className="space-y-2">
        {rows.map((row) => {
          const pct = Math.round((row.weeklyMinutes / maxMins) * 100);
          return (
            <div key={row.uid} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="truncate font-medium text-slate-700 dark:text-slate-300">
                  {row.displayName}
                </span>
                <span className="font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {(row.weeklyMinutes / 60).toFixed(1)}h
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    row.isMe ? 'bg-blue-600' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${row.weeklyMinutes > 0 ? Math.max(4, pct) : 0}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

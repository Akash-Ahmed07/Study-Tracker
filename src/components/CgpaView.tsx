import React, { useEffect, useMemo, useState } from 'react';
import { History, Lock, Plus, RotateCcw, Save } from 'lucide-react';
import {
  computeGpaReport,
  computeRequiredGpa,
  getGradePoints,
  getMidtermPercent,
  getScaleEntries,
} from '../lib/gpa.ts';
import { saveCourse, updateUserPreferences } from '../lib/studyData.ts';
import { Course, GradingScale, UserProfile } from '../lib/types.ts';
import { CgpaTrajectoryChart } from './StudyCharts.tsx';

interface CgpaViewProps {
  profile: UserProfile;
  courses: Course[];
  onNotify: (msg: string) => void;
}

export const CgpaView: React.FC<CgpaViewProps> = ({ profile, courses, onNotify }) => {
  const [scale, setScale] = useState<GradingScale>(profile.gradingScale || 'bd');
  const [targetCgpa, setTargetCgpa] = useState('3.75');
  const [remainingCredits, setRemainingCredits] = useState('15');
  const [whatIfGrades, setWhatIfGrades] = useState<Record<string, string>>({});

  // Persisted Prior / Old Semesters Record
  const [priorCgpaInput, setPriorCgpaInput] = useState(
    typeof profile.priorCgpa === 'number' && profile.priorCgpa > 0
      ? String(profile.priorCgpa)
      : ''
  );
  const [priorCreditsInput, setPriorCreditsInput] = useState(
    typeof profile.priorCredits === 'number' && profile.priorCredits > 0
      ? String(profile.priorCredits)
      : ''
  );
  const [savingPrior, setSavingPrior] = useState(false);

  // Quick Upcoming / Planned Semester Course Adder
  const [showUpcomingForm, setShowUpcomingForm] = useState(false);
  const [upCode, setUpCode] = useState('');
  const [upTitle, setUpTitle] = useState('');
  const [upSemester, setUpSemester] = useState('Next Semester');
  const [upCredits, setUpCredits] = useState('3');
  const [savingUpcoming, setSavingUpcoming] = useState(false);

  useEffect(() => {
    setPriorCgpaInput(
      typeof profile.priorCgpa === 'number' && profile.priorCgpa > 0
        ? String(profile.priorCgpa)
        : ''
    );
    setPriorCreditsInput(
      typeof profile.priorCredits === 'number' && profile.priorCredits > 0
        ? String(profile.priorCredits)
        : ''
    );
  }, [profile.priorCgpa, profile.priorCredits]);

  const priorSummary = useMemo(
    () => ({
      priorCgpa: Math.max(0, Math.min(4, Number(priorCgpaInput) || 0)),
      priorCredits: Math.max(0, Math.min(400, Number(priorCreditsInput) || 0)),
    }),
    [priorCgpaInput, priorCreditsInput]
  );

  const scaleEntries = useMemo(() => getScaleEntries(scale), [scale]);
  const actualReport = useMemo(
    () => computeGpaReport(courses, scale, undefined, priorSummary),
    [courses, priorSummary, scale]
  );
  const projectedReport = useMemo(
    () => computeGpaReport(courses, scale, whatIfGrades, priorSummary),
    [courses, priorSummary, scale, whatIfGrades]
  );

  const targetCalc = useMemo(() => {
    return computeRequiredGpa(
      actualReport.cgpa,
      actualReport.completedCredits,
      Math.max(0, Math.min(4.0, Number(targetCgpa) || 0)),
      Math.max(0, Number(remainingCredits) || 0)
    );
  }, [actualReport.cgpa, actualReport.completedCredits, remainingCredits, targetCgpa]);

  const handleScaleChange = async (nextScale: GradingScale) => {
    setScale(nextScale);
    await updateUserPreferences(profile.uid, {
      displayName: profile.displayName,
      gradingScale: nextScale,
      weeklyGoalMinutes: profile.weeklyGoalMinutes,
      priorCgpa: priorSummary.priorCgpa,
      priorCredits: priorSummary.priorCredits,
    });
    onNotify(
      `Switched grading scale to ${nextScale === 'bd' ? 'Bangladesh 4.00' : 'US 4.0'}.`
    );
  };

  const handleSavePriorRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingPrior(true);
    try {
      await updateUserPreferences(profile.uid, {
        displayName: profile.displayName,
        gradingScale: scale,
        weeklyGoalMinutes: profile.weeklyGoalMinutes,
        priorCgpa: priorSummary.priorCgpa,
        priorCredits: priorSummary.priorCredits,
      });
      onNotify(
        `Saved old semesters record (${priorSummary.priorCgpa.toFixed(2)} CGPA across ${priorSummary.priorCredits} credits).`
      );
    } finally {
      setSavingPrior(false);
    }
  };

  const handleAddUpcomingCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!upCode.trim() || !upTitle.trim()) return;
    setSavingUpcoming(true);
    try {
      await saveCourse(profile.uid, {
        code: upCode.trim().toUpperCase(),
        title: upTitle.trim(),
        semester: upSemester.trim() || 'Upcoming',
        credits: Math.max(0.5, Math.min(20, Number(upCredits) || 3)),
        gradeLetter: '',
        isCompleted: false,
        color: '#2563EB',
      });
      setUpCode('');
      setUpTitle('');
      setShowUpcomingForm(false);
      onNotify('Added upcoming course. Pick a What-If grade below to project your new CGPA.');
    } finally {
      setSavingUpcoming(false);
    }
  };

  const handleCommitRealGrade = async (course: Course, letter: string) => {
    await saveCourse(
      profile.uid,
      {
        code: course.code,
        title: course.title,
        semester: course.semester,
        credits: course.credits,
        gradeLetter: letter,
        isCompleted: Boolean(letter),
        color: course.color,
        midtermScore: course.midtermScore,
        midtermMax: course.midtermMax,
      },
      course.id
    );
    onNotify(`Updated private grade for ${course.code}.`);
  };

  const cgpaDelta = projectedReport.cgpa - actualReport.cgpa;

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            CGPA, Old Semesters &amp; Upcoming Projections
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            Private to your account — combines saved prior semesters with current &amp; upcoming courses.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg shrink-0 self-start">
          <button
            type="button"
            onClick={() => void handleScaleChange('bd')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              scale === 'bd'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            Bangladesh 4.00
          </button>
          <button
            type="button"
            onClick={() => void handleScaleChange('us')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              scale === 'us'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            US 4.0
          </button>
        </div>
      </div>

      {/* Persisted Prior / Old Semesters Record */}
      <form
        onSubmit={(e) => void handleSavePriorRecord(e)}
        className="glass-panel rounded-xl p-5 flex flex-col lg:flex-row lg:items-end justify-between gap-4"
      >
        <div className="flex items-start gap-3">
          <History className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Old / Previous Semesters Record (Remembered Across Sessions)
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Enter your existing CGPA &amp; completed credits from earlier semesters so every new or upcoming course counts accurately.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3 shrink-0">
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Old CGPA
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              max="4"
              value={priorCgpaInput}
              onChange={(e) => setPriorCgpaInput(e.target.value)}
              placeholder="e.g. 3.45"
              className="w-28 px-3 py-1.5 text-sm font-mono tabular-nums bg-white/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
              Old Credits
            </label>
            <input
              type="number"
              step="0.5"
              min="0"
              max="400"
              value={priorCreditsInput}
              onChange={(e) => setPriorCreditsInput(e.target.value)}
              placeholder="e.g. 60"
              className="w-28 px-3 py-1.5 text-sm font-mono tabular-nums bg-white/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg"
            />
          </div>
          <button
            type="submit"
            disabled={savingPrior}
            className="inline-flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60 whitespace-nowrap"
          >
            <Save className="w-3.5 h-3.5" />
            {savingPrior ? 'Saving...' : 'Remember Old CGPA'}
          </button>
        </div>
      </form>

      {/* Top Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-panel rounded-xl p-5">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Cumulative CGPA (Old + Current)
          </span>
          <div className="mt-2 font-mono text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {actualReport.completedCredits > 0 ? actualReport.cgpa.toFixed(2) : '—'}
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {actualReport.completedCredits} total credits
            {actualReport.priorCredits > 0 ? ` (${actualReport.priorCredits} old + ${actualReport.completedCredits - actualReport.priorCredits} new)` : ''}
          </span>
        </div>

        <div className="glass-panel rounded-xl p-5">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Projected CGPA (with Upcoming What-If)
          </span>
          <div className="mt-2 font-mono text-3xl font-semibold tabular-nums text-blue-600 dark:text-blue-400">
            {projectedReport.completedCredits > 0 ? projectedReport.cgpa.toFixed(2) : '—'}
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {Object.keys(whatIfGrades).length > 0
              ? `${cgpaDelta >= 0 ? '+' : ''}${cgpaDelta.toFixed(2)} change (${projectedReport.completedCredits} cr)`
              : 'Pick grades on upcoming courses below'}
          </span>
        </div>

        <div className="glass-panel rounded-xl p-5">
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Required GPA for Target ({targetCgpa})
          </span>
          <div
            className={`mt-2 font-mono text-3xl font-semibold tabular-nums ${
              targetCalc.feasible
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {Number(remainingCredits) > 0 ? Math.max(0, targetCalc.requiredGpa).toFixed(2) : '—'}
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {targetCalc.feasible
              ? `Achievable across next ${remainingCredits} credits`
              : 'Exceeds 4.00 scale maximum'}
          </span>
        </div>
      </div>

      {/* Semester SGPA & CGPA Trajectory Visual */}
      <CgpaTrajectoryChart
        semesters={actualReport.semesters}
        targetCgpa={Math.max(0, Math.min(4.0, Number(targetCgpa) || 3.75))}
      />

      {/* Target Calculator + Scale Reference */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 glass-panel rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Target-CGPA Calculator
          </h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Target CGPA
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                max="4.0"
                value={targetCgpa}
                onChange={(e) => setTargetCgpa(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Remaining Credits
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="200"
                value={remainingCredits}
                onChange={(e) => setRemainingCredits(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-700 dark:text-slate-300">
            {Number(remainingCredits) <= 0 ? (
              'Enter remaining credits to compute required future GPA.'
            ) : targetCalc.requiredGpa <= 0 ? (
              'You have already exceeded your target CGPA.'
            ) : targetCalc.feasible ? (
              <span>
                You need an average GPA of{' '}
                <strong className="font-mono">{targetCalc.requiredGpa.toFixed(2)}</strong> over
                your remaining <strong className="font-mono">{remainingCredits}</strong> credits to
                reach <strong className="font-mono">{Number(targetCgpa).toFixed(2)}</strong>.
              </span>
            ) : (
              <span>
                Reaching <strong className="font-mono">{Number(targetCgpa).toFixed(2)}</strong>{' '}
                requires <strong className="font-mono">{targetCalc.requiredGpa.toFixed(2)}</strong>,
                which is above 4.00. Try increasing remaining credits or adjusting the target.
              </span>
            )}
          </div>

          {/* Semester SGPA Summary */}
          <div className="pt-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Semester SGPA Breakdown
            </h3>
            {actualReport.priorCredits === 0 && actualReport.semesters.length === 0 ? (
              <p className="text-xs text-slate-500">
                Save your prior CGPA above or assign grades to semester courses to see SGPA breakdown.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {actualReport.priorCredits > 0 && (
                  <div className="py-2 flex items-center justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-300">
                      Old Semesters (Saved) · {actualReport.priorCredits} cr
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {actualReport.priorCgpa.toFixed(2)}
                    </span>
                  </div>
                )}
                {actualReport.semesters.map((sem) => (
                  <div
                    key={sem.semester}
                    className="py-2 flex items-center justify-between text-sm"
                  >
                    <span className="text-slate-700 dark:text-slate-300">
                      {sem.semester} · {sem.credits} cr
                    </span>
                    <span className="font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                      {sem.sgpa.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Course Grades & What-If Simulator */}
        <div className="lg:col-span-7 glass-panel rounded-xl overflow-hidden flex flex-col">
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Current &amp; Upcoming Semester Projections
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Simulate grades for upcoming semesters or commit official grades.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowUpcomingForm((v) => !v)}
                className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Upcoming Course
              </button>
              {Object.keys(whatIfGrades).length > 0 && (
                <button
                  type="button"
                  onClick={() => setWhatIfGrades({})}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Reset What-If
                </button>
              )}
            </div>
          </div>

          {showUpcomingForm && (
            <form
              onSubmit={(e) => void handleAddUpcomingCourse(e)}
              className="p-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 grid grid-cols-1 sm:grid-cols-5 gap-2.5"
            >
              <input
                type="text"
                required
                value={upCode}
                onChange={(e) => setUpCode(e.target.value)}
                placeholder="CSE 410"
                className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
              <input
                type="text"
                required
                value={upTitle}
                onChange={(e) => setUpTitle(e.target.value)}
                placeholder="Course title"
                className="sm:col-span-2 px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
              <input
                type="text"
                value={upSemester}
                onChange={(e) => setUpSemester(e.target.value)}
                placeholder="Spring 2027"
                className="px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
              <div className="flex gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="20"
                  value={upCredits}
                  onChange={(e) => setUpCredits(e.target.value)}
                  className="w-16 px-2 py-1.5 text-xs font-mono tabular-nums bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
                <button
                  type="submit"
                  disabled={savingUpcoming}
                  className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60"
                >
                  Add
                </button>
              </div>
            </form>
          )}

          {courses.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              Add courses in Courses & Syllabus to manage grades and run projections.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-6 font-medium">Course</th>
                    <th className="py-3 px-3 font-medium text-right">Credits</th>
                    <th className="py-3 px-3 font-medium">Saved Grade</th>
                    <th className="py-3 px-6 font-medium">What-If Grade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {courses.map((course) => {
                    const simGrade = whatIfGrades[course.id] ?? '';
                    const pts = getGradePoints(simGrade || course.gradeLetter, scale);
                    const midPct = getMidtermPercent(course);
                    return (
                      <tr key={course.id}>
                        <td className="py-3 px-6">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {course.code}
                            </span>
                            {midPct !== null && (
                              <span
                                className={`font-mono text-[11px] tabular-nums ${
                                  midPct < 60
                                    ? 'text-red-600 dark:text-red-400 font-semibold'
                                    : 'text-emerald-600 dark:text-emerald-400'
                                }`}
                              >
                                Mid {midPct}%
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-slate-500 truncate max-w-[200px]">
                            {course.semester} · {course.title}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {course.credits}
                        </td>
                        <td className="py-3 px-3">
                          <select
                            value={course.isCompleted ? course.gradeLetter : ''}
                            onChange={(e) => void handleCommitRealGrade(course, e.target.value)}
                            className="px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md"
                          >
                            <option value="">In Progress</option>
                            {scaleEntries.map((entry) => (
                              <option key={entry.letter} value={entry.letter}>
                                {entry.letter} ({entry.points.toFixed(2)})
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3 px-6">
                          <div className="flex items-center gap-2">
                            <select
                              value={simGrade}
                              onChange={(e) => {
                                const val = e.target.value;
                                setWhatIfGrades((prev) => {
                                  const next = { ...prev };
                                  if (!val) delete next[course.id];
                                  else next[course.id] = val;
                                  return next;
                                });
                              }}
                              className="px-2.5 py-1.5 text-xs font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md"
                            >
                              <option value="">Use Saved</option>
                              {scaleEntries.map((entry) => (
                                <option key={entry.letter} value={entry.letter}>
                                  {entry.letter} ({entry.points.toFixed(2)})
                                </option>
                              ))}
                            </select>
                            {pts !== null && (
                              <span className="text-xs font-mono tabular-nums text-slate-400">
                                {pts.toFixed(2)}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Grading Scale Reference Table */}
      <div className="glass-panel rounded-xl p-6">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">
          {scale === 'bd' ? 'Bangladesh 4.00 Scale Reference' : 'US 4.0 Scale Reference'}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-5 lg:grid-cols-10 gap-3">
          {scaleEntries.map((entry) => (
            <div
              key={entry.letter}
              className="border border-slate-200 dark:border-slate-800 rounded-lg p-2.5 text-center"
            >
              <div className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                {entry.letter}
              </div>
              <div className="font-mono text-xs tabular-nums text-blue-600 dark:text-blue-400">
                {entry.points.toFixed(2)}
              </div>
              <div className="text-[11px] text-slate-500 mt-0.5">{entry.minMark}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

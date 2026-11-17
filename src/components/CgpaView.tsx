import React, { useMemo, useState } from 'react';
import { Lock, RotateCcw } from 'lucide-react';
import {
  computeGpaReport,
  computeRequiredGpa,
  getGradePoints,
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

  const scaleEntries = useMemo(() => getScaleEntries(scale), [scale]);
  const actualReport = useMemo(() => computeGpaReport(courses, scale), [courses, scale]);
  const projectedReport = useMemo(
    () => computeGpaReport(courses, scale, whatIfGrades),
    [courses, scale, whatIfGrades]
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
    });
    onNotify(
      `Switched grading scale to ${nextScale === 'bd' ? 'Bangladesh 4.00' : 'US 4.0'}.`
    );
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
            CGPA, Target & What-If Projections
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            Private to your account — friends never see your grades or CGPA.
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

      {/* Top Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-panel rounded-xl p-5">
          <span className="text-xs text-slate-500 dark:text-slate-400">Cumulative CGPA</span>
          <div className="mt-2 font-mono text-3xl font-semibold tabular-nums text-slate-900 dark:text-slate-50">
            {actualReport.completedCredits > 0 ? actualReport.cgpa.toFixed(2) : '—'}
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {actualReport.completedCredits} completed credits
          </span>
        </div>

        <div className="glass-panel rounded-xl p-5">
          <span className="text-xs text-slate-500 dark:text-slate-400">What-If Projected CGPA</span>
          <div className="mt-2 font-mono text-3xl font-semibold tabular-nums text-blue-600 dark:text-blue-400">
            {projectedReport.completedCredits > 0 ? projectedReport.cgpa.toFixed(2) : '—'}
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {Object.keys(whatIfGrades).length > 0
              ? `${cgpaDelta >= 0 ? '+' : ''}${cgpaDelta.toFixed(2)} vs actual (${projectedReport.completedCredits} cr)`
              : 'Adjust grades below to simulate'}
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
            {actualReport.semesters.length === 0 ? (
              <p className="text-xs text-slate-500">
                Assign grades to completed courses to see SGPA per semester.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
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
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Course Grades & What-If Projection
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Simulate hypothetical grades or save official completed grades.
              </p>
            </div>
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
                    return (
                      <tr key={course.id}>
                        <td className="py-3 px-6">
                          <div className="font-medium text-slate-900 dark:text-slate-100">
                            {course.code}
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

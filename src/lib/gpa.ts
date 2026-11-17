import { Course, GradingScale } from './types.ts';

export interface GradePointEntry {
  letter: string;
  points: number;
  minMark?: string;
}

export const BANGLADESH_SCALE: GradePointEntry[] = [
  { letter: 'A+', points: 4.0, minMark: '80%+' },
  { letter: 'A', points: 3.75, minMark: '75–79%' },
  { letter: 'A-', points: 3.5, minMark: '70–74%' },
  { letter: 'B+', points: 3.25, minMark: '65–69%' },
  { letter: 'B', points: 3.0, minMark: '60–64%' },
  { letter: 'B-', points: 2.75, minMark: '55–59%' },
  { letter: 'C+', points: 2.5, minMark: '50–54%' },
  { letter: 'C', points: 2.25, minMark: '45–49%' },
  { letter: 'D', points: 2.0, minMark: '40–44%' },
  { letter: 'F', points: 0.0, minMark: '<40%' },
];

export const US_SCALE: GradePointEntry[] = [
  { letter: 'A', points: 4.0, minMark: '93–100%' },
  { letter: 'A-', points: 3.7, minMark: '90–92%' },
  { letter: 'B+', points: 3.3, minMark: '87–89%' },
  { letter: 'B', points: 3.0, minMark: '83–86%' },
  { letter: 'B-', points: 2.7, minMark: '80–82%' },
  { letter: 'C+', points: 2.3, minMark: '77–79%' },
  { letter: 'C', points: 2.0, minMark: '73–76%' },
  { letter: 'C-', points: 1.7, minMark: '70–72%' },
  { letter: 'D+', points: 1.3, minMark: '67–69%' },
  { letter: 'D', points: 1.0, minMark: '60–66%' },
  { letter: 'F', points: 0.0, minMark: '<60%' },
];

export function getScaleEntries(scale: GradingScale): GradePointEntry[] {
  return scale === 'bd' ? BANGLADESH_SCALE : US_SCALE;
}

export function getGradePoints(letter: string, scale: GradingScale): number | null {
  if (!letter) return null;
  const entries = getScaleEntries(scale);
  const found = entries.find((e) => e.letter.toUpperCase() === letter.trim().toUpperCase());
  if (found) return found.points;
  // Cross-scale fallback for A+ on US or C-/D+ on BD
  if (letter === 'A+') return 4.0;
  if (letter === 'C-') return scale === 'bd' ? 2.0 : 1.7;
  if (letter === 'D+') return scale === 'bd' ? 2.0 : 1.3;
  return null;
}

export interface SemesterGpaSummary {
  semester: string;
  credits: number;
  qualityPoints: number;
  sgpa: number;
  courses: Course[];
}

export interface GpaReport {
  cgpa: number;
  completedCredits: number;
  totalQualityPoints: number;
  semesters: SemesterGpaSummary[];
}

export function computeGpaReport(
  courses: Course[],
  scale: GradingScale,
  whatIfOverrides?: Record<string, string>
): GpaReport {
  const semesterMap = new Map<string, { credits: number; qualityPoints: number; courses: Course[] }>();
  let totalCredits = 0;
  let totalQualityPoints = 0;

  for (const course of courses) {
    const effectiveLetter = whatIfOverrides?.[course.id] ?? course.gradeLetter;
    const pts = getGradePoints(effectiveLetter, scale);
    const hasGrade = pts !== null && (course.isCompleted || Boolean(whatIfOverrides?.[course.id]));

    if (!hasGrade || pts === null) continue;

    const qp = course.credits * pts;
    totalCredits += course.credits;
    totalQualityPoints += qp;

    const bucket = semesterMap.get(course.semester) || { credits: 0, qualityPoints: 0, courses: [] };
    bucket.credits += course.credits;
    bucket.qualityPoints += qp;
    bucket.courses.push(course);
    semesterMap.set(course.semester, bucket);
  }

  const semesters: SemesterGpaSummary[] = Array.from(semesterMap.entries()).map(([semester, data]) => ({
    semester,
    credits: data.credits,
    qualityPoints: data.qualityPoints,
    sgpa: data.credits > 0 ? data.qualityPoints / data.credits : 0,
    courses: data.courses,
  }));

  return {
    cgpa: totalCredits > 0 ? totalQualityPoints / totalCredits : 0,
    completedCredits: totalCredits,
    totalQualityPoints,
    semesters,
  };
}

export function computeRequiredGpa(
  currentCgpa: number,
  completedCredits: number,
  targetCgpa: number,
  remainingCredits: number
): { requiredGpa: number; feasible: boolean } {
  if (remainingCredits <= 0) {
    return { requiredGpa: 0, feasible: currentCgpa >= targetCgpa };
  }
  const currentPoints = currentCgpa * completedCredits;
  const targetTotalPoints = targetCgpa * (completedCredits + remainingCredits);
  const needed = (targetTotalPoints - currentPoints) / remainingCredits;
  return {
    requiredGpa: needed,
    feasible: needed <= 4.0,
  };
}

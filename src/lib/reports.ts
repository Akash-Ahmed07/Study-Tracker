import { getIdToken } from './firebase.ts';
import { computeGpaReport, getGradePoints, getMidtermPercent } from './gpa.ts';
import { computeStreakDays, computeWeeklyMinutes } from './studyData.ts';
import {
  Course,
  NoteOrFile,
  StudySession,
  SyllabusTopic,
  UserProfile,
} from './types.ts';

export interface WeeklyReportParams {
  profile: UserProfile;
  courses: Course[];
  topics: SyllabusTopic[];
  sessions: StudySession[];
  notes: NoteOrFile[];
}

export function buildWeeklyReportPayload({
  profile,
  courses,
  topics,
  sessions,
  notes,
}: WeeklyReportParams) {
  const gpaReport = computeGpaReport(courses, profile.gradingScale, undefined, {
    priorCgpa: profile.priorCgpa,
    priorCredits: profile.priorCredits,
  });

  const weeklyMinutes = computeWeeklyMinutes(sessions);
  const totalMinutes = sessions.reduce((acc, s) => acc + (Number(s.durationMinutes) || 0), 0);
  const streakDays = computeStreakDays(sessions);
  const doneTopics = topics.filter((t) => t.status === 'done').length;
  const doingTopics = topics.filter((t) => t.status === 'doing').length;
  const todoTopics = topics.filter((t) => t.status === 'todo').length;

  const dayMap = new Map<string, number>();
  for (const s of sessions) {
    const key = (s.startedAt || '').slice(0, 10);
    if (key) {
      dayMap.set(key, (dayMap.get(key) || 0) + (Number(s.durationMinutes) || 0));
    }
  }

  const daily7Days: { date: string; label: string; minutes: number }[] = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString('en-US', { weekday: 'short' });
    daily7Days.push({
      date: key,
      label,
      minutes: dayMap.get(key) || 0,
    });
  }

  const daily28Days: { date: string; minutes: number }[] = [];
  for (let i = 27; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86400000);
    const key = d.toISOString().slice(0, 10);
    daily28Days.push({
      date: key,
      minutes: dayMap.get(key) || 0,
    });
  }

  const courseLookup = new Map<string, Course>();
  for (const c of courses) {
    courseLookup.set(c.id, c);
  }

  const enrichedCourses = courses.map((c) => {
    const courseTopics = topics.filter((t) => t.courseId === c.id);
    const courseStudyMins = sessions
      .filter((s) => s.courseId === c.id || s.courseCode === c.code)
      .reduce((sum, s) => sum + (Number(s.durationMinutes) || 0), 0);
    return {
      code: c.code,
      title: c.title,
      semester: c.semester,
      credits: c.credits,
      gradeLetter: c.gradeLetter,
      gradePoints: c.isCompleted ? getGradePoints(c.gradeLetter, profile.gradingScale) : null,
      isCompleted: c.isCompleted,
      midtermScore: c.midtermScore ?? null,
      midtermMax: c.midtermMax ?? null,
      midtermPct: getMidtermPercent(c),
      studyMinutes: courseStudyMins,
      doneTopics: courseTopics.filter((t) => t.status === 'done').length,
      totalTopics: courseTopics.length,
    };
  });

  const sortedSessions = [...sessions]
    .sort((a, b) => (b.startedAt || '').localeCompare(a.startedAt || ''))
    .map((s) => ({
      date: (s.startedAt || '').slice(0, 10),
      courseCode: s.courseCode || 'GENERAL',
      durationMinutes: Number(s.durationMinutes) || 0,
      source: s.source || 'timer',
      note: s.note || '',
    }));

  const enrichedTopics = topics.map((t) => ({
    courseCode: courseLookup.get(t.courseId)?.code || 'COURSE',
    title: t.title,
    status: t.status,
    dueDate: t.dueDate || '',
  }));

  const enrichedNotes = notes.map((n) => ({
    title: n.title,
    courseCode: n.courseCode || 'GENERAL',
    kind: n.kind,
    sizeBytes: Number(n.sizeBytes) || 0,
    isShared: Boolean(n.isShared),
    hasDriveBackup: Boolean(n.driveFileId),
    originalFilename: n.originalFilename || '',
  }));

  return {
    generatedAt: new Date().toISOString(),
    profile: {
      uid: profile.uid,
      displayName: profile.displayName,
      email: profile.email,
      friendCode: profile.friendCode,
      gradingScale: profile.gradingScale,
      weeklyGoalMinutes: profile.weeklyGoalMinutes || 600,
      priorCgpa: profile.priorCgpa || 0,
      priorCredits: profile.priorCredits || 0,
    },
    gpaReport: {
      cgpa: gpaReport.cgpa,
      completedCredits: gpaReport.completedCredits,
      totalQualityPoints: gpaReport.totalQualityPoints,
      priorCredits: gpaReport.priorCredits,
      priorCgpa: gpaReport.priorCgpa,
      semesters: gpaReport.semesters.map((s) => ({
        semester: s.semester,
        credits: s.credits,
        sgpa: s.sgpa,
      })),
    },
    metrics: {
      weeklyMinutes,
      totalMinutes,
      streakDays,
      totalSessions: sessions.length,
      doneTopics,
      doingTopics,
      todoTopics,
      totalTopics: topics.length,
    },
    daily7Days,
    daily28Days,
    courses: enrichedCourses,
    sessions: sortedSessions,
    topics: enrichedTopics,
    notes: enrichedNotes,
  };
}

export async function downloadWeeklySeabornPdf(params: WeeklyReportParams): Promise<void> {
  const token = await getIdToken();
  const payload = buildWeeklyReportPayload(params);

  const response = await fetch('/api/reports/weekly-pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let errMessage = `PDF export failed (${response.status})`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data?.error) errMessage = data.error;
    } catch {
      // Ignore non-JSON error
    }
    throw new Error(errMessage);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateTag = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `StudyTracker_Weekly_Performance_${dateTag}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

import React, { useMemo, useState } from 'react';
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Plus,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  createTopic,
  deleteCourseAndTopics,
  deleteTopic,
  saveCourse,
  updateTopic,
} from '../lib/studyData.ts';
import { getScaleEntries } from '../lib/gpa.ts';
import { Course, GradingScale, SyllabusTopic, TopicStatus } from '../lib/types.ts';
import {
  getOrCreateStudyTrackerTaskList,
  syncTopicToGoogleTask,
} from '../lib/workspace.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

interface CoursesViewProps {
  uid: string;
  gradingScale: GradingScale;
  courses: Course[];
  topics: SyllabusTopic[];
  accessToken: string | null;
  onRequestAuth: () => void;
  onNotify: (msg: string) => void;
}

const COURSE_COLORS = ['#2563EB', '#059669', '#D97706', '#7C3AED', '#DC2626', '#0D9488'];

export const CoursesView: React.FC<CoursesViewProps> = ({
  uid,
  gradingScale,
  courses,
  topics,
  accessToken,
  onRequestAuth,
  onNotify,
}) => {
  const [expandedCourseId, setExpandedCourseId] = useState<string | null>(
    courses[0]?.id || null
  );
  const [showAddCourse, setShowAddCourse] = useState(false);

  // Add/Edit Course fields
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [semester, setSemester] = useState('Fall 2026');
  const [credits, setCredits] = useState('3');
  const [gradeLetter, setGradeLetter] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [color, setColor] = useState(COURSE_COLORS[0]);
  const [savingCourse, setSavingCourse] = useState(false);

  // Add Topic inputs keyed by courseId
  const [newTopicTitle, setNewTopicTitle] = useState<Record<string, string>>({});
  const [newTopicDue, setNewTopicDue] = useState<Record<string, string>>({});
  const [bulkCourseId, setBulkCourseId] = useState<string | null>(null);
  const [bulkLines, setBulkLines] = useState('');
  const [importingBulk, setImportingBulk] = useState(false);

  // Confirmations
  const [confirmDeleteCourse, setConfirmDeleteCourse] = useState<Course | null>(null);
  const [confirmSyncTasksCourse, setConfirmSyncTasksCourse] = useState<Course | null>(null);
  const [syncingTasks, setSyncingTasks] = useState(false);

  const scaleEntries = useMemo(() => getScaleEntries(gradingScale), [gradingScale]);

  const handleAddCourse = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !title.trim()) return;
    setSavingCourse(true);
    try {
      const id = await saveCourse(uid, {
        code: code.trim().toUpperCase(),
        title: title.trim(),
        semester: semester.trim() || 'Current',
        credits: Math.max(0.5, Math.min(20, Number(credits) || 3)),
        gradeLetter: isCompleted ? gradeLetter : '',
        isCompleted,
        color,
      });
      setCode('');
      setTitle('');
      setGradeLetter('');
      setIsCompleted(false);
      setShowAddCourse(false);
      setExpandedCourseId(id);
      onNotify('Course added.');
    } finally {
      setSavingCourse(false);
    }
  };

  const handleAddTopic = async (courseId: string) => {
    const tTitle = (newTopicTitle[courseId] || '').trim();
    if (!tTitle) return;
    const due = (newTopicDue[courseId] || '').trim();
    const existingCount = topics.filter((t) => t.courseId === courseId).length;
    await createTopic(uid, courseId, tTitle, due, existingCount);
    setNewTopicTitle((prev) => ({ ...prev, [courseId]: '' }));
    setNewTopicDue((prev) => ({ ...prev, [courseId]: '' }));
    onNotify('Syllabus topic added.');
  };

  const handleBulkImportTopics = async (courseId: string) => {
    const lines = bulkLines
      .split('\n')
      .map((l) => l.replace(/^[-*•\d.)\s]+/, '').trim())
      .filter(Boolean)
      .slice(0, 40);
    if (!lines.length) return;
    setImportingBulk(true);
    try {
      let order = topics.filter((t) => t.courseId === courseId).length;
      for (const line of lines) {
        await createTopic(uid, courseId, line, '', order);
        order += 1;
      }
      setBulkLines('');
      setBulkCourseId(null);
      onNotify(`Added ${lines.length} syllabus topics.`);
    } finally {
      setImportingBulk(false);
    }
  };

  const handleCycleStatus = async (topic: SyllabusTopic) => {
    const order: TopicStatus[] = ['todo', 'doing', 'done'];
    const next = order[(order.indexOf(topic.status) + 1) % order.length];
    await updateTopic(uid, topic.id, { status: next });
  };

  const handleSetStatus = async (topic: SyllabusTopic, status: TopicStatus) => {
    await updateTopic(uid, topic.id, { status });
  };

  const handleConfirmDeleteCourse = async () => {
    if (!confirmDeleteCourse) return;
    const cTopics = topics.filter((t) => t.courseId === confirmDeleteCourse.id).map((t) => t.id);
    await deleteCourseAndTopics(uid, confirmDeleteCourse.id, cTopics);
    setConfirmDeleteCourse(null);
    onNotify('Course and its syllabus topics deleted.');
  };

  const handleSyncToGoogleTasks = async () => {
    if (!confirmSyncTasksCourse) return;
    if (!accessToken) {
      setConfirmSyncTasksCourse(null);
      onRequestAuth();
      return;
    }
    setSyncingTasks(true);
    try {
      const taskListId = await getOrCreateStudyTrackerTaskList(accessToken);
      const courseTopics = topics.filter((t) => t.courseId === confirmSyncTasksCourse.id);
      for (const topic of courseTopics) {
        const googleTaskId = await syncTopicToGoogleTask(
          accessToken,
          taskListId,
          confirmSyncTasksCourse.code,
          topic
        );
        if (googleTaskId !== topic.googleTaskId) {
          await updateTopic(uid, topic.id, { googleTaskId });
        }
      }
      onNotify(
        `Synced ${courseTopics.length} topic(s) for ${confirmSyncTasksCourse.code} to Google Tasks.`
      );
      setConfirmSyncTasksCourse(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Google Tasks sync failed.');
    } finally {
      setSyncingTasks(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Courses & Syllabus
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Organize semester courses, cycle topics through todo, doing, and done, and sync deadlines with Google Tasks.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowAddCourse((v) => !v)}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          {showAddCourse ? 'Close Form' : 'Add Course'}
        </button>
      </div>

      {showAddCourse && (
        <form
          onSubmit={(e) => void handleAddCourse(e)}
          className="glass-panel rounded-xl p-6 space-y-4"
        >
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            New Course
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Course Code
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="CSE 320"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Course Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Computer Networks"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Semester
              </label>
              <input
                type="text"
                required
                value={semester}
                onChange={(e) => setSemester(e.target.value)}
                placeholder="Fall 2026"
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Credits
              </label>
              <input
                type="number"
                step="0.5"
                min="0.5"
                max="20"
                required
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
                className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Color Tag
              </label>
              <div className="flex items-center gap-2 py-1.5">
                {COURSE_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-md transition-transform ${
                      color === c ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : ''
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Select color ${c}`}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input
                id="course-completed"
                type="checkbox"
                checked={isCompleted}
                onChange={(e) => setIsCompleted(e.target.checked)}
                className="w-4 h-4 rounded border-slate-300 text-blue-600"
              />
              <label
                htmlFor="course-completed"
                className="text-sm text-slate-700 dark:text-slate-300"
              >
                Already graded (private)
              </label>
            </div>
            {isCompleted && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Grade Letter
                </label>
                <select
                  value={gradeLetter}
                  onChange={(e) => setGradeLetter(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="">Select grade</option>
                  {scaleEntries.map((entry) => (
                    <option key={entry.letter} value={entry.letter}>
                      {entry.letter} ({entry.points.toFixed(2)})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowAddCourse(false)}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={savingCourse}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60"
            >
              {savingCourse ? 'Saving...' : 'Save Course'}
            </button>
          </div>
        </form>
      )}

      {courses.length === 0 ? (
        <div className="glass-panel rounded-xl p-12 text-center space-y-3">
          <p className="text-base font-medium text-slate-800 dark:text-slate-200">
            No courses added yet
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Create your first course to track syllabus topics, attach lecture PDFs and notes, and project your CGPA.
          </p>
          <button
            type="button"
            onClick={() => setShowAddCourse(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            Add First Course
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {courses.map((course) => {
            const cTopics = topics
              .filter((t) => t.courseId === course.id)
              .sort((a, b) => a.sortOrder - b.sortOrder);
            const doneCount = cTopics.filter((t) => t.status === 'done').length;
            const doingCount = cTopics.filter((t) => t.status === 'doing').length;
            const pct = cTopics.length > 0 ? Math.round((doneCount / cTopics.length) * 100) : 0;
            const isExpanded = expandedCourseId === course.id;

            return (
              <div
                key={course.id}
                className="glass-panel rounded-xl overflow-hidden"
              >
                <div className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <button
                    type="button"
                    onClick={() => setExpandedCourseId(isExpanded ? null : course.id)}
                    className="flex items-start gap-3 text-left min-w-0 flex-1"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-slate-400 mt-1 shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-2.5 h-2.5 rounded-xs shrink-0"
                          style={{ backgroundColor: course.color || '#2563EB' }}
                        />
                        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {course.code} — {course.title}
                        </h3>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                        {course.semester} · {course.credits} credits · {doneCount}/{cTopics.length} topics done
                        {doingCount > 0 ? ` · ${doingCount} in progress` : ''}
                        {course.isCompleted && course.gradeLetter
                          ? ` · Grade ${course.gradeLetter} (private)`
                          : ''}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-4 shrink-0">
                    <div className="w-36 hidden sm:block">
                      <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1 tabular-nums">
                        <span>Syllabus</span>
                        <span className="font-mono">{pct}%</span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded-full transition-all duration-300"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        if (!accessToken) {
                          onRequestAuth();
                          return;
                        }
                        setConfirmSyncTasksCourse(course);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Sync Google Tasks
                    </button>

                    <button
                      type="button"
                      onClick={() => setConfirmDeleteCourse(course)}
                      className="p-2 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg transition-colors"
                      aria-label={`Delete ${course.code}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-200 dark:border-slate-800 p-5 bg-slate-50/60 dark:bg-slate-950/40 space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="text"
                        value={newTopicTitle[course.id] || ''}
                        onChange={(e) =>
                          setNewTopicTitle((prev) => ({ ...prev, [course.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleAddTopic(course.id);
                          }
                        }}
                        placeholder="Add syllabus topic (e.g., TCP Congestion Control)"
                        className="flex-1 px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <input
                        type="date"
                        value={newTopicDue[course.id] || ''}
                        onChange={(e) =>
                          setNewTopicDue((prev) => ({ ...prev, [course.id]: e.target.value }))
                        }
                        className="px-3 py-2 text-sm font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAddTopic(course.id)}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap"
                      >
                        Add Topic
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setBulkCourseId(bulkCourseId === course.id ? null : course.id)
                        }
                        className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap"
                      >
                        Bulk Paste
                      </button>
                    </div>

                    {bulkCourseId === course.id && (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
                        <div className="text-xs font-medium text-slate-600 dark:text-slate-300">
                          Paste your syllabus outline (one topic per line, up to 40 lines):
                        </div>
                        <textarea
                          rows={4}
                          value={bulkLines}
                          onChange={(e) => setBulkLines(e.target.value)}
                          placeholder={`1. OSI & TCP/IP Layers\n2. DNS & HTTP Protocols\n3. Reliable Transport & Congestion Control`}
                          className="w-full px-3 py-2 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setBulkCourseId(null)}
                            className="px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={importingBulk || !bulkLines.trim()}
                            onClick={() => void handleBulkImportTopics(course.id)}
                            className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60"
                          >
                            {importingBulk ? 'Importing...' : 'Import All Lines'}
                          </button>
                        </div>
                      </div>
                    )}

                    {cTopics.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400 py-2">
                        No syllabus topics yet. Add topics above to track todo, doing, and done states.
                      </p>
                    ) : (
                      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800">
                        {cTopics.map((topic) => (
                          <div
                            key={topic.id}
                            className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <button
                                type="button"
                                onClick={() => void handleCycleStatus(topic)}
                                className="text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 shrink-0"
                                title="Cycle topic status"
                              >
                                <CheckSquare
                                  className={`w-4 h-4 ${
                                    topic.status === 'done'
                                      ? 'text-emerald-600 dark:text-emerald-400'
                                      : topic.status === 'doing'
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : 'text-slate-400'
                                  }`}
                                />
                              </button>
                              <div className="min-w-0">
                                <p
                                  className={`text-sm font-medium truncate ${
                                    topic.status === 'done'
                                      ? 'line-through text-slate-400 dark:text-slate-500'
                                      : 'text-slate-800 dark:text-slate-100'
                                  }`}
                                >
                                  {topic.title}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {topic.dueDate ? `Due ${topic.dueDate}` : 'No due date'}
                                  {topic.googleTaskId ? ' · Synced to Google Tasks' : ''}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <div className="flex items-center gap-1 p-0.5 bg-slate-100 dark:bg-slate-800 rounded-md">
                                {(['todo', 'doing', 'done'] as TopicStatus[]).map((st) => (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={() => void handleSetStatus(topic, st)}
                                    className={`px-2.5 py-1 text-xs font-medium rounded-sm transition-colors ${
                                      topic.status === st
                                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 shadow-xs'
                                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                                    }`}
                                  >
                                    {st}
                                  </button>
                                ))}
                              </div>
                              <button
                                type="button"
                                onClick={() => void deleteTopic(uid, topic.id)}
                                className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                                aria-label="Delete topic"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDeleteCourse)}
        title={`Delete ${confirmDeleteCourse?.code || 'course'}?`}
        description="This removes the course and all of its syllabus topics from your Study Tracker."
        confirmLabel="Delete Course"
        tone="danger"
        onConfirm={handleConfirmDeleteCourse}
        onCancel={() => setConfirmDeleteCourse(null)}
      />

      <ConfirmDialog
        open={Boolean(confirmSyncTasksCourse)}
        title={`Sync ${confirmSyncTasksCourse?.code || ''} topics to Google Tasks?`}
        description="This creates or updates tasks inside your 'Study Tracker' list in Google Tasks matching your syllabus topics and completion status."
        details={topics
          .filter((t) => t.courseId === confirmSyncTasksCourse?.id)
          .map((t) => `[${t.status.toUpperCase()}] ${t.title}${t.dueDate ? ` (Due ${t.dueDate})` : ''}`)}
        confirmLabel="Sync to Google Tasks"
        busy={syncingTasks}
        onConfirm={handleSyncToGoogleTasks}
        onCancel={() => setConfirmSyncTasksCourse(null)}
      />
    </div>
  );
};

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { User } from 'firebase/auth';
import { db, handleFirestoreError, OperationType } from './firebase.ts';
import {
  Course,
  CourseProgressSummary,
  FeatureFormConfig,
  FeatureRequestCategory,
  FeatureRequestStatus,
  FriendRequest,
  Friendship,
  GradingScale,
  GroupStudySession,
  NoteOrFile,
  SharedNote,
  StudyGroup,
  StudySession,
  SyllabusTopic,
  TopicStatus,
  UserProfile,
  UserPublicProfile,
} from './types.ts';

export function makeId(prefix = ''): string {
  const rand =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      : `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}_${rand}` : rand;
}

export function pairDocId(uid1: string, uid2: string): string {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

export async function hashEmail(email: string): Promise<string> {
  const normalized = email.trim().toLowerCase();
  const data = new TextEncoder().encode(normalized);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateFriendCode(uid: string): string {
  const clean = uid.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'USER';
  const suffix = Math.random().toString(36).replace(/[^a-z0-9]/g, '').toUpperCase().slice(0, 4) || '2026';
  return `ST-${clean}${suffix}`.slice(0, 12);
}

export function computeWeeklyMinutes(sessions: StudySession[]): number {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  return sessions.reduce((sum, s) => {
    const dt = new Date(s.endedAt || s.startedAt);
    if (!Number.isNaN(dt.getTime()) && dt >= weekAgo) {
      return sum + (Number(s.durationMinutes) || 0);
    }
    return sum;
  }, 0);
}

export function computeStreakDays(sessions: StudySession[]): number {
  if (!sessions.length) return 0;
  const dayKeys = new Set<string>();
  for (const s of sessions) {
    const dt = new Date(s.startedAt);
    if (!Number.isNaN(dt.getTime())) {
      dayKeys.add(dt.toISOString().slice(0, 10));
    }
  }
  const todayKey = new Date().toISOString().slice(0, 10);
  const yesterdayKey = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  let cursor = dayKeys.has(todayKey)
    ? new Date(todayKey)
    : dayKeys.has(yesterdayKey)
      ? new Date(yesterdayKey)
      : null;

  if (!cursor) return 0;

  let streak = 0;
  while (cursor) {
    const key = cursor.toISOString().slice(0, 10);
    if (dayKeys.has(key)) {
      streak += 1;
      cursor = new Date(cursor.getTime() - 86400000);
    } else {
      break;
    }
  }
  return streak;
}

export async function ensureUserInitialized(user: User): Promise<UserProfile> {
  const userPath = `users/${user.uid}`;
  try {
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);

    if (snap.exists()) {
      const existing = snap.data() as UserProfile;
      // Ensure lookup docs exist
      const pubRef = doc(db, 'userPublicProfiles', user.uid);
      const pubSnap = await getDoc(pubRef);
      if (!pubSnap.exists()) {
        await setDoc(pubRef, {
          uid: user.uid,
          displayName: existing.displayName,
          friendCode: existing.friendCode,
          weeklyMinutes: 0,
          streakDays: 0,
          weeklyGoalMinutes: existing.weeklyGoalMinutes || 600,
          courseProgress: [],
          updatedAt: serverTimestamp(),
        });
      }
      return existing;
    }

    const displayName = (user.displayName || user.email?.split('@')[0] || 'Student').slice(0, 100);
    const email = (user.email || '').slice(0, 200);
    const friendCode = generateFriendCode(user.uid);
    const emailHash = email ? await hashEmail(email) : '';

    const profile: UserProfile = {
      uid: user.uid,
      displayName,
      email,
      gradingScale: 'bd',
      weeklyGoalMinutes: 600,
      friendCode,
    };

    const batch = writeBatch(db);
    batch.set(userRef, {
      ...profile,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'userPublicProfiles', user.uid), {
      uid: user.uid,
      displayName,
      friendCode,
      weeklyMinutes: 0,
      streakDays: 0,
      weeklyGoalMinutes: 600,
      courseProgress: [],
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'friendCodes', friendCode), {
      uid: user.uid,
      displayName,
      createdAt: serverTimestamp(),
    });
    if (emailHash) {
      batch.set(doc(db, 'emailLookup', emailHash), {
        uid: user.uid,
        displayName,
        friendCode,
        createdAt: serverTimestamp(),
      });
    }
    await batch.commit();
    return profile;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, userPath);
  }
}

export async function updateUserPreferences(
  uid: string,
  updates: {
    displayName: string;
    gradingScale: GradingScale;
    weeklyGoalMinutes: number;
    priorCgpa?: number;
    priorCredits?: number;
  }
): Promise<void> {
  const path = `users/${uid}`;
  try {
    const batch = writeBatch(db);
    const userPayload: Record<string, unknown> = {
      displayName: updates.displayName.slice(0, 100),
      gradingScale: updates.gradingScale,
      weeklyGoalMinutes: Math.max(30, Math.min(10080, updates.weeklyGoalMinutes)),
      updatedAt: serverTimestamp(),
    };
    if (typeof updates.priorCgpa === 'number' && !Number.isNaN(updates.priorCgpa)) {
      userPayload.priorCgpa = Math.max(0, Math.min(4, Number(updates.priorCgpa.toFixed(3))));
    }
    if (typeof updates.priorCredits === 'number' && !Number.isNaN(updates.priorCredits)) {
      userPayload.priorCredits = Math.max(0, Math.min(400, Number(updates.priorCredits)));
    }
    batch.update(doc(db, 'users', uid), userPayload);
    batch.update(doc(db, 'userPublicProfiles', uid), {
      displayName: updates.displayName.slice(0, 100),
      weeklyGoalMinutes: Math.max(30, Math.min(10080, updates.weeklyGoalMinutes)),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function syncPublicProfile(
  profile: UserProfile,
  courses: Course[],
  topics: SyllabusTopic[],
  sessions: StudySession[]
): Promise<void> {
  const path = `userPublicProfiles/${profile.uid}`;
  try {
    // Strictly exclude grades, CGPA, and email!
    const courseProgress: CourseProgressSummary[] = courses.slice(0, 20).map((c) => {
      const cTopics = topics.filter((t) => t.courseId === c.id);
      const doneTopics = cTopics.filter((t) => t.status === 'done').length;
      return {
        code: c.code,
        title: c.title,
        totalTopics: cTopics.length,
        doneTopics,
      };
    });

    await updateDoc(doc(db, 'userPublicProfiles', profile.uid), {
      displayName: profile.displayName.slice(0, 100),
      weeklyMinutes: Math.min(10080, computeWeeklyMinutes(sessions)),
      streakDays: Math.min(3650, computeStreakDays(sessions)),
      weeklyGoalMinutes: Math.max(30, Math.min(10080, profile.weeklyGoalMinutes)),
      courseProgress,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

// ---------------- COURSES & TOPICS ----------------

export async function saveCourse(
  uid: string,
  course: Omit<Course, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  existingId?: string
): Promise<string> {
  const id = existingId || makeId('crs');
  const path = `users/${uid}/courses/${id}`;
  const hasMid =
    typeof course.midtermMax === 'number' &&
    course.midtermMax > 0 &&
    typeof course.midtermScore === 'number' &&
    !Number.isNaN(course.midtermScore);

  const midtermFields = hasMid
    ? {
        midtermScore: Math.max(0, Math.min(1000, Number(course.midtermScore))),
        midtermMax: Math.max(1, Math.min(1000, Number(course.midtermMax))),
      }
    : {};

  try {
    if (existingId) {
      await updateDoc(doc(db, 'users', uid, 'courses', id), {
        code: course.code.trim().slice(0, 32),
        title: course.title.trim().slice(0, 120),
        semester: course.semester.trim().slice(0, 40),
        credits: Number(course.credits) || 3,
        gradeLetter: course.gradeLetter.trim().slice(0, 8),
        isCompleted: Boolean(course.isCompleted),
        color: course.color.slice(0, 24),
        ...midtermFields,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(doc(db, 'users', uid, 'courses', id), {
        userId: uid,
        code: course.code.trim().slice(0, 32),
        title: course.title.trim().slice(0, 120),
        semester: course.semester.trim().slice(0, 40),
        credits: Number(course.credits) || 3,
        gradeLetter: course.gradeLetter.trim().slice(0, 8),
        isCompleted: Boolean(course.isCompleted),
        color: course.color.slice(0, 24),
        ...midtermFields,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    return id;
  } catch (error) {
    handleFirestoreError(error, existingId ? OperationType.UPDATE : OperationType.CREATE, path);
  }
}

export async function deleteCourseAndTopics(
  uid: string,
  courseId: string,
  courseTopicIds: string[]
): Promise<void> {
  const path = `users/${uid}/courses/${courseId}`;
  try {
    const batch = writeBatch(db);
    for (const tid of courseTopicIds) {
      batch.delete(doc(db, 'users', uid, 'topics', tid));
    }
    batch.delete(doc(db, 'users', uid, 'courses', courseId));
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function createTopic(
  uid: string,
  courseId: string,
  title: string,
  dueDate = '',
  sortOrder = 0
): Promise<string> {
  const id = makeId('top');
  const path = `users/${uid}/topics/${id}`;
  try {
    await setDoc(doc(db, 'users', uid, 'topics', id), {
      userId: uid,
      courseId,
      title: title.trim().slice(0, 160),
      status: 'todo' as TopicStatus,
      dueDate: dueDate.slice(0, 32),
      googleTaskId: '',
      sortOrder,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateTopic(
  uid: string,
  topicId: string,
  fields: Partial<Pick<SyllabusTopic, 'title' | 'status' | 'dueDate' | 'googleTaskId' | 'sortOrder'>>
): Promise<void> {
  const path = `users/${uid}/topics/${topicId}`;
  try {
    await updateDoc(doc(db, 'users', uid, 'topics', topicId), {
      ...fields,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteTopic(uid: string, topicId: string): Promise<void> {
  const path = `users/${uid}/topics/${topicId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'topics', topicId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ---------------- STUDY SESSIONS ----------------

export async function logStudySession(
  uid: string,
  session: Omit<StudySession, 'id' | 'userId' | 'createdAt'>
): Promise<string> {
  const id = makeId('ses');
  const path = `users/${uid}/sessions/${id}`;
  try {
    await setDoc(doc(db, 'users', uid, 'sessions', id), {
      userId: uid,
      courseId: session.courseId.slice(0, 128),
      courseCode: session.courseCode.slice(0, 32),
      topicId: session.topicId.slice(0, 128),
      durationMinutes: Math.max(1, Math.min(1440, Math.round(session.durationMinutes))),
      startedAt: session.startedAt.slice(0, 40),
      endedAt: session.endedAt.slice(0, 40),
      source: session.source,
      groupSessionId: session.groupSessionId.slice(0, 128),
      note: session.note.slice(0, 500),
      createdAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteStudySession(uid: string, sessionId: string): Promise<void> {
  const path = `users/${uid}/sessions/${sessionId}`;
  try {
    await deleteDoc(doc(db, 'users', uid, 'sessions', sessionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ---------------- NOTES & FILES ----------------

const MAX_STORED_FILE_BYTES = 2147483648; // 2 GB

export async function createNoteOrFile(
  uid: string,
  payload: Omit<NoteOrFile, 'id' | 'userId' | 'createdAt' | 'updatedAt'>,
  friendUids: string[],
  ownerName: string
): Promise<string> {
  const id = makeId('nte');
  const path = `users/${uid}/notes/${id}`;
  const clampedSize = Math.max(0, Math.min(MAX_STORED_FILE_BYTES, payload.sizeBytes));
  const cleanDriveId = (payload.driveFileId || '').slice(0, 128);
  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'users', uid, 'notes', id), {
      userId: uid,
      courseId: payload.courseId.slice(0, 128),
      courseCode: payload.courseCode.slice(0, 32),
      topicId: payload.topicId.slice(0, 128),
      topicTitle: payload.topicTitle.slice(0, 160),
      title: payload.title.trim().slice(0, 160),
      kind: payload.kind,
      textContent: payload.textContent.slice(0, 50000),
      originalFilename: payload.originalFilename.slice(0, 240),
      mimeType: payload.mimeType.slice(0, 120),
      sizeBytes: clampedSize,
      storageKey: payload.storageKey.slice(0, 240),
      isShared: Boolean(payload.isShared),
      driveFileId: cleanDriveId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    if (payload.isShared) {
      batch.set(doc(db, 'sharedNotes', id), {
        ownerUid: uid,
        ownerName: ownerName.slice(0, 100),
        sourceNoteId: id,
        courseCode: payload.courseCode.slice(0, 32),
        title: payload.title.trim().slice(0, 160),
        kind: payload.kind,
        textContent: payload.textContent.slice(0, 50000),
        originalFilename: payload.originalFilename.slice(0, 240),
        mimeType: payload.mimeType.slice(0, 120),
        sizeBytes: clampedSize,
        storageKey: payload.storageKey.slice(0, 240),
        driveFileId: cleanDriveId,
        allowedFriendUids: friendUids.slice(0, 25),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    await batch.commit();
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function toggleShareNote(
  uid: string,
  ownerName: string,
  note: NoteOrFile,
  share: boolean,
  friendUids: string[]
): Promise<void> {
  const path = `users/${uid}/notes/${note.id}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', uid, 'notes', note.id), {
      isShared: share,
      updatedAt: serverTimestamp(),
    });

    const sharedRef = doc(db, 'sharedNotes', note.id);
    if (share) {
      batch.set(sharedRef, {
        ownerUid: uid,
        ownerName: ownerName.slice(0, 100),
        sourceNoteId: note.id,
        courseCode: note.courseCode.slice(0, 32),
        title: note.title.slice(0, 160),
        kind: note.kind,
        textContent: note.textContent.slice(0, 50000),
        originalFilename: note.originalFilename.slice(0, 240),
        mimeType: note.mimeType.slice(0, 120),
        sizeBytes: Math.max(0, Math.min(MAX_STORED_FILE_BYTES, note.sizeBytes)),
        storageKey: note.storageKey.slice(0, 240),
        driveFileId: (note.driveFileId || '').slice(0, 128),
        allowedFriendUids: friendUids.slice(0, 25),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.delete(sharedRef);
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteNoteRecord(uid: string, note: NoteOrFile): Promise<void> {
  const path = `users/${uid}/notes/${note.id}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, 'users', uid, 'notes', note.id));
    if (note.isShared) {
      batch.delete(doc(db, 'sharedNotes', note.id));
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function syncSharedNotesFriendList(
  uid: string,
  sharedNoteIds: string[],
  friendUids: string[]
): Promise<void> {
  if (!sharedNoteIds.length) return;
  try {
    const batch = writeBatch(db);
    for (const id of sharedNoteIds) {
      batch.update(doc(db, 'sharedNotes', id), {
        allowedFriendUids: friendUids.slice(0, 25),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (error) {
    // Non-fatal if doc already deleted
    console.warn('Could not refresh sharedNotes friend list:', error);
  }
}

// ---------------- FRIENDS & GROUP STUDY ----------------

export async function lookupStudentByCodeOrEmail(
  queryValue: string
): Promise<{ uid: string; displayName: string } | null> {
  const trimmed = queryValue.trim();
  if (!trimmed) return null;

  if (trimmed.includes('@')) {
    const emailHash = await hashEmail(trimmed);
    const path = `emailLookup/${emailHash}`;
    try {
      const snap = await getDoc(doc(db, 'emailLookup', emailHash));
      if (!snap.exists()) return null;
      const d = snap.data() as { uid: string; displayName: string };
      return { uid: d.uid, displayName: d.displayName };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  } else {
    const code = trimmed.toUpperCase();
    const path = `friendCodes/${code}`;
    try {
      const snap = await getDoc(doc(db, 'friendCodes', code));
      if (!snap.exists()) return null;
      const d = snap.data() as { uid: string; displayName: string };
      return { uid: d.uid, displayName: d.displayName };
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }
}

export async function sendFriendRequest(
  fromProfile: UserProfile,
  target: { uid: string; displayName: string }
): Promise<string> {
  const id = makeId('frq');
  const path = `friendRequests/${id}`;
  try {
    await setDoc(doc(db, 'friendRequests', id), {
      fromUid: fromProfile.uid,
      fromName: fromProfile.displayName.slice(0, 100),
      toUid: target.uid,
      toName: target.displayName.slice(0, 100),
      status: 'pending',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function respondToFriendRequest(
  request: FriendRequest,
  accept: boolean
): Promise<void> {
  const path = `friendRequests/${request.id}`;
  try {
    const batch = writeBatch(db);
    batch.update(doc(db, 'friendRequests', request.id), {
      status: accept ? 'accepted' : 'declined',
      updatedAt: serverTimestamp(),
    });

    if (accept) {
      const uidA = request.fromUid < request.toUid ? request.fromUid : request.toUid;
      const uidB = request.fromUid < request.toUid ? request.toUid : request.fromUid;
      const pId = `${uidA}_${uidB}`;
      batch.set(doc(db, 'friendships', pId), {
        uidA,
        uidB,
        memberUids: [uidA, uidB],
        requestId: request.id,
        createdAt: serverTimestamp(),
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function fetchFriendPublicProfiles(
  friendUids: string[]
): Promise<UserPublicProfile[]> {
  if (!friendUids.length) return [];
  const results: UserPublicProfile[] = [];
  for (const fUid of friendUids) {
    const path = `userPublicProfiles/${fUid}`;
    try {
      const snap = await getDoc(doc(db, 'userPublicProfiles', fUid));
      if (snap.exists()) {
        results.push(snap.data() as UserPublicProfile);
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, path);
    }
  }
  return results;
}

export async function createGroupStudyInvite(
  hostProfile: UserProfile,
  invitedUid: string,
  courseCode: string,
  topicTitle: string,
  durationMinutes: number
): Promise<string> {
  const id = makeId('grp');
  const path = `groupSessions/${id}`;
  try {
    await setDoc(doc(db, 'groupSessions', id), {
      hostUid: hostProfile.uid,
      hostName: hostProfile.displayName.slice(0, 100),
      invitedUid,
      courseCode: courseCode.slice(0, 32),
      topicTitle: topicTitle.slice(0, 160),
      durationMinutes: Math.max(1, Math.min(600, durationMinutes)),
      status: 'invited',
      participantUids: [hostProfile.uid],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function joinGroupStudySession(
  uid: string,
  session: GroupStudySession
): Promise<void> {
  const path = `groupSessions/${session.id}`;
  try {
    const nextParticipants = Array.from(new Set([...session.participantUids, uid])).slice(0, 10);
    await updateDoc(doc(db, 'groupSessions', session.id), {
      status: 'active',
      participantUids: nextParticipants,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function completeGroupStudySession(
  uid: string,
  session: GroupStudySession,
  actualMinutes: number
): Promise<void> {
  const path = `groupSessions/${session.id}`;
  try {
    await updateDoc(doc(db, 'groupSessions', session.id), {
      status: 'completed',
      durationMinutes: Math.max(1, Math.min(600, actualMinutes)),
      updatedAt: serverTimestamp(),
    });
    await logStudySession(uid, {
      courseId: '',
      courseCode: session.courseCode,
      topicId: '',
      durationMinutes: actualMinutes,
      startedAt: new Date(Date.now() - actualMinutes * 60000).toISOString(),
      endedAt: new Date().toISOString(),
      source: 'group',
      groupSessionId: session.id,
      note: `Group study: ${session.topicTitle}`,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function fetchFriendships(uid: string): Promise<Friendship[]> {
  const path = 'friendships';
  try {
    const q = query(collection(db, 'friendships'), where('memberUids', 'array-contains', uid));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Friendship, 'id'>) }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

export async function fetchSharedNotesForUser(uid: string): Promise<SharedNote[]> {
  const path = 'sharedNotes';
  try {
    const q = query(
      collection(db, 'sharedNotes'),
      where('allowedFriendUids', 'array-contains', uid)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SharedNote, 'id'>) }));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
  }
}

// ---------------- FEATURE REQUESTS & GOOGLE FORM CONFIG ----------------

export async function saveFeatureFormConfig(
  uid: string,
  config: Omit<FeatureFormConfig, 'updatedByUid' | 'updatedAt'>
): Promise<void> {
  const path = 'appConfig/featureForm';
  try {
    await setDoc(doc(db, 'appConfig', 'featureForm'), {
      formId: config.formId.trim().slice(0, 128),
      formTitle: config.formTitle.trim().slice(0, 160) || 'Feature Requests',
      responderUri: config.responderUri.trim().slice(0, 500),
      updatedByUid: uid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function clearFeatureFormConfig(): Promise<void> {
  const path = 'appConfig/featureForm';
  try {
    await deleteDoc(doc(db, 'appConfig', 'featureForm'));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function submitFeatureRequest(
  profile: UserProfile,
  payload: {
    category: FeatureRequestCategory;
    title: string;
    description: string;
  }
): Promise<string> {
  const id = makeId('fr');
  const path = `featureRequests/${id}`;
  try {
    await setDoc(doc(db, 'featureRequests', id), {
      authorUid: profile.uid,
      authorName: profile.displayName.slice(0, 100),
      authorEmail: profile.email.slice(0, 200),
      category: payload.category,
      title: payload.title.trim().slice(0, 140),
      description: payload.description.trim().slice(0, 2000),
      status: 'open' as FeatureRequestStatus,
      adminNote: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateFeatureRequestAdmin(
  requestId: string,
  status: FeatureRequestStatus,
  adminNote: string
): Promise<void> {
  const path = `featureRequests/${requestId}`;
  try {
    await updateDoc(doc(db, 'featureRequests', requestId), {
      status,
      adminNote: adminNote.trim().slice(0, 500),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteFeatureRequest(requestId: string): Promise<void> {
  const path = `featureRequests/${requestId}`;
  try {
    await deleteDoc(doc(db, 'featureRequests', requestId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ---------------- STUDY GROUPS (WHATSAPP-STYLE NOTES & PDF CHANNELS) ----------------

function generateGroupCode(): string {
  const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, '').toUpperCase().slice(0, 6);
  return `GRP-${rand || 'STUDY1'}`;
}

export async function createStudyGroup(
  profile: UserProfile,
  payload: { name: string; courseCode: string; initialFriendUids: string[] }
): Promise<string> {
  const id = makeId('grp');
  const groupCode = generateGroupCode();
  const path = `studyGroups/${id}`;
  const cleanName = payload.name.trim().slice(0, 100) || 'Study Group';
  const cleanCourse = payload.courseCode.trim().slice(0, 32) || 'GENERAL';
  const members = Array.from(new Set([profile.uid, ...payload.initialFriendUids])).slice(0, 25);

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'studyGroups', id), {
      ownerUid: profile.uid,
      ownerName: profile.displayName.slice(0, 100),
      name: cleanName,
      courseCode: cleanCourse,
      groupCode,
      memberUids: members,
      lastMessageText: `Group created by ${profile.displayName}`,
      lastMessageAt: new Date().toISOString(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    batch.set(doc(db, 'groupCodes', groupCode), {
      groupId: id,
      groupName: cleanName,
      ownerUid: profile.uid,
      createdAt: serverTimestamp(),
    });
    await batch.commit();
    return id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function joinStudyGroupByCode(
  uid: string,
  rawCode: string
): Promise<{ groupId: string; groupName: string }> {
  const code = rawCode.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '');
  if (!code) {
    throw new Error('Enter a valid group code (e.g., GRP-...).');
  }
  const codePath = `groupCodes/${code}`;
  try {
    const codeSnap = await getDoc(doc(db, 'groupCodes', code));
    if (!codeSnap.exists()) {
      throw new Error('No study group found with that code.');
    }
    const lookup = codeSnap.data() as { groupId: string; groupName: string };
    const groupSnap = await getDoc(doc(db, 'studyGroups', lookup.groupId));
    if (!groupSnap.exists()) {
      throw new Error('Study group no longer exists.');
    }
    const groupData = groupSnap.data() as Omit<StudyGroup, 'id'>;
    if (!groupData.memberUids.includes(uid)) {
      if (groupData.memberUids.length >= 25) {
        throw new Error('This study group has reached the 25-member limit.');
      }
      await updateDoc(doc(db, 'studyGroups', lookup.groupId), {
        memberUids: [...groupData.memberUids, uid],
        updatedAt: serverTimestamp(),
      });
    }
    return { groupId: lookup.groupId, groupName: lookup.groupName };
  } catch (error) {
    if (error instanceof Error && !error.message.includes('Firebase')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, codePath);
  }
}

export async function addMemberToStudyGroup(
  group: StudyGroup,
  friendUid: string
): Promise<void> {
  if (group.memberUids.includes(friendUid)) return;
  const path = `studyGroups/${group.id}`;
  try {
    await updateDoc(doc(db, 'studyGroups', group.id), {
      memberUids: [...group.memberUids, friendUid].slice(0, 25),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function leaveStudyGroup(group: StudyGroup, uid: string): Promise<void> {
  const path = `studyGroups/${group.id}`;
  try {
    await updateDoc(doc(db, 'studyGroups', group.id), {
      memberUids: group.memberUids.filter((m) => m !== uid),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteStudyGroup(group: StudyGroup): Promise<void> {
  const path = `studyGroups/${group.id}`;
  try {
    const msgsSnap = await getDocs(collection(db, 'studyGroups', group.id, 'messages'));
    const docs = msgsSnap.docs;
    for (let i = 0; i < docs.length; i += 400) {
      const batch = writeBatch(db);
      for (const d of docs.slice(i, i + 400)) {
        batch.delete(d.ref);
      }
      await batch.commit();
    }
    const finalBatch = writeBatch(db);
    if (group.groupCode) {
      finalBatch.delete(doc(db, 'groupCodes', group.groupCode));
    }
    finalBatch.delete(doc(db, 'studyGroups', group.id));
    await finalBatch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function sendGroupMessage(
  groupId: string,
  profile: UserProfile,
  payload: {
    kind: 'text' | 'note' | 'file';
    text?: string;
    noteTitle?: string;
    originalFilename?: string;
    mimeType?: string;
    sizeBytes?: number;
    storageKey?: string;
    driveFileId?: string;
    sourceNoteId?: string;
  }
): Promise<string> {
  const msgId = makeId('msg');
  const path = `studyGroups/${groupId}/messages/${msgId}`;
  const cleanText = (payload.text || '').trim().slice(0, 20000);
  const cleanTitle = (payload.noteTitle || '').trim().slice(0, 160);
  const cleanFile = (payload.originalFilename || '').trim().slice(0, 240);
  const preview =
    payload.kind === 'file'
      ? `PDF/File: ${cleanFile || cleanTitle}`
      : payload.kind === 'note'
        ? `Note: ${cleanTitle || cleanText.slice(0, 60)}`
        : cleanText;

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'studyGroups', groupId, 'messages', msgId), {
      groupId,
      senderUid: profile.uid,
      senderName: profile.displayName.slice(0, 100),
      kind: payload.kind,
      text: cleanText,
      noteTitle: cleanTitle,
      originalFilename: cleanFile,
      mimeType: (payload.mimeType || '').slice(0, 120),
      sizeBytes: Math.max(0, Math.min(MAX_STORED_FILE_BYTES, payload.sizeBytes || 0)),
      storageKey: (payload.storageKey || '').slice(0, 240),
      driveFileId: (payload.driveFileId || '').slice(0, 128),
      sourceNoteId: (payload.sourceNoteId || '').slice(0, 128),
      createdAt: serverTimestamp(),
    });
    batch.update(doc(db, 'studyGroups', groupId), {
      lastMessageText: `${profile.displayName}: ${preview}`.slice(0, 300),
      lastMessageAt: new Date().toISOString(),
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return msgId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function deleteGroupMessage(
  groupId: string,
  messageId: string
): Promise<void> {
  const path = `studyGroups/${groupId}/messages/${messageId}`;
  try {
    await deleteDoc(doc(db, 'studyGroups', groupId, 'messages', messageId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}



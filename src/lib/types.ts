export type GradingScale = 'bd' | 'us';
export type TopicStatus = 'todo' | 'doing' | 'done';
export type SessionSource = 'timer' | 'manual' | 'group';
export type NoteKind = 'text' | 'file';

export const ADMIN_SUPPORT_EMAIL = 'akashahmed00011976@gmail.com';
export const ADMIN_EMAILS = [
  'akashahmed00011976@gmail.com',
  'groweasy25@gmail.com',
] as const;

export function isAppAdmin(email?: string | null, isDynamicAdmin = false): boolean {
  if (isDynamicAdmin) return true;
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return (ADMIN_EMAILS as readonly string[]).includes(normalized);
}

export type NavSection =
  | 'overview'
  | 'courses'
  | 'sessions'
  | 'notes'
  | 'cgpa'
  | 'friends'
  | 'requests';

export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  gradingScale: GradingScale;
  weeklyGoalMinutes: number;
  friendCode: string;
  priorCgpa?: number;
  priorCredits?: number;
  suspended?: boolean;
  suspendedReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Course {
  id: string;
  userId: string;
  code: string;
  title: string;
  semester: string;
  credits: number;
  gradeLetter: string;
  isCompleted: boolean;
  color: string;
  midtermScore?: number;
  midtermMax?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SyllabusTopic {
  id: string;
  userId: string;
  courseId: string;
  title: string;
  status: TopicStatus;
  dueDate: string;
  googleTaskId: string;
  sortOrder: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudySession {
  id: string;
  userId: string;
  courseId: string;
  courseCode: string;
  topicId: string;
  durationMinutes: number;
  startedAt: string;
  endedAt: string;
  source: SessionSource;
  groupSessionId: string;
  note: string;
  createdAt?: unknown;
}

export interface NoteOrFile {
  id: string;
  userId: string;
  courseId: string;
  courseCode: string;
  topicId: string;
  topicTitle: string;
  title: string;
  kind: NoteKind;
  textContent: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  isShared: boolean;
  driveFileId: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CourseProgressSummary {
  code: string;
  title: string;
  totalTopics: number;
  doneTopics: number;
}

export interface UserPublicProfile {
  uid: string;
  displayName: string;
  friendCode: string;
  weeklyMinutes: number;
  streakDays: number;
  weeklyGoalMinutes: number;
  courseProgress: CourseProgressSummary[];
  updatedAt?: unknown;
}

export interface FriendRequest {
  id: string;
  fromUid: string;
  fromName: string;
  toUid: string;
  toName: string;
  status: 'pending' | 'accepted' | 'declined';
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Friendship {
  id: string;
  uidA: string;
  uidB: string;
  memberUids: string[];
  requestId: string;
  createdAt?: unknown;
}

export interface GroupStudySession {
  id: string;
  hostUid: string;
  hostName: string;
  invitedUid: string;
  courseCode: string;
  topicTitle: string;
  durationMinutes: number;
  status: 'invited' | 'active' | 'completed';
  participantUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SharedNote {
  id: string;
  ownerUid: string;
  ownerName: string;
  sourceNoteId: string;
  courseCode: string;
  title: string;
  kind: NoteKind;
  textContent: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  driveFileId?: string;
  allowedFriendUids: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type FeatureRequestCategory =
  | 'courses'
  | 'timer'
  | 'notes'
  | 'cgpa'
  | 'friends'
  | 'workspace'
  | 'other';

export type FeatureRequestStatus = 'open' | 'planned' | 'shipped' | 'declined';

export interface FeatureFormConfig {
  formId: string;
  formTitle: string;
  responderUri: string;
  updatedByUid: string;
  updatedAt?: unknown;
}

export interface GlobalAnnouncement {
  enabled: boolean;
  title: string;
  message: string;
  tone: 'info' | 'warning' | 'success';
  updatedByUid: string;
  updatedAt?: unknown;
}

export interface AdminRole {
  uid: string;
  email: string;
  createdAt?: unknown;
}

export interface SystemSettingsConfig {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  allowSharedNotes: boolean;
  maxGroupMembers: number;
  defaultWeeklyGoalMinutes: number;
  updatedByUid: string;
  updatedAt?: unknown;
}

export interface FeatureRequest {
  id: string;
  authorUid: string;
  authorName: string;
  authorEmail: string;
  category: FeatureRequestCategory;
  title: string;
  description: string;
  status: FeatureRequestStatus;
  adminNote: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export type GroupMessageKind = 'text' | 'note' | 'file';

export interface StudyGroup {
  id: string;
  ownerUid: string;
  ownerName: string;
  name: string;
  courseCode: string;
  groupCode: string;
  memberUids: string[];
  lastMessageText: string;
  lastMessageAt: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudyGroupMessage {
  id: string;
  groupId: string;
  senderUid: string;
  senderName: string;
  kind: GroupMessageKind;
  text: string;
  noteTitle: string;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  driveFileId?: string;
  sourceNoteId: string;
  createdAt?: unknown;
}

export function safeToMillis(val: unknown): number {
  if (!val) return 0;
  if (typeof val === 'number') return Number.isFinite(val) ? val : 0;
  if (typeof val === 'string') {
    const ms = Date.parse(val);
    return Number.isNaN(ms) ? 0 : ms;
  }
  if (val instanceof Date) {
    const ms = val.getTime();
    return Number.isNaN(ms) ? 0 : ms;
  }
  if (typeof val === 'object') {
    const obj = val as {
      toMillis?: () => number;
      seconds?: number;
      nanoseconds?: number;
    };
    if (typeof obj.toMillis === 'function') {
      try {
        return obj.toMillis();
      } catch {
        return 0;
      }
    }
    if (typeof obj.seconds === 'number') {
      return obj.seconds * 1000 + Math.floor((obj.nanoseconds || 0) / 1e6);
    }
  }
  return 0;
}

export function safeToDate(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return Number.isNaN(val.getTime()) ? null : val;
  if (typeof val === 'object') {
    const obj = val as { toDate?: () => Date };
    if (typeof obj.toDate === 'function') {
      try {
        return obj.toDate();
      } catch {
        return null;
      }
    }
  }
  const ms = safeToMillis(val);
  if (ms > 0) {
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export type GradingScale = 'bd' | 'us';
export type TopicStatus = 'todo' | 'doing' | 'done';
export type SessionSource = 'timer' | 'manual' | 'group';
export type NoteKind = 'text' | 'file';

export const ADMIN_SUPPORT_EMAIL = 'groweasy25@gmail.com';

export function isAppAdmin(email?: string | null): boolean {
  return Boolean(email && email.trim().toLowerCase() === ADMIN_SUPPORT_EMAIL);
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
  sourceNoteId: string;
  createdAt?: unknown;
}



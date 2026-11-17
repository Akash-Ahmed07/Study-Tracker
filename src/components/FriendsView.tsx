import React, { useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Eye,
  Link2,
  Lock,
  Mail,
  Play,
  Trophy,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { getIdToken } from '../lib/firebase.ts';
import {
  completeGroupStudySession,
  computeStreakDays,
  computeWeeklyMinutes,
  createGroupStudyInvite,
  createNoteOrFile,
  joinGroupStudySession,
  lookupStudentByCodeOrEmail,
  respondToFriendRequest,
  sendFriendRequest,
} from '../lib/studyData.ts';
import {
  Course,
  FriendRequest,
  GroupStudySession,
  SharedNote,
  StudySession,
  SyllabusTopic,
  UserProfile,
  UserPublicProfile,
} from '../lib/types.ts';
import { sendStudyEmail } from '../lib/workspace.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { FriendsHoursComparisonChart } from './StudyCharts.tsx';

interface FriendsViewProps {
  profile: UserProfile;
  courses: Course[];
  topics: SyllabusTopic[];
  sessions: StudySession[];
  friendProfiles: UserPublicProfile[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  groupSessions: GroupStudySession[];
  sharedNotes: SharedNote[];
  accessToken: string | null;
  pendingInviteCode?: string | null;
  onClearPendingInvite?: () => void;
  onRequestAuth: () => void;
  onNotify: (msg: string) => void;
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  profile,
  courses,
  topics,
  sessions,
  friendProfiles,
  incomingRequests,
  outgoingRequests,
  groupSessions,
  sharedNotes,
  accessToken,
  pendingInviteCode,
  onClearPendingInvite,
  onRequestAuth,
  onNotify,
}) => {
  const inviteLink = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/?invite=${encodeURIComponent(profile.friendCode)}`;
  }, [profile.friendCode]);

  const [friendLookupInput, setFriendLookupInput] = useState(pendingInviteCode || '');
  const [sendingInvite, setSendingInvite] = useState(false);

  React.useEffect(() => {
    if (pendingInviteCode) {
      setFriendLookupInput(pendingInviteCode);
    }
  }, [pendingInviteCode]);

  // Group study session invite form
  const [groupFriendUid, setGroupFriendUid] = useState(friendProfiles[0]?.uid || '');
  const [groupCourseCode, setGroupCourseCode] = useState(courses[0]?.code || 'STUDY');
  const [groupTopicTitle, setGroupTopicTitle] = useState('');
  const [groupMinutes, setGroupMinutes] = useState('50');

  // Gmail study invite modal / confirmation
  const [gmailTo, setGmailTo] = useState('');
  const [gmailSubject, setGmailSubject] = useState(
    `Study Tracker invite from ${profile.displayName}`
  );
  const [gmailBody, setGmailBody] = useState(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const link = origin ? `${origin}/?invite=${encodeURIComponent(profile.friendCode)}` : '';
    return `Hey! Join me on Study Tracker so we can compare syllabus progress and log group study sessions together.\n\nMy Friend Code: ${profile.friendCode}${link ? `\nDirect Invite Link: ${link}` : ''}`;
  });
  const [confirmGmailOpen, setConfirmGmailOpen] = useState(false);
  const [sendingGmail, setSendingGmail] = useState(false);

  // Shared note viewer & save copy
  const [viewingShared, setViewingShared] = useState<SharedNote | null>(null);
  const [sharedBlobUrl, setSharedBlobUrl] = useState<string | null>(null);
  const [savingCopyId, setSavingCopyId] = useState<string | null>(null);

  const myWeeklyMinutes = computeWeeklyMinutes(sessions);
  const myStreakDays = computeStreakDays(sessions);

  const leaderboard = useMemo(() => {
    const me = {
      uid: profile.uid,
      displayName: `${profile.displayName} (You)`,
      weeklyMinutes: myWeeklyMinutes,
      streakDays: myStreakDays,
      isMe: true,
    };
    const others = friendProfiles.map((f) => ({
      uid: f.uid,
      displayName: f.displayName,
      weeklyMinutes: f.weeklyMinutes || 0,
      streakDays: f.streakDays || 0,
      isMe: false,
    }));
    return [me, ...others].sort((a, b) => b.weeklyMinutes - a.weeklyMinutes);
  }, [friendProfiles, myStreakDays, myWeeklyMinutes, profile.displayName, profile.uid]);

  const myCourseProgress = useMemo(
    () =>
      courses.map((c) => {
        const cTopics = topics.filter((t) => t.courseId === c.id);
        const done = cTopics.filter((t) => t.status === 'done').length;
        return {
          code: c.code,
          title: c.title,
          totalTopics: cTopics.length,
          doneTopics: done,
        };
      }),
    [courses, topics]
  );

  const handleSendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendLookupInput.trim()) return;
    setSendingInvite(true);
    try {
      const target = await lookupStudentByCodeOrEmail(friendLookupInput);
      if (!target) {
        onNotify('No student found with that friend code or email. You can also send a Gmail invite below.');
        return;
      }
      if (target.uid === profile.uid) {
        onNotify('You cannot send a friend request to yourself.');
        return;
      }
      await sendFriendRequest(profile, target);
      setFriendLookupInput('');
      if (pendingInviteCode && onClearPendingInvite) {
        onClearPendingInvite();
      }
      onNotify(`Friend invite sent to ${target.displayName}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to send friend invite.');
    } finally {
      setSendingInvite(false);
    }
  };

  const handleCreateGroupInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetUid = groupFriendUid || friendProfiles[0]?.uid;
    if (!targetUid || !groupTopicTitle.trim()) return;
    await createGroupStudyInvite(
      profile,
      targetUid,
      groupCourseCode.trim() || 'STUDY',
      groupTopicTitle.trim(),
      Number(groupMinutes) || 50
    );
    setGroupTopicTitle('');
    onNotify('Group study session invite sent.');
  };

  const handleOpenSharedNote = async (sn: SharedNote) => {
    setViewingShared(sn);
    if (sharedBlobUrl) {
      URL.revokeObjectURL(sharedBlobUrl);
      setSharedBlobUrl(null);
    }
    if (sn.kind === 'text') return;
    try {
      const idToken = await getIdToken();
      const res = await fetch(
        `/api/files/${encodeURIComponent(sn.ownerUid)}/${encodeURIComponent(
          sn.storageKey
        )}?mime=${encodeURIComponent(sn.mimeType)}&name=${encodeURIComponent(sn.originalFilename)}`,
        { headers: { Authorization: `Bearer ${idToken}` } }
      );
      if (!res.ok) throw new Error('Could not open shared file.');
      const blob = await res.blob();
      setSharedBlobUrl(URL.createObjectURL(blob));
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Unable to open shared file.');
    }
  };

  const handleSaveCopyToLibrary = async (sn: SharedNote) => {
    setSavingCopyId(sn.id);
    try {
      let newStorageKey = '';
      let sizeBytes = sn.sizeBytes;

      if (sn.kind === 'file' && sn.storageKey) {
        const idToken = await getIdToken();
        const res = await fetch('/api/files/copy-shared', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ownerUid: sn.ownerUid,
            storageKey: sn.storageKey,
          }),
        });
        const data = (await res.json()) as {
          error?: string;
          storageKey?: string;
          sizeBytes?: number;
        };
        if (!res.ok || !data.storageKey) {
          throw new Error(data.error || 'Could not copy shared file.');
        }
        newStorageKey = data.storageKey;
        sizeBytes = data.sizeBytes ?? sn.sizeBytes;
      }

      await createNoteOrFile(
        profile.uid,
        {
          courseId: '',
          courseCode: sn.courseCode || 'SHARED',
          topicId: '',
          topicTitle: '',
          title: `${sn.title} (from ${sn.ownerName})`,
          kind: sn.kind,
          textContent: sn.textContent,
          originalFilename: sn.originalFilename,
          mimeType: sn.mimeType,
          sizeBytes,
          storageKey: newStorageKey,
          isShared: false,
          driveFileId: '',
        },
        [],
        profile.displayName
      );
      onNotify(`Saved copy of "${sn.title}" to your Notes & Files library.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to save copy.');
    } finally {
      setSavingCopyId(null);
    }
  };

  const handleConfirmSendGmail = async () => {
    if (!accessToken) {
      setConfirmGmailOpen(false);
      onRequestAuth();
      return;
    }
    setSendingGmail(true);
    try {
      await sendStudyEmail(accessToken, gmailTo.trim(), gmailSubject.trim(), gmailBody.trim());
      setConfirmGmailOpen(false);
      setGmailTo('');
      onNotify('Study invitation sent via Gmail.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Gmail send failed.');
    } finally {
      setSendingGmail(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Friends & Study Together
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            Compare syllabus progress, weekly study hours, group sessions, and shared notes — grades & CGPA stay private.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(inviteLink);
              onNotify('Copied shareable friend invite link.');
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <Link2 className="w-3.5 h-3.5" />
            Copy Invite Link
          </button>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(profile.friendCode);
              onNotify(`Copied Friend Code: ${profile.friendCode}`);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-mono font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Copy className="w-3.5 h-3.5 text-slate-400" />
            {profile.friendCode}
          </button>
        </div>
      </div>

      {/* Add Friend + Gmail Invite */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 glass-panel rounded-xl p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Invite a Study Friend
          </h2>
          <div className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-1.5">
            <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Your Direct Invite Link (includes code {profile.friendCode})
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={inviteLink}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="flex-1 px-2.5 py-1.5 text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-slate-700 dark:text-slate-300"
              />
              <button
                type="button"
                onClick={() => {
                  void navigator.clipboard?.writeText(inviteLink);
                  onNotify('Invite link copied to clipboard.');
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-md whitespace-nowrap"
              >
                Copy
              </button>
            </div>
          </div>
          <form onSubmit={(e) => void handleSendFriendRequest(e)} className="flex gap-2">
            <input
              type="text"
              required
              value={friendLookupInput}
              onChange={(e) => setFriendLookupInput(e.target.value)}
              placeholder="Enter friend code (ST-...) or email"
              className="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
            />
            <button
              type="submit"
              disabled={sendingInvite}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap"
            >
              <UserPlus className="w-4 h-4" />
              {sendingInvite ? 'Sending...' : 'Invite'}
            </button>
          </form>

          {incomingRequests.length > 0 && (
            <div className="pt-2 space-y-2">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Incoming Requests ({incomingRequests.length})
              </div>
              {incomingRequests.map((req) => (
                <div
                  key={req.id}
                  className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg flex items-center justify-between gap-3"
                >
                  <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                    {req.fromName}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        void respondToFriendRequest(req, true).then(() =>
                          onNotify(`Connected with ${req.fromName}.`)
                        )
                      }
                      className="inline-flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-md"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => void respondToFriendRequest(req, false)}
                      className="px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-red-600"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {outgoingRequests.length > 0 && (
            <div className="text-xs text-slate-500 dark:text-slate-400">
              Pending sent invites: {outgoingRequests.map((r) => r.toName).join(', ')}
            </div>
          )}
        </div>

        {/* Send Study Invite via Gmail */}
        <div className="lg:col-span-6 glass-panel rounded-xl p-6 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Send Study Invite via Gmail
            </h2>
            <Mail className="w-4 h-4 text-slate-400" />
          </div>
          <input
            type="email"
            value={gmailTo}
            onChange={(e) => setGmailTo(e.target.value)}
            placeholder="Classmate's Gmail address"
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
          />
          <input
            type="text"
            value={gmailSubject}
            onChange={(e) => setGmailSubject(e.target.value)}
            className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
          />
          <textarea
            rows={2}
            value={gmailBody}
            onChange={(e) => setGmailBody(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
          />
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!gmailTo.trim()}
              onClick={() => {
                if (!accessToken) {
                  onRequestAuth();
                  return;
                }
                setConfirmGmailOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50"
            >
              <Mail className="w-4 h-4" />
              Send Gmail Invite
            </button>
          </div>
        </div>
      </div>

      {/* Weekly Leaderboard + Group Study Session Invites */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 glass-panel rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Weekly Study Leaderboard
            </h2>
            <Trophy className="w-4 h-4 text-amber-500" />
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {leaderboard.map((row, idx) => (
              <div
                key={row.uid}
                className="py-3 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-xs text-slate-400 w-5 tabular-nums">
                    #{idx + 1}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {row.displayName}
                    </p>
                    <p className="text-xs text-slate-500 tabular-nums">
                      {row.streakDays} day streak
                    </p>
                  </div>
                </div>
                <span className="font-mono text-sm font-semibold tabular-nums text-blue-600 dark:text-blue-400">
                  {(row.weeklyMinutes / 60).toFixed(1)}h
                </span>
              </div>
            ))}
          </div>

          <FriendsHoursComparisonChart rows={leaderboard} />
        </div>

        <div className="lg:col-span-7 glass-panel rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Study-Session Invites & Group Logging
            </h2>
            <Users className="w-4 h-4 text-slate-400" />
          </div>

          <form onSubmit={(e) => void handleCreateGroupInvite(e)} className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
            <select
              value={groupFriendUid || friendProfiles[0]?.uid || ''}
              onChange={(e) => setGroupFriendUid(e.target.value)}
              disabled={friendProfiles.length === 0}
              className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
            >
              {friendProfiles.length === 0 ? (
                <option value="">No friends yet</option>
              ) : (
                friendProfiles.map((f) => (
                  <option key={f.uid} value={f.uid}>
                    {f.displayName}
                  </option>
                ))
              )}
            </select>
            <input
              type="text"
              value={groupCourseCode}
              onChange={(e) => setGroupCourseCode(e.target.value)}
              placeholder="Course code"
              className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
            />
            <input
              type="text"
              required
              value={groupTopicTitle}
              onChange={(e) => setGroupTopicTitle(e.target.value)}
              placeholder="Topic to study together"
              className="px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
            />
            <div className="flex gap-2">
              <input
                type="number"
                min="5"
                max="360"
                value={groupMinutes}
                onChange={(e) => setGroupMinutes(e.target.value)}
                className="w-20 px-2.5 py-2 text-sm font-mono tabular-nums bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
              <button
                type="submit"
                disabled={friendProfiles.length === 0}
                className="flex-1 px-3 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 whitespace-nowrap"
              >
                Invite
              </button>
            </div>
          </form>

          {groupSessions.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4">
              No group study sessions yet. Connect with a friend to schedule and log sessions together.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {groupSessions.map((gs) => (
                <div
                  key={gs.id}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {gs.courseCode} — {gs.topicTitle}
                    </p>
                    <p className="text-xs text-slate-500 tabular-nums">
                      Host: {gs.hostName} · {gs.durationMinutes} min · Status: {gs.status}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {gs.status === 'invited' && gs.invitedUid === profile.uid && (
                      <button
                        type="button"
                        onClick={() =>
                          void joinGroupStudySession(profile.uid, gs).then(() =>
                            onNotify('Joined group study session.')
                          )
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Join Session
                      </button>
                    )}
                    {gs.status !== 'completed' && gs.hostUid === profile.uid && (
                      <button
                        type="button"
                        onClick={() =>
                          void completeGroupStudySession(profile.uid, gs, gs.durationMinutes).then(
                            () => onNotify('Group study session completed and logged.')
                          )
                        }
                        className="px-3 py-1.5 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                      >
                        Complete & Log
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Syllabus Progress Comparison */}
      <div className="glass-panel rounded-xl p-6 space-y-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Syllabus Progress Comparison
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3">
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {profile.displayName} (You)
            </div>
            {myCourseProgress.length === 0 ? (
              <p className="text-xs text-slate-500">No courses tracked yet.</p>
            ) : (
              myCourseProgress.map((cp) => {
                const pct =
                  cp.totalTopics > 0 ? Math.round((cp.doneTopics / cp.totalTopics) * 100) : 0;
                return (
                  <div key={cp.code} className="space-y-1">
                    <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                      <span className="truncate">{cp.code}</span>
                      <span className="font-mono">
                        {cp.doneTopics}/{cp.totalTopics} ({pct}%)
                      </span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-600 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {friendProfiles.map((fp) => (
            <div
              key={fp.uid}
              className="border border-slate-200 dark:border-slate-800 rounded-lg p-4 space-y-3"
            >
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {fp.displayName}
              </div>
              {!fp.courseProgress?.length ? (
                <p className="text-xs text-slate-500">No shared syllabus topics yet.</p>
              ) : (
                fp.courseProgress.map((cp, idx) => {
                  const pct =
                    cp.totalTopics > 0 ? Math.round((cp.doneTopics / cp.totalTopics) * 100) : 0;
                  return (
                    <div key={`${fp.uid}-${idx}`} className="space-y-1">
                      <div className="flex justify-between text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                        <span className="truncate">{cp.code}</span>
                        <span className="font-mono">
                          {cp.doneTopics}/{cp.totalTopics} ({pct}%)
                        </span>
                      </div>
                      <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-600 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Notes & files shared by friends */}
      <div className="glass-panel rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Notes & files shared by friends
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Open shared notes and documents or save a copy directly into your own library.
          </p>
        </div>

        {sharedNotes.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No notes or files have been shared by your friends yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {sharedNotes.map((sn) => (
              <div
                key={sn.id}
                className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {sn.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Shared by {sn.ownerName} · {sn.courseCode || 'GENERAL'} ·{' '}
                    {sn.kind === 'text' ? 'Text note' : sn.originalFilename}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleOpenSharedNote(sn)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    Open
                  </button>
                  <button
                    type="button"
                    disabled={savingCopyId === sn.id}
                    onClick={() => void handleSaveCopyToLibrary(sn)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {savingCopyId === sn.id ? 'Saving...' : 'Save Copy to My Library'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Shared Note Viewer */}
      {viewingShared && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-4xl max-h-[90vh] glass-panel rounded-xl flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  {viewingShared.title}
                </h3>
                <p className="text-xs text-slate-500">
                  Shared by {viewingShared.ownerName} · {viewingShared.courseCode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (sharedBlobUrl) URL.revokeObjectURL(sharedBlobUrl);
                  setSharedBlobUrl(null);
                  setViewingShared(null);
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {viewingShared.kind === 'text' ? (
                <pre className="whitespace-pre-wrap font-mono text-sm text-slate-800 dark:text-slate-200">
                  {viewingShared.textContent}
                </pre>
              ) : sharedBlobUrl && viewingShared.mimeType.startsWith('image/') ? (
                <img
                  src={sharedBlobUrl}
                  alt={viewingShared.title}
                  className="max-w-full max-h-[65vh] mx-auto rounded-lg"
                />
              ) : sharedBlobUrl && viewingShared.mimeType === 'application/pdf' ? (
                <iframe
                  src={sharedBlobUrl}
                  title={viewingShared.title}
                  className="w-full h-[65vh] rounded-lg border border-slate-200 dark:border-slate-800"
                />
              ) : (
                <div className="py-12 text-center text-sm text-slate-500">
                  Use "Save Copy to My Library" to download or open this document format.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmGmailOpen}
        title="Send study invitation via Gmail?"
        description={`This will send an email from your Gmail account to ${gmailTo} with your Study Tracker friend code.`}
        details={[`To: ${gmailTo}`, `Subject: ${gmailSubject}`]}
        confirmLabel="Send Email"
        busy={sendingGmail}
        onConfirm={handleConfirmSendGmail}
        onCancel={() => setConfirmGmailOpen(false)}
      />
    </div>
  );
};

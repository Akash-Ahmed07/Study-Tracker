import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Clock,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Link2,
  Lock,
  Mail,
  Maximize2,
  MessageCircle,
  Play,
  Search,
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
import {
  fetchDriveFileBlobUrl,
  getDriveDirectDownloadUrl,
  getDrivePreviewEmbedUrl,
  sendStudyEmail,
} from '../lib/workspace.ts';
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
  onStartFocusZoom?: (courseCode: string) => void;
  onNotify: (msg: string) => void;
}

function getTimestampMillis(val: unknown): number | null {
  if (!val) return null;
  if (typeof val === 'object' && val !== null && 'toMillis' in val) {
    const fn = (val as { toMillis?: () => number }).toMillis;
    if (typeof fn === 'function') return fn();
  }
  return null;
}

function formatElapsedClock(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const h = Math.floor(safe / 3600);
  const m = Math.floor((safe % 3600) / 60);
  const s = safe % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
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
  onStartFocusZoom,
  onNotify,
}) => {
  const inviteLink = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/?invite=${encodeURIComponent(profile.friendCode)}`;
  }, [profile.friendCode]);

  const whatsappShareUrl = useMemo(() => {
    const text = `Join me on Study Tracker! Track study sessions, share PDF notes, and compare study streaks.\nFriend Code: ${profile.friendCode}\nInvite Link: ${inviteLink}`;
    return `https://wa.me/?text=${encodeURIComponent(text)}`;
  }, [inviteLink, profile.friendCode]);

  const [friendLookupInput, setFriendLookupInput] = useState(pendingInviteCode || '');
  const [lookingUpFriend, setLookingUpFriend] = useState(false);
  const [foundStudentPreview, setFoundStudentPreview] = useState<{
    uid: string;
    displayName: string;
  } | null>(null);
  const [sendingInvite, setSendingInvite] = useState(false);

  useEffect(() => {
    if (pendingInviteCode) {
      setFriendLookupInput(pendingInviteCode);
    }
  }, [pendingInviteCode]);

  // Live Study Together Room creation form
  const [groupFriendUid, setGroupFriendUid] = useState(friendProfiles[0]?.uid || '');
  const [groupCourseCode, setGroupCourseCode] = useState(courses[0]?.code || 'STUDY');
  const [groupTopicTitle, setGroupTopicTitle] = useState('');
  const [groupMinutes, setGroupMinutes] = useState('50');
  const [creatingRoom, setCreatingRoom] = useState(false);

  // Live clock tick for active study rooms
  const [nowMs, setNowMs] = useState(() => Date.now());
  const hasLiveRooms = useMemo(
    () => groupSessions.some((gs) => gs.status === 'active'),
    [groupSessions]
  );
  useEffect(() => {
    if (!hasLiveRooms) return;
    const id = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(id);
  }, [hasLiveRooms]);

  // Gmail study invite modal / confirmation
  const [gmailTo, setGmailTo] = useState('');
  const [gmailSubject, setGmailSubject] = useState(
    `Study Tracker invite from ${profile.displayName}`
  );
  const [gmailBody, setGmailBody] = useState(() => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const link = origin ? `${origin}/?invite=${encodeURIComponent(profile.friendCode)}` : '';
    return `Hey! Join me on Study Tracker so we can study together live, share lecture PDFs, and compare study streaks.\n\nMy Friend Code: ${profile.friendCode}${link ? `\nDirect Invite Link: ${link}` : ''}`;
  });
  const [confirmGmailOpen, setConfirmGmailOpen] = useState(false);
  const [sendingGmail, setSendingGmail] = useState(false);

  // Shared note viewer & save copy
  const [viewingShared, setViewingShared] = useState<SharedNote | null>(null);
  const [sharedBlobUrl, setSharedBlobUrl] = useState<string | null>(null);
  const [sharedDriveEmbedUrl, setSharedDriveEmbedUrl] = useState<string | null>(null);
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

  const sortedGroupSessions = useMemo(() => {
    const rank = (s: GroupStudySession['status']) =>
      s === 'active' ? 0 : s === 'invited' ? 1 : 2;
    return [...groupSessions].sort((a, b) => {
      const diff = rank(a.status) - rank(b.status);
      if (diff !== 0) return diff;
      return (getTimestampMillis(b.createdAt) || 0) - (getTimestampMillis(a.createdAt) || 0);
    });
  }, [groupSessions]);

  const handleFindStudent = async () => {
    const val = friendLookupInput.trim();
    if (!val) return;
    setLookingUpFriend(true);
    try {
      const target = await lookupStudentByCodeOrEmail(val);
      if (!target) {
        setFoundStudentPreview(null);
        onNotify('No student found yet. Share your Invite Link or send a Gmail invite.');
        return;
      }
      if (target.uid === profile.uid) {
        setFoundStudentPreview(null);
        onNotify('That friend code or email belongs to your own account.');
        return;
      }
      setFoundStudentPreview(target);
    } finally {
      setLookingUpFriend(false);
    }
  };

  const handleSendFriendRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendLookupInput.trim()) return;
    setSendingInvite(true);
    try {
      const target = foundStudentPreview || (await lookupStudentByCodeOrEmail(friendLookupInput));
      if (!target) {
        onNotify('No student found with that friend code or email. Send your invite link via WhatsApp or Gmail!');
        return;
      }
      if (target.uid === profile.uid) {
        onNotify('You cannot send a friend request to yourself.');
        return;
      }
      await sendFriendRequest(profile, target);
      setFriendLookupInput('');
      setFoundStudentPreview(null);
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
    setCreatingRoom(true);
    try {
      await createGroupStudyInvite(
        profile,
        targetUid,
        groupCourseCode.trim() || 'STUDY',
        groupTopicTitle.trim(),
        Number(groupMinutes) || 50
      );
      setGroupTopicTitle('');
      onNotify('Study room created and invite sent to your friend.');
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleOpenSharedNote = async (sn: SharedNote) => {
    setViewingShared(sn);
    if (sharedBlobUrl) {
      URL.revokeObjectURL(sharedBlobUrl);
      setSharedBlobUrl(null);
    }
    setSharedDriveEmbedUrl(null);
    if (sn.kind === 'text') return;
    try {
      if (sn.driveFileId) {
        if (accessToken && sn.sizeBytes <= 60 * 1024 * 1024) {
          try {
            const url = await fetchDriveFileBlobUrl(accessToken, sn.driveFileId, sn.mimeType);
            setSharedBlobUrl(url);
            return;
          } catch {
            // Fall through to Google Drive embed preview
          }
        }
        setSharedDriveEmbedUrl(getDrivePreviewEmbedUrl(sn.driveFileId));
        return;
      }

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
      const driveFileId = sn.driveFileId || '';

      if (sn.kind === 'file' && !driveFileId && sn.storageKey) {
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
        const ctype = res.headers.get('content-type') || '';
        if (!ctype.includes('application/json')) {
          throw new Error('Could not copy legacy server file.');
        }
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
          driveFileId,
        },
        [],
        profile.displayName
      );
      onNotify(`Saved "${sn.title}" to your Notes & Files library.`);
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
            6. Friends &amp; Study Together
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            Invite classmates in 1 click, run Live Study Together rooms, and share notes — grades &amp; CGPA stay strictly private.
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
          <a
            href={whatsappShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <MessageCircle className="w-3.5 h-3.5" />
            WhatsApp Share
          </a>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(profile.friendCode);
              onNotify(`Copied Friend Code: ${profile.friendCode}`);
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-mono font-medium text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Copy className="w-3.5 h-3.5 text-slate-400" />
            {profile.friendCode}
          </button>
        </div>
      </div>

      {/* Add Friend + Gmail Invite */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-6 glass-panel rounded-xl p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Invite &amp; Connect Friends
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              {friendProfiles.length} connected
            </span>
          </div>

          <div className="p-3.5 glass-subtle rounded-lg space-y-2">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Step 1 · Share your direct invite link or Friend Code (<span className="font-mono">{profile.friendCode}</span>)
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
                Copy Link
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-medium text-slate-700 dark:text-slate-300">
              Step 2 · Or add a classmate by their Friend Code or Gmail
            </div>
            <form onSubmit={(e) => void handleSendFriendRequest(e)} className="flex gap-2">
              <input
                type="text"
                required
                value={friendLookupInput}
                onChange={(e) => {
                  setFriendLookupInput(e.target.value);
                  setFoundStudentPreview(null);
                }}
                placeholder="Enter Friend Code (ST-...) or classmate email"
                className="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
              <button
                type="button"
                disabled={lookingUpFriend || !friendLookupInput.trim()}
                onClick={() => void handleFindStudent()}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-200 glass-subtle rounded-lg disabled:opacity-50 whitespace-nowrap"
              >
                <Search className="w-3.5 h-3.5" />
                {lookingUpFriend ? 'Finding...' : 'Find'}
              </button>
              <button
                type="submit"
                disabled={sendingInvite}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap"
              >
                <UserPlus className="w-4 h-4" />
                {sendingInvite ? 'Sending...' : 'Send Invite'}
              </button>
            </form>

            {foundStudentPreview && (
              <div className="px-3 py-2 bg-emerald-50/80 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/70 rounded-lg text-xs text-emerald-800 dark:text-emerald-200 flex items-center justify-between">
                <span>
                  Found student: <strong>{foundStudentPreview.displayName}</strong>
                </span>
                <span className="font-mono text-[11px]">Ready to invite</span>
              </div>
            )}
          </div>

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
                    {req.fromName} wants to connect
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

      {/* Weekly Leaderboard + Live Study Together Rooms */}
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
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Live Study Together Rooms
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Pick a friend, set a focus sprint (25m / 50m / 90m), and study together with Zoom + Notes.
              </p>
            </div>
            <Users className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
          </div>

          <form
            onSubmit={(e) => void handleCreateGroupInvite(e)}
            className="p-4 glass-subtle rounded-xl space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <select
                value={groupFriendUid || friendProfiles[0]?.uid || ''}
                onChange={(e) => setGroupFriendUid(e.target.value)}
                disabled={friendProfiles.length === 0}
                className="px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                {friendProfiles.length === 0 ? (
                  <option value="">Connect a friend first</option>
                ) : (
                  friendProfiles.map((f) => (
                    <option key={f.uid} value={f.uid}>
                      With {f.displayName}
                    </option>
                  ))
                )}
              </select>

              <select
                value={groupCourseCode}
                onChange={(e) => setGroupCourseCode(e.target.value)}
                className="px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              >
                <option value="STUDY">General Study</option>
                {courses.map((c) => (
                  <option key={c.id} value={c.code}>
                    {c.code} — {c.title}
                  </option>
                ))}
              </select>

              <input
                type="text"
                required
                value={groupTopicTitle}
                onChange={(e) => setGroupTopicTitle(e.target.value)}
                placeholder="Topic / chapter to study..."
                className="px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">Duration:</span>
                {['25', '50', '90'].map((mins) => (
                  <button
                    key={mins}
                    type="button"
                    onClick={() => setGroupMinutes(mins)}
                    className={`px-2.5 py-1 text-xs font-mono rounded-md transition-colors ${
                      groupMinutes === mins
                        ? 'bg-blue-600 text-white'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {mins}m
                  </button>
                ))}
                <input
                  type="number"
                  min="5"
                  max="360"
                  value={groupMinutes}
                  onChange={(e) => setGroupMinutes(e.target.value)}
                  className="w-16 px-2 py-1 text-xs font-mono tabular-nums bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-md"
                />
                <span className="text-xs text-slate-500">min</span>
              </div>

              <button
                type="submit"
                disabled={friendProfiles.length === 0 || creatingRoom}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                {creatingRoom ? 'Starting...' : 'Invite & Start Room'}
              </button>
            </div>
          </form>

          {sortedGroupSessions.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">
              No study together rooms yet. Start one above so both of you can track your session live!
            </p>
          ) : (
            <div className="space-y-2.5">
              {sortedGroupSessions.map((gs) => {
                const isParticipant =
                  gs.hostUid === profile.uid || gs.participantUids.includes(profile.uid);
                const startedMs = getTimestampMillis(gs.updatedAt) || getTimestampMillis(gs.createdAt);
                const elapsedSec =
                  gs.status === 'active' && startedMs
                    ? Math.max(0, Math.floor((nowMs - startedMs) / 1000))
                    : 0;
                const partner = friendProfiles.find(
                  (f) => f.uid === (gs.hostUid === profile.uid ? gs.invitedUid : gs.hostUid)
                );

                return (
                  <div
                    key={gs.id}
                    className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      gs.status === 'active'
                        ? 'bg-blue-50/70 dark:bg-blue-950/35 border-blue-200 dark:border-blue-800/70'
                        : 'glass-subtle border-slate-200/70 dark:border-slate-800/70'
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-mono font-semibold text-blue-700 dark:text-blue-300">
                          {gs.courseCode}
                        </span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {gs.topicTitle}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {gs.hostUid === profile.uid
                          ? `You invited ${partner?.displayName || 'friend'}`
                          : `Hosted by ${gs.hostName}`}
                        {' · '}
                        Target {gs.durationMinutes} min ·{' '}
                        {gs.status === 'active'
                          ? 'Studying live now'
                          : gs.status === 'invited'
                            ? 'Waiting for friend to join'
                            : 'Completed & logged'}
                      </p>
                      {gs.status === 'active' && (
                        <div className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold tabular-nums text-emerald-700 dark:text-emerald-300 pt-0.5">
                          <Clock className="w-3.5 h-3.5" />
                          Live Room Clock: {formatElapsedClock(elapsedSec)}
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {gs.status === 'invited' && gs.invitedUid === profile.uid && (
                        <button
                          type="button"
                          onClick={() =>
                            void joinGroupStudySession(profile.uid, gs).then(() =>
                              onNotify('Joined live study room! Open Zoom + Notes when ready.')
                            )
                          }
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Join Room
                        </button>
                      )}
                      {gs.status !== 'completed' && onStartFocusZoom && (
                        <button
                          type="button"
                          onClick={() => onStartFocusZoom(gs.courseCode)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-white/85 dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-lg"
                        >
                          <Maximize2 className="w-3.5 h-3.5" />
                          Zoom + Notes
                        </button>
                      )}
                      {gs.status !== 'completed' && isParticipant && (
                        <button
                          type="button"
                          onClick={() => {
                            const minsToLog =
                              gs.status === 'active' && elapsedSec >= 60
                                ? Math.max(1, Math.round(elapsedSec / 60))
                                : gs.durationMinutes;
                            void completeGroupStudySession(profile.uid, gs, minsToLog).then(() =>
                              onNotify(`Completed & logged ${minsToLog} min group study session.`)
                            );
                          }}
                          className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg"
                        >
                          Complete &amp; Log
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
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
            Notes &amp; files shared by friends
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Open shared notes and Drive PDFs or save a copy directly into your own library.
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
                    {sn.driveFileId ? ' · Google Drive' : ''}
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
              <div className="flex items-center gap-2 shrink-0">
                {viewingShared.driveFileId && (
                  <a
                    href={getDriveDirectDownloadUrl(viewingShared.driveFileId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                  >
                    Download from Drive
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (sharedBlobUrl) URL.revokeObjectURL(sharedBlobUrl);
                    setSharedBlobUrl(null);
                    setSharedDriveEmbedUrl(null);
                    setViewingShared(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
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
              ) : sharedDriveEmbedUrl ? (
                <iframe
                  src={sharedDriveEmbedUrl}
                  title={viewingShared.title}
                  className="w-full h-[65vh] rounded-lg border border-slate-200 dark:border-slate-800 bg-white"
                  allow="autoplay"
                />
              ) : (
                <div className="py-12 text-center text-sm text-slate-500">
                  Use &ldquo;Save Copy to My Library&rdquo; to download or open this document format.
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

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Eye,
  FileText,
  LogOut,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  Trash2,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { collection, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db, getIdToken, handleFirestoreError, OperationType } from '../lib/firebase.ts';
import {
  addMemberToStudyGroup,
  createNoteOrFile,
  createStudyGroup,
  deleteGroupMessage,
  deleteStudyGroup,
  joinStudyGroupByCode,
  leaveStudyGroup,
  sendGroupMessage,
} from '../lib/studyData.ts';
import {
  Course,
  NoteOrFile,
  StudyGroup,
  StudyGroupMessage,
  UserProfile,
  UserPublicProfile,
} from '../lib/types.ts';
import {
  fetchDriveFileBlobUrl,
  getDriveDirectDownloadUrl,
  getDrivePreviewEmbedUrl,
  setDriveFileAnyoneReader,
  uploadFileToDriveResumable,
} from '../lib/workspace.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

interface NotesGroupsPanelProps {
  profile: UserProfile;
  courses: Course[];
  notes: NoteOrFile[];
  friendProfiles: UserPublicProfile[];
  studyGroups: StudyGroup[];
  accessToken: string | null;
  onRequestAuth: () => void;
  onNotify: (msg: string) => void;
}

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatMsgTime(ts: unknown): string {
  if (!ts) return 'now';
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts) {
    const fn = (ts as { toDate?: () => Date }).toDate;
    if (typeof fn === 'function') {
      return fn().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
  }
  return '';
}

export const NotesGroupsPanel: React.FC<NotesGroupsPanelProps> = ({
  profile,
  courses,
  notes,
  friendProfiles,
  studyGroups,
  accessToken,
  onRequestAuth,
  onNotify,
}) => {
  const [selectedGroupId, setSelectedGroupId] = useState<string>(studyGroups[0]?.id || '');
  const [messages, setMessages] = useState<StudyGroupMessage[]>([]);
  const [groupSearch, setGroupSearch] = useState('');

  // Create group modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupCourse, setNewGroupCourse] = useState(courses[0]?.code || 'GENERAL');
  const [selectedFriendsForNew, setSelectedFriendsForNew] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  // Join by group code
  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joiningGroup, setJoiningGroup] = useState(false);

  // Composer inside active group
  const [chatText, setChatText] = useState('');
  const [sendingText, setSendingText] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [showShareLibraryModal, setShowShareLibraryModal] = useState(false);
  const [addFriendSelect, setAddFriendSelect] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Preview shared PDF/file/note from group message
  const [previewMsg, setPreviewMsg] = useState<StudyGroupMessage | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewDriveEmbedUrl, setPreviewDriveEmbedUrl] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [savingMsgId, setSavingMsgId] = useState<string | null>(null);
  const [confirmLeaveGroup, setConfirmLeaveGroup] = useState<StudyGroup | null>(null);
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState<StudyGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState(false);

  useEffect(() => {
    if (!selectedGroupId && studyGroups.length > 0) {
      setSelectedGroupId(studyGroups[0].id);
    } else if (selectedGroupId && !studyGroups.some((g) => g.id === selectedGroupId)) {
      setSelectedGroupId(studyGroups[0]?.id || '');
    }
  }, [selectedGroupId, studyGroups]);

  const activeGroup = useMemo(
    () => studyGroups.find((g) => g.id === selectedGroupId) || null,
    [selectedGroupId, studyGroups]
  );

  useEffect(() => {
    if (!activeGroup) {
      setMessages([]);
      return;
    }
    const q = query(
      collection(db, 'studyGroups', activeGroup.id, 'messages'),
      orderBy('createdAt', 'asc')
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMessages(
          snap.docs.map((d) => ({
            id: d.id,
            ...(d.data() as Omit<StudyGroupMessage, 'id'>),
          }))
        );
      },
      (err) =>
        handleFirestoreError(err, OperationType.LIST, `studyGroups/${activeGroup.id}/messages`)
    );
    return unsub;
  }, [activeGroup]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return studyGroups;
    return studyGroups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.courseCode.toLowerCase().includes(q) ||
        g.groupCode.toLowerCase().includes(q)
    );
  }, [groupSearch, studyGroups]);

  const availableFriendsToAdd = useMemo(() => {
    if (!activeGroup) return [];
    return friendProfiles.filter((f) => !activeGroup.memberUids.includes(f.uid));
  }, [activeGroup, friendProfiles]);

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    setCreatingGroup(true);
    try {
      const id = await createStudyGroup(profile, {
        name: newGroupName,
        courseCode: newGroupCourse,
        initialFriendUids: selectedFriendsForNew,
      });
      setSelectedGroupId(id);
      setNewGroupName('');
      setSelectedFriendsForNew([]);
      setShowCreateModal(false);
      onNotify('Study group created. Share its code so friends can join.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to create group.');
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleJoinByCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCodeInput.trim()) return;
    setJoiningGroup(true);
    try {
      const joined = await joinStudyGroupByCode(profile.uid, joinCodeInput);
      setSelectedGroupId(joined.groupId);
      setJoinCodeInput('');
      onNotify(`Joined study group "${joined.groupName}".`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not join group.');
    } finally {
      setJoiningGroup(false);
    }
  };

  const handleSendText = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeGroup || !chatText.trim()) return;
    const msg = chatText.trim();
    setChatText('');
    setSendingText(true);
    try {
      await sendGroupMessage(activeGroup.id, profile, {
        kind: 'text',
        text: msg,
      });
    } catch (err) {
      setChatText(msg);
      onNotify(err instanceof Error ? err.message : 'Failed to send message.');
    } finally {
      setSendingText(false);
    }
  };

  const handleUploadFileToGroup = async (file: File) => {
    if (!activeGroup) return;
    if (file.size > MAX_FILE_SIZE_BYTES) {
      onNotify(`"${file.name}" exceeds the 2 GB per-file limit.`);
      return;
    }

    setUploadingFile(true);
    setUploadProgress(0);
    try {
      if (accessToken) {
        const driveRes = await uploadFileToDriveResumable(accessToken, file, {
          shareAnyone: true,
          onProgress: (pct) => setUploadProgress(pct),
        });
        await sendGroupMessage(activeGroup.id, profile, {
          kind: 'file',
          noteTitle: file.name,
          originalFilename: file.name,
          mimeType: file.type || 'application/pdf',
          sizeBytes: file.size,
          storageKey: '',
          driveFileId: driveRes.id,
        });
        onNotify(`Shared "${file.name}" (${formatBytes(file.size)}) via your Google Drive.`);
        return;
      }

      let serverAvailable = false;
      try {
        const healthRes = await fetch('/api/health');
        const ctype = healthRes.headers.get('content-type') || '';
        serverAvailable = healthRes.ok && ctype.includes('application/json');
      } catch {
        serverAvailable = false;
      }

      if (!serverAvailable) {
        onNotify('Connect Google Drive first to share files up to 2 GB in this group.');
        onRequestAuth();
        return;
      }

      const idToken = await getIdToken();
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/files/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${idToken}` },
        body: form,
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Connect Google Drive to upload files up to 2 GB.');
      }
      const data = (await res.json()) as {
        error?: string;
        storageKey?: string;
        originalFilename?: string;
        mimeType?: string;
        sizeBytes?: number;
      };
      if (!res.ok || !data.storageKey) {
        throw new Error(data.error || 'Upload failed.');
      }
      await sendGroupMessage(activeGroup.id, profile, {
        kind: 'file',
        noteTitle: file.name,
        originalFilename: data.originalFilename || file.name,
        mimeType: data.mimeType || file.type || 'application/pdf',
        sizeBytes: data.sizeBytes || file.size,
        storageKey: data.storageKey,
      });
      onNotify(`Shared "${file.name}" to ${activeGroup.name}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to share file.');
    } finally {
      setUploadingFile(false);
      setUploadProgress(null);
    }
  };

  const handleShareLibraryNote = async (note: NoteOrFile) => {
    if (!activeGroup) return;
    try {
      if (note.driveFileId && accessToken) {
        await setDriveFileAnyoneReader(accessToken, note.driveFileId);
      }
      await sendGroupMessage(activeGroup.id, profile, {
        kind: note.kind === 'file' ? 'file' : 'note',
        text: note.textContent,
        noteTitle: note.title,
        originalFilename: note.originalFilename,
        mimeType: note.mimeType,
        sizeBytes: note.sizeBytes,
        storageKey: note.storageKey,
        driveFileId: note.driveFileId,
        sourceNoteId: note.id,
      });
      setShowShareLibraryModal(false);
      onNotify(`Shared "${note.title}" in ${activeGroup.name}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not share note.');
    }
  };

  const handleOpenMessageAttachment = async (msg: StudyGroupMessage) => {
    if (!activeGroup) return;
    setPreviewMsg(msg);
    if (previewBlobUrl) {
      URL.revokeObjectURL(previewBlobUrl);
      setPreviewBlobUrl(null);
    }
    setPreviewDriveEmbedUrl(null);
    if (msg.kind !== 'file') return;

    setLoadingPreview(true);
    try {
      if (msg.driveFileId) {
        if (accessToken && msg.sizeBytes <= 60 * 1024 * 1024) {
          try {
            const url = await fetchDriveFileBlobUrl(accessToken, msg.driveFileId, msg.mimeType);
            setPreviewBlobUrl(url);
            return;
          } catch {
            // Fall through to Google Drive embed preview
          }
        }
        setPreviewDriveEmbedUrl(getDrivePreviewEmbedUrl(msg.driveFileId));
        return;
      }

      if (!msg.storageKey) {
        throw new Error('No file attachment source found.');
      }

      const idToken = await getIdToken();
      const url = `/api/files/${encodeURIComponent(msg.senderUid)}/${encodeURIComponent(
        msg.storageKey
      )}?groupId=${encodeURIComponent(activeGroup.id)}&mime=${encodeURIComponent(
        msg.mimeType
      )}&name=${encodeURIComponent(msg.originalFilename)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) throw new Error('Unable to load group file preview.');
      const blob = await res.blob();
      setPreviewBlobUrl(URL.createObjectURL(blob));
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not open file.');
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleSaveCopyToLibrary = async (msg: StudyGroupMessage) => {
    if (!activeGroup) return;
    setSavingMsgId(msg.id);
    try {
      let newStorageKey = '';
      let sizeBytes = msg.sizeBytes;
      const driveFileId = msg.driveFileId || '';

      if (msg.kind === 'file' && !driveFileId && msg.storageKey) {
        const idToken = await getIdToken();
        const res = await fetch('/api/files/copy-shared', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ownerUid: msg.senderUid,
            storageKey: msg.storageKey,
            groupId: activeGroup.id,
          }),
        });
        const ctype = res.headers.get('content-type') || '';
        if (!ctype.includes('application/json')) {
          throw new Error('Server file copy is not available for legacy uploads on this host.');
        }
        const data = (await res.json()) as {
          error?: string;
          storageKey?: string;
          sizeBytes?: number;
        };
        if (!res.ok || !data.storageKey) {
          throw new Error(data.error || 'Could not copy group file.');
        }
        newStorageKey = data.storageKey;
        sizeBytes = data.sizeBytes ?? msg.sizeBytes;
      }

      await createNoteOrFile(
        profile.uid,
        {
          courseId: '',
          courseCode: activeGroup.courseCode || 'GROUP',
          topicId: '',
          topicTitle: activeGroup.name,
          title: msg.noteTitle || msg.originalFilename || `Note from ${msg.senderName}`,
          kind: msg.kind === 'file' ? 'file' : 'text',
          textContent: msg.text,
          originalFilename: msg.originalFilename || `${msg.noteTitle || 'note'}.txt`,
          mimeType: msg.mimeType || 'text/plain',
          sizeBytes,
          storageKey: newStorageKey,
          isShared: false,
          driveFileId,
        },
        [],
        profile.displayName
      );
      onNotify('Saved copy to your personal Notes & Files library.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to save copy.');
    } finally {
      setSavingMsgId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 min-h-[600px]">
      {/* Left Sidebar: Group List + Create/Join */}
      <div className="lg:col-span-4 glass-panel rounded-xl flex flex-col overflow-hidden">
        <div className="p-4 border-b border-slate-200/70 dark:border-slate-800/80 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              Study Groups ({studyGroups.length})
            </h2>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              New Group
            </button>
          </div>

          <input
            type="text"
            value={groupSearch}
            onChange={(e) => setGroupSearch(e.target.value)}
            placeholder="Search groups..."
            className="w-full px-3 py-1.5 text-xs bg-white/70 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg"
          />

          <form onSubmit={(e) => void handleJoinByCode(e)} className="flex gap-1.5">
            <input
              type="text"
              value={joinCodeInput}
              onChange={(e) => setJoinCodeInput(e.target.value)}
              placeholder="Join with code (GRP-...)"
              className="flex-1 px-2.5 py-1.5 text-xs font-mono bg-white/70 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 rounded-lg"
            />
            <button
              type="submit"
              disabled={joiningGroup || !joinCodeInput.trim()}
              className="px-3 py-1.5 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-200/80 dark:bg-slate-800/80 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-lg disabled:opacity-50 whitespace-nowrap"
            >
              Join
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100/80 dark:divide-slate-800/70">
          {filteredGroups.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
              No study groups yet. Create a group or join with a group code to share PDFs and notes like a study chatroom.
            </div>
          ) : (
            filteredGroups.map((g) => {
              const isSelected = activeGroup?.id === g.id;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setSelectedGroupId(g.id)}
                  className={`w-full p-3.5 text-left transition-colors ${
                    isSelected
                      ? 'bg-blue-50/85 dark:bg-blue-950/50'
                      : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {g.name}
                    </span>
                    <span className="text-[11px] font-mono text-slate-500 shrink-0 tabular-nums">
                      {g.memberUids.length}m
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-blue-600 dark:text-blue-400 mt-0.5">
                    {g.courseCode || 'GENERAL'} · {g.groupCode}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate mt-1">
                    {g.lastMessageText || 'No messages yet'}
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right Pane: WhatsApp-style Thread */}
      <div className="lg:col-span-8 glass-panel rounded-xl flex flex-col overflow-hidden min-h-[600px]">
        {!activeGroup ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-3">
            <MessageSquare className="w-10 h-10 text-slate-400" />
            <p className="text-base font-semibold text-slate-800 dark:text-slate-200">
              Notes &amp; PDF Study Groups
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md">
              Create a WhatsApp-style group for your course or lab team to drop PDFs up to 2 GB via Google Drive, lecture notes, and quick study messages in real time.
            </p>
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              Create First Study Group
            </button>
          </div>
        ) : (
          <>
            {/* Group Header */}
            <div className="px-5 py-3.5 border-b border-slate-200/70 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {activeGroup.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {activeGroup.courseCode || 'GENERAL'} · {activeGroup.memberUids.length} members · Code:{' '}
                  <span className="font-mono text-slate-700 dark:text-slate-300">
                    {activeGroup.groupCode}
                  </span>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    void navigator.clipboard?.writeText(activeGroup.groupCode);
                    onNotify(`Copied group code: ${activeGroup.groupCode}`);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-mono text-slate-700 dark:text-slate-200 bg-white/70 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy Code
                </button>

                {activeGroup.ownerUid === profile.uid && availableFriendsToAdd.length > 0 && (
                  <div className="flex items-center gap-1">
                    <select
                      value={addFriendSelect}
                      onChange={(e) => setAddFriendSelect(e.target.value)}
                      className="px-2 py-1.5 text-xs bg-white/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg"
                    >
                      <option value="">Add friend...</option>
                      {availableFriendsToAdd.map((f) => (
                        <option key={f.uid} value={f.uid}>
                          {f.displayName}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      disabled={!addFriendSelect}
                      onClick={() => {
                        const target = addFriendSelect;
                        if (!target) return;
                        void addMemberToStudyGroup(activeGroup, target).then(() => {
                          setAddFriendSelect('');
                          onNotify('Added friend to group.');
                        });
                      }}
                      className="p-1.5 text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-40"
                      aria-label="Add selected friend"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {activeGroup.ownerUid === profile.uid ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDeleteGroup(activeGroup)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg whitespace-nowrap"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Group
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmLeaveGroup(activeGroup)}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    Leave
                  </button>
                )}
              </div>
            </div>

            {/* Messages Stream */}
            <div className="flex-1 p-5 overflow-y-auto space-y-3 bg-slate-50/50 dark:bg-slate-950/40 max-h-[430px]">
              {messages.length === 0 ? (
                <div className="py-16 text-center text-xs text-slate-500 dark:text-slate-400">
                  No messages or PDFs shared in this group yet. Send a message or attach a PDF below!
                </div>
              ) : (
                messages.map((msg) => {
                  const isMine = msg.senderUid === profile.uid;
                  const canDelete = isMine || activeGroup.ownerUid === profile.uid;
                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 shadow-xs border ${
                          isMine
                            ? 'bg-blue-600/95 text-white border-blue-500/50 rounded-br-xs'
                            : 'bg-white/85 dark:bg-slate-800/85 backdrop-blur-md text-slate-900 dark:text-slate-100 border-slate-200/70 dark:border-slate-700/70 rounded-bl-xs'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4 mb-1">
                          <span
                            className={`text-[11px] font-semibold ${
                              isMine ? 'text-blue-100' : 'text-blue-600 dark:text-blue-400'
                            }`}
                          >
                            {isMine ? 'You' : msg.senderName}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span
                              className={`text-[10px] tabular-nums ${
                                isMine ? 'text-blue-100/80' : 'text-slate-400'
                              }`}
                            >
                              {formatMsgTime(msg.createdAt)}
                            </span>
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => void deleteGroupMessage(activeGroup.id, msg.id)}
                                className={`opacity-70 hover:opacity-100 ${
                                  isMine ? 'text-white' : 'text-slate-400 hover:text-red-500'
                                }`}
                                aria-label="Delete message"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>

                        {msg.kind === 'text' ? (
                          <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.text}</p>
                        ) : (
                          <div
                            className={`p-3 rounded-xl space-y-2 border ${
                              isMine
                                ? 'bg-blue-700/50 border-blue-400/40'
                                : 'bg-slate-50/90 dark:bg-slate-900/80 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            <div className="flex items-start gap-2.5">
                              <FileText
                                className={`w-4 h-4 shrink-0 mt-0.5 ${
                                  isMine ? 'text-blue-100' : 'text-blue-600 dark:text-blue-400'
                                }`}
                              />
                              <div className="min-w-0">
                                <div className="text-xs font-semibold truncate">
                                  {msg.noteTitle || msg.originalFilename}
                                </div>
                                <div
                                  className={`text-[11px] tabular-nums ${
                                    isMine ? 'text-blue-100/85' : 'text-slate-500 dark:text-slate-400'
                                  }`}
                                >
                                  {msg.kind === 'file' ? msg.originalFilename : 'Shared text note'} ·{' '}
                                  {formatBytes(msg.sizeBytes)}
                                  {msg.driveFileId ? ' · Google Drive' : ''}
                                </div>
                              </div>
                            </div>

                            {msg.kind === 'note' && msg.text && (
                              <p
                                className={`text-xs font-mono line-clamp-3 whitespace-pre-wrap ${
                                  isMine ? 'text-blue-50' : 'text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {msg.text}
                              </p>
                            )}

                            <div className="flex flex-wrap items-center gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => void handleOpenMessageAttachment(msg)}
                                className={`inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md ${
                                  isMine
                                    ? 'bg-white/20 hover:bg-white/30 text-white'
                                    : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                                }`}
                              >
                                <Eye className="w-3 h-3" />
                                Open
                              </button>
                              {!isMine && (
                                <button
                                  type="button"
                                  disabled={savingMsgId === msg.id}
                                  onClick={() => void handleSaveCopyToLibrary(msg)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium rounded-md bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-60"
                                >
                                  <Download className="w-3 h-3" />
                                  {savingMsgId === msg.id ? 'Saving...' : 'Save to Library'}
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Bottom WhatsApp-Style Composer */}
            <div className="p-3.5 border-t border-slate-200/70 dark:border-slate-800/80 bg-white/75 dark:bg-slate-900/75 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void handleUploadFileToGroup(f);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploadingFile}
                  onClick={() => {
                    if (!accessToken) {
                      onNotify('Connecting your Google Drive for 2 GB group uploads...');
                      onRequestAuth();
                      return;
                    }
                    fileInputRef.current?.click();
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100/90 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap disabled:opacity-60"
                >
                  <Paperclip className="w-3.5 h-3.5" />
                  {uploadingFile
                    ? `Uploading to Drive (${uploadProgress ?? 0}%)...`
                    : accessToken
                      ? 'Send PDF / File (2 GB Drive)'
                      : 'Connect Drive & Send File'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowShareLibraryModal(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50/90 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg whitespace-nowrap"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Share from My Library
                </button>
              </div>

              <form onSubmit={(e) => void handleSendText(e)} className="flex items-end gap-2">
                <textarea
                  rows={1}
                  value={chatText}
                  onChange={(e) => setChatText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      void handleSendText();
                    }
                  }}
                  placeholder={`Message ${activeGroup.name}... (Enter to send)`}
                  className="flex-1 px-3.5 py-2 text-sm bg-white/90 dark:bg-slate-950/90 border border-slate-200 dark:border-slate-800 rounded-xl resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={sendingText || !chatText.trim()}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-xl disabled:opacity-50 whitespace-nowrap"
                >
                  <Send className="w-4 h-4" />
                  Send
                </button>
              </form>
            </div>
          </>
        )}
      </div>

      {/* Create Group Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={(e) => void handleCreateGroup(e)}
            className="w-full max-w-md glass-panel rounded-xl p-6 space-y-4 shadow-xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Create Notes &amp; PDF Study Group
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Group Name</label>
              <input
                type="text"
                required
                maxLength={100}
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g., CSE 320 Midterm Notes"
                className="w-full px-3 py-2 text-sm bg-white/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Course Tag</label>
              <input
                type="text"
                maxLength={32}
                value={newGroupCourse}
                onChange={(e) => setNewGroupCourse(e.target.value)}
                placeholder="e.g., CSE320 or GENERAL"
                className="w-full px-3 py-2 text-sm bg-white/80 dark:bg-slate-950/80 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>

            {friendProfiles.length > 0 && (
              <div className="space-y-2">
                <div className="text-xs font-medium text-slate-500">
                  Add Connected Friends (optional)
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1.5 border border-slate-200 dark:border-slate-800 rounded-lg p-2">
                  {friendProfiles.map((f) => {
                    const checked = selectedFriendsForNew.includes(f.uid);
                    return (
                      <button
                        key={f.uid}
                        type="button"
                        onClick={() =>
                          setSelectedFriendsForNew((prev) =>
                            checked ? prev.filter((id) => id !== f.uid) : [...prev, f.uid]
                          )
                        }
                        className="w-full px-2.5 py-1.5 text-left text-xs rounded-md flex items-center justify-between hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        <span className="text-slate-800 dark:text-slate-200">{f.displayName}</span>
                        {checked && <Check className="w-3.5 h-3.5 text-blue-600" />}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={creatingGroup}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60"
              >
                {creatingGroup ? 'Creating...' : 'Create Group'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Share from Personal Library Modal */}
      {showShareLibraryModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-lg glass-panel rounded-xl overflow-hidden flex flex-col max-h-[80vh] shadow-xl">
            <div className="px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Share Note or PDF from Your Library
              </h3>
              <button
                type="button"
                onClick={() => setShowShareLibraryModal(false)}
                className="p-1 text-slate-400"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {notes.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  No notes or PDFs in your library yet.
                </div>
              ) : (
                notes.map((n) => (
                  <div key={n.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {n.title}
                      </div>
                      <div className="text-xs text-slate-500">
                        {n.courseCode || 'GENERAL'} · {n.kind === 'text' ? 'Text note' : n.originalFilename}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleShareLibraryNote(n)}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg shrink-0"
                    >
                      Share
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Group File / Note Preview Modal */}
      {previewMsg && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-4xl max-h-[90vh] glass-panel rounded-xl flex flex-col overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {previewMsg.noteTitle || previewMsg.originalFilename}
                </h3>
                <p className="text-xs text-slate-500">
                  Shared by {previewMsg.senderName} · {formatBytes(previewMsg.sizeBytes)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {previewMsg.driveFileId && (
                  <a
                    href={getDriveDirectDownloadUrl(previewMsg.driveFileId)}
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
                    if (previewBlobUrl) URL.revokeObjectURL(previewBlobUrl);
                    setPreviewBlobUrl(null);
                    setPreviewDriveEmbedUrl(null);
                    setPreviewMsg(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
              {previewMsg.kind === 'note' ? (
                <pre className="whitespace-pre-wrap font-mono text-sm text-slate-800 dark:text-slate-200">
                  {previewMsg.text}
                </pre>
              ) : loadingPreview ? (
                <div className="py-16 text-center text-sm text-slate-500">Loading preview...</div>
              ) : previewBlobUrl && previewMsg.mimeType.startsWith('image/') ? (
                <img
                  src={previewBlobUrl}
                  alt={previewMsg.noteTitle}
                  className="max-w-full max-h-[65vh] mx-auto rounded-lg"
                />
              ) : previewBlobUrl && previewMsg.mimeType === 'application/pdf' ? (
                <iframe
                  src={previewBlobUrl}
                  title={previewMsg.noteTitle}
                  className="w-full h-[65vh] rounded-lg border border-slate-200 dark:border-slate-800"
                />
              ) : previewDriveEmbedUrl ? (
                <iframe
                  src={previewDriveEmbedUrl}
                  title={previewMsg.noteTitle}
                  className="w-full h-[65vh] rounded-lg border border-slate-200 dark:border-slate-800 bg-white"
                  allow="autoplay"
                />
              ) : (
                <div className="py-12 text-center text-sm text-slate-500">
                  Use &ldquo;Save to Library&rdquo; to copy and download this document format.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmLeaveGroup)}
        title={`Leave "${confirmLeaveGroup?.name || 'group'}"?`}
        description="You will no longer see messages or shared PDFs from this group unless you rejoin with its group code."
        confirmLabel="Leave Group"
        tone="danger"
        onConfirm={async () => {
          if (confirmLeaveGroup) {
            await leaveStudyGroup(confirmLeaveGroup, profile.uid);
            setConfirmLeaveGroup(null);
            onNotify('Left study group.');
          }
        }}
        onCancel={() => setConfirmLeaveGroup(null)}
      />

      <ConfirmDialog
        open={Boolean(confirmDeleteGroup)}
        title={`Delete group "${confirmDeleteGroup?.name || 'group'}"?`}
        description="This permanently deletes the study group, its group code, and all messages inside it for every member."
        confirmLabel="Delete Group"
        tone="danger"
        busy={deletingGroup}
        onConfirm={async () => {
          if (!confirmDeleteGroup) return;
          setDeletingGroup(true);
          try {
            await deleteStudyGroup(confirmDeleteGroup);
            setConfirmDeleteGroup(null);
            onNotify('Study group permanently deleted.');
          } finally {
            setDeletingGroup(false);
          }
        }}
        onCancel={() => setConfirmDeleteGroup(null)}
      />
    </div>
  );
};

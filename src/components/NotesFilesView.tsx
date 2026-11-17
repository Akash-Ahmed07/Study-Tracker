import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  CloudDownload,
  CloudUpload,
  Download,
  ExternalLink,
  Eye,
  FileText,
  FolderUp,
  Layers,
  Search,
  Share2,
  Terminal,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { getIdToken } from '../lib/firebase.ts';
import {
  createNoteOrFile,
  deleteNoteRecord,
  toggleShareNote,
} from '../lib/studyData.ts';
import {
  Course,
  NoteOrFile,
  StudyGroup,
  SyllabusTopic,
  UserProfile,
  UserPublicProfile,
} from '../lib/types.ts';
import {
  downloadDriveFileAsFile,
  DriveFileItem,
  exportBlobToDrive,
  fetchDriveFileBlobUrl,
  getDriveDirectDownloadUrl,
  getDrivePreviewEmbedUrl,
  listDriveFiles,
  setDriveFileAnyoneReader,
  uploadFileToDriveResumable,
} from '../lib/workspace.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import { FlashcardModal } from './FlashcardModal.tsx';
import { NotesGroupsPanel } from './NotesGroupsPanel.tsx';

const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB

interface NotesFilesViewProps {
  profile: UserProfile;
  courses: Course[];
  topics: SyllabusTopic[];
  notes: NoteOrFile[];
  friendUids: string[];
  friendProfiles: UserPublicProfile[];
  studyGroups: StudyGroup[];
  accessToken: string | null;
  onRequestAuth: () => void;
  onRequestDriveOnly?: () => void;
  onNotify: (msg: string) => void;
  initialComposeMode?: 'upload' | 'text' | null;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export const NotesFilesView: React.FC<NotesFilesViewProps> = ({
  profile,
  courses,
  topics,
  notes,
  friendUids,
  friendProfiles,
  studyGroups,
  accessToken,
  onRequestAuth,
  onRequestDriveOnly,
  onNotify,
  initialComposeMode = null,
}) => {
  const [activeTab, setActiveTab] = useState<'library' | 'groups'>('library');
  const [composeMode, setComposeMode] = useState<'upload' | 'text' | null>(initialComposeMode);

  useEffect(() => {
    if (initialComposeMode) {
      setActiveTab('library');
      setComposeMode(initialComposeMode);
    }
  }, [initialComposeMode]);

  const [searchQuery, setSearchQuery] = useState('');
  const [courseFilter, setCourseFilter] = useState('all');

  // Shared attachment selection
  const [selectedCourseId, setSelectedCourseId] = useState(courses[0]?.id || '');
  const [selectedTopicId, setSelectedTopicId] = useState('');
  const [shareOnSave, setShareOnSave] = useState(false);

  // Text note composer (supports ending with a standalone "." line)
  const [noteTitle, setNoteTitle] = useState('');
  const [noteBody, setNoteBody] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // File upload
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadTitle, setUploadTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Viewer modal
  const [viewingNote, setViewingNote] = useState<NoteOrFile | null>(null);
  const [viewerBlobUrl, setViewerBlobUrl] = useState<string | null>(null);
  const [viewerDriveEmbedUrl, setViewerDriveEmbedUrl] = useState<string | null>(null);
  const [loadingViewer, setLoadingViewer] = useState(false);

  // Google Drive import/export
  const [showDriveModal, setShowDriveModal] = useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveFileItem[]>([]);
  const [driveSearch, setDriveSearch] = useState('');
  const [loadingDrive, setLoadingDrive] = useState(false);
  const [importingDriveId, setImportingDriveId] = useState<string | null>(null);
  const [confirmDriveExportNote, setConfirmDriveExportNote] = useState<NoteOrFile | null>(null);
  const [exportingDrive, setExportingDrive] = useState(false);

  // Delete confirmation & flashcard mode
  const [confirmDeleteNote, setConfirmDeleteNote] = useState<NoteOrFile | null>(null);
  const [flashcardNote, setFlashcardNote] = useState<NoteOrFile | null>(null);

  const availableTopics = useMemo(
    () => topics.filter((t) => t.courseId === selectedCourseId),
    [selectedCourseId, topics]
  );

  const filteredNotes = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return notes.filter((n) => {
      if (courseFilter !== 'all' && n.courseId !== courseFilter) return false;
      if (!q) return true;
      return (
        n.title.toLowerCase().includes(q) ||
        n.textContent.toLowerCase().includes(q) ||
        n.originalFilename.toLowerCase().includes(q) ||
        n.courseCode.toLowerCase().includes(q) ||
        n.topicTitle.toLowerCase().includes(q)
      );
    });
  }, [courseFilter, notes, searchQuery]);

  const getAttachmentMeta = () => {
    const c = courses.find((item) => item.id === selectedCourseId);
    const t = topics.find((item) => item.id === selectedTopicId);
    return {
      courseId: c?.id || '',
      courseCode: c?.code || 'GENERAL',
      topicId: t?.id || '',
      topicTitle: t?.title || '',
    };
  };

  const saveTextNote = async (rawBody: string) => {
    const cleanedLines = rawBody.split('\n');
    if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1].trim() === '.') {
      cleanedLines.pop();
    }
    const content = cleanedLines.join('\n').trim();
    const title = noteTitle.trim() || content.split('\n')[0]?.slice(0, 60) || 'Untitled Note';
    if (!content) return;

    setSavingNote(true);
    try {
      const meta = getAttachmentMeta();
      await createNoteOrFile(
        profile.uid,
        {
          ...meta,
          title,
          kind: 'text',
          textContent: content,
          originalFilename: `${title.replace(/[^a-zA-Z0-9_-]+/g, '_')}.txt`,
          mimeType: 'text/plain',
          sizeBytes: new Blob([content]).size,
          storageKey: '',
          isShared: shareOnSave,
          driveFileId: '',
        },
        friendUids,
        profile.displayName
      );
      setNoteTitle('');
      setNoteBody('');
      setComposeMode(null);
      onNotify('Text note saved to your library.');
    } finally {
      setSavingNote(false);
    }
  };

  const handleTextNoteChange = (val: string) => {
    setNoteBody(val);
    const lines = val.split('\n');
    if (lines.length >= 2 && lines[lines.length - 1] === '' && lines[lines.length - 2].trim() === '.') {
      const withoutTrailingBlank = lines.slice(0, -1).join('\n');
      void saveTextNote(withoutTrailingBlank);
    }
  };

  const uploadSingleFile = async (file: File, existingDriveId = '') => {
    if (file.size > MAX_FILE_SIZE_BYTES) {
      onNotify(`"${file.name}" exceeds the 2 GB per-file limit.`);
      return;
    }

    setUploading(true);
    setUploadProgress(0);
    try {
      const meta = getAttachmentMeta();

      // Primary storage: each user's own Google Drive (supports 1 GB - 2 GB+ with zero server limit)
      if (existingDriveId) {
        if (shareOnSave && accessToken) {
          await setDriveFileAnyoneReader(accessToken, existingDriveId);
        }
        await createNoteOrFile(
          profile.uid,
          {
            ...meta,
            title: uploadTitle.trim() || file.name,
            kind: 'file',
            textContent: '',
            originalFilename: file.name,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
            storageKey: '',
            isShared: shareOnSave,
            driveFileId: existingDriveId,
          },
          friendUids,
          profile.displayName
        );
        setUploadTitle('');
        setComposeMode(null);
        onNotify(`Linked "${file.name}" from your Google Drive.`);
        return;
      }

      if (accessToken) {
        const driveRes = await uploadFileToDriveResumable(accessToken, file, {
          shareAnyone: shareOnSave,
          onProgress: (pct) => setUploadProgress(pct),
        });

        await createNoteOrFile(
          profile.uid,
          {
            ...meta,
            title: uploadTitle.trim() || file.name,
            kind: 'file',
            textContent: '',
            originalFilename: file.name,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
            storageKey: '',
            isShared: shareOnSave,
            driveFileId: driveRes.id,
          },
          friendUids,
          profile.displayName
        );

        setUploadTitle('');
        setComposeMode(null);
        onNotify(`Uploaded "${file.name}" (${formatBytes(file.size)}) to your Google Drive.`);
        return;
      }

      // Fallback to local Express backend only when running with the backend server
      let serverAvailable = false;
      try {
        const healthRes = await fetch('/api/health');
        const ctype = healthRes.headers.get('content-type') || '';
        serverAvailable = healthRes.ok && ctype.includes('application/json');
      } catch {
        serverAvailable = false;
      }

      if (!serverAvailable) {
        onNotify('Connect your Google Drive first to upload files up to 2 GB directly to your Drive.');
        onRequestAuth();
        return;
      }

      const idToken = await getIdToken();
      const form = new FormData();
      form.append('file', file);

      const res = await fetch('/api/files/upload', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${idToken}`,
        },
        body: form,
      });

      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error('Connect Google Drive to upload files up to 2 GB directly to your Drive.');
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

      await createNoteOrFile(
        profile.uid,
        {
          ...meta,
          title: uploadTitle.trim() || file.name,
          kind: 'file',
          textContent: '',
          originalFilename: data.originalFilename || file.name,
          mimeType: data.mimeType || file.type || 'application/octet-stream',
          sizeBytes: data.sizeBytes || file.size,
          storageKey: data.storageKey,
          isShared: shareOnSave,
          driveFileId: '',
        },
        friendUids,
        profile.displayName
      );

      setUploadTitle('');
      setComposeMode(null);
      onNotify(`Uploaded "${file.name}" (${formatBytes(file.size)}).`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'File upload failed.');
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  const handleOpenViewer = async (note: NoteOrFile) => {
    setViewingNote(note);
    if (viewerBlobUrl) {
      URL.revokeObjectURL(viewerBlobUrl);
      setViewerBlobUrl(null);
    }
    setViewerDriveEmbedUrl(null);
    if (note.kind === 'text') return;

    setLoadingViewer(true);
    try {
      if (note.driveFileId) {
        if (accessToken && note.sizeBytes <= 60 * 1024 * 1024) {
          try {
            const url = await fetchDriveFileBlobUrl(accessToken, note.driveFileId, note.mimeType);
            setViewerBlobUrl(url);
            return;
          } catch {
            // Fall through to Google Drive embed viewer
          }
        }
        setViewerDriveEmbedUrl(getDrivePreviewEmbedUrl(note.driveFileId));
        return;
      }

      if (!note.storageKey) {
        throw new Error('No file attachment found for this item.');
      }

      const idToken = await getIdToken();
      const url = `/api/files/${encodeURIComponent(note.userId)}/${encodeURIComponent(
        note.storageKey
      )}?mime=${encodeURIComponent(note.mimeType)}&name=${encodeURIComponent(note.originalFilename)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) throw new Error('Unable to load file preview.');
      const blob = await res.blob();
      setViewerBlobUrl(URL.createObjectURL(blob));
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not open file.');
    } finally {
      setLoadingViewer(false);
    }
  };

  const handleExportLocal = async (note: NoteOrFile) => {
    if (note.kind === 'text') {
      const blob = new Blob([note.textContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = note.originalFilename || `${note.title}.txt`;
      a.click();
      URL.revokeObjectURL(url);
      onNotify(`Exported "${note.title}" as text file.`);
      return;
    }

    if (note.driveFileId) {
      if (accessToken && note.sizeBytes <= 60 * 1024 * 1024) {
        try {
          const blobUrl = await fetchDriveFileBlobUrl(accessToken, note.driveFileId, note.mimeType);
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = note.originalFilename || note.title;
          a.click();
          URL.revokeObjectURL(blobUrl);
          onNotify(`Downloaded "${note.originalFilename}".`);
          return;
        } catch {
          // Fall back to Google Drive download link
        }
      }
      const a = document.createElement('a');
      a.href = getDriveDirectDownloadUrl(note.driveFileId);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.click();
      onNotify(`Opened Google Drive download for "${note.originalFilename}".`);
      return;
    }

    try {
      const idToken = await getIdToken();
      const url = `/api/files/${encodeURIComponent(note.userId)}/${encodeURIComponent(
        note.storageKey
      )}?download=1&name=${encodeURIComponent(note.originalFilename)}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (!res.ok) throw new Error('Export failed.');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = note.originalFilename || note.title;
      a.click();
      URL.revokeObjectURL(blobUrl);
      onNotify(`Exported "${note.originalFilename}".`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Export failed.');
    }
  };

  const handleOpenDrivePicker = async () => {
    if (!accessToken) {
      onRequestAuth();
      return;
    }
    setShowDriveModal(true);
    setLoadingDrive(true);
    try {
      const files = await listDriveFiles(accessToken, driveSearch);
      setDriveFiles(files);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not list Google Drive files.');
    } finally {
      setLoadingDrive(false);
    }
  };

  const handleImportDriveFile = async (item: DriveFileItem) => {
    if (!accessToken) return;
    setImportingDriveId(item.id);
    try {
      const sizeBytes = Number(item.size) || 0;
      const meta = getAttachmentMeta();
      // Link large files directly via Drive ID without re-downloading if already binary in Drive
      if (sizeBytes > 25 * 1024 * 1024 && !item.mimeType.startsWith('application/vnd.google-apps.')) {
        if (shareOnSave) {
          await setDriveFileAnyoneReader(accessToken, item.id);
        }
        await createNoteOrFile(
          profile.uid,
          {
            ...meta,
            title: uploadTitle.trim() || item.name,
            kind: 'file',
            textContent: '',
            originalFilename: item.name,
            mimeType: item.mimeType || 'application/octet-stream',
            sizeBytes,
            storageKey: '',
            isShared: shareOnSave,
            driveFileId: item.id,
          },
          friendUids,
          profile.displayName
        );
        setShowDriveModal(false);
        onNotify(`Linked "${item.name}" (${formatBytes(sizeBytes)}) from Google Drive.`);
      } else {
        const file = await downloadDriveFileAsFile(accessToken, item);
        await createNoteOrFile(
          profile.uid,
          {
            ...meta,
            title: uploadTitle.trim() || file.name,
            kind: 'file',
            textContent: '',
            originalFilename: file.name,
            mimeType: file.type || item.mimeType || 'application/octet-stream',
            sizeBytes: file.size || sizeBytes,
            storageKey: '',
            isShared: shareOnSave,
            driveFileId: item.id,
          },
          friendUids,
          profile.displayName
        );
        setShowDriveModal(false);
        onNotify(`Linked "${file.name}" from your Google Drive.`);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Google Drive import failed.');
    } finally {
      setImportingDriveId(null);
    }
  };

  const handleExportToDrive = async () => {
    if (!confirmDriveExportNote) return;
    if (!accessToken) {
      setConfirmDriveExportNote(null);
      onRequestAuth();
      return;
    }
    setExportingDrive(true);
    try {
      if (confirmDriveExportNote.driveFileId) {
        onNotify('This file is already stored in your Google Drive ("Study Tracker Uploads").');
        setConfirmDriveExportNote(null);
        return;
      }

      let blob: Blob;
      const filename =
        confirmDriveExportNote.originalFilename || `${confirmDriveExportNote.title}.txt`;
      let mime = confirmDriveExportNote.mimeType || 'text/plain';

      if (confirmDriveExportNote.kind === 'text') {
        blob = new Blob([confirmDriveExportNote.textContent], { type: 'text/plain;charset=utf-8' });
        mime = 'text/plain';
      } else {
        const idToken = await getIdToken();
        const res = await fetch(
          `/api/files/${encodeURIComponent(confirmDriveExportNote.userId)}/${encodeURIComponent(
            confirmDriveExportNote.storageKey
          )}`,
          { headers: { Authorization: `Bearer ${idToken}` } }
        );
        if (!res.ok) throw new Error('Could not read file for Drive export.');
        blob = await res.blob();
      }

      await exportBlobToDrive(accessToken, filename, mime, blob);
      onNotify(`Saved "${filename}" to your Google Drive.`);
      setConfirmDriveExportNote(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Google Drive export failed.');
    } finally {
      setExportingDrive(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteNote) return;
    const target = confirmDeleteNote;
    setConfirmDeleteNote(null);
    if (target.kind === 'file' && target.storageKey) {
      try {
        const idToken = await getIdToken();
        await fetch(`/api/files/${encodeURIComponent(target.storageKey)}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${idToken}` },
        });
      } catch (err) {
        console.warn('File disk cleanup error:', err);
      }
    }
    await deleteNoteRecord(profile.uid, target);
    onNotify('Note removed from your library.');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            4. Notes &amp; Files
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
            Upload PDFs, slides, videos, or documents up to 2 GB directly to your own Google Drive, write dot-terminated notes, or collaborate in Study Groups.
          </p>
        </div>

        {activeTab === 'library' && (
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setComposeMode(composeMode === 'upload' ? null : 'upload')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap shadow-sm"
            >
              <FolderUp className="w-4 h-4" />
              Upload File (2 GB Drive)
            </button>
            <button
              type="button"
              onClick={() => setComposeMode(composeMode === 'text' ? null : 'text')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 glass-subtle hover:bg-white/80 dark:hover:bg-slate-800/80 rounded-lg whitespace-nowrap"
            >
              <Terminal className="w-4 h-4" />
              Write Text Note
            </button>
            <button
              type="button"
              onClick={() => void handleOpenDrivePicker()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 glass-subtle hover:bg-white/80 dark:hover:bg-slate-800/80 rounded-lg whitespace-nowrap"
            >
              <CloudDownload className="w-4 h-4" />
              Import from Drive
            </button>
          </div>
        )}
      </div>

      {/* Section Tab Switcher: My Library vs WhatsApp-style Study Groups */}
      <div className="inline-flex p-1 glass-subtle rounded-xl gap-1">
        <button
          type="button"
          onClick={() => setActiveTab('library')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'library'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <FileText className="w-3.5 h-3.5" />
          <span className="tabular-nums">My Notes &amp; Files ({notes.length})</span>
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('groups')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap ${
            activeTab === 'groups'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          <span className="tabular-nums">Study Groups ({studyGroups.length})</span>
        </button>
      </div>

      {activeTab === 'groups' ? (
        <NotesGroupsPanel
          profile={profile}
          courses={courses}
          notes={notes}
          friendProfiles={friendProfiles}
          studyGroups={studyGroups}
          accessToken={accessToken}
          onRequestAuth={onRequestAuth}
          onNotify={onNotify}
        />
      ) : (
        <>
          {composeMode && (
            <div className="glass-panel rounded-xl p-6 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Attach to Course
                  </label>
                  <select
                    value={selectedCourseId}
                    onChange={(e) => {
                      setSelectedCourseId(e.target.value);
                      setSelectedTopicId('');
                    }}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    <option value="">General Library</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} — {c.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Attach to Topic (optional)
                  </label>
                  <select
                    value={selectedTopicId}
                    onChange={(e) => setSelectedTopicId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    <option value="">Course-wide</option>
                    {availableTopics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-5">
                  <input
                    id="share-on-save"
                    type="checkbox"
                    checked={shareOnSave}
                    onChange={(e) => setShareOnSave(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600"
                  />
                  <label
                    htmlFor="share-on-save"
                    className="text-sm text-slate-700 dark:text-slate-300"
                  >
                    Share with connected friends
                  </label>
                </div>
              </div>

              {composeMode === 'upload' && (
                <div className="space-y-4">
                  <div className="p-3.5 glass-subtle rounded-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-slate-700 dark:text-slate-300">
                      {accessToken ? (
                        <span>
                          <strong className="text-emerald-600 dark:text-emerald-400">
                            Google Drive Connected:
                          </strong>{' '}
                          Files up to 2 GB upload directly into your personal &ldquo;Study Tracker Uploads&rdquo; Drive folder — zero app storage limit.
                        </span>
                      ) : (
                        <span>
                          Connect your Google Drive so every uploaded file (up to 2 GB) is saved safely in your own Drive account.
                        </span>
                      )}
                    </div>
                    {!accessToken && (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={onRequestAuth}
                          className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap shrink-0"
                        >
                          Connect Google Drive
                        </button>
                        {onRequestDriveOnly && (
                          <button
                            type="button"
                            onClick={onRequestDriveOnly}
                            className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-lg whitespace-nowrap shrink-0"
                          >
                            Drive Only
                          </button>
                        )}
                      </div>
                    )}
                  </div>

                  <input
                    type="text"
                    value={uploadTitle}
                    onChange={(e) => setUploadTitle(e.target.value)}
                    placeholder="Optional custom title (defaults to filename)"
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDragActive(true);
                    }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => {
                      e.preventDefault();
                      setDragActive(false);
                      const file = e.dataTransfer.files?.[0];
                      if (file) void uploadSingleFile(file);
                    }}
                    className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors ${
                      dragActive
                        ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30'
                        : 'border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950/40'
                    }`}
                  >
                    <FolderUp className="w-8 h-8 text-slate-400 mx-auto mb-3" />
                    <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                      {uploading
                        ? uploadProgress !== null
                          ? `Uploading directly to your Google Drive (${uploadProgress}%)...`
                          : 'Uploading file...'
                        : 'Drag and drop a PDF, lecture slides, video, Word file, or image here'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Minimum 1 GB · Up to 2 GB per file · Saved to each student&apos;s own Google Drive
                    </p>

                    {uploading && uploadProgress !== null && (
                      <div className="max-w-sm mx-auto mt-4 space-y-1.5">
                        <div className="w-full h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-blue-600 rounded-full transition-all duration-200"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <div className="text-[11px] font-mono tabular-nums text-slate-500">
                          {uploadProgress}% uploaded
                        </div>
                      </div>
                    )}

                    <input
                      ref={fileInputRef}
                      type="file"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void uploadSingleFile(file);
                        e.target.value = '';
                      }}
                      className="hidden"
                    />
                    <button
                      type="button"
                      disabled={uploading}
                      onClick={() => {
                        if (!accessToken) {
                          onNotify('Connecting your Google Drive for 2 GB uploads...');
                          onRequestAuth();
                          return;
                        }
                        fileInputRef.current?.click();
                      }}
                      className="mt-4 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60"
                    >
                      {uploading
                        ? 'Uploading...'
                        : accessToken
                          ? 'Choose File (up to 2 GB)'
                          : 'Connect Drive & Choose File'}
                    </button>
                  </div>
                </div>
              )}

              {composeMode === 'text' && (
                <div className="space-y-3">
                  <input
                    type="text"
                    value={noteTitle}
                    onChange={(e) => setNoteTitle(e.target.value)}
                    placeholder="Note title (e.g., Week 4 Lecture Summary)"
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                  <textarea
                    rows={7}
                    value={noteBody}
                    onChange={(e) => handleTextNoteChange(e.target.value)}
                    placeholder={`Write your text note directly...\nTip: End with a line containing only a dot (.) and press Enter to save immediately.`}
                    className="w-full px-3 py-2.5 text-sm font-mono bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                      End with "." on its own line + Enter, or click Save Note
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setComposeMode(null)}
                        className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-lg"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={savingNote || !noteBody.trim()}
                        onClick={() => void saveTextNote(noteBody)}
                        className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60"
                      >
                        {savingNote ? 'Saving...' : 'Save Note'}
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Search & Course Filter Bar */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes, text content, filenames, or topics..."
                className="w-full pl-9 pr-4 py-2 text-sm glass-subtle rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="px-3 py-2 text-sm glass-subtle rounded-lg"
            >
              <option value="all">All Courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} — {c.title}
                </option>
              ))}
            </select>
          </div>

          {/* Notes & Files List */}
          <div className="glass-panel rounded-xl overflow-hidden">
            {filteredNotes.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <FileText className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-base font-medium text-slate-800 dark:text-slate-200">
                  {notes.length === 0 ? 'Your Notes & Files library is empty' : 'No matching notes or files'}
                </p>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Upload course PDFs or lecture files (up to 2 GB on your Google Drive), write a text note, or import from Drive.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredNotes.map((item) => (
                  <div
                    key={item.id}
                    className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                  >
                    <div className="min-w-0 space-y-1">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {item.title}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums truncate">
                        {item.courseCode || 'GENERAL'}
                        {item.topicTitle ? ` · ${item.topicTitle}` : ''}
                        {' · '}
                        {item.kind === 'text' ? 'Text note' : item.originalFilename}
                        {' · '}
                        {formatBytes(item.sizeBytes)}
                        {item.driveFileId ? ' · Google Drive' : ''}
                        {item.isShared ? ' · Shared with friends' : ' · Private'}
                      </p>
                      {item.kind === 'text' && item.textContent && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2 pt-1 font-mono">
                          {item.textContent}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      {item.kind === 'text' && (
                        <button
                          type="button"
                          onClick={() => setFlashcardNote(item)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg whitespace-nowrap"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          Study Cards
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => void handleOpenViewer(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Open
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleExportLocal(item)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export
                      </button>
                      {item.driveFileId ? (
                        <a
                          href={`https://drive.google.com/file/d/${encodeURIComponent(item.driveFileId)}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/50 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg whitespace-nowrap"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          View in Drive
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            if (!accessToken) {
                              onRequestAuth();
                              return;
                            }
                            setConfirmDriveExportNote(item);
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg whitespace-nowrap"
                        >
                          <CloudUpload className="w-3.5 h-3.5" />
                          Save to Drive
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          if (!item.isShared && item.driveFileId && accessToken) {
                            await setDriveFileAnyoneReader(accessToken, item.driveFileId);
                          }
                          await toggleShareNote(
                            profile.uid,
                            profile.displayName,
                            item,
                            !item.isShared,
                            friendUids
                          );
                          onNotify(
                            item.isShared
                              ? 'Note set to private.'
                              : 'Note shared with connected friends.'
                          );
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap ${
                          item.isShared
                            ? 'text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800'
                            : 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        {item.isShared ? 'Shared' : 'Share'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteNote(item)}
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                        aria-label="Delete note"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {/* Viewer Modal */}
      {viewingNote && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-4xl max-h-[90vh] glass-panel rounded-xl flex flex-col overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {viewingNote.title}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {viewingNote.courseCode} · {viewingNote.originalFilename} ·{' '}
                  {formatBytes(viewingNote.sizeBytes)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleExportLocal(viewingNote)}
                  className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                >
                  Download Copy
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (viewerBlobUrl) URL.revokeObjectURL(viewerBlobUrl);
                    setViewerBlobUrl(null);
                    setViewerDriveEmbedUrl(null);
                    setViewingNote(null);
                  }}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
              {viewingNote.kind === 'text' ? (
                <pre className="whitespace-pre-wrap font-mono text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                  {viewingNote.textContent}
                </pre>
              ) : loadingViewer ? (
                <div className="py-16 text-center text-sm text-slate-500">
                  Loading preview...
                </div>
              ) : viewerBlobUrl && viewingNote.mimeType.startsWith('image/') ? (
                <img
                  src={viewerBlobUrl}
                  alt={viewingNote.title}
                  className="max-w-full max-h-[65vh] mx-auto rounded-lg"
                />
              ) : viewerBlobUrl && viewingNote.mimeType === 'application/pdf' ? (
                <iframe
                  src={viewerBlobUrl}
                  title={viewingNote.title}
                  className="w-full h-[65vh] rounded-lg border border-slate-200 dark:border-slate-800"
                />
              ) : viewerDriveEmbedUrl ? (
                <iframe
                  src={viewerDriveEmbedUrl}
                  title={viewingNote.title}
                  className="w-full h-[65vh] rounded-lg border border-slate-200 dark:border-slate-800 bg-white"
                  allow="autoplay"
                />
              ) : (
                <div className="py-16 text-center space-y-3">
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    In-browser preview is not available for this document format ({viewingNote.mimeType}).
                  </p>
                  <button
                    type="button"
                    onClick={() => void handleExportLocal(viewingNote)}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                  >
                    Open / Download Document
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Google Drive Picker Modal */}
      {showDriveModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-2xl glass-panel rounded-xl overflow-hidden flex flex-col max-h-[85vh] shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Import File from Google Drive
              </h3>
              <button
                type="button"
                onClick={() => setShowDriveModal(false)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex gap-2">
              <input
                type="text"
                value={driveSearch}
                onChange={(e) => setDriveSearch(e.target.value)}
                placeholder="Filter Drive files by name..."
                className="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
              <button
                type="button"
                onClick={() => void handleOpenDrivePicker()}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                Search
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
              {loadingDrive ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  Loading Google Drive files...
                </div>
              ) : driveFiles.length === 0 ? (
                <div className="p-8 text-center text-sm text-slate-500">
                  No matching files found in your Google Drive.
                </div>
              ) : (
                driveFiles.map((df) => (
                  <div
                    key={df.id}
                    className="px-6 py-3.5 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {df.name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">
                        {df.mimeType}
                        {df.size ? ` · ${formatBytes(Number(df.size))}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={importingDriveId === df.id}
                      onClick={() => void handleImportDriveFile(df)}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap shrink-0 disabled:opacity-60"
                    >
                      {importingDriveId === df.id ? 'Linking...' : 'Import'}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(confirmDriveExportNote)}
        title="Export file to Google Drive?"
        description={`This will upload a copy of "${confirmDriveExportNote?.title || ''}" to your Google Drive.`}
        confirmLabel="Upload to Drive"
        busy={exportingDrive}
        onConfirm={handleExportToDrive}
        onCancel={() => setConfirmDriveExportNote(null)}
      />

      <ConfirmDialog
        open={Boolean(confirmDeleteNote)}
        title={`Delete "${confirmDeleteNote?.title || 'note'}"?`}
        description="This permanently removes the note or uploaded file link from your library and stops sharing it with friends."
        confirmLabel="Delete Note"
        tone="danger"
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmDeleteNote(null)}
      />

      <FlashcardModal
        note={flashcardNote}
        onClose={() => setFlashcardNote(null)}
      />
    </div>
  );
};

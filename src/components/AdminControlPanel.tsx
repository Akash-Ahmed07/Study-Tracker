import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Ban,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Link2,
  Megaphone,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  clearFeatureFormConfig,
  clearGlobalAnnouncement,
  deleteFeatureRequest,
  deleteStudyGroup,
  fetchAdminDashboardData,
  saveFeatureFormConfig,
  saveGlobalAnnouncement,
  setUserSuspensionAdmin,
  updateFeatureRequestAdmin,
} from '../lib/studyData.ts';
import {
  ADMIN_SUPPORT_EMAIL,
  FeatureFormConfig,
  FeatureRequest,
  FeatureRequestStatus,
  GlobalAnnouncement,
  StudyGroup,
  UserProfile,
  UserPublicProfile,
} from '../lib/types.ts';
import {
  createFeatureRequestGoogleForm,
  getGoogleFormDetails,
  GoogleFormDetails,
  GoogleFormResponseSummary,
  listGoogleFormResponses,
} from '../lib/workspace.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

interface AdminControlPanelProps {
  profile: UserProfile;
  featureRequests: FeatureRequest[];
  formConfig: FeatureFormConfig | null;
  announcement: GlobalAnnouncement | null;
  accessToken: string | null;
  onRequestAuth: () => void;
  onExitAdmin: () => void;
  onNotify: (msg: string) => void;
}

type AdminTab = 'overview' | 'users' | 'announcements' | 'groups' | 'requests';

export const AdminControlPanel: React.FC<AdminControlPanelProps> = ({
  profile,
  featureRequests,
  formConfig,
  announcement,
  accessToken,
  onRequestAuth,
  onExitAdmin,
  onNotify,
}) => {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [publicProfiles, setPublicProfiles] = useState<UserPublicProfile[]>([]);
  const [allGroups, setAllGroups] = useState<StudyGroup[]>([]);

  // User search & suspend actions
  const [userSearch, setUserSearch] = useState('');
  const [busyUid, setBusyUid] = useState<string | null>(null);

  // Global announcement editor
  const [annEnabled, setAnnEnabled] = useState(announcement?.enabled ?? false);
  const [annTitle, setAnnTitle] = useState(announcement?.title || 'Study Tracker Update');
  const [annMessage, setAnnMessage] = useState(announcement?.message || '');
  const [annTone, setAnnTone] = useState<'info' | 'warning' | 'success'>(
    announcement?.tone || 'info'
  );
  const [savingAnn, setSavingAnn] = useState(false);

  // Google Form admin state
  const [newFormTitle, setNewFormTitle] = useState('Study Tracker — Feature Requests');
  const [linkFormIdInput, setLinkFormIdInput] = useState('');
  const [formDetails, setFormDetails] = useState<GoogleFormDetails | null>(null);
  const [formResponses, setFormResponses] = useState<GoogleFormResponseSummary[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);

  // Feature request triage state
  const [triageEdits, setTriageEdits] = useState<
    Record<string, { status: FeatureRequestStatus; adminNote: string }>
  >({});
  const [savingTriageId, setSavingTriageId] = useState<string | null>(null);

  // Confirmation modal
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    details: string[];
    confirmLabel: string;
    tone: 'primary' | 'danger';
    action: (() => Promise<void>) | null;
  }>({
    open: false,
    title: '',
    description: '',
    details: [],
    confirmLabel: 'Confirm',
    tone: 'primary',
    action: null,
  });
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    if (announcement) {
      setAnnEnabled(announcement.enabled);
      setAnnTitle(announcement.title);
      setAnnMessage(announcement.message);
      setAnnTone(announcement.tone);
    }
  }, [announcement]);

  const loadPlatformData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAdminDashboardData();
      setUsers(data.users);
      setPublicProfiles(data.publicProfiles);
      setAllGroups(data.groups);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not load admin telemetry.');
    } finally {
      setLoading(false);
    }
  }, [onNotify]);

  useEffect(() => {
    void loadPlatformData();
  }, [loadPlatformData]);

  const publicMap = useMemo(() => {
    const map = new Map<string, UserPublicProfile>();
    for (const p of publicProfiles) map.set(p.uid, p);
    return map;
  }, [publicProfiles]);

  const stats = useMemo(() => {
    const suspendedCount = users.filter((u) => u.suspended).length;
    const totalWeeklyHours =
      publicProfiles.reduce((acc, p) => acc + (Number(p.weeklyMinutes) || 0), 0) / 60;
    const openRequests = featureRequests.filter((r) => r.status === 'open').length;
    return {
      totalUsers: users.length,
      suspendedCount,
      totalGroups: allGroups.length,
      totalWeeklyHours,
      openRequests,
    };
  }, [allGroups.length, featureRequests, publicProfiles, users]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.friendCode.toLowerCase().includes(q)
    );
  }, [userSearch, users]);

  const runConfirmed = async () => {
    if (!confirmState.action) return;
    setConfirmBusy(true);
    try {
      await confirmState.action();
      setConfirmState((prev) => ({ ...prev, open: false, action: null }));
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setConfirmBusy(false);
    }
  };

  const handleToggleSuspend = async (target: UserProfile) => {
    if (target.email.toLowerCase() === ADMIN_SUPPORT_EMAIL) {
      onNotify('Admin account cannot be suspended.');
      return;
    }
    const nextSuspended = !target.suspended;
    setBusyUid(target.uid);
    try {
      await setUserSuspensionAdmin(
        target.uid,
        nextSuspended,
        nextSuspended ? 'Suspended by site administrator.' : ''
      );
      setUsers((prev) =>
        prev.map((u) => (u.uid === target.uid ? { ...u, suspended: nextSuspended } : u))
      );
      onNotify(
        nextSuspended
          ? `Suspended access for ${target.email}.`
          : `Restored access for ${target.email}.`
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to update user status.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleSaveAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAnn(true);
    try {
      await saveGlobalAnnouncement(profile.uid, {
        enabled: annEnabled,
        title: annTitle,
        message: annMessage,
        tone: annTone,
      });
      onNotify(
        annEnabled
          ? 'Global announcement published to all students.'
          : 'Global announcement saved (hidden).'
      );
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not save announcement.');
    } finally {
      setSavingAnn(false);
    }
  };

  const handleCreateGoogleForm = () => {
    if (!accessToken) {
      onRequestAuth();
      return;
    }
    const desiredTitle = newFormTitle.trim() || 'Study Tracker — Feature Requests';
    setConfirmState({
      open: true,
      title: 'Create Feature Request Google Form',
      description:
        'Creates a new Google Form in your admin Google account and links its URL for students.',
      details: [`Title: ${desiredTitle}`],
      confirmLabel: 'Create Google Form',
      tone: 'primary',
      action: async () => {
        const created = await createFeatureRequestGoogleForm(accessToken, desiredTitle);
        setFormDetails(created);
        await saveFeatureFormConfig(profile.uid, {
          formId: created.formId,
          formTitle: created.title,
          responderUri: created.responderUri,
        });
        onNotify(`Created and linked Google Form "${created.title}".`);
      },
    });
  };

  const handleLinkExistingForm = (e: React.FormEvent) => {
    e.preventDefault();
    const rawId = linkFormIdInput.trim();
    if (!rawId) return;
    if (!accessToken) {
      onRequestAuth();
      return;
    }
    setConfirmState({
      open: true,
      title: 'Link Existing Google Form',
      description: 'Fetch metadata from Google Forms API and publish to students.',
      details: [`Form ID: ${rawId}`],
      confirmLabel: 'Verify & Link',
      tone: 'primary',
      action: async () => {
        const details = await getGoogleFormDetails(accessToken, rawId);
        setFormDetails(details);
        await saveFeatureFormConfig(profile.uid, {
          formId: details.formId,
          formTitle: details.title,
          responderUri: details.responderUri,
        });
        setLinkFormIdInput('');
        onNotify(`Linked "${details.title}".`);
      },
    });
  };

  const handleFetchResponses = async () => {
    if (!formConfig?.formId) return;
    if (!accessToken) {
      onRequestAuth();
      return;
    }
    setLoadingResponses(true);
    try {
      const [details, responses] = await Promise.all([
        getGoogleFormDetails(accessToken, formConfig.formId),
        listGoogleFormResponses(accessToken, formConfig.formId),
      ]);
      setFormDetails(details);
      setFormResponses(responses);
      onNotify(`Loaded ${responses.length} form response(s).`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to load form responses.');
    } finally {
      setLoadingResponses(false);
    }
  };

  const dbId =
    (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
    'ai-studio-4c04f183-2f3a-41f1-91b9-700637bab5ec';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50/40 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100 p-6 lg:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Hidden Admin Header */}
        <header className="glass-panel rounded-2xl p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">
                Private Admin Control Panel
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hidden route · Authenticated exclusively as{' '}
                <span className="font-mono text-slate-700 dark:text-slate-200">{profile.email}</span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void loadPlatformData()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium glass-subtle rounded-lg"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh Data
            </button>
            <button
              type="button"
              onClick={onExitAdmin}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              Back to Workspace
            </button>
          </div>
        </header>

        {/* Tabs */}
        <nav className="flex flex-wrap gap-2">
          {(
            [
              { id: 'overview', label: 'Overview & Dashboards', icon: Activity },
              { id: 'users', label: `Students (${stats.totalUsers})`, icon: Users },
              { id: 'announcements', label: 'Global Banner', icon: Megaphone },
              { id: 'groups', label: `Study Groups (${stats.totalGroups})`, icon: Users },
              {
                id: 'requests',
                label: `Requests & Forms (${stats.openRequests} open)`,
                icon: MessageSquarePlus,
              },
            ] as const
          ).map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-colors ${
                  tab === item.id
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'glass-panel text-slate-700 dark:text-slate-200 hover:bg-white/90 dark:hover:bg-slate-800/80'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Tab 1: Overview & External Console Links */}
        {tab === 'overview' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="glass-panel rounded-xl p-5">
                <div className="text-xs text-slate-500">Registered Students</div>
                <div className="font-mono text-3xl font-bold tabular-nums mt-1">
                  {stats.totalUsers}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {stats.suspendedCount} suspended
                </div>
              </div>
              <div className="glass-panel rounded-xl p-5">
                <div className="text-xs text-slate-500">Platform Weekly Focus</div>
                <div className="font-mono text-3xl font-bold tabular-nums mt-1 text-blue-600 dark:text-blue-400">
                  {stats.totalWeeklyHours.toFixed(1)}h
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Across all public trackers</div>
              </div>
              <div className="glass-panel rounded-xl p-5">
                <div className="text-xs text-slate-500">Active Study Groups</div>
                <div className="font-mono text-3xl font-bold tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">
                  {stats.totalGroups}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">Notes & PDF channels</div>
              </div>
              <div className="glass-panel rounded-xl p-5">
                <div className="text-xs text-slate-500">Open Feature Requests</div>
                <div className="font-mono text-3xl font-bold tabular-nums mt-1 text-amber-600 dark:text-amber-400">
                  {stats.openRequests}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  {featureRequests.length} total submissions
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-xl p-6 space-y-4">
              <h2 className="text-base font-semibold">Where to Monitor Live Website Data</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <a
                  href="https://vercel.com/dashboard"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-4 glass-subtle rounded-xl space-y-1.5 hover:border-blue-400"
                >
                  <div className="flex items-center justify-between text-sm font-semibold text-blue-600 dark:text-blue-400">
                    <span>Vercel Analytics &amp; Logs</span>
                    <ExternalLink className="w-4 h-4" />
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Live visitor page views, countries, browsers, and deployment build logs.
                  </p>
                </a>

                <a
                  href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/firestore/databases/${dbId}/data`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-4 glass-subtle rounded-xl space-y-1.5 hover:border-blue-400"
                >
                  <div className="flex items-center justify-between text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                    <span>Firebase Firestore Data</span>
                    <ExternalLink className="w-4 h-4" />
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    Inspect all collections (`users`, `studyGroups`, `friendRequests`, `featureRequests`).
                  </p>
                </a>

                <a
                  href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/users`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-4 glass-subtle rounded-xl space-y-1.5 hover:border-blue-400"
                >
                  <div className="flex items-center justify-between text-sm font-semibold text-amber-600 dark:text-amber-400">
                    <span>Firebase Auth &amp; Domains</span>
                    <ExternalLink className="w-4 h-4" />
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    View Google sign-in accounts and manage authorized Vercel domains.
                  </p>
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Student Directory & Access Control */}
        {tab === 'users' && (
          <div className="glass-panel rounded-xl p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-base font-semibold">Registered Students ({filteredUsers.length})</h2>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search name, Gmail, or ST code..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                  <tr>
                    <th className="py-2.5 pr-4">Student</th>
                    <th className="py-2.5 pr-4">Friend Code</th>
                    <th className="py-2.5 pr-4">Scale</th>
                    <th className="py-2.5 pr-4">Weekly Study</th>
                    <th className="py-2.5 pr-4">Status</th>
                    <th className="py-2.5 text-right">Access Control</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredUsers.map((u) => {
                    const pub = publicMap.get(u.uid);
                    const isSelf = u.email.toLowerCase() === ADMIN_SUPPORT_EMAIL;
                    return (
                      <tr key={u.uid}>
                        <td className="py-3 pr-4">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {u.displayName}
                          </div>
                          <div className="font-mono text-[11px] text-slate-500">{u.email}</div>
                        </td>
                        <td className="py-3 pr-4 font-mono">{u.friendCode}</td>
                        <td className="py-3 pr-4 uppercase">{u.gradingScale}</td>
                        <td className="py-3 pr-4 font-mono tabular-nums">
                          {((pub?.weeklyMinutes || 0) / 60).toFixed(1)}h · {pub?.streakDays || 0}d
                        </td>
                        <td className="py-3 pr-4">
                          {u.suspended ? (
                            <span className="text-red-600 dark:text-red-400 font-semibold">
                              Suspended
                            </span>
                          ) : (
                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="py-3 text-right">
                          {isSelf ? (
                            <span className="font-mono text-blue-600 dark:text-blue-400">Admin</span>
                          ) : (
                            <button
                              type="button"
                              disabled={busyUid === u.uid}
                              onClick={() => void handleToggleSuspend(u)}
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md font-medium ${
                                u.suspended
                                  ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                  : 'bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900'
                              }`}
                            >
                              {u.suspended ? (
                                <>
                                  <UserCheck className="w-3.5 h-3.5" /> Restore
                                </>
                              ) : (
                                <>
                                  <Ban className="w-3.5 h-3.5" /> Suspend
                                </>
                              )}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 3: Global Broadcast Announcement */}
        {tab === 'announcements' && (
          <form onSubmit={(e) => void handleSaveAnnouncement(e)} className="glass-panel rounded-xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold">Global Workspace Announcement Banner</h2>
                <p className="text-xs text-slate-500">
                  Publish a live notice banner at the top of every student&apos;s Study Tracker workspace.
                </p>
              </div>
              {announcement && (
                <button
                  type="button"
                  onClick={() =>
                    void clearGlobalAnnouncement().then(() => {
                      setAnnEnabled(false);
                      setAnnMessage('');
                      onNotify('Announcement cleared.');
                    })
                  }
                  className="text-xs text-red-600 hover:underline"
                >
                  Clear Banner
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Banner Status</label>
                <select
                  value={annEnabled ? 'on' : 'off'}
                  onChange={(e) => setAnnEnabled(e.target.value === 'on')}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="on">Visible to all users</option>
                  <option value="off">Hidden / Draft</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Tone</label>
                <select
                  value={annTone}
                  onChange={(e) => setAnnTone(e.target.value as 'info' | 'warning' | 'success')}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="info">Info (Blue)</option>
                  <option value="success">Announcement (Green)</option>
                  <option value="warning">Alert (Amber)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Title</label>
                <input
                  type="text"
                  required
                  maxLength={120}
                  value={annTitle}
                  onChange={(e) => setAnnTitle(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-500 mb-1">Message</label>
              <textarea
                rows={3}
                maxLength={600}
                value={annMessage}
                onChange={(e) => setAnnMessage(e.target.value)}
                placeholder="Write maintenance alerts, exam tips, or feature announcements..."
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>

            <button
              type="submit"
              disabled={savingAnn}
              className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              {savingAnn ? 'Saving...' : 'Save Announcement'}
            </button>
          </form>
        )}

        {/* Tab 4: Study Groups Moderation */}
        {tab === 'groups' && (
          <div className="glass-panel rounded-xl p-6 space-y-4">
            <h2 className="text-base font-semibold">All Study Groups ({allGroups.length})</h2>
            {allGroups.length === 0 ? (
              <p className="text-xs text-slate-500">No study groups created yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {allGroups.map((g) => (
                  <div key={g.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">
                        {g.name}{' '}
                        <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                          ({g.groupCode})
                        </span>
                      </div>
                      <div className="text-xs text-slate-500">
                        Owner: {g.ownerName} · Course: {g.courseCode} · {g.memberUids.length} members
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmState({
                          open: true,
                          title: 'Delete Study Group',
                          description: 'Permanently delete this study group and its messages?',
                          details: [g.name, `Code: ${g.groupCode}`],
                          confirmLabel: 'Delete Group',
                          tone: 'danger',
                          action: async () => {
                            await deleteStudyGroup(g);
                            setAllGroups((prev) => prev.filter((item) => item.id !== g.id));
                            onNotify(`Deleted group "${g.name}".`);
                          },
                        })
                      }
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 dark:bg-red-950/40 rounded-lg"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab 5: Feature Requests Triage & Google Forms Manager */}
        {tab === 'requests' && (
          <div className="space-y-6">
            <div className="glass-panel rounded-xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                  <h2 className="text-base font-semibold">Google Forms Manager</h2>
                </div>
                {formConfig?.formId && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleFetchResponses()}
                      disabled={loadingResponses}
                      className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg"
                    >
                      {loadingResponses ? 'Loading...' : 'Fetch Responses'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmState({
                          open: true,
                          title: 'Unlink Google Form',
                          description: 'Unlink the current Google Form from students?',
                          details: [formConfig.formTitle],
                          confirmLabel: 'Unlink',
                          tone: 'danger',
                          action: async () => {
                            await clearFeatureFormConfig();
                            setFormDetails(null);
                            setFormResponses([]);
                            onNotify('Unlinked Google Form.');
                          },
                        })
                      }
                      className="px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 dark:bg-red-950/50 rounded-lg"
                    >
                      Unlink
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 glass-subtle rounded-xl space-y-2.5">
                  <div className="text-xs font-semibold">Create New Google Form via API</div>
                  <input
                    type="text"
                    value={newFormTitle}
                    onChange={(e) => setNewFormTitle(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                  <button
                    type="button"
                    onClick={handleCreateGoogleForm}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" /> Create &amp; Link
                  </button>
                </div>

                <form onSubmit={handleLinkExistingForm} className="p-4 glass-subtle rounded-xl space-y-2.5">
                  <div className="text-xs font-semibold">Link Existing Form ID</div>
                  <input
                    type="text"
                    value={linkFormIdInput}
                    onChange={(e) => setLinkFormIdInput(e.target.value)}
                    placeholder="Paste Form ID..."
                    className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  />
                  <button
                    type="submit"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold glass-panel rounded-lg"
                  >
                    <Link2 className="w-3.5 h-3.5" /> Verify &amp; Link
                  </button>
                </form>
              </div>

              {formDetails && (
                <div className="text-xs text-slate-600 dark:text-slate-300">
                  Linked: <strong>{formDetails.title}</strong> ({formDetails.questions.length} questions, {formResponses.length} responses loaded)
                </div>
              )}
            </div>

            <div className="glass-panel rounded-xl p-6 space-y-4">
              <h2 className="text-base font-semibold">
                All Student Feature Requests ({featureRequests.length})
              </h2>
              {featureRequests.length === 0 ? (
                <p className="text-xs text-slate-500">No feature requests submitted yet.</p>
              ) : (
                <div className="space-y-3">
                  {featureRequests.map((req) => {
                    const draft = triageEdits[req.id] || {
                      status: req.status,
                      adminNote: req.adminNote || '',
                    };
                    return (
                      <div key={req.id} className="p-4 glass-subtle rounded-xl space-y-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-semibold">{req.title}</div>
                            <div className="text-xs text-slate-500 font-mono">
                              {req.authorName} ({req.authorEmail}) · {req.category}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmState({
                                open: true,
                                title: 'Delete Request',
                                description: 'Delete this feature request permanently?',
                                details: [req.title],
                                confirmLabel: 'Delete',
                                tone: 'danger',
                                action: async () => {
                                  await deleteFeatureRequest(req.id);
                                  onNotify('Feature request deleted.');
                                },
                              })
                            }
                            className="p-1.5 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                          {req.description}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1">
                          <select
                            value={draft.status}
                            onChange={(e) =>
                              setTriageEdits((prev) => ({
                                ...prev,
                                [req.id]: {
                                  ...draft,
                                  status: e.target.value as FeatureRequestStatus,
                                },
                              }))
                            }
                            className="sm:col-span-3 px-2.5 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                          >
                            <option value="open">Open</option>
                            <option value="planned">Planned</option>
                            <option value="shipped">Shipped</option>
                            <option value="declined">Declined</option>
                          </select>
                          <input
                            type="text"
                            value={draft.adminNote}
                            onChange={(e) =>
                              setTriageEdits((prev) => ({
                                ...prev,
                                [req.id]: { ...draft, adminNote: e.target.value },
                              }))
                            }
                            placeholder="Admin response note..."
                            className="sm:col-span-7 px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                          />
                          <button
                            type="button"
                            disabled={savingTriageId === req.id}
                            onClick={async () => {
                              setSavingTriageId(req.id);
                              try {
                                await updateFeatureRequestAdmin(
                                  req.id,
                                  draft.status,
                                  draft.adminNote
                                );
                                onNotify(`Updated "${req.title}".`);
                              } finally {
                                setSavingTriageId(null);
                              }
                            }}
                            className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Save
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.description}
        details={confirmState.details}
        confirmLabel={confirmState.confirmLabel}
        tone={confirmState.tone}
        busy={confirmBusy}
        onConfirm={runConfirmed}
        onCancel={() => {
          if (!confirmBusy) setConfirmState((prev) => ({ ...prev, open: false, action: null }));
        }}
      />
    </div>
  );
};

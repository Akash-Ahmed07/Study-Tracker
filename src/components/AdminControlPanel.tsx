import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  HardDrive,
  Link2,
  Megaphone,
  MessageSquare,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Search,
  Server,
  Settings,
  Shield,
  ShieldCheck,
  ShieldOff,
  Trash2,
  UserCheck,
  UserMinus,
  Users,
  X,
} from 'lucide-react';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  clearFeatureFormConfig,
  clearGlobalAnnouncement,
  deleteFeatureRequest,
  deleteGroupMessage,
  deleteSharedNoteAdmin,
  deleteStudyGroup,
  deleteUserAccountAdmin,
  fetchAdminDashboardData,
  fetchStudyGroupMessagesAdmin,
  grantAdminRoleAdmin,
  revokeAdminRoleAdmin,
  saveFeatureFormConfig,
  saveGlobalAnnouncement,
  saveSystemSettingsConfig,
  setUserSuspensionAdmin,
  updateFeatureRequestAdmin,
  updateStudyGroupAdmin,
  updateUserAdmin,
} from '../lib/studyData.ts';
import {
  ADMIN_EMAILS,
  AdminRole,
  FeatureFormConfig,
  FeatureRequest,
  FeatureRequestStatus,
  GlobalAnnouncement,
  GradingScale,
  isAppAdmin,
  SharedNote,
  StudyGroup,
  StudyGroupMessage,
  SystemSettingsConfig,
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
  systemSettings: SystemSettingsConfig | null;
  accessToken: string | null;
  onRequestAuth: () => void;
  onRequestDriveOnly?: () => void;
  onExitAdmin: () => void;
  onNotify: (msg: string) => void;
}

type AdminTab =
  | 'overview'
  | 'users'
  | 'announcements'
  | 'groups'
  | 'shared'
  | 'requests';

export const AdminControlPanel: React.FC<AdminControlPanelProps> = ({
  profile,
  featureRequests,
  formConfig,
  announcement,
  systemSettings,
  accessToken,
  onRequestAuth,
  onRequestDriveOnly,
  onExitAdmin,
  onNotify,
}) => {
  const [tab, setTab] = useState<AdminTab>('overview');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [publicProfiles, setPublicProfiles] = useState<UserPublicProfile[]>([]);
  const [allGroups, setAllGroups] = useState<StudyGroup[]>([]);
  const [admins, setAdmins] = useState<AdminRole[]>([]);
  const [sharedNotes, setSharedNotes] = useState<SharedNote[]>([]);

  // Diagnostics state
  const [serverHealth, setServerHealth] = useState<{
    checked: boolean;
    ok: boolean;
    message: string;
  }>({ checked: false, ok: false, message: 'Checking...' });

  // User directory filters & power modals
  const [userSearch, setUserSearch] = useState('');
  const [userFilter, setUserFilter] = useState<'all' | 'active' | 'suspended' | 'admins'>('all');
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<UserProfile | null>(null);
  const [suspendReason, setSuspendReason] = useState('Suspended by site administrator.');
  const [editUserTarget, setEditUserTarget] = useState<UserProfile | null>(null);
  const [editUserName, setEditUserName] = useState('');
  const [editUserScale, setEditUserScale] = useState<GradingScale>('bd');
  const [editUserGoal, setEditUserGoal] = useState('600');
  const [savingUserEdit, setSavingUserEdit] = useState(false);

  // Global announcement editor
  const [annEnabled, setAnnEnabled] = useState(announcement?.enabled ?? false);
  const [annTitle, setAnnTitle] = useState(announcement?.title || 'Study Tracker Update');
  const [annMessage, setAnnMessage] = useState(announcement?.message || '');
  const [annTone, setAnnTone] = useState<'info' | 'warning' | 'success'>(
    announcement?.tone || 'info'
  );
  const [savingAnn, setSavingAnn] = useState(false);

  // Platform System Settings editor
  const [sysMaintenance, setSysMaintenance] = useState(
    systemSettings?.maintenanceMode ?? false
  );
  const [sysMaintenanceMsg, setSysMaintenanceMsg] = useState(
    systemSettings?.maintenanceMessage ||
      'Study Tracker is undergoing scheduled maintenance. Please check back shortly.'
  );
  const [sysAllowShared, setSysAllowShared] = useState(
    systemSettings?.allowSharedNotes ?? true
  );
  const [sysMaxMembers, setSysMaxMembers] = useState(
    String(systemSettings?.maxGroupMembers ?? 25)
  );
  const [sysDefaultGoal, setSysDefaultGoal] = useState(
    String(systemSettings?.defaultWeeklyGoalMinutes ?? 600)
  );
  const [savingSys, setSavingSys] = useState(false);

  // Study Groups moderation & message inspector
  const [groupSearch, setGroupSearch] = useState('');
  const [inspectGroup, setInspectGroup] = useState<StudyGroup | null>(null);
  const [groupMessages, setGroupMessages] = useState<StudyGroupMessage[]>([]);
  const [loadingGroupMsgs, setLoadingGroupMsgs] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupCourse, setEditGroupCourse] = useState('');
  const [savingGroupEdit, setSavingGroupEdit] = useState(false);

  // Shared notes moderation
  const [sharedSearch, setSharedSearch] = useState('');
  const [previewShared, setPreviewShared] = useState<SharedNote | null>(null);

  // Google Form admin state
  const [newFormTitle, setNewFormTitle] = useState('Study Tracker — Feature Requests');
  const [linkFormIdInput, setLinkFormIdInput] = useState('');
  const [formDetails, setFormDetails] = useState<GoogleFormDetails | null>(null);
  const [formResponses, setFormResponses] = useState<GoogleFormResponseSummary[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);

  // Feature request triage state
  const [requestFilter, setRequestFilter] = useState<'all' | FeatureRequestStatus>('all');
  const [requestSearch, setRequestSearch] = useState('');
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

  useEffect(() => {
    if (systemSettings) {
      setSysMaintenance(systemSettings.maintenanceMode);
      setSysMaintenanceMsg(systemSettings.maintenanceMessage);
      setSysAllowShared(systemSettings.allowSharedNotes);
      setSysMaxMembers(String(systemSettings.maxGroupMembers));
      setSysDefaultGoal(String(systemSettings.defaultWeeklyGoalMinutes));
    }
  }, [systemSettings]);

  const checkHealth = useCallback(async () => {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { ok?: boolean; maxFileSizeBytes?: number };
      setServerHealth({
        checked: true,
        ok: Boolean(data.ok),
        message: data.ok
          ? `Online (upload cap ${(Number(data.maxFileSizeBytes || 0) / 1024 ** 3).toFixed(1)} GB)`
          : 'Degraded response',
      });
    } catch (err) {
      setServerHealth({
        checked: true,
        ok: false,
        message: err instanceof Error ? err.message : 'Backend unreachable',
      });
    }
  }, []);

  const loadPlatformData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [data] = await Promise.all([fetchAdminDashboardData(), checkHealth()]);
      setUsers(data.users);
      setPublicProfiles(data.publicProfiles);
      setAllGroups(data.groups);
      setAdmins(data.admins);
      setSharedNotes(data.sharedNotes);
      if (data.systemSettings) {
        setSysMaintenance(data.systemSettings.maintenanceMode);
        setSysMaintenanceMsg(data.systemSettings.maintenanceMessage);
        setSysAllowShared(data.systemSettings.allowSharedNotes);
        setSysMaxMembers(String(data.systemSettings.maxGroupMembers));
        setSysDefaultGoal(String(data.systemSettings.defaultWeeklyGoalMinutes));
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Could not load admin telemetry.';
      setLoadError(msg);
      onNotify(msg);
    } finally {
      setLoading(false);
    }
  }, [checkHealth, onNotify]);

  useEffect(() => {
    void loadPlatformData();
  }, [loadPlatformData]);

  const publicMap = useMemo(() => {
    const map = new Map<string, UserPublicProfile>();
    for (const p of publicProfiles) map.set(p.uid, p);
    return map;
  }, [publicProfiles]);

  const adminUidSet = useMemo(() => new Set(admins.map((a) => a.uid)), [admins]);

  const isTargetAdmin = useCallback(
    (u: UserProfile) => isAppAdmin(u.email, adminUidSet.has(u.uid)),
    [adminUidSet]
  );

  const isSuperAdminEmail = useCallback((email?: string | null) => {
    if (!email) return false;
    return (ADMIN_EMAILS as readonly string[]).includes(email.trim().toLowerCase());
  }, []);

  const stats = useMemo(() => {
    const suspendedCount = users.filter((u) => u.suspended).length;
    const totalWeeklyHours =
      publicProfiles.reduce((acc, p) => acc + (Number(p.weeklyMinutes) || 0), 0) / 60;
    const openRequests = featureRequests.filter((r) => r.status === 'open').length;
    const adminCount = users.filter((u) => isTargetAdmin(u)).length;
    return {
      totalUsers: users.length,
      suspendedCount,
      adminCount,
      totalGroups: allGroups.length,
      totalShared: sharedNotes.length,
      totalWeeklyHours,
      openRequests,
    };
  }, [allGroups.length, featureRequests, isTargetAdmin, publicProfiles, sharedNotes.length, users]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users
      .filter((u) => {
        if (userFilter === 'active' && u.suspended) return false;
        if (userFilter === 'suspended' && !u.suspended) return false;
        if (userFilter === 'admins' && !isTargetAdmin(u)) return false;
        if (!q) return true;
        return (
          u.displayName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.friendCode.toLowerCase().includes(q) ||
          u.uid.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aMins = publicMap.get(a.uid)?.weeklyMinutes || 0;
        const bMins = publicMap.get(b.uid)?.weeklyMinutes || 0;
        return bMins - aMins;
      });
  }, [isTargetAdmin, publicMap, userFilter, userSearch, users]);

  const filteredGroups = useMemo(() => {
    const q = groupSearch.trim().toLowerCase();
    if (!q) return allGroups;
    return allGroups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.courseCode.toLowerCase().includes(q) ||
        g.groupCode.toLowerCase().includes(q) ||
        g.ownerName.toLowerCase().includes(q)
    );
  }, [allGroups, groupSearch]);

  const filteredSharedNotes = useMemo(() => {
    const q = sharedSearch.trim().toLowerCase();
    if (!q) return sharedNotes;
    return sharedNotes.filter(
      (n) =>
        n.title.toLowerCase().includes(q) ||
        n.ownerName.toLowerCase().includes(q) ||
        n.courseCode.toLowerCase().includes(q) ||
        n.originalFilename.toLowerCase().includes(q)
    );
  }, [sharedNotes, sharedSearch]);

  const filteredRequests = useMemo(() => {
    const q = requestSearch.trim().toLowerCase();
    return featureRequests.filter((r) => {
      if (requestFilter !== 'all' && r.status !== requestFilter) return false;
      if (!q) return true;
      return (
        r.title.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.authorName.toLowerCase().includes(q) ||
        r.authorEmail.toLowerCase().includes(q)
      );
    });
  }, [featureRequests, requestFilter, requestSearch]);

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

  const handleConfirmSuspend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!suspendTarget) return;
    if (isSuperAdminEmail(suspendTarget.email) || suspendTarget.uid === profile.uid) {
      onNotify('Core admin or current account cannot be suspended.');
      setSuspendTarget(null);
      return;
    }
    setBusyUid(suspendTarget.uid);
    try {
      const reason = suspendReason.trim() || 'Suspended by site administrator.';
      await setUserSuspensionAdmin(suspendTarget.uid, true, reason);
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === suspendTarget.uid ? { ...u, suspended: true, suspendedReason: reason } : u
        )
      );
      onNotify(`Suspended access for ${suspendTarget.email}.`);
      setSuspendTarget(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to suspend student.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleRestoreUser = async (target: UserProfile) => {
    setBusyUid(target.uid);
    try {
      await setUserSuspensionAdmin(target.uid, false, '');
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === target.uid ? { ...u, suspended: false, suspendedReason: '' } : u
        )
      );
      onNotify(`Restored access for ${target.email}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to restore student.');
    } finally {
      setBusyUid(null);
    }
  };

  const handleSaveUserEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUserTarget) return;
    setSavingUserEdit(true);
    try {
      const goal = Math.max(30, Math.min(10080, Number(editUserGoal) || 600));
      const cleanName = editUserName.trim() || editUserTarget.displayName;
      await updateUserAdmin(editUserTarget.uid, {
        displayName: cleanName,
        gradingScale: editUserScale,
        weeklyGoalMinutes: goal,
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.uid === editUserTarget.uid
            ? { ...u, displayName: cleanName, gradingScale: editUserScale, weeklyGoalMinutes: goal }
            : u
        )
      );
      setPublicProfiles((prev) =>
        prev.map((p) =>
          p.uid === editUserTarget.uid
            ? { ...p, displayName: cleanName, weeklyGoalMinutes: goal }
            : p
        )
      );
      onNotify(`Updated profile settings for ${cleanName}.`);
      setEditUserTarget(null);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to update student profile.');
    } finally {
      setSavingUserEdit(false);
    }
  };

  const handleToggleAdminRole = async (target: UserProfile) => {
    if (isSuperAdminEmail(target.email) || target.uid === profile.uid) {
      onNotify('Core admin permissions cannot be modified here.');
      return;
    }
    const currentlyDynamicAdmin = adminUidSet.has(target.uid);
    setBusyUid(target.uid);
    try {
      if (currentlyDynamicAdmin) {
        await revokeAdminRoleAdmin(target.uid);
        setAdmins((prev) => prev.filter((a) => a.uid !== target.uid));
        onNotify(`Revoked admin role from ${target.email}.`);
      } else {
        await grantAdminRoleAdmin(target.uid, target.email);
        setAdmins((prev) => [...prev, { uid: target.uid, email: target.email }]);
        onNotify(`Promoted ${target.email} to Admin.`);
      }
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not update admin role.');
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

  const handleClearAnnouncement = async () => {
    try {
      await clearGlobalAnnouncement();
      setAnnEnabled(false);
      setAnnMessage('');
      onNotify('Announcement cleared.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not clear announcement.');
    }
  };

  const handleSaveSystemSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSys(true);
    try {
      await saveSystemSettingsConfig(profile.uid, {
        maintenanceMode: sysMaintenance,
        maintenanceMessage:
          sysMaintenanceMsg.trim() ||
          'Study Tracker is undergoing scheduled maintenance. Please check back shortly.',
        allowSharedNotes: sysAllowShared,
        maxGroupMembers: Math.max(2, Math.min(25, Number(sysMaxMembers) || 25)),
        defaultWeeklyGoalMinutes: Math.max(
          30,
          Math.min(10080, Number(sysDefaultGoal) || 600)
        ),
      });
      onNotify('Platform system settings updated live.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to update system settings.');
    } finally {
      setSavingSys(false);
    }
  };

  const openGroupInspector = async (group: StudyGroup) => {
    setInspectGroup(group);
    setEditGroupName(group.name);
    setEditGroupCourse(group.courseCode);
    setLoadingGroupMsgs(true);
    try {
      const msgs = await fetchStudyGroupMessagesAdmin(group.id);
      setGroupMessages(msgs);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not load group messages.');
      setGroupMessages([]);
    } finally {
      setLoadingGroupMsgs(false);
    }
  };

  const handleSaveGroupEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectGroup) return;
    setSavingGroupEdit(true);
    try {
      const cleanName = editGroupName.trim() || inspectGroup.name;
      const cleanCourse = editGroupCourse.trim() || inspectGroup.courseCode;
      await updateStudyGroupAdmin(inspectGroup.id, {
        name: cleanName,
        courseCode: cleanCourse,
        memberUids: inspectGroup.memberUids,
      });
      setAllGroups((prev) =>
        prev.map((g) =>
          g.id === inspectGroup.id ? { ...g, name: cleanName, courseCode: cleanCourse } : g
        )
      );
      setInspectGroup((prev) =>
        prev ? { ...prev, name: cleanName, courseCode: cleanCourse } : null
      );
      onNotify(`Updated study group "${cleanName}".`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not update study group.');
    } finally {
      setSavingGroupEdit(false);
    }
  };

  const handleKickGroupMember = async (memberUid: string) => {
    if (!inspectGroup || memberUid === inspectGroup.ownerUid) return;
    const nextMembers = inspectGroup.memberUids.filter((id) => id !== memberUid);
    try {
      await updateStudyGroupAdmin(inspectGroup.id, {
        name: inspectGroup.name,
        courseCode: inspectGroup.courseCode,
        memberUids: nextMembers,
      });
      setAllGroups((prev) =>
        prev.map((g) => (g.id === inspectGroup.id ? { ...g, memberUids: nextMembers } : g))
      );
      setInspectGroup((prev) => (prev ? { ...prev, memberUids: nextMembers } : null));
      onNotify('Removed member from study group.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to remove group member.');
    }
  };

  const handleDeleteGroupMessageAdmin = async (msgId: string) => {
    if (!inspectGroup) return;
    try {
      await deleteGroupMessage(inspectGroup.id, msgId);
      setGroupMessages((prev) => prev.filter((m) => m.id !== msgId));
      onNotify('Message removed from group.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Failed to delete message.');
    }
  };

  const handleExportSnapshotJson = () => {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      projectId: firebaseConfig.projectId,
      stats,
      users: users.map((u) => ({
        uid: u.uid,
        displayName: u.displayName,
        email: u.email,
        friendCode: u.friendCode,
        gradingScale: u.gradingScale,
        weeklyGoalMinutes: u.weeklyGoalMinutes,
        suspended: Boolean(u.suspended),
      })),
      studyGroups: allGroups,
      sharedNotesCount: sharedNotes.length,
      featureRequests,
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studytracker-admin-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify('Exported platform JSON snapshot.');
  };

  const handleExportUsersCsv = () => {
    const header = 'uid,displayName,email,friendCode,scale,weeklyMinutes,streakDays,suspended';
    const rows = users.map((u) => {
      const pub = publicMap.get(u.uid);
      const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
      return [
        esc(u.uid),
        esc(u.displayName),
        esc(u.email),
        esc(u.friendCode),
        esc(u.gradingScale),
        pub?.weeklyMinutes || 0,
        pub?.streakDays || 0,
        Boolean(u.suspended),
      ].join(',');
    });
    const blob = new Blob([[header, ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `studytracker-students-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    onNotify(`Exported ${users.length} student(s) to CSV.`);
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
    'ai-studio-studytracker-e35d7615-f3a0-43c8-aca6-ee7b8e3d95bf';

  const tabs: { id: AdminTab; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: 'overview', label: 'Overview & Health', icon: Activity },
    { id: 'users', label: `Students & Roles (${stats.totalUsers})`, icon: Users },
    { id: 'announcements', label: 'Banner & System', icon: Settings },
    { id: 'groups', label: `Groups (${stats.totalGroups})`, icon: MessageSquare },
    { id: 'shared', label: `Shared Notes (${stats.totalShared})`, icon: FileText },
    { id: 'requests', label: `Requests (${stats.openRequests})`, icon: MessageSquarePlus },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50/40 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100 p-4 sm:p-6 lg:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Admin Header */}
        <header className="glass-panel rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-600 text-white rounded-xl shadow-sm">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-xl font-bold text-slate-900 dark:text-slate-50">
                  Admin Control Center
                </h1>
                {sysMaintenance && (
                  <span className="px-2 py-0.5 text-[11px] font-semibold bg-amber-100 dark:bg-amber-950/70 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800 rounded-md">
                    Maintenance Mode ON
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Authenticated as{' '}
                <span className="font-mono text-slate-700 dark:text-slate-200">
                  {profile.email}
                </span>
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {!accessToken && (
              <>
                <button
                  type="button"
                  onClick={onRequestAuth}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-lg"
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  Connect Workspace
                </button>
                {onRequestDriveOnly && (
                  <button
                    type="button"
                    onClick={onRequestDriveOnly}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium glass-subtle rounded-lg"
                  >
                    Drive Only
                  </button>
                )}
              </>
            )}
            <button
              type="button"
              onClick={() => void loadPlatformData()}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium glass-subtle rounded-lg"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
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

        {loadError && (
          <div className="glass-panel border border-red-300 dark:border-red-900 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-red-700 dark:text-red-300">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Admin telemetry error</div>
                <div className="font-mono mt-0.5 break-all">{loadError}</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => void loadPlatformData()}
              className="px-3 py-1.5 font-semibold bg-red-600 text-white rounded-lg shrink-0 self-start sm:self-auto"
            >
              Retry
            </button>
          </div>
        )}

        {/* Animated Tabs */}
        <nav className="flex flex-wrap gap-2" aria-label="Admin tabs">
          {tabs.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`relative inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold rounded-xl transition-colors ${
                  active
                    ? 'text-white'
                    : 'glass-panel text-slate-700 dark:text-slate-200 hover:bg-white/90 dark:hover:bg-slate-800/80'
                }`}
              >
                {active && (
                  <motion.span
                    layoutId="adminTabPill"
                    transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                    className="absolute inset-0 bg-blue-600 rounded-xl shadow-sm -z-0"
                  />
                )}
                <Icon className="w-3.5 h-3.5 relative z-10" />
                <span className="relative z-10">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          >
            {/* Tab 1: Overview & Diagnostics */}
            {tab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="glass-panel rounded-xl p-5">
                    <div className="text-xs text-slate-500">Registered Students</div>
                    <div className="font-mono text-3xl font-bold tabular-nums mt-1">
                      {stats.totalUsers}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      {stats.suspendedCount} suspended · {stats.adminCount} admin(s)
                    </div>
                  </div>
                  <div className="glass-panel rounded-xl p-5">
                    <div className="text-xs text-slate-500">Platform Weekly Focus</div>
                    <div className="font-mono text-3xl font-bold tabular-nums mt-1 text-blue-600 dark:text-blue-400">
                      {stats.totalWeeklyHours.toFixed(1)}h
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Across all public trackers
                    </div>
                  </div>
                  <div className="glass-panel rounded-xl p-5">
                    <div className="text-xs text-slate-500">Groups &amp; Shared Notes</div>
                    <div className="font-mono text-3xl font-bold tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">
                      {stats.totalGroups} / {stats.totalShared}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-1">
                      Active groups / shared items
                    </div>
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

                {/* Live System Diagnostics & Snapshot Export */}
                <div className="glass-panel rounded-xl p-6 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold">Live System Diagnostics &amp; Backup</h2>
                      <p className="text-xs text-slate-500">
                        Verify backend API health, Firestore database wiring, and Google Drive OAuth status.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportSnapshotJson}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Export Platform JSON
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div className="p-4 glass-subtle rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          <Server className="w-4 h-4 text-blue-600" /> Express File Server
                        </span>
                        <span
                          className={
                            serverHealth.ok
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-red-600 dark:text-red-400'
                          }
                        >
                          {serverHealth.ok ? 'Healthy' : 'Offline'}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 font-mono">
                        {serverHealth.message}
                      </p>
                    </div>

                    <div className="p-4 glass-subtle rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          <Activity className="w-4 h-4 text-emerald-600" /> Firestore Database
                        </span>
                        <span className="text-emerald-600 dark:text-emerald-400">Connected</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 font-mono truncate">
                        {dbId}
                      </p>
                    </div>

                    <div className="p-4 glass-subtle rounded-xl space-y-1.5">
                      <div className="flex items-center justify-between font-semibold">
                        <span className="inline-flex items-center gap-1.5">
                          <HardDrive className="w-4 h-4 text-amber-600" /> Google Drive &amp; Forms Token
                        </span>
                        <span
                          className={
                            accessToken
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }
                        >
                          {accessToken ? 'Active' : 'Not Connected'}
                        </span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400">
                        {accessToken
                          ? 'Session token ready for Drive & Google Forms API.'
                          : 'Connect Workspace or Drive Only in header to manage Google Forms.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Firebase Console Shortcuts */}
                <div className="glass-panel rounded-xl p-6 space-y-4">
                  <h2 className="text-base font-semibold">Firebase Console Direct Links</h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                        Inspect collections (`users`, `studyGroups`, `sharedNotes`, `featureRequests`, `admins`).
                      </p>
                    </a>

                    <a
                      href={`https://console.firebase.google.com/project/${firebaseConfig.projectId}/authentication/users`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-4 glass-subtle rounded-xl space-y-1.5 hover:border-blue-400"
                    >
                      <div className="flex items-center justify-between text-sm font-semibold text-amber-600 dark:text-amber-400">
                        <span>Firebase Auth &amp; Authorized Domains</span>
                        <ExternalLink className="w-4 h-4" />
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-400">
                        Manage Google sign-in accounts and authorized preview domains for project{' '}
                        <span className="font-mono">{firebaseConfig.projectId}</span>.
                      </p>
                    </a>
                  </div>
                </div>
              </div>
            )}

            {/* Tab 2: Student Directory, Roles & Access Control */}
            {tab === 'users' && (
              <div className="glass-panel rounded-xl p-6 space-y-4">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-base font-semibold mr-2">
                      Students &amp; Roles ({filteredUsers.length})
                    </h2>
                    {(['all', 'active', 'suspended', 'admins'] as const).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setUserFilter(f)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize ${
                          userFilter === f
                            ? 'bg-blue-600 text-white'
                            : 'glass-subtle text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-64">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Search name, Gmail, UID, code..."
                        className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleExportUsersCsv}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium glass-subtle rounded-lg"
                    >
                      <Download className="w-3.5 h-3.5" />
                      CSV
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                      <tr>
                        <th className="py-2.5 pr-4">Student</th>
                        <th className="py-2.5 pr-4">Friend Code</th>
                        <th className="py-2.5 pr-4">Goal / Scale</th>
                        <th className="py-2.5 pr-4">Weekly Study</th>
                        <th className="py-2.5 pr-4">Status</th>
                        <th className="py-2.5 text-right">Power Controls</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredUsers.map((u) => {
                        const pub = publicMap.get(u.uid);
                        const isCore = isSuperAdminEmail(u.email);
                        const isDynAdmin = adminUidSet.has(u.uid);
                        const isSelf = u.uid === profile.uid;
                        return (
                          <tr key={u.uid}>
                            <td className="py-3 pr-4">
                              <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-slate-100">
                                <span>{u.displayName}</span>
                                {(isCore || isDynAdmin) && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-mono bg-blue-100 dark:bg-blue-950/70 text-blue-700 dark:text-blue-300 rounded">
                                    {isCore ? 'Owner Admin' : 'Admin'}
                                  </span>
                                )}
                              </div>
                              <div className="font-mono text-[11px] text-slate-500">{u.email}</div>
                            </td>
                            <td className="py-3 pr-4 font-mono">{u.friendCode}</td>
                            <td className="py-3 pr-4 font-mono">
                              {Math.round((u.weeklyGoalMinutes || 600) / 60)}h ·{' '}
                              <span className="uppercase">{u.gradingScale}</span>
                            </td>
                            <td className="py-3 pr-4 font-mono tabular-nums">
                              {((pub?.weeklyMinutes || 0) / 60).toFixed(1)}h · {pub?.streakDays || 0}d
                            </td>
                            <td className="py-3 pr-4">
                              {u.suspended ? (
                                <div>
                                  <span className="text-red-600 dark:text-red-400 font-semibold">
                                    Suspended
                                  </span>
                                  {u.suspendedReason && (
                                    <div className="text-[11px] text-slate-500 max-w-[180px] truncate">
                                      {u.suspendedReason}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                  Active
                                </span>
                              )}
                            </td>
                            <td className="py-3 text-right">
                              <div className="inline-flex flex-wrap items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditUserTarget(u);
                                    setEditUserName(u.displayName);
                                    setEditUserScale(u.gradingScale);
                                    setEditUserGoal(String(u.weeklyGoalMinutes || 600));
                                  }}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-md glass-subtle hover:border-blue-400"
                                  title="Edit student profile"
                                >
                                  <Edit3 className="w-3 h-3" /> Edit
                                </button>

                                {!isCore && !isSelf && (
                                  <>
                                    <button
                                      type="button"
                                      disabled={busyUid === u.uid}
                                      onClick={() => void handleToggleAdminRole(u)}
                                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium ${
                                        isDynAdmin
                                          ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                          : 'glass-subtle text-blue-700 dark:text-blue-300'
                                      }`}
                                      title={isDynAdmin ? 'Revoke Admin' : 'Promote to Admin'}
                                    >
                                      {isDynAdmin ? (
                                        <>
                                          <ShieldOff className="w-3 h-3" /> Demote
                                        </>
                                      ) : (
                                        <>
                                          <Shield className="w-3 h-3" /> Make Admin
                                        </>
                                      )}
                                    </button>

                                    {u.suspended ? (
                                      <button
                                        type="button"
                                        disabled={busyUid === u.uid}
                                        onClick={() => void handleRestoreUser(u)}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium bg-emerald-600 text-white hover:bg-emerald-700"
                                      >
                                        <UserCheck className="w-3 h-3" /> Restore
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        disabled={busyUid === u.uid}
                                        onClick={() => {
                                          setSuspendTarget(u);
                                          setSuspendReason('Suspended by site administrator.');
                                        }}
                                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md font-medium bg-red-50 dark:bg-red-950/50 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-900"
                                      >
                                        <Ban className="w-3 h-3" /> Suspend
                                      </button>
                                    )}

                                    <button
                                      type="button"
                                      disabled={busyUid === u.uid}
                                      onClick={() =>
                                        setConfirmState({
                                          open: true,
                                          title: 'Delete Student Record',
                                          description:
                                            'Removes this student’s profile, public tracker, and invite lookup records.',
                                          details: [u.displayName, u.email, `Code: ${u.friendCode}`],
                                          confirmLabel: 'Delete Student',
                                          tone: 'danger',
                                          action: async () => {
                                            await deleteUserAccountAdmin(u);
                                            setUsers((prev) =>
                                              prev.filter((item) => item.uid !== u.uid)
                                            );
                                            setPublicProfiles((prev) =>
                                              prev.filter((item) => item.uid !== u.uid)
                                            );
                                            onNotify(`Removed student record for ${u.email}.`);
                                          },
                                        })
                                      }
                                      className="p-1.5 text-slate-400 hover:text-red-600 rounded-md"
                                      title="Delete student record"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Tab 3: Global Broadcast Announcement & System Settings */}
            {tab === 'announcements' && (
              <div className="space-y-6">
                <form
                  onSubmit={(e) => void handleSaveAnnouncement(e)}
                  className="glass-panel rounded-xl p-6 space-y-4"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-base font-semibold flex items-center gap-2">
                        <Megaphone className="w-4 h-4 text-blue-600" />
                        Global Workspace Announcement Banner
                      </h2>
                      <p className="text-xs text-slate-500">
                        Publish a live notice banner at the top of every student&apos;s workspace.
                      </p>
                    </div>
                    {announcement && (
                      <button
                        type="button"
                        onClick={() => void handleClearAnnouncement()}
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
                        onChange={(e) =>
                          setAnnTone(e.target.value as 'info' | 'warning' | 'success')
                        }
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
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60"
                  >
                    {savingAnn ? 'Saving...' : 'Save Announcement'}
                  </button>
                </form>

                {/* Platform System Controls */}
                <form
                  onSubmit={(e) => void handleSaveSystemSettings(e)}
                  className="glass-panel rounded-xl p-6 space-y-4"
                >
                  <div>
                    <h2 className="text-base font-semibold flex items-center gap-2">
                      <Settings className="w-4 h-4 text-blue-600" />
                      Platform System Controls
                    </h2>
                    <p className="text-xs text-slate-500">
                      Control maintenance lock, global shared-notes permissions, and group limits in real time.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="p-4 glass-subtle rounded-xl flex items-center justify-between gap-3 cursor-pointer">
                      <div>
                        <div className="text-xs font-semibold">Maintenance Mode Lock</div>
                        <div className="text-[11px] text-slate-500">
                          Pauses student workspace access while admins keep full control.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={sysMaintenance}
                        onChange={(e) => setSysMaintenance(e.target.checked)}
                        className="w-4 h-4 accent-blue-600"
                      />
                    </label>

                    <label className="p-4 glass-subtle rounded-xl flex items-center justify-between gap-3 cursor-pointer">
                      <div>
                        <div className="text-xs font-semibold">Allow Friend Shared Notes</div>
                        <div className="text-[11px] text-slate-500">
                          Enable or pause cross-student note sharing platform-wide.
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        checked={sysAllowShared}
                        onChange={(e) => setSysAllowShared(e.target.checked)}
                        className="w-4 h-4 accent-blue-600"
                      />
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">
                        Max Study Group Members (2–25)
                      </label>
                      <input
                        type="number"
                        min={2}
                        max={25}
                        value={sysMaxMembers}
                        onChange={(e) => setSysMaxMembers(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">
                        Default Weekly Study Goal (minutes)
                      </label>
                      <input
                        type="number"
                        min={30}
                        max={10080}
                        value={sysDefaultGoal}
                        onChange={(e) => setSysDefaultGoal(e.target.value)}
                        className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-slate-500 mb-1">
                      Maintenance Screen Message
                    </label>
                    <input
                      type="text"
                      maxLength={500}
                      value={sysMaintenanceMsg}
                      onChange={(e) => setSysMaintenanceMsg(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={savingSys}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-60"
                  >
                    {savingSys ? 'Saving...' : 'Save System Controls'}
                  </button>
                </form>
              </div>
            )}

            {/* Tab 4: Study Groups Moderation */}
            {tab === 'groups' && (
              <div className="glass-panel rounded-xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">
                    All Study Groups ({filteredGroups.length})
                  </h2>
                  <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={groupSearch}
                      onChange={(e) => setGroupSearch(e.target.value)}
                      placeholder="Search group name, code, owner..."
                      className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                </div>

                {filteredGroups.length === 0 ? (
                  <p className="text-xs text-slate-500">No study groups match your search.</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredGroups.map((g) => (
                      <div
                        key={g.id}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">
                            {g.name}{' '}
                            <span className="font-mono text-xs text-blue-600 dark:text-blue-400">
                              ({g.groupCode})
                            </span>
                          </div>
                          <div className="text-xs text-slate-500">
                            Owner: {g.ownerName} · Course: {g.courseCode} · {g.memberUids.length}{' '}
                            members
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => void openGroupInspector(g)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium glass-subtle hover:border-blue-400 rounded-lg"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Inspect &amp; Edit
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmState({
                                open: true,
                                title: 'Delete Study Group',
                                description:
                                  'Permanently delete this study group and all its messages?',
                                details: [g.name, `Code: ${g.groupCode}`],
                                confirmLabel: 'Delete Group',
                                tone: 'danger',
                                action: async () => {
                                  await deleteStudyGroup(g);
                                  setAllGroups((prev) =>
                                    prev.filter((item) => item.id !== g.id)
                                  );
                                  if (inspectGroup?.id === g.id) setInspectGroup(null);
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
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 5: Shared Notes Moderation */}
            {tab === 'shared' && (
              <div className="glass-panel rounded-xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <h2 className="text-base font-semibold">
                    Platform Shared Notes ({filteredSharedNotes.length})
                  </h2>
                  <div className="relative w-full sm:w-72">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type="text"
                      value={sharedSearch}
                      onChange={(e) => setSharedSearch(e.target.value)}
                      placeholder="Search title, owner, course..."
                      className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                    />
                  </div>
                </div>

                {filteredSharedNotes.length === 0 ? (
                  <p className="text-xs text-slate-500">No shared notes found.</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredSharedNotes.map((sn) => (
                      <div
                        key={sn.id}
                        className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-sm font-semibold truncate">{sn.title}</div>
                          <div className="text-xs text-slate-500 font-mono">
                            By {sn.ownerName} · {sn.courseCode || 'GENERAL'} · {sn.kind.toUpperCase()}{' '}
                            {sn.originalFilename ? `· ${sn.originalFilename}` : ''} ·{' '}
                            {sn.allowedFriendUids.length} friend(s)
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setPreviewShared(sn)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium glass-subtle rounded-lg"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Preview
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmState({
                                open: true,
                                title: 'Remove Shared Note',
                                description:
                                  'Remove this shared note from public friend access?',
                                details: [sn.title, `Owner: ${sn.ownerName}`],
                                confirmLabel: 'Remove',
                                tone: 'danger',
                                action: async () => {
                                  await deleteSharedNoteAdmin(sn.id);
                                  setSharedNotes((prev) =>
                                    prev.filter((item) => item.id !== sn.id)
                                  );
                                  onNotify(`Removed shared note "${sn.title}".`);
                                },
                              })
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-red-600 bg-red-50 dark:bg-red-950/40 rounded-lg"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 6: Feature Requests Triage & Google Forms Manager */}
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
                          className="px-3 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg disabled:opacity-60"
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

                    <form
                      onSubmit={handleLinkExistingForm}
                      className="p-4 glass-subtle rounded-xl space-y-2.5"
                    >
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

                  {(formConfig?.formId || formDetails) && (
                    <div className="text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span>
                        Active Form: <strong>{formDetails?.title || formConfig?.formTitle}</strong>
                        {formDetails && ` (${formDetails.questions.length} questions)`}
                      </span>
                      {(formDetails?.responderUri || formConfig?.responderUri) && (
                        <a
                          href={formDetails?.responderUri || formConfig?.responderUri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Open Form <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>
                  )}

                  {/* Rendered Google Form Responses */}
                  {formResponses.length > 0 && (
                    <div className="pt-3 border-t border-slate-200/70 dark:border-slate-800 space-y-3">
                      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                        Submitted Google Form Responses ({formResponses.length})
                      </div>
                      <div className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                        {formResponses.map((resp) => (
                          <div key={resp.responseId} className="p-3.5 glass-subtle rounded-xl space-y-1.5 text-xs">
                            <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-500">
                              <span>{resp.respondentEmail || 'Anonymous respondent'}</span>
                              <span>{resp.createTime ? new Date(resp.createTime).toLocaleString() : ''}</span>
                            </div>
                            <div className="space-y-1">
                              {resp.answers.map((ans, idx) => (
                                <div key={`${resp.responseId}_${idx}`}>
                                  <span className="font-semibold text-slate-700 dark:text-slate-200">
                                    {ans.questionTitle}:{' '}
                                  </span>
                                  <span className="text-slate-600 dark:text-slate-300">
                                    {ans.value || '—'}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="glass-panel rounded-xl p-6 space-y-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-base font-semibold mr-2">
                        Student Feature Requests ({filteredRequests.length})
                      </h2>
                      {(['all', 'open', 'planned', 'shipped', 'declined'] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setRequestFilter(s)}
                          className={`px-2.5 py-1 text-xs font-medium rounded-md capitalize ${
                            requestFilter === s
                              ? 'bg-blue-600 text-white'
                              : 'glass-subtle text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                    <div className="relative w-full sm:w-64">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={requestSearch}
                        onChange={(e) => setRequestSearch(e.target.value)}
                        placeholder="Search requests..."
                        className="w-full pl-9 pr-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                      />
                    </div>
                  </div>

                  {filteredRequests.length === 0 ? (
                    <p className="text-xs text-slate-500">No feature requests match this filter.</p>
                  ) : (
                    <div className="space-y-3">
                      {filteredRequests.map((req) => {
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
                                  } catch (err) {
                                    onNotify(
                                      err instanceof Error
                                        ? err.message
                                        : 'Failed to update feature request.'
                                    );
                                  } finally {
                                    setSavingTriageId(null);
                                  }
                                }}
                                className="sm:col-span-2 inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg disabled:opacity-60"
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
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Suspend With Custom Reason Modal */}
      {suspendTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={(e) => void handleConfirmSuspend(e)}
            className="glass-panel rounded-2xl p-6 max-w-md w-full space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">Suspend Student Access</h3>
              <button
                type="button"
                onClick={() => setSuspendTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300">
              Pause access for <strong>{suspendTarget.displayName}</strong> ({suspendTarget.email}).
            </p>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Suspension Reason</label>
              <textarea
                rows={3}
                maxLength={300}
                required
                value={suspendReason}
                onChange={(e) => setSuspendReason(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSuspendTarget(null)}
                className="px-3.5 py-2 text-xs font-medium glass-subtle rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busyUid === suspendTarget.uid}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
              >
                Confirm Suspend
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Student Profile Modal */}
      {editUserTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={(e) => void handleSaveUserEdit(e)}
            className="glass-panel rounded-2xl p-6 max-w-md w-full space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold">Edit Student Settings</h3>
              <button
                type="button"
                onClick={() => setEditUserTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs font-mono text-slate-500">{editUserTarget.email}</div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Display Name</label>
              <input
                type="text"
                required
                maxLength={100}
                value={editUserName}
                onChange={(e) => setEditUserName(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Grading Scale</label>
                <select
                  value={editUserScale}
                  onChange={(e) => setEditUserScale(e.target.value as GradingScale)}
                  className="w-full px-3 py-2 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <option value="bd">Bangladesh (4.00)</option>
                  <option value="us">US (4.0)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Weekly Goal (mins)</label>
                <input
                  type="number"
                  min={30}
                  max={10080}
                  value={editUserGoal}
                  onChange={(e) => setEditUserGoal(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditUserTarget(null)}
                className="px-3.5 py-2 text-xs font-medium glass-subtle rounded-lg"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingUserEdit}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
              >
                {savingUserEdit ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Study Group Inspector & Message Moderation Modal */}
      {inspectGroup && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl p-6 max-w-2xl w-full max-h-[88vh] flex flex-col space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-display text-base font-bold">
                  Inspect Group: {inspectGroup.name}
                </h3>
                <p className="text-xs font-mono text-slate-500">
                  {inspectGroup.groupCode} · Owner: {inspectGroup.ownerName}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectGroup(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => void handleSaveGroupEdit(e)}
              className="grid grid-cols-1 sm:grid-cols-12 gap-2"
            >
              <input
                type="text"
                value={editGroupName}
                onChange={(e) => setEditGroupName(e.target.value)}
                placeholder="Group name"
                className="sm:col-span-6 px-3 py-1.5 text-xs bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
              <input
                type="text"
                value={editGroupCourse}
                onChange={(e) => setEditGroupCourse(e.target.value)}
                placeholder="Course code"
                className="sm:col-span-4 px-3 py-1.5 text-xs font-mono bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
              />
              <button
                type="submit"
                disabled={savingGroupEdit}
                className="sm:col-span-2 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 rounded-lg"
              >
                Save
              </button>
            </form>

            {/* Members */}
            <div className="space-y-1.5">
              <div className="text-xs font-semibold text-slate-500">
                Members ({inspectGroup.memberUids.length})
              </div>
              <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                {inspectGroup.memberUids.map((mUid) => {
                  const memberUser = users.find((u) => u.uid === mUid);
                  const isOwnerMember = mUid === inspectGroup.ownerUid;
                  return (
                    <span
                      key={mUid}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] glass-subtle rounded-md"
                    >
                      <span>{memberUser?.displayName || mUid.slice(0, 8)}</span>
                      {!isOwnerMember && (
                        <button
                          type="button"
                          onClick={() => void handleKickGroupMember(mUid)}
                          className="text-red-600 hover:text-red-700"
                          title="Remove from group"
                        >
                          <UserMinus className="w-3 h-3" />
                        </button>
                      )}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 min-h-0 flex flex-col space-y-2">
              <div className="text-xs font-semibold text-slate-500">
                Group Messages ({groupMessages.length})
              </div>
              <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[160px] max-h-64">
                {loadingGroupMsgs ? (
                  <p className="text-xs text-slate-500">Loading messages...</p>
                ) : groupMessages.length === 0 ? (
                  <p className="text-xs text-slate-500">No messages in this group yet.</p>
                ) : (
                  groupMessages.map((m) => (
                    <div
                      key={m.id}
                      className="p-3 glass-subtle rounded-xl flex items-start justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold">
                          {m.senderName}{' '}
                          <span className="font-mono text-[10px] text-slate-400">({m.kind})</span>
                        </div>
                        <div className="text-slate-600 dark:text-slate-300 break-words mt-0.5">
                          {m.kind === 'file'
                            ? `File: ${m.originalFilename || m.noteTitle}`
                            : m.text || m.noteTitle}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => void handleDeleteGroupMessageAdmin(m.id)}
                        className="p-1 text-slate-400 hover:text-red-600 shrink-0"
                        title="Delete message"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Shared Note Preview Modal */}
      {previewShared && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="glass-panel rounded-2xl p-6 max-w-lg w-full space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-display text-base font-bold">{previewShared.title}</h3>
                <p className="text-xs font-mono text-slate-500">
                  {previewShared.ownerName} · {previewShared.courseCode}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewShared(null)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {previewShared.kind === 'text' ? (
              <pre className="p-3 glass-subtle rounded-xl text-xs whitespace-pre-wrap max-h-72 overflow-y-auto font-sans">
                {previewShared.textContent || '(Empty note)'}
              </pre>
            ) : (
              <div className="p-3 glass-subtle rounded-xl text-xs space-y-1 font-mono">
                <div>File: {previewShared.originalFilename}</div>
                <div>MIME: {previewShared.mimeType}</div>
                <div>Size: {(previewShared.sizeBytes / 1024).toFixed(1)} KB</div>
                {previewShared.driveFileId && <div>Drive ID: {previewShared.driveFileId}</div>}
              </div>
            )}
          </div>
        </div>
      )}

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

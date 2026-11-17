import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  Clock,
  Command,
  FileText,
  LayoutDashboard,
  LogOut,
  Maximize2,
  Megaphone,
  Menu,
  MessageSquarePlus,
  Moon,
  Shield,
  Sun,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import { AdminControlPanel } from './components/AdminControlPanel.tsx';
import { AmbientBubbles, BubbleVibeMode } from './components/AmbientBubbles.tsx';
import { CgpaView } from './components/CgpaView.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { CoursesView } from './components/CoursesView.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { FeatureRequestsView } from './components/FeatureRequestsView.tsx';
import { FocusZoomModal } from './components/FocusZoomModal.tsx';
import { FriendsView } from './components/FriendsView.tsx';
import { LegalDocMode, LegalPage } from './components/LegalPage.tsx';
import { NotesFilesView } from './components/NotesFilesView.tsx';
import { OverviewView } from './components/OverviewView.tsx';
import { SessionsView, TimerPreset } from './components/SessionsView.tsx';
import { SignInView } from './components/SignInView.tsx';
import { getLowMidtermCourses, getMidtermPercent } from './lib/gpa.ts';
import { soundEngine, SoundscapeType } from './lib/soundscape.ts';
import {
  connectGoogleDriveOnly,
  connectGoogleWorkspace,
  db,
  googleSignIn,
  handleFirestoreError,
  initAuth,
  logout,
  OperationType,
} from './lib/firebase.ts';
import {
  ensureUserInitialized,
  fetchFriendPublicProfiles,
  logStudySession,
  lookupStudentByCodeOrEmail,
  respondToFriendRequest,
  sendFriendRequest,
  syncPublicProfile,
  syncSharedNotesFriendList,
} from './lib/studyData.ts';
import {
  Course,
  FeatureFormConfig,
  FeatureRequest,
  FriendRequest,
  Friendship,
  GlobalAnnouncement,
  GroupStudySession,
  isAppAdmin,
  NavSection,
  NoteOrFile,
  SharedNote,
  StudyGroup,
  StudySession,
  SyllabusTopic,
  SystemSettingsConfig,
  UserProfile,
  UserPublicProfile,
} from './lib/types.ts';

const NAV_ITEMS: { id: NavSection; num: string; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'overview', num: '1', label: 'Overview', icon: LayoutDashboard },
  { id: 'courses', num: '2', label: 'Courses & Syllabus', icon: BookOpen },
  { id: 'sessions', num: '3', label: 'Study Sessions', icon: Clock },
  { id: 'notes', num: '4', label: 'Notes & Files', icon: FileText },
  { id: 'cgpa', num: '5', label: 'CGPA & Projections', icon: Calculator },
  { id: 'friends', num: '6', label: 'Friends & Study Together', icon: Users },
  { id: 'requests', num: '7', label: 'Feature Requests', icon: MessageSquarePlus },
];

function StudyTrackerWorkspace() {
  const [authUser, setAuthUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [topics, setTopics] = useState<SyllabusTopic[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [notes, setNotes] = useState<NoteOrFile[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [friendProfiles, setFriendProfiles] = useState<UserPublicProfile[]>([]);
  const [incomingRequests, setIncomingRequests] = useState<FriendRequest[]>([]);
  const [outgoingRequests, setOutgoingRequests] = useState<FriendRequest[]>([]);
  const [groupSessions, setGroupSessions] = useState<GroupStudySession[]>([]);
  const [sharedNotes, setSharedNotes] = useState<SharedNote[]>([]);
  const [studyGroups, setStudyGroups] = useState<StudyGroup[]>([]);
  const [featureFormConfig, setFeatureFormConfig] = useState<FeatureFormConfig | null>(null);
  const [featureRequests, setFeatureRequests] = useState<FeatureRequest[]>([]);
  const [announcement, setAnnouncement] = useState<GlobalAnnouncement | null>(null);
  const [systemSettings, setSystemSettings] = useState<SystemSettingsConfig | null>(null);
  const [isDynamicAdmin, setIsDynamicAdmin] = useState(false);
  const [workspaceBlockedError, setWorkspaceBlockedError] = useState<string | null>(null);
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const raw = new URLSearchParams(window.location.search).get('invite');
    if (!raw) return null;
    const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '');
    return cleaned || null;
  });
  const [acceptingInviteLink, setAcceptingInviteLink] = useState(false);

  const isVerifiedAdmin = Boolean(
    authUser?.emailVerified && isAppAdmin(authUser.email, isDynamicAdmin)
  );

  const readLegalFromLocation = useCallback((): LegalDocMode | null => {
    if (typeof window === 'undefined') return null;
    const path = window.location.pathname.toLowerCase().replace(/\/+$/, '');
    const pageParam = new URLSearchParams(window.location.search).get('page')?.toLowerCase();
    if (path === '/privacy' || pageParam === 'privacy') return 'privacy';
    if (path === '/terms' || pageParam === 'terms') return 'terms';
    return null;
  }, []);

  const readAdminRouteFromLocation = useCallback((): boolean => {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname.toLowerCase().replace(/\/+$/, '');
    return path === '/admin-ctrl';
  }, []);

  const [legalMode, setLegalMode] = useState<LegalDocMode | null>(() => readLegalFromLocation());
  const [adminRouteOpen, setAdminRouteOpen] = useState<boolean>(() => readAdminRouteFromLocation());

  useEffect(() => {
    const onPop = () => {
      setLegalMode(readLegalFromLocation());
      setAdminRouteOpen(readAdminRouteFromLocation());
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [readAdminRouteFromLocation, readLegalFromLocation]);

  const openLegalPage = useCallback((mode: LegalDocMode | null) => {
    setLegalMode(mode);
    setAdminRouteOpen(false);
    if (typeof window !== 'undefined') {
      const targetPath = mode === 'privacy' ? '/privacy' : mode === 'terms' ? '/terms' : '/';
      window.history.pushState({}, '', targetPath);
    }
  }, []);

  const setHiddenAdminRoute = useCallback((open: boolean) => {
    setAdminRouteOpen(open);
    if (typeof window !== 'undefined') {
      window.history.pushState({}, '', open ? '/admin-ctrl' : '/');
    }
  }, []);

  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [notesComposeMode, setNotesComposeMode] = useState<'upload' | 'text' | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('studytracker_sidebar') === '1';
    } catch {
      return false;
    }
  });
  const [commandOpen, setCommandOpen] = useState(false);
  const [focusZoomOpen, setFocusZoomOpen] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem('studytracker_theme') === 'dark';
    } catch {
      return false;
    }
  });
  const [bubbleMode, setBubbleMode] = useState<BubbleVibeMode>(() => {
    if (typeof window === 'undefined') return 'subtle';
    try {
      const saved = window.localStorage.getItem('studytracker_bubbles');
      return saved === 'off' || saved === 'lively' ? saved : 'subtle';
    } catch {
      return 'subtle';
    }
  });
  const [soundscape, setSoundscape] = useState<SoundscapeType>('off');
  const [soundVolume, setSoundVolume] = useState(0.25);
  const [toast, setToast] = useState<string | null>(null);

  // Global live study timer state
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerPreset, setTimerPreset] = useState<TimerPreset>('free');
  const [timerStartedIso, setTimerStartedIso] = useState<string | null>(null);
  const [timerCourseId, setTimerCourseId] = useState('');
  const [timerTopicId, setTimerTopicId] = useState('');

  const notify = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Clean ?invite= from address bar once captured into state
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    if (url.searchParams.has('invite')) {
      url.searchParams.delete('invite');
      window.history.replaceState({}, '', url.toString());
    }
  }, []);

  // Sync & persist theme, bubbles, and sidebar state across refreshes
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    try {
      window.localStorage.setItem('studytracker_theme', darkMode ? 'dark' : 'light');
    } catch {
      // Ignore storage errors
    }
  }, [darkMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem('studytracker_bubbles', bubbleMode);
    } catch {
      // Ignore
    }
  }, [bubbleMode]);

  useEffect(() => {
    try {
      window.localStorage.setItem('studytracker_sidebar', sidebarCollapsed ? '1' : '0');
    } catch {
      // Ignore
    }
  }, [sidebarCollapsed]);

  // Global keyboard shortcuts (Cmd/Ctrl+K or "/", plus stealth admin shortcut strictly for verified admin)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'a') {
        if (isVerifiedAdmin) {
          e.preventDefault();
          setHiddenAdminRoute(!adminRouteOpen);
        }
        return;
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandOpen((v) => !v);
      } else if (!isTyping && e.key === '/') {
        e.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [adminRouteOpen, isVerifiedAdmin, setHiddenAdminRoute]);

  // Auth listener
  useEffect(() => {
    const unsub = initAuth((user, token) => {
      setAuthUser(user);
      if (token) setAccessToken(token);
      if (!user) {
        setAccessToken(null);
        setProfile(null);
        setIsDynamicAdmin(false);
        setSystemSettings(null);
      }
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Initialize user doc on sign-in
  useEffect(() => {
    if (!authUser) return;
    let cancelled = false;
    void ensureUserInitialized(authUser).then((p) => {
      if (!cancelled) setProfile(p);
    });
    return () => {
      cancelled = true;
    };
  }, [authUser]);

  // Real-time Firestore listeners (only active when authenticated)
  useEffect(() => {
    if (!authUser) return;
    const uid = authUser.uid;

    const unsubUser = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) setProfile(snap.data() as UserProfile);
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)
    );

    const unsubCourses = onSnapshot(
      query(collection(db, 'users', uid, 'courses'), orderBy('createdAt', 'desc')),
      (snap) => {
        setCourses(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Course, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/courses`)
    );

    const unsubTopics = onSnapshot(
      collection(db, 'users', uid, 'topics'),
      (snap) => {
        setTopics(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SyllabusTopic, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/topics`)
    );

    const unsubSessions = onSnapshot(
      query(collection(db, 'users', uid, 'sessions'), orderBy('startedAt', 'desc')),
      (snap) => {
        setSessions(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudySession, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/sessions`)
    );

    const unsubNotes = onSnapshot(
      query(collection(db, 'users', uid, 'notes'), orderBy('createdAt', 'desc')),
      (snap) => {
        setNotes(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<NoteOrFile, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/notes`)
    );

    const unsubIncoming = onSnapshot(
      query(
        collection(db, 'friendRequests'),
        where('toUid', '==', uid),
        where('status', '==', 'pending')
      ),
      (snap) => {
        setIncomingRequests(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FriendRequest, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'friendRequests')
    );

    const unsubOutgoing = onSnapshot(
      query(
        collection(db, 'friendRequests'),
        where('fromUid', '==', uid),
        where('status', '==', 'pending')
      ),
      (snap) => {
        setOutgoingRequests(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<FriendRequest, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'friendRequests')
    );

    const unsubFriendships = onSnapshot(
      query(collection(db, 'friendships'), where('memberUids', 'array-contains', uid)),
      (snap) => {
        setFriendships(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Friendship, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'friendships')
    );

    const unsubGroupHost = onSnapshot(
      query(collection(db, 'groupSessions'), where('hostUid', '==', uid)),
      (snap) => {
        const hosted = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<GroupStudySession, 'id'>),
        }));
        setGroupSessions((prev) => {
          const other = prev.filter((p) => p.hostUid !== uid);
          return [...hosted, ...other];
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'groupSessions')
    );

    const unsubGroupInv = onSnapshot(
      query(collection(db, 'groupSessions'), where('invitedUid', '==', uid)),
      (snap) => {
        const invited = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<GroupStudySession, 'id'>),
        }));
        setGroupSessions((prev) => {
          const other = prev.filter((p) => p.invitedUid !== uid || p.hostUid === uid);
          const merged = new Map<string, GroupStudySession>();
          for (const item of [...other, ...invited]) merged.set(item.id, item);
          return Array.from(merged.values());
        });
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'groupSessions')
    );

    const unsubSharedNotes = onSnapshot(
      query(collection(db, 'sharedNotes'), where('allowedFriendUids', 'array-contains', uid)),
      (snap) => {
        setSharedNotes(
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SharedNote, 'id'>) }))
        );
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'sharedNotes')
    );

    const unsubFormConfig = onSnapshot(
      doc(db, 'appConfig', 'featureForm'),
      (snap) => {
        setFeatureFormConfig(snap.exists() ? (snap.data() as FeatureFormConfig) : null);
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'appConfig/featureForm')
    );

    const unsubAnnouncement = onSnapshot(
      doc(db, 'appConfig', 'announcement'),
      (snap) => {
        setAnnouncement(snap.exists() ? (snap.data() as GlobalAnnouncement) : null);
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'appConfig/announcement')
    );

    const unsubSystemSettings = onSnapshot(
      doc(db, 'appConfig', 'systemSettings'),
      (snap) => {
        setSystemSettings(snap.exists() ? (snap.data() as SystemSettingsConfig) : null);
      },
      (err) => handleFirestoreError(err, OperationType.GET, 'appConfig/systemSettings')
    );

    const unsubDynamicAdmin = onSnapshot(
      doc(db, 'admins', uid),
      (snap) => {
        setIsDynamicAdmin(snap.exists());
      },
      (err) => handleFirestoreError(err, OperationType.GET, `admins/${uid}`)
    );

    const unsubStudyGroups = onSnapshot(
      query(collection(db, 'studyGroups'), where('memberUids', 'array-contains', uid)),
      (snap) => {
        const groups = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<StudyGroup, 'id'>),
        }));
        const toMillis = (val: unknown) => {
          if (val && typeof val === 'object' && 'toMillis' in val) {
            const fn = (val as { toMillis?: () => number }).toMillis;
            if (typeof fn === 'function') return fn();
          }
          return 0;
        };
        groups.sort(
          (a, b) =>
            toMillis(b.lastMessageAt || b.createdAt) -
            toMillis(a.lastMessageAt || a.createdAt)
        );
        setStudyGroups(groups);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'studyGroups')
    );

    return () => {
      unsubUser();
      unsubCourses();
      unsubTopics();
      unsubSessions();
      unsubNotes();
      unsubIncoming();
      unsubOutgoing();
      unsubFriendships();
      unsubGroupHost();
      unsubGroupInv();
      unsubSharedNotes();
      unsubStudyGroups();
      unsubFormConfig();
      unsubAnnouncement();
      unsubSystemSettings();
      unsubDynamicAdmin();
    };
  }, [authUser]);

  // Feature requests listener reacts to admin promotion/revocation in real time
  useEffect(() => {
    if (!authUser) {
      setFeatureRequests([]);
      return;
    }
    const uid = authUser.uid;
    const reqQuery = isVerifiedAdmin
      ? collection(db, 'featureRequests')
      : query(collection(db, 'featureRequests'), where('authorUid', '==', uid));

    const unsubFeatureRequests = onSnapshot(
      reqQuery,
      (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<FeatureRequest, 'id'>),
        }));
        const toMillis = (val: unknown) => {
          if (val && typeof val === 'object' && 'toMillis' in val) {
            const fn = (val as { toMillis?: () => number }).toMillis;
            if (typeof fn === 'function') return fn();
          }
          return 0;
        };
        list.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
        setFeatureRequests(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'featureRequests')
    );

    return () => {
      unsubFeatureRequests();
    };
  }, [authUser, isVerifiedAdmin]);

  const friendUids = useMemo(() => {
    if (!authUser) return [];
    return friendships.map((f) => (f.uidA === authUser.uid ? f.uidB : f.uidA));
  }, [authUser, friendships]);

  // Fetch public profiles of connected friends
  useEffect(() => {
    if (!friendUids.length) {
      setFriendProfiles([]);
      return;
    }
    let cancelled = false;
    void fetchFriendPublicProfiles(friendUids).then((list) => {
      if (!cancelled) setFriendProfiles(list);
    });
    return () => {
      cancelled = true;
    };
  }, [friendUids]);

  // Sync allowedFriendUids on owner's shared notes when friend list changes
  useEffect(() => {
    if (!authUser) return;
    const sharedIds = notes.filter((n) => n.isShared).map((n) => n.id);
    if (sharedIds.length > 0) {
      void syncSharedNotesFriendList(authUser.uid, sharedIds, friendUids);
    }
  }, [authUser, friendUids, notes]);

  // Keep anonymized public study stats synced for friends (never grades/CGPA)
  useEffect(() => {
    if (!profile) return;
    const timer = setTimeout(() => {
      void syncPublicProfile(profile, courses, topics, sessions);
    }, 800);
    return () => clearTimeout(timer);
  }, [courses, profile, sessions, topics]);

  // Live timer ticker + Pomodoro gentle chime & hydration reminder
  useEffect(() => {
    if (!timerRunning) return;
    const id = setInterval(() => {
      setTimerSeconds((s) => {
        const next = s + 1;
        if (timerPreset === 'pomodoro25' && next === 25 * 60) {
          soundEngine.playGentleChime();
          notify('25-minute Pomodoro complete — take a 5-minute stretch and water break.');
        } else if (timerPreset === 'deep50' && next === 50 * 60) {
          soundEngine.playGentleChime();
          notify('50-minute Deep Focus complete — take a 10-minute rest break.');
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [notify, timerPreset, timerRunning]);

  // Cleanup focus audio on unmount
  useEffect(() => {
    return () => {
      soundEngine.stop();
    };
  }, []);

  const handleChangeSoundscape = (type: SoundscapeType) => {
    setSoundscape(type);
    soundEngine.start(type, soundVolume);
  };

  const handleChangeSoundVolume = (vol: number) => {
    setSoundVolume(vol);
    soundEngine.setVolume(vol);
  };

  const handleSignIn = async () => {
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const res = await googleSignIn();
      setAuthUser(res.user);
      setAccessToken(res.accessToken);
      notify('Signed in to Study Tracker.');
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleConnectWorkspace = async () => {
    setWorkspaceBlockedError(null);
    try {
      const res = await connectGoogleWorkspace();
      setAuthUser(res.user);
      setAccessToken(res.accessToken);
      if (res.accessToken) {
        setWorkspaceBlockedError(null);
        notify('Connected to Google Drive, Gmail, Tasks, and Forms.');
      } else {
        setWorkspaceBlockedError(
          'Google did not return a Workspace access token. You can try "Connect Drive Only" to upload & sync files directly.'
        );
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not authorize Google Workspace access.';
      setWorkspaceBlockedError(msg);
      notify(msg);
    }
  };

  const handleConnectDriveOnly = async () => {
    setWorkspaceBlockedError(null);
    try {
      const res = await connectGoogleDriveOnly();
      setAuthUser(res.user);
      setAccessToken(res.accessToken);
      if (res.accessToken) {
        setWorkspaceBlockedError(null);
        notify('Connected to Google Drive (app file upload & sync).');
      } else {
        notify('Google Drive token was not granted. Please allow Drive access in the popup.');
      }
    } catch (err) {
      notify(
        err instanceof Error
          ? err.message
          : 'Could not authorize Google Drive access.'
      );
    }
  };

  const handleSendPendingInvite = async () => {
    if (!profile || !pendingInviteCode) return;
    setAcceptingInviteLink(true);
    try {
      const target = await lookupStudentByCodeOrEmail(pendingInviteCode);
      if (!target) {
        notify(`No student found for invite code ${pendingInviteCode}.`);
        setPendingInviteCode(null);
        return;
      }
      if (target.uid === profile.uid) {
        notify('That invite link belongs to your own account.');
        setPendingInviteCode(null);
        return;
      }
      if (friendUids.includes(target.uid)) {
        notify(`You are already friends with ${target.displayName}.`);
        setPendingInviteCode(null);
        setActiveSection('friends');
        return;
      }
      const incomingMatch = incomingRequests.find((r) => r.fromUid === target.uid);
      if (incomingMatch) {
        await respondToFriendRequest(incomingMatch, true);
        notify(`Connected with ${target.displayName}!`);
        setPendingInviteCode(null);
        setActiveSection('friends');
        return;
      }
      if (outgoingRequests.some((r) => r.toUid === target.uid)) {
        notify(`Invite is already pending for ${target.displayName}.`);
        setPendingInviteCode(null);
        setActiveSection('friends');
        return;
      }
      await sendFriendRequest(profile, target);
      notify(`Friend invite sent to ${target.displayName} (${pendingInviteCode}).`);
      setPendingInviteCode(null);
      setActiveSection('friends');
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Could not send friend invite.');
    } finally {
      setAcceptingInviteLink(false);
    }
  };

  const handleStartTimer = () => {
    if (!timerStartedIso) {
      setTimerStartedIso(new Date().toISOString());
    }
    setTimerRunning(true);
    setFocusZoomOpen(true);
  };

  const handleStartCourseRecoveryFocus = (courseId: string) => {
    setTimerCourseId(courseId);
    setTimerTopicId('');
    if (!timerStartedIso) {
      setTimerStartedIso(new Date().toISOString());
    }
    setTimerRunning(true);
    setFocusZoomOpen(true);
  };

  const handleStopAndSaveTimer = async (noteText = '') => {
    if (!profile) return;
    setTimerRunning(false);
    const mins = Math.max(1, Math.round(timerSeconds / 60));
    const selectedCourse = courses.find((c) => c.id === timerCourseId);
    const nowIso = new Date().toISOString();
    await logStudySession(profile.uid, {
      courseId: selectedCourse?.id || '',
      courseCode: selectedCourse?.code || 'GENERAL',
      topicId: timerTopicId || '',
      durationMinutes: mins,
      startedAt: timerStartedIso || nowIso,
      endedAt: nowIso,
      source: 'timer',
      groupSessionId: '',
      note: noteText.trim(),
    });
    setTimerSeconds(0);
    setTimerStartedIso(null);
    notify(`Logged ${mins} minute timer session.`);
  };

  const handleResetTimer = () => {
    setTimerRunning(false);
    setTimerSeconds(0);
    setTimerStartedIso(null);
  };

  const lowMidCourses = useMemo(() => getLowMidtermCourses(courses), [courses]);

  if (legalMode) {
    return (
      <LegalPage
        mode={legalMode}
        onNavigateHome={() => openLegalPage(null)}
        onSwitchMode={(m) => openLegalPage(m)}
      />
    );
  }

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-sm text-slate-500">
        Loading Study Tracker...
      </div>
    );
  }

  // Stealth 404 for hidden admin route if visitor is not verified admin
  if (adminRouteOpen && !isVerifiedAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="glass-panel rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <div className="font-mono text-4xl font-bold text-slate-400">404</div>
          <h1 className="font-display text-xl font-bold">Page not found</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            The requested page could not be located on this server.
          </p>
          <button
            type="button"
            onClick={() => setHiddenAdminRoute(false)}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
          >
            Return to Study Tracker
          </button>
        </div>
      </div>
    );
  }

  if (!authUser || !profile) {
    return (
      <SignInView
        onSignIn={() => void handleSignIn()}
        isSigningIn={isSigningIn}
        errorMessage={authError}
        pendingInviteCode={pendingInviteCode}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((v) => !v)}
        onOpenLegal={(m) => openLegalPage(m)}
      />
    );
  }

  // Hidden Admin Control Panel (rendered at /admin-ctrl for verified admins)
  if (adminRouteOpen && isVerifiedAdmin) {
    return (
      <>
        <AdminControlPanel
          profile={profile}
          featureRequests={featureRequests}
          formConfig={featureFormConfig}
          announcement={announcement}
          systemSettings={systemSettings}
          accessToken={accessToken}
          onRequestAuth={() => void handleConnectWorkspace()}
          onRequestDriveOnly={() => void handleConnectDriveOnly()}
          onExitAdmin={() => setHiddenAdminRoute(false)}
          onNotify={notify}
        />
        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 8 }}
              role="status"
              className="fixed bottom-5 right-5 z-50 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg flex items-center gap-3"
            >
              <span>{toast}</span>
              <button
                type="button"
                onClick={() => setToast(null)}
                className="opacity-70 hover:opacity-100"
                aria-label="Dismiss message"
              >
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </>
    );
  }

  if (profile.suspended && !isVerifiedAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="glass-panel rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-red-600 mx-auto" />
          <h1 className="font-display text-xl font-bold">Account Suspended</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {profile.suspendedReason || 'Your Study Tracker access has been paused by the site administrator.'}
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-800 rounded-lg"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  if (systemSettings?.maintenanceMode && !isVerifiedAdmin) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-6">
        <div className="glass-panel rounded-2xl p-8 max-w-md w-full text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <h1 className="font-display text-xl font-bold">Scheduled Maintenance</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {systemSettings.maintenanceMessage ||
              'Study Tracker is temporarily undergoing maintenance. Please check back shortly.'}
          </p>
          <button
            type="button"
            onClick={() => void logout()}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 dark:bg-slate-800 rounded-lg"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </div>
    );
  }

  const activeNavItem = NAV_ITEMS.find((n) => n.id === activeSection) || NAV_ITEMS[0];
  const timerCourseCode = courses.find((c) => c.id === timerCourseId)?.code || 'GENERAL';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50/40 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100 flex relative overflow-x-hidden">
      <AmbientBubbles mode={bubbleMode} darkMode={darkMode} />

      {/* Desktop Sidebar (256px, smooth animated collapse/expand) */}
      <AnimatePresence initial={false}>
        {!sidebarCollapsed && (
          <motion.aside
            key="desktop-sidebar"
            initial={{ width: 0, opacity: 0, x: -20 }}
            animate={{ width: 256, opacity: 1, x: 0 }}
            exit={{ width: 0, opacity: 0, x: -20 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="hidden lg:flex shrink-0 flex-col justify-between glass-panel border-r border-white/50 dark:border-slate-800/80 rounded-none relative z-10 overflow-hidden"
          >
            <div className="w-64 h-full flex flex-col justify-between">
              <div className="p-5 space-y-6">
                <div className="px-2 py-1 flex items-center justify-between gap-2">
                  <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap">
                    Study Tracker
                  </span>
                  <motion.button
                    type="button"
                    whileHover={{ scale: 1.08 }}
                    whileTap={{ scale: 0.92 }}
                    onClick={() => setSidebarCollapsed(true)}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md transition-colors"
                    aria-label="Close sidebar menu"
                    title="Close menu"
                  >
                    <X className="w-4 h-4" />
                  </motion.button>
                </div>

                <nav className="space-y-1" aria-label="Main menu">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeSection === item.id;
                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        whileHover={{ x: 3 }}
                        whileTap={{ scale: 0.985 }}
                        transition={{ duration: 0.15 }}
                        onClick={() => {
                          setActiveSection(item.id);
                          setNotesComposeMode(null);
                        }}
                        className={`relative w-full px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors text-left ${
                          isActive
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                        }`}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="desktopNavPill"
                            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                            className="absolute inset-0 rounded-lg bg-blue-50/95 dark:bg-blue-950/70 border border-blue-200/70 dark:border-blue-800/60 shadow-xs"
                          />
                        )}
                        <Icon className="w-4 h-4 shrink-0 relative z-10" />
                        <span className="truncate relative z-10">
                          {item.num}. {item.label}
                        </span>
                      </motion.button>
                    );
                  })}
                </nav>
              </div>

              <div className="p-5 border-t border-slate-200 dark:border-slate-800 space-y-2.5">
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {profile.displayName} · {profile.email}
                </div>
                {isVerifiedAdmin && (
                  <motion.button
                    type="button"
                    whileHover={{ y: -1 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => setHiddenAdminRoute(true)}
                    className="w-full inline-flex items-center justify-between px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50/90 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/60 rounded-lg transition-colors"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Shield className="w-3.5 h-3.5" />
                      Admin Panel
                    </span>
                    <span className="font-mono text-[10px] opacity-75">⌘⇧A</span>
                  </motion.button>
                )}
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="w-full inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Mobile Drawer */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 lg:hidden bg-slate-950/60 backdrop-blur-xs flex"
            onClick={() => setMobileMenuOpen(false)}
          >
            <motion.aside
              initial={{ x: -272 }}
              animate={{ x: 0 }}
              exit={{ x: -272 }}
              transition={{ type: 'spring', stiffness: 360, damping: 34 }}
              className="w-64 glass-panel h-full p-5 flex flex-col justify-between border-r border-white/50 dark:border-slate-800/80 rounded-none"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <span className="font-display text-lg font-bold">Study Tracker</span>
                  <button
                    type="button"
                    onClick={() => setMobileMenuOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-md"
                    aria-label="Close mobile menu"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <nav className="space-y-1">
                  {NAV_ITEMS.map((item, idx) => {
                    const Icon = item.icon;
                    const isActive = activeSection === item.id;
                    return (
                      <motion.button
                        key={item.id}
                        type="button"
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.03, duration: 0.2 }}
                        whileTap={{ scale: 0.985 }}
                        onClick={() => {
                          setActiveSection(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`relative w-full px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium text-left transition-colors ${
                          isActive
                            ? 'text-blue-700 dark:text-blue-300'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/60'
                        }`}
                      >
                        {isActive && (
                          <motion.span
                            layoutId="mobileNavPill"
                            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                            className="absolute inset-0 rounded-lg bg-blue-50 dark:bg-blue-950/60 border border-blue-200/70 dark:border-blue-800/60"
                          />
                        )}
                        <Icon className="w-4 h-4 shrink-0 relative z-10" />
                        <span className="truncate relative z-10">
                          {item.num}. {item.label}
                        </span>
                      </motion.button>
                    );
                  })}
                </nav>
              </div>
              <div className="space-y-2.5">
                {isVerifiedAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setMobileMenuOpen(false);
                      setHiddenAdminRoute(true);
                    }}
                    className="w-full inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-lg"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    Admin Panel
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void logout()}
                  className="w-full inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-lg"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            </motion.aside>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Top Bar with Menu Open/Close & Quick Command on Right */}
        <header className="h-16 glass-panel border-b border-white/50 dark:border-slate-800/80 rounded-none px-6 flex items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <motion.button
              type="button"
              whileTap={{ scale: 0.92 }}
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 rounded-lg"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </motion.button>
            <motion.button
              type="button"
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => setSidebarCollapsed((v) => !v)}
              className="hidden lg:inline-flex items-center justify-center p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 glass-subtle rounded-lg transition-colors"
              aria-label={sidebarCollapsed ? 'Open navigation menu' : 'Close navigation menu'}
              title={sidebarCollapsed ? 'Open Menu' : 'Close Menu'}
            >
              <motion.span
                key={sidebarCollapsed ? 'closed' : 'open'}
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                transition={{ duration: 0.18 }}
                className="inline-flex"
              >
                <Menu className="w-4 h-4" />
              </motion.span>
            </motion.button>
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap truncate">
              Study Tracker / {activeNavItem.num}. {activeNavItem.label}
            </span>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {(timerRunning || timerSeconds > 0) && (
              <button
                type="button"
                onClick={() => setFocusZoomOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/70 border border-blue-200 dark:border-blue-800 rounded-lg whitespace-nowrap shrink-0 tabular-nums"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                {Math.floor(timerSeconds / 60)}m · Zoom Focus
              </button>
            )}
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-slate-300 dark:hover:border-slate-700 whitespace-nowrap shrink-0"
            >
              <Command className="w-3.5 h-3.5" />
              Quick Command
              <span className="font-mono text-[11px] text-slate-400">⌘K</span>
            </button>
            <button
              type="button"
              onClick={() => setDarkMode((v) => !v)}
              className="p-2 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 rounded-lg transition-colors"
              aria-label="Toggle color theme"
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveSection('notes');
                setNotesComposeMode('text');
              }}
              className="px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Quick Note
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-6 lg:p-8 max-w-6xl w-full mx-auto">
          {/* Admin Maintenance Mode Active Notice */}
          {systemSettings?.maintenanceMode && isVerifiedAdmin && (
            <div className="mb-6 p-3.5 glass-panel border border-amber-300/80 dark:border-amber-800/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs sm:text-sm text-amber-800 dark:text-amber-300">
                <Shield className="w-4 h-4 shrink-0" />
                <span>
                  <strong>Maintenance Mode is active:</strong> regular student accounts see the maintenance screen.
                </span>
              </div>
              <button
                type="button"
                onClick={() => setHiddenAdminRoute(true)}
                className="px-3 py-1.5 text-xs font-semibold text-amber-900 dark:text-amber-100 bg-amber-200/80 dark:bg-amber-900/60 hover:bg-amber-300/80 rounded-lg whitespace-nowrap shrink-0"
              >
                Manage in Admin Panel
              </button>
            </div>
          )}

          {/* Google Workspace Blocked Fallback Banner */}
          {workspaceBlockedError && !accessToken && (
            <div className="mb-6 p-4 glass-panel border border-blue-300/80 dark:border-blue-800/80 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs sm:text-sm text-slate-700 dark:text-slate-200">
                <strong className="text-slate-900 dark:text-slate-100">
                  Google Workspace prompt did not complete:
                </strong>{' '}
                {workspaceBlockedError}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleConnectDriveOnly()}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg whitespace-nowrap"
                >
                  Connect Drive Only
                </button>
                <button
                  type="button"
                  onClick={() => setWorkspaceBlockedError(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  aria-label="Dismiss notice"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* Global Announcement Banner (managed via Admin Control Panel) */}
          {announcement?.enabled && announcement.message && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`mb-6 p-4 glass-panel rounded-xl flex items-start gap-3 border ${
                announcement.tone === 'warning'
                  ? 'border-amber-300/80 dark:border-amber-800/80'
                  : announcement.tone === 'success'
                    ? 'border-emerald-300/80 dark:border-emerald-800/80'
                    : 'border-blue-300/80 dark:border-blue-800/80'
              }`}
            >
              <Megaphone className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
              <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-100">
                <strong className="mr-1.5">{announcement.title}:</strong>
                <span>{announcement.message}</span>
              </div>
            </motion.div>
          )}

          {/* Persistent Low Midterm Study Reminder (always visible when any incomplete course mid < 60%) */}
          {lowMidCourses.length > 0 && (
            <div className="mb-6 p-4 glass-panel border border-red-200/80 dark:border-red-900/70 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start sm:items-center gap-3 min-w-0">
                <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5 sm:mt-0" />
                <div className="text-xs sm:text-sm text-slate-800 dark:text-slate-100">
                  <strong className="text-red-700 dark:text-red-300">
                    Midterm Recovery Reminder — Study Now:
                  </strong>{' '}
                  {lowMidCourses
                    .map((c) => `${c.code} (${getMidtermPercent(c)}%)`)
                    .join(', ')}{' '}
                  scored below 60%. Put extra focus time in before finals!
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleStartCourseRecoveryFocus(lowMidCourses[0].id)}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg whitespace-nowrap"
                >
                  Study {lowMidCourses[0].code} Now
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('courses')}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 glass-subtle rounded-lg whitespace-nowrap"
                >
                  Courses
                </button>
              </div>
            </div>
          )}

          {pendingInviteCode && pendingInviteCode !== profile.friendCode && (
            <div className="mb-6 p-4 glass-panel border border-blue-200/80 dark:border-blue-800/70 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <UserPlus className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                <div className="text-sm text-slate-800 dark:text-slate-100">
                  Friend invite link detected for code{' '}
                  <span className="font-mono font-semibold">{pendingInviteCode}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={acceptingInviteLink}
                  onClick={() => void handleSendPendingInvite()}
                  className="px-3.5 py-1.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap disabled:opacity-60"
                >
                  {acceptingInviteLink ? 'Sending...' : 'Send Friend Invite'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveSection('friends')}
                  className="px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 glass-subtle rounded-lg whitespace-nowrap"
                >
                  Open Friends
                </button>
                <button
                  type="button"
                  onClick={() => setPendingInviteCode(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  aria-label="Dismiss invite link"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          <AnimatePresence mode="wait">
            <motion.div
              key={activeSection}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              {activeSection === 'overview' && (
                <OverviewView
                  profile={profile}
                  courses={courses}
                  topics={topics}
                  sessions={sessions}
                  notes={notes}
                  friendCount={friendProfiles.length}
                  timerRunning={timerRunning}
                  timerSeconds={timerSeconds}
                  timerCourseCode={timerCourseCode}
                  hasWorkspaceToken={Boolean(accessToken)}
                  accessToken={accessToken}
                  bubbleMode={bubbleMode}
                  soundscape={soundscape}
                  soundVolume={soundVolume}
                  onChangeBubbleMode={setBubbleMode}
                  onChangeSoundscape={handleChangeSoundscape}
                  onChangeSoundVolume={handleChangeSoundVolume}
                  onReconnectWorkspace={() => void handleConnectWorkspace()}
                  onConnectDriveOnly={() => void handleConnectDriveOnly()}
                  onStartQuickTimer={handleStartTimer}
                  onStopAndSaveTimer={() => void handleStopAndSaveTimer()}
                  onOpenFocusZoom={() => setFocusZoomOpen(true)}
                  onStartCourseRecoveryFocus={handleStartCourseRecoveryFocus}
                  onNavigate={(sec) => setActiveSection(sec)}
                />
              )}

              {activeSection === 'courses' && (
                <CoursesView
                  uid={profile.uid}
                  gradingScale={profile.gradingScale}
                  courses={courses}
                  topics={topics}
                  accessToken={accessToken}
                  onRequestAuth={() => void handleConnectWorkspace()}
                  onStartRecoveryFocus={handleStartCourseRecoveryFocus}
                  onNotify={notify}
                />
              )}

              {activeSection === 'sessions' && (
                <SessionsView
                  profile={profile}
                  courses={courses}
                  topics={topics}
                  sessions={sessions}
                  timerRunning={timerRunning}
                  timerSeconds={timerSeconds}
                  timerPreset={timerPreset}
                  timerCourseId={timerCourseId}
                  timerTopicId={timerTopicId}
                  onSetTimerPreset={setTimerPreset}
                  onSetTimerTarget={(cId, tId) => {
                    setTimerCourseId(cId);
                    setTimerTopicId(tId);
                  }}
                  onStartTimer={handleStartTimer}
                  onPauseTimer={() => setTimerRunning(false)}
                  onStopAndSaveTimer={handleStopAndSaveTimer}
                  onResetTimer={handleResetTimer}
                  onOpenFocusZoom={() => setFocusZoomOpen(true)}
                  onNotify={notify}
                />
              )}

              {activeSection === 'notes' && (
                <NotesFilesView
                  profile={profile}
                  courses={courses}
                  topics={topics}
                  notes={notes}
                  friendUids={friendUids}
                  friendProfiles={friendProfiles}
                  studyGroups={studyGroups}
                  accessToken={accessToken}
                  onRequestAuth={() => void handleConnectWorkspace()}
                  onRequestDriveOnly={() => void handleConnectDriveOnly()}
                  onNotify={notify}
                  initialComposeMode={notesComposeMode}
                />
              )}

              {activeSection === 'cgpa' && (
                <CgpaView profile={profile} courses={courses} onNotify={notify} />
              )}

              {activeSection === 'friends' && (
                <FriendsView
                  profile={profile}
                  courses={courses}
                  topics={topics}
                  sessions={sessions}
                  friendProfiles={friendProfiles}
                  incomingRequests={incomingRequests}
                  outgoingRequests={outgoingRequests}
                  groupSessions={groupSessions}
                  sharedNotes={sharedNotes}
                  accessToken={accessToken}
                  pendingInviteCode={pendingInviteCode}
                  onClearPendingInvite={() => setPendingInviteCode(null)}
                  onRequestAuth={() => void handleConnectWorkspace()}
                  onStartFocusZoom={(courseCode) => {
                    const matched = courses.find(
                      (c) => c.code.toLowerCase() === courseCode.toLowerCase()
                    );
                    if (matched) setTimerCourseId(matched.id);
                    handleStartTimer();
                  }}
                  onNotify={notify}
                />
              )}

              {activeSection === 'requests' && (
                <FeatureRequestsView
                  profile={profile}
                  formConfig={featureFormConfig}
                  requests={featureRequests}
                  accessToken={accessToken}
                  onRequestAuth={() => void handleConnectWorkspace()}
                  onNotify={notify}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Full-Screen Zoomed Focus Timer + Integrated PDF / Notes Reader */}
      <FocusZoomModal
        open={focusZoomOpen}
        onClose={() => setFocusZoomOpen(false)}
        courses={courses}
        topics={topics}
        notes={notes}
        timerRunning={timerRunning}
        timerSeconds={timerSeconds}
        timerPreset={timerPreset}
        timerCourseId={timerCourseId}
        timerTopicId={timerTopicId}
        soundscape={soundscape}
        soundVolume={soundVolume}
        accessToken={accessToken}
        onRequestAuth={() => void handleConnectWorkspace()}
        onSetTimerPreset={setTimerPreset}
        onSetTimerTarget={(cId, tId) => {
          setTimerCourseId(cId);
          setTimerTopicId(tId);
        }}
        onStartTimer={() => {
          if (!timerStartedIso) setTimerStartedIso(new Date().toISOString());
          setTimerRunning(true);
        }}
        onPauseTimer={() => setTimerRunning(false)}
        onStopAndSaveTimer={handleStopAndSaveTimer}
        onResetTimer={handleResetTimer}
        onChangeSoundscape={handleChangeSoundscape}
        onChangeSoundVolume={handleChangeSoundVolume}
        onNotify={notify}
      />

      {/* Command Palette */}
      <CommandPalette
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        onNavigate={(sec) => {
          setActiveSection(sec);
          setNotesComposeMode(null);
        }}
        onStartQuickTimer={() => {
          setActiveSection('sessions');
          handleStartTimer();
        }}
        onOpenQuickNote={() => {
          setActiveSection('notes');
          setNotesComposeMode('text');
        }}
        onToggleTheme={() => setDarkMode((v) => !v)}
        isAdmin={isVerifiedAdmin}
        onOpenAdmin={() => setHiddenAdminRoute(true)}
      />

      {/* Toast Feedback */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            role="status"
            className="fixed bottom-5 right-5 z-50 bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg flex items-center gap-3"
          >
            <span>{toast}</span>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="opacity-70 hover:opacity-100"
              aria-label="Dismiss message"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ErrorBoundary>
        <StudyTrackerWorkspace />
      </ErrorBoundary>
    </MotionConfig>
  );
}

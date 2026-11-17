import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Analytics } from '@vercel/analytics/react';
import {
  BookOpen,
  Calculator,
  Clock,
  Command,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquarePlus,
  Moon,
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
import { AmbientBubbles, BubbleVibeMode } from './components/AmbientBubbles.tsx';
import { CgpaView } from './components/CgpaView.tsx';
import { CommandPalette } from './components/CommandPalette.tsx';
import { CoursesView } from './components/CoursesView.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';
import { FeatureRequestsView } from './components/FeatureRequestsView.tsx';
import { FriendsView } from './components/FriendsView.tsx';
import { NotesFilesView } from './components/NotesFilesView.tsx';
import { OverviewView } from './components/OverviewView.tsx';
import { SessionsView, TimerPreset } from './components/SessionsView.tsx';
import { SignInView } from './components/SignInView.tsx';
import { soundEngine, SoundscapeType } from './lib/soundscape.ts';
import {
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
  GroupStudySession,
  isAppAdmin,
  NavSection,
  NoteOrFile,
  SharedNote,
  StudyGroup,
  StudySession,
  SyllabusTopic,
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
  const [pendingInviteCode, setPendingInviteCode] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    const raw = new URLSearchParams(window.location.search).get('invite');
    if (!raw) return null;
    const cleaned = raw.trim().toUpperCase().replace(/[^A-Z0-9\-]/g, '');
    return cleaned || null;
  });
  const [acceptingInviteLink, setAcceptingInviteLink] = useState(false);

  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [notesComposeMode, setNotesComposeMode] = useState<'upload' | 'text' | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [bubbleMode, setBubbleMode] = useState<BubbleVibeMode>('subtle');
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

  // Sync dark mode class on <html>
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

  // Global keyboard shortcuts (Cmd/Ctrl+K or "/" when not in an input)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'SELECT' ||
        target?.isContentEditable;

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
  }, []);

  // Auth listener
  useEffect(() => {
    const unsub = initAuth((user, token) => {
      setAuthUser(user);
      if (token) setAccessToken(token);
      if (!user) {
        setAccessToken(null);
        setProfile(null);
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

    const reqQuery = isAppAdmin(authUser.email)
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
      unsubFeatureRequests();
    };
  }, [authUser]);

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
      if (res.accessToken) {
        notify('Signed in and connected to Google Drive, Gmail, Tasks, and Forms.');
      }
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Google Sign-In failed.');
    } finally {
      setIsSigningIn(false);
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

  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center text-sm text-slate-500">
        Loading Study Tracker...
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
      />
    );
  }

  const activeNavItem = NAV_ITEMS.find((n) => n.id === activeSection) || NAV_ITEMS[0];
  const timerCourseCode = courses.find((c) => c.id === timerCourseId)?.code || 'GENERAL';

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50/40 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-900 dark:text-slate-100 flex relative overflow-x-hidden">
      <AmbientBubbles mode={bubbleMode} darkMode={darkMode} />

      {/* Desktop Sidebar (256px) */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col justify-between glass-panel border-r border-white/50 dark:border-slate-800/80 rounded-none relative z-10">
        <div className="p-5 space-y-6">
          <div className="px-2 py-1">
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-slate-50 whitespace-nowrap">
              Study Tracker
            </span>
          </div>

          <nav className="space-y-1" aria-label="Main menu">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setActiveSection(item.id);
                    setNotesComposeMode(null);
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium transition-colors text-left ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">
                    {item.num}. {item.label}
                  </span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-5 border-t border-slate-200 dark:border-slate-800 space-y-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
            {profile.displayName} · {profile.email}
          </div>
          <button
            type="button"
            onClick={() => void logout()}
            className="w-full inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-red-600 dark:hover:text-red-400 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden bg-slate-950/60 backdrop-blur-xs flex"
          onClick={() => setMobileMenuOpen(false)}
        >
          <aside
            className="w-64 glass-panel h-full p-5 flex flex-col justify-between border-r border-white/50 dark:border-slate-800/80 rounded-none"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <span className="font-display text-lg font-bold">Study Tracker</span>
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1 text-slate-400"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <nav className="space-y-1">
                {NAV_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setActiveSection(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full px-3 py-2.5 rounded-lg flex items-center gap-3 text-sm font-medium text-left ${
                        isActive
                          ? 'bg-blue-50 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate">
                        {item.num}. {item.label}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>
            <button
              type="button"
              onClick={() => void logout()}
              className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 rounded-lg"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Clean 3-Zone Top Bar */}
        <header className="h-16 glass-panel border-b border-white/50 dark:border-slate-800/80 rounded-none px-6 flex items-center justify-between gap-8 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap truncate">
              Study Tracker / {activeNavItem.num}. {activeNavItem.label}
            </span>
          </div>

          <div className="hidden md:flex items-center">
            <button
              type="button"
              onClick={() => setCommandOpen(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg hover:border-slate-300 dark:hover:border-slate-700 whitespace-nowrap shrink-0"
            >
              <Command className="w-3.5 h-3.5" />
              Quick Command
              <span className="font-mono text-[11px] text-slate-400">⌘K</span>
            </button>
          </div>

          <div className="flex items-center gap-3 shrink-0">
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
              onReconnectWorkspace={() => void handleSignIn()}
              onStartQuickTimer={handleStartTimer}
              onStopAndSaveTimer={() => void handleStopAndSaveTimer()}
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
              onRequestAuth={() => void handleSignIn()}
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
              onRequestAuth={() => void handleSignIn()}
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
              onRequestAuth={() => void handleSignIn()}
              onNotify={notify}
            />
          )}

          {activeSection === 'requests' && (
            <FeatureRequestsView
              profile={profile}
              formConfig={featureFormConfig}
              requests={featureRequests}
              accessToken={accessToken}
              onRequestAuth={() => void handleSignIn()}
              onNotify={notify}
            />
          )}
        </main>
      </div>

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
      />

      {/* Toast Feedback */}
      {toast && (
        <div
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
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <StudyTrackerWorkspace />
      <Analytics />
    </ErrorBoundary>
  );
}

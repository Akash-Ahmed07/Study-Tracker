import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithPopup,
  signInWithPopup,
  User,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

export const WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/forms.body',
  'https://www.googleapis.com/auth/forms.body.readonly',
  'https://www.googleapis.com/auth/forms.responses.readonly',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/tasks',
] as const;

export const DRIVE_ONLY_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
] as const;

const app = initializeApp(firebaseConfig);
const databaseId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-studytracker-e35d7615-f3a0-43c8-aca6-ee7b8e3d95bf';

export const db = getFirestore(app, databaseId);
export const auth = getAuth(app);

const basicProvider = new GoogleAuthProvider();
basicProvider.setCustomParameters({ prompt: 'select_account' });

const workspaceProvider = new GoogleAuthProvider();
for (const scope of WORKSPACE_SCOPES) {
  workspaceProvider.addScope(scope);
}
workspaceProvider.setCustomParameters({ prompt: 'consent select_account' });

const driveOnlyProvider = new GoogleAuthProvider();
for (const scope of DRIVE_ONLY_SCOPES) {
  driveOnlyProvider.addScope(scope);
}
driveOnlyProvider.setCustomParameters({ prompt: 'consent select_account' });

// In-memory only OAuth access token (never localStorage or sessionStorage)
let isSigningIn = false;
let cachedAccessToken: string | null = null;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((p) => ({
          providerId: p.providerId,
          email: p.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection(): Promise<void> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration: the client is offline.');
    }
  }
}

void testConnection();

export function initAuth(
  onUserChanged: (user: User | null, accessToken: string | null) => void
) {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedAccessToken = null;
      onUserChanged(null, null);
      return;
    }
    if (!isSigningIn) {
      onUserChanged(user, cachedAccessToken);
    }
  });
}

function formatAuthError(error: unknown): Error {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = (error as { code?: string }).code;
    if (code === 'auth/unauthorized-domain') {
      const host = typeof window !== 'undefined' ? window.location.hostname : 'this domain';
      return new Error(
        `Domain "${host}" is not authorized in Firebase Authentication for project "${firebaseConfig.projectId}". Add "${host}" under Firebase Console → Authentication → Settings → Authorized domains.`
      );
    }
    if (code === 'auth/popup-blocked') {
      return new Error(
        'Popup was blocked by your browser. Please allow popups for this site and try again.'
      );
    }
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
      return new Error(
        'Sign-in popup was closed before finishing. If Google blocked full Workspace access, try "Connect Drive Only".'
      );
    }
  }
  return error instanceof Error ? error : new Error('Google Sign-In failed.');
}

async function authorizeWithProvider(provider: GoogleAuthProvider): Promise<{
  user: User;
  accessToken: string | null;
}> {
  try {
    isSigningIn = true;
    let result;
    if (auth.currentUser) {
      try {
        result = await reauthenticateWithPopup(auth.currentUser, provider);
      } catch (reauthErr) {
        const code =
          reauthErr && typeof reauthErr === 'object' && 'code' in reauthErr
            ? (reauthErr as { code?: string }).code
            : '';
        if (code === 'auth/user-mismatch' || code === 'auth/operation-not-allowed') {
          result = await signInWithPopup(auth, provider);
        } else {
          throw reauthErr;
        }
      }
    } else {
      result = await signInWithPopup(auth, provider);
    }
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken ?? null;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Google Workspace connection error:', error);
    throw formatAuthError(error);
  } finally {
    isSigningIn = false;
  }
}

export async function googleSignIn(): Promise<{
  user: User;
  accessToken: string | null;
}> {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, basicProvider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    cachedAccessToken = credential?.accessToken ?? null;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Google Sign-In error:', error);
    throw formatAuthError(error);
  } finally {
    isSigningIn = false;
  }
}

export async function connectGoogleWorkspace(): Promise<{
  user: User;
  accessToken: string | null;
}> {
  return authorizeWithProvider(workspaceProvider);
}

export async function connectGoogleDriveOnly(): Promise<{
  user: User;
  accessToken: string | null;
}> {
  return authorizeWithProvider(driveOnlyProvider);
}

export function getAccessToken(): string | null {
  return cachedAccessToken;
}

export async function getIdToken(): Promise<string> {
  if (!auth.currentUser) {
    throw new Error('Not authenticated');
  }
  return auth.currentUser.getIdToken();
}

export async function logout(): Promise<void> {
  cachedAccessToken = null;
  await auth.signOut();
}

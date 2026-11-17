import express, { type Request, type Response, type NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import dotenv from 'dotenv';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

dotenv.config();

const PORT = 3000;
const MAX_FILE_SIZE_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB limit per file
const FILES_ROOT = path.resolve(
  process.cwd(),
  process.env.STUDYTRACKER_FILES || '.studytracker_files'
);

if (!fs.existsSync(FILES_ROOT)) {
  fs.mkdirSync(FILES_ROOT, { recursive: true });
}

const adminApp = getApps().length
  ? getApps()[0]
  : initializeApp({
      projectId: firebaseConfig.projectId,
    });

const adminAuth = getAuth(adminApp);
const databaseId =
  (firebaseConfig as { firestoreDatabaseId?: string }).firestoreDatabaseId ||
  'ai-studio-studytracker-e35d7615-f3a0-43c8-aca6-ee7b8e3d95bf';
const adminDb = getFirestore(adminApp, databaseId);

interface AuthRequest extends Request {
  user?: DecodedIdToken;
}

const SAFE_SEGMENT_RE = /^[a-zA-Z0-9._-]+$/;

function isSafeSegment(value: string): boolean {
  return Boolean(value) && value.length <= 200 && SAFE_SEGMENT_RE.test(value) && !value.includes('..');
}

function getUserFilesDir(uid: string): string {
  if (!isSafeSegment(uid)) {
    throw new Error('Invalid user identifier');
  }
  const dir = path.join(FILES_ROOT, uid);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing bearer token' });
    return;
  }

  const idToken = authHeader.slice('Bearer '.length).trim();
  try {
    const decoded = await adminAuth.verifyIdToken(idToken);
    req.user = decoded;
    next();
  } catch (err) {
    console.error('Firebase token verification error:', err);
    res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    try {
      const authReq = req as AuthRequest;
      if (!authReq.user?.uid) {
        cb(new Error('Unauthorized'), '');
        return;
      }
      const userDir = getUserFilesDir(authReq.user.uid);
      cb(null, userDir);
    } catch (err) {
      cb(err as Error, '');
    }
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 16);
    const key = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
    cb(null, key);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
  },
});

function pairDocId(uid1: string, uid2: string): string {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, maxFileSizeBytes: MAX_FILE_SIZE_BYTES });
  });

  // Upload a course file (max 100 MB) into STUDYTRACKER_FILES/<uid>/
  app.post('/api/files/upload', requireAuth, (req: AuthRequest, res: Response) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({ error: 'File exceeds the 2 GB per-file limit.' });
          return;
        }
        res.status(400).json({ error: err.message || 'File upload failed.' });
        return;
      }

      if (!req.file) {
        res.status(400).json({ error: 'No file provided.' });
        return;
      }

      res.json({
        storageKey: req.file.filename,
        originalFilename: req.file.originalname,
        mimeType: req.file.mimetype || 'application/octet-stream',
        sizeBytes: req.file.size,
      });
    });
  });

  // Download or preview an owned file OR a friend's explicitly shared file OR a study-group shared file
  app.get('/api/files/:ownerUid/:storageKey', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const requesterUid = req.user?.uid;
      const ownerUid = String(req.params.ownerUid || '');
      const storageKey = String(req.params.storageKey || '');
      const groupId = typeof req.query.groupId === 'string' ? req.query.groupId.trim() : '';

      if (!requesterUid || !isSafeSegment(ownerUid) || !isSafeSegment(storageKey)) {
        res.status(400).json({ error: 'Invalid file reference.' });
        return;
      }

      if (requesterUid !== ownerUid) {
        let authorized = false;

        if (groupId && isSafeSegment(groupId)) {
          const groupSnap = await adminDb.collection('studyGroups').doc(groupId).get();
          const groupData = groupSnap.data() as { memberUids?: string[] } | undefined;
          const members = groupData?.memberUids || [];
          if (members.includes(requesterUid) && members.includes(ownerUid)) {
            const msgSnap = await adminDb
              .collection('studyGroups')
              .doc(groupId)
              .collection('messages')
              .where('senderUid', '==', ownerUid)
              .where('storageKey', '==', storageKey)
              .limit(1)
              .get();
            if (!msgSnap.empty) {
              authorized = true;
            }
          }
        }

        if (!authorized) {
          const friendshipSnap = await adminDb
            .collection('friendships')
            .doc(pairDocId(requesterUid, ownerUid))
            .get();
          if (friendshipSnap.exists) {
            const sharedSnap = await adminDb
              .collection('sharedNotes')
              .where('ownerUid', '==', ownerUid)
              .where('storageKey', '==', storageKey)
              .limit(1)
              .get();
            if (!sharedSnap.empty) {
              authorized = true;
            }
          }
        }

        if (!authorized) {
          res.status(403).json({ error: 'Access denied: File is not shared with you.' });
          return;
        }
      }

      const filePath = path.join(FILES_ROOT, ownerUid, storageKey);
      if (!fs.existsSync(filePath)) {
        res.status(404).json({ error: 'File not found on server storage.' });
        return;
      }

      const downloadName = typeof req.query.name === 'string' && req.query.name.trim()
        ? path.basename(req.query.name.trim())
        : storageKey;

      if (req.query.download === '1') {
        res.download(filePath, downloadName);
        return;
      }

      if (typeof req.query.mime === 'string' && req.query.mime.trim()) {
        res.setHeader('Content-Type', req.query.mime.trim());
      }
      res.setHeader('Content-Disposition', `inline; filename="${downloadName.replace(/"/g, '')}"`);
      fs.createReadStream(filePath).pipe(res);
    } catch (error) {
      console.error('File retrieval error:', error);
      res.status(500).json({ error: 'Failed to retrieve file.' });
    }
  });

  // Save a copy of a friend's or group member's shared file into the requester's own storage folder
  app.post('/api/files/copy-shared', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const requesterUid = req.user?.uid;
      const ownerUid = String(req.body?.ownerUid || '');
      const storageKey = String(req.body?.storageKey || '');
      const groupId = typeof req.body?.groupId === 'string' ? req.body.groupId.trim() : '';

      if (!requesterUid || !isSafeSegment(ownerUid) || !isSafeSegment(storageKey)) {
        res.status(400).json({ error: 'Invalid shared file reference.' });
        return;
      }

      if (requesterUid !== ownerUid) {
        let authorized = false;

        if (groupId && isSafeSegment(groupId)) {
          const groupSnap = await adminDb.collection('studyGroups').doc(groupId).get();
          const groupData = groupSnap.data() as { memberUids?: string[] } | undefined;
          const members = groupData?.memberUids || [];
          if (members.includes(requesterUid) && members.includes(ownerUid)) {
            const msgSnap = await adminDb
              .collection('studyGroups')
              .doc(groupId)
              .collection('messages')
              .where('senderUid', '==', ownerUid)
              .where('storageKey', '==', storageKey)
              .limit(1)
              .get();
            if (!msgSnap.empty) {
              authorized = true;
            }
          }
        }

        if (!authorized) {
          const friendshipSnap = await adminDb
            .collection('friendships')
            .doc(pairDocId(requesterUid, ownerUid))
            .get();
          if (friendshipSnap.exists) {
            const sharedSnap = await adminDb
              .collection('sharedNotes')
              .where('ownerUid', '==', ownerUid)
              .where('storageKey', '==', storageKey)
              .limit(1)
              .get();
            if (!sharedSnap.empty) {
              authorized = true;
            }
          }
        }

        if (!authorized) {
          res.status(403).json({ error: 'Access denied: File is not shared with you.' });
          return;
        }
      }

      const srcPath = path.join(FILES_ROOT, ownerUid, storageKey);
      if (!fs.existsSync(srcPath)) {
        res.status(404).json({ error: 'Source file not found.' });
        return;
      }

      const ext = path.extname(storageKey).replace(/[^a-zA-Z0-9.]/g, '').slice(0, 16);
      const newKey = `${Date.now()}_${crypto.randomBytes(6).toString('hex')}${ext}`;
      const destDir = getUserFilesDir(requesterUid);
      const destPath = path.join(destDir, newKey);

      await fs.promises.copyFile(srcPath, destPath);
      const stat = await fs.promises.stat(destPath);

      res.json({
        storageKey: newKey,
        sizeBytes: stat.size,
      });
    } catch (error) {
      console.error('Copy shared file error:', error);
      res.status(500).json({ error: 'Failed to copy shared file.' });
    }
  });

  // Delete an owned file from disk
  app.delete('/api/files/:storageKey', requireAuth, async (req: AuthRequest, res: Response) => {
    try {
      const uid = req.user?.uid;
      const storageKey = String(req.params.storageKey || '');
      if (!uid || !isSafeSegment(storageKey)) {
        res.status(400).json({ error: 'Invalid file key.' });
        return;
      }

      const filePath = path.join(FILES_ROOT, uid, storageKey);
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
      res.json({ deleted: true });
    } catch (error) {
      console.error('Delete file error:', error);
      res.status(500).json({ error: 'Failed to delete file.' });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Study Tracker server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start Study Tracker server:', err);
  process.exit(1);
});

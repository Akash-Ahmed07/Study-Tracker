# Study Tracker — Security Specification (Phase 0)

## 1. Data Invariants

1. **Grade & CGPA Privacy Isolation**: `courses` (which hold `gradeLetter`), `users/{uid}` (email & settings), `topics`, `sessions`, and `notes` live strictly under `/users/{uid}/...` where only `request.auth.uid == uid` can read or write. Friends can NEVER read another user's grades, CGPA, or email.
2. **Identity & Immutability**: Every user-owned document verifies `uid` / `userId` / `ownerUid` / `hostUid` matches `request.auth.uid` on create and cannot be reassigned on update. `createdAt` is always server-verified `request.time` and immutable thereafter.
3. **Friend Lookup Without Scraping**: `/friendCodes/{code}` and `/emailLookup/{emailHash}` allow `get` only (zero `list`), preventing enumeration of all users or email harvesting.
4. **Atomic Friendship Creation**: `/friendships/{pairId}` creation requires `pairId == uidA + '_' + uidB` (lexicographically ordered) and uses `getAfter()` on `/friendRequests/{requestId}` to verify the invitation transitioned atomically to `'accepted'`.
5. **Terminal State Locking**: `friendRequests` cannot be mutated once `'accepted'` or `'declined'`; `groupSessions` cannot be mutated once `'completed'`.
6. **File Size Cap & Bounded Arrays**: `NoteOrFile.sizeBytes` and `SharedNote.sizeBytes` are bounded `>= 0 && <= 104857600` (100 MB). `allowedFriendUids` is bounded `<= 25`, `participantUids` is bounded `<= 10`, and `courseProgress` is bounded `<= 20`.
7. **Verified Auth**: All writes require `request.auth != null && request.auth.token.email_verified == true`.
8. **Admin RBAC & Feature Request Integrity**: Only verified admins (`groweasy25@gmail.com` or `/admins/{uid}`) can write `/appConfig/featureForm` or change `status` / `adminNote` on `/featureRequests/{requestId}`. Students always initialize new feature requests with `status == 'open'` and `adminNote == ''`.
9. **Study Group Membership Isolation**: Only members in `studyGroups/{groupId}.memberUids` can list or read messages in `/studyGroups/{groupId}/messages/{messageId}` or download files shared inside that group. Joining via `/groupCodes/{code}` only permits appending the requester's own UID to `memberUids`.

## 2. The "Dirty Dozen" Adversarial Payloads

1. **Grade Snooping**: Friend B attempts `get` on `/users/userA/courses/course1` -> `PERMISSION_DENIED`.
2. **PII Harvesting**: Authenticated user attempts `list` on `/users` or `/emailLookup` -> `PERMISSION_DENIED`.
3. **Ghost Field Shadow Update**: User A updates `/users/userA/courses/c1` with extra field `isAdmin: true` -> `PERMISSION_DENIED` (`hasOnly` check).
4. **UID Spoofing**: User B creates `/users/userB/courses/c1` with `userId: "userA"` -> `PERMISSION_DENIED`.
5. **Unverified Email Write**: Token with `email_verified: false` attempts to create `/friendRequests/req1` -> `PERMISSION_DENIED`.
6. **Self-Friend Request**: User A creates `/friendRequests/req1` with `fromUid == toUid` -> `PERMISSION_DENIED`.
7. **Unauthorized Request Acceptance**: Sender User A attempts to update `/friendRequests/req1` status to `'accepted'` -> `PERMISSION_DENIED` (only `toUid` may accept).
8. **Terminal State Reopening**: User B updates an already `'accepted'` `/friendRequests/req1` back to `'pending'` -> `PERMISSION_DENIED`.
9. **Orphan Friendship Bypass**: User A creates `/friendships/userA_userB` without an accepted `friendRequest` -> `PERMISSION_DENIED` (`getAfter` check).
10. **100 MB Limit Bypass**: User A creates `/users/userA/notes/n1` with `sizeBytes: 200000000` -> `PERMISSION_DENIED`.
11. **ID Poisoning**: User A writes `/users/userA/topics/invalid$id!` -> `PERMISSION_DENIED` (`isValidId` regex).
12. **Timestamp Forgery**: User A creates `/sharedNotes/sn1` with backdated `createdAt` != `request.time` -> `PERMISSION_DENIED`.
13. **Admin Escalation / Config Tampering**: Non-admin User A attempts to create `/appConfig/featureForm` or update `/featureRequests/fr1` with `status: 'shipped'` -> `PERMISSION_DENIED`.
14. **Unauthorized Group Read / Hijack**: Non-member User C attempts `list` on `/studyGroups/g1/messages` or updates `memberUids` to remove owner -> `PERMISSION_DENIED`.



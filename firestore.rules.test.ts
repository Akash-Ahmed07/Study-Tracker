/**
 * Security Rule Verification Suite for Study Tracker
 * Covers the Dirty Dozen adversarial payloads defined in security_spec.md.
 */

export const DIRTY_DOZEN_CASES = [
  { name: '1. Grade snooping across user boundaries', path: '/users/userA/courses/c1', op: 'get', actor: 'userB', expect: 'PERMISSION_DENIED' },
  { name: '2. PII harvesting via list on /users or /emailLookup', path: '/users', op: 'list', actor: 'userB', expect: 'PERMISSION_DENIED' },
  { name: '3. Ghost field shadow update on course', path: '/users/userA/courses/c1', op: 'update', payload: { isAdmin: true }, actor: 'userA', expect: 'PERMISSION_DENIED' },
  { name: '4. UID spoofing on course create', path: '/users/userB/courses/c1', op: 'create', payload: { userId: 'userA' }, actor: 'userB', expect: 'PERMISSION_DENIED' },
  { name: '5. Unverified email write blocked', path: '/friendRequests/req1', op: 'create', actor: 'unverifiedUser', expect: 'PERMISSION_DENIED' },
  { name: '6. Self-friend request blocked', path: '/friendRequests/req1', op: 'create', payload: { fromUid: 'userA', toUid: 'userA' }, actor: 'userA', expect: 'PERMISSION_DENIED' },
  { name: '7. Unauthorized request acceptance by sender', path: '/friendRequests/req1', op: 'update', payload: { status: 'accepted' }, actor: 'userA', expect: 'PERMISSION_DENIED' },
  { name: '8. Terminal state reopening on friendRequest', path: '/friendRequests/req1', op: 'update', payload: { status: 'pending' }, actor: 'userB', expect: 'PERMISSION_DENIED' },
  { name: '9. Orphan friendship without accepted request', path: '/friendships/userA_userB', op: 'create', actor: 'userA', expect: 'PERMISSION_DENIED' },
  { name: '10. 100 MB file size cap bypass', path: '/users/userA/notes/n1', op: 'create', payload: { sizeBytes: 200000000 }, actor: 'userA', expect: 'PERMISSION_DENIED' },
  { name: '11. ID poisoning on document path', path: '/users/userA/topics/invalid$id!', op: 'create', actor: 'userA', expect: 'PERMISSION_DENIED' },
  { name: '12. Timestamp forgery on sharedNotes', path: '/sharedNotes/sn1', op: 'create', payload: { createdAt: '2020-01-01T00:00:00Z' }, actor: 'userA', expect: 'PERMISSION_DENIED' },
  { name: '13. Admin escalation / feature config tampering by student', path: '/appConfig/featureForm', op: 'create', payload: { formId: 'f1' }, actor: 'userA', expect: 'PERMISSION_DENIED' },
  { name: '14. Unauthorized study group message read / member hijack', path: '/studyGroups/g1/messages/m1', op: 'list', actor: 'nonMember', expect: 'PERMISSION_DENIED' },
] as const;

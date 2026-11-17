import { SyllabusTopic } from './types.ts';

export interface DriveFileItem {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime?: string;
  webViewLink?: string;
}

export interface GoogleTaskItem {
  id: string;
  title: string;
  notes?: string;
  due?: string;
  status: 'needsAction' | 'completed';
}

export interface GmailMessageSummary {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

async function workspaceFetch(url: string, accessToken: string, init?: RequestInit) {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Workspace API (${res.status}): ${text.slice(0, 220)}`);
  }
  return res;
}

// ---------------- GOOGLE DRIVE ----------------

export async function listDriveFiles(
  accessToken: string,
  searchQuery = ''
): Promise<DriveFileItem[]> {
  const qParts = ['trashed = false', "mimeType != 'application/vnd.google-apps.folder'"];
  if (searchQuery.trim()) {
    const escaped = searchQuery.trim().replace(/'/g, "\\'");
    qParts.push(`name contains '${escaped}'`);
  }
  const params = new URLSearchParams({
    pageSize: '25',
    fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink)',
    orderBy: 'modifiedTime desc',
    q: qParts.join(' and '),
  });

  const res = await workspaceFetch(
    `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
    accessToken
  );
  const data = (await res.json()) as { files?: DriveFileItem[] };
  return data.files || [];
}

export async function downloadDriveFileAsFile(
  accessToken: string,
  item: DriveFileItem
): Promise<File> {
  const isGoogleDoc = item.mimeType.startsWith('application/vnd.google-apps.');
  let url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}?alt=media`;
  let targetMime = item.mimeType || 'application/octet-stream';
  let targetName = item.name;

  if (isGoogleDoc) {
    // Export Google Docs/Slides/Sheets to PDF for reliable viewing and archiving
    targetMime = 'application/pdf';
    url = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(item.id)}/export?mimeType=application/pdf`;
    if (!targetName.toLowerCase().endsWith('.pdf')) {
      targetName = `${targetName}.pdf`;
    }
  }

  const res = await workspaceFetch(url, accessToken);
  const blob = await res.blob();
  return new File([blob], targetName, { type: targetMime });
}

export async function exportBlobToDrive(
  accessToken: string,
  filename: string,
  mimeType: string,
  blob: Blob
): Promise<{ id: string; webViewLink?: string }> {
  const metadata = {
    name: filename,
    mimeType,
  };
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', blob, filename);

  const res = await workspaceFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    accessToken,
    {
      method: 'POST',
      body: form,
    }
  );
  return (await res.json()) as { id: string; webViewLink?: string };
}

// ---------------- GOOGLE TASKS ----------------

export async function getOrCreateStudyTrackerTaskList(
  accessToken: string
): Promise<string> {
  const listRes = await workspaceFetch(
    'https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=50',
    accessToken
  );
  const data = (await listRes.json()) as {
    items?: { id: string; title: string }[];
  };
  const existing = data.items?.find(
    (l) => l.title.trim().toLowerCase() === 'study tracker'
  );
  if (existing) return existing.id;

  const createRes = await workspaceFetch(
    'https://tasks.googleapis.com/tasks/v1/users/@me/lists',
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Study Tracker' }),
    }
  );
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

export async function listStudyTasks(
  accessToken: string,
  taskListId: string
): Promise<GoogleTaskItem[]> {
  const res = await workspaceFetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks?showCompleted=true&maxResults=50`,
    accessToken
  );
  const data = (await res.json()) as { items?: GoogleTaskItem[] };
  return data.items || [];
}

export async function syncTopicToGoogleTask(
  accessToken: string,
  taskListId: string,
  courseCode: string,
  topic: SyllabusTopic
): Promise<string> {
  const taskPayload: Record<string, unknown> = {
    title: `[${courseCode}] ${topic.title}`,
    status: topic.status === 'done' ? 'completed' : 'needsAction',
    notes: `Course: ${courseCode} | Syllabus status: ${topic.status.toUpperCase()}`,
  };
  if (topic.dueDate) {
    const parsed = new Date(topic.dueDate);
    if (!Number.isNaN(parsed.getTime())) {
      taskPayload.due = parsed.toISOString();
    }
  }

  if (topic.googleTaskId) {
    const res = await workspaceFetch(
      `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(topic.googleTaskId)}`,
      accessToken,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(taskPayload),
      }
    );
    const updated = (await res.json()) as { id: string };
    return updated.id;
  }

  const res = await workspaceFetch(
    `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks`,
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(taskPayload),
    }
  );
  const created = (await res.json()) as { id: string };
  return created.id;
}

// ---------------- GMAIL ----------------

function base64UrlEncode(str: string): string {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function sendStudyEmail(
  accessToken: string,
  toEmail: string,
  subject: string,
  bodyText: string
): Promise<{ id: string }> {
  const rfc2822 = [
    `To: ${toEmail}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'MIME-Version: 1.0',
    '',
    bodyText,
  ].join('\r\n');

  const res = await workspaceFetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        raw: base64UrlEncode(rfc2822),
      }),
    }
  );
  return (await res.json()) as { id: string };
}

export async function listRecentStudyEmails(
  accessToken: string
): Promise<GmailMessageSummary[]> {
  const listRes = await workspaceFetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=6&q=study%20OR%20syllabus%20OR%20assignment%20OR%20exam',
    accessToken
  );
  const listData = (await listRes.json()) as { messages?: { id: string }[] };
  if (!listData.messages?.length) return [];

  const details = await Promise.all(
    listData.messages.slice(0, 6).map(async (m) => {
      const msgRes = await workspaceFetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(m.id)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
        accessToken
      );
      const msgData = (await msgRes.json()) as {
        id: string;
        snippet?: string;
        payload?: { headers?: { name: string; value: string }[] };
      };
      const headers = msgData.payload?.headers || [];
      const getHeader = (name: string) =>
        headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || '';
      return {
        id: msgData.id,
        subject: getHeader('Subject') || '(No subject)',
        from: getHeader('From') || 'Unknown sender',
        date: getHeader('Date') || '',
        snippet: msgData.snippet || '',
      };
    })
  );
  return details;
}

// ---------------- GOOGLE FORMS ----------------

export interface GoogleFormQuestion {
  questionId: string;
  title: string;
  kind: 'text' | 'choice';
}

export interface GoogleFormDetails {
  formId: string;
  title: string;
  description: string;
  responderUri: string;
  questions: GoogleFormQuestion[];
}

export interface GoogleFormResponseSummary {
  responseId: string;
  createTime: string;
  respondentEmail: string;
  answers: { questionTitle: string; value: string }[];
}

interface RawFormItem {
  title?: string;
  questionItem?: {
    question?: {
      questionId?: string;
      choiceQuestion?: unknown;
    };
  };
}

interface RawFormResponse {
  formId?: string;
  info?: { title?: string; description?: string };
  responderUri?: string;
  items?: RawFormItem[];
}

function parseFormDetails(raw: RawFormResponse): GoogleFormDetails {
  const questions: GoogleFormQuestion[] = [];
  for (const item of raw.items || []) {
    const q = item.questionItem?.question;
    if (q?.questionId && item.title) {
      questions.push({
        questionId: q.questionId,
        title: item.title,
        kind: q.choiceQuestion ? 'choice' : 'text',
      });
    }
  }
  return {
    formId: raw.formId || '',
    title: raw.info?.title || 'Feature Request Form',
    description: raw.info?.description || '',
    responderUri: raw.responderUri || '',
    questions,
  };
}

export async function getGoogleFormDetails(
  accessToken: string,
  formId: string
): Promise<GoogleFormDetails> {
  const safeFormId = encodeURIComponent(formId.trim());
  const res = await workspaceFetch(
    `https://forms.googleapis.com/v1/forms/${safeFormId}`,
    accessToken
  );
  const raw = (await res.json()) as RawFormResponse;
  return parseFormDetails(raw);
}

export async function createFeatureRequestGoogleForm(
  accessToken: string,
  title = 'Study Tracker — Feature Requests'
): Promise<GoogleFormDetails> {
  const cleanTitle = title.trim().slice(0, 140) || 'Study Tracker — Feature Requests';
  const createRes = await workspaceFetch(
    'https://forms.googleapis.com/v1/forms',
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        info: {
          title: cleanTitle,
          documentTitle: cleanTitle,
        },
      }),
    }
  );
  const created = (await createRes.json()) as RawFormResponse;
  const formId = created.formId;
  if (!formId) {
    throw new Error('Google Forms API did not return a formId.');
  }

  const safeFormId = encodeURIComponent(formId.trim());
  const batchRes = await workspaceFetch(
    `https://forms.googleapis.com/v1/forms/${safeFormId}:batchUpdate`,
    accessToken,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        includeFormInResponse: true,
        requests: [
          {
            updateFormInfo: {
              info: {
                description:
                  'Suggest new features, workflow improvements, or bug fixes for Study Tracker.',
              },
              updateMask: 'description',
            },
          },
          {
            createItem: {
              item: {
                title: 'Area / Category',
                questionItem: {
                  question: {
                    required: true,
                    choiceQuestion: {
                      type: 'RADIO',
                      options: [
                        { value: 'Courses & Syllabus' },
                        { value: 'Study Sessions & Timer' },
                        { value: 'Notes & Files' },
                        { value: 'CGPA & Projections' },
                        { value: 'Friends & Study Together' },
                        { value: 'Google Workspace' },
                        { value: 'Other' },
                      ],
                    },
                  },
                },
              },
              location: { index: 0 },
            },
          },
          {
            createItem: {
              item: {
                title: 'Feature Title',
                questionItem: {
                  question: {
                    required: true,
                    textQuestion: { paragraph: false },
                  },
                },
              },
              location: { index: 1 },
            },
          },
          {
            createItem: {
              item: {
                title: 'Detailed Description & Why It Helps',
                questionItem: {
                  question: {
                    required: true,
                    textQuestion: { paragraph: true },
                  },
                },
              },
              location: { index: 2 },
            },
          },
          {
            createItem: {
              item: {
                title: 'Your Email (optional for follow-up)',
                questionItem: {
                  question: {
                    required: false,
                    textQuestion: { paragraph: false },
                  },
                },
              },
              location: { index: 3 },
            },
          },
        ],
      }),
    }
  );
  const updated = (await batchRes.json()) as { form?: RawFormResponse };
  if (updated.form) {
    return parseFormDetails(updated.form);
  }
  return getGoogleFormDetails(accessToken, formId);
}

export async function listGoogleFormResponses(
  accessToken: string,
  formId: string
): Promise<GoogleFormResponseSummary[]> {
  const safeFormId = encodeURIComponent(formId.trim());
  const [details, res] = await Promise.all([
    getGoogleFormDetails(accessToken, formId),
    workspaceFetch(
      `https://forms.googleapis.com/v1/forms/${safeFormId}/responses?pageSize=50`,
      accessToken
    ),
  ]);

  const titleById = new Map<string, string>();
  for (const q of details.questions) {
    titleById.set(q.questionId, q.title);
  }

  const data = (await res.json()) as {
    responses?: {
      responseId?: string;
      createTime?: string;
      respondentEmail?: string;
      answers?: Record<
        string,
        {
          questionId?: string;
          textAnswers?: { answers?: { value?: string }[] };
        }
      >;
    }[];
  };

  return (data.responses || [])
    .map((r) => {
      const answers: { questionTitle: string; value: string }[] = [];
      for (const [qId, ans] of Object.entries(r.answers || {})) {
        const vals = (ans.textAnswers?.answers || [])
          .map((a) => a.value || '')
          .filter(Boolean);
        answers.push({
          questionTitle: titleById.get(qId) || qId,
          value: vals.join(', '),
        });
      }
      return {
        responseId: r.responseId || '',
        createTime: r.createTime || '',
        respondentEmail: r.respondentEmail || '',
        answers,
      };
    })
    .sort((a, b) => (b.createTime || '').localeCompare(a.createTime || ''));
}


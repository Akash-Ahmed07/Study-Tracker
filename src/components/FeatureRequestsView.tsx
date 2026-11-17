import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  FileSpreadsheet,
  Link2,
  Mail,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import {
  clearFeatureFormConfig,
  deleteFeatureRequest,
  saveFeatureFormConfig,
  submitFeatureRequest,
  updateFeatureRequestAdmin,
} from '../lib/studyData.ts';
import {
  ADMIN_SUPPORT_EMAIL,
  FeatureFormConfig,
  FeatureRequest,
  FeatureRequestCategory,
  FeatureRequestStatus,
  isAppAdmin,
  UserProfile,
} from '../lib/types.ts';
import {
  createFeatureRequestGoogleForm,
  getGoogleFormDetails,
  GoogleFormDetails,
  GoogleFormResponseSummary,
  listGoogleFormResponses,
  sendStudyEmail,
} from '../lib/workspace.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';

interface FeatureRequestsViewProps {
  profile: UserProfile;
  formConfig: FeatureFormConfig | null;
  requests: FeatureRequest[];
  accessToken: string | null;
  onRequestAuth: () => void;
  onNotify: (msg: string) => void;
}

const CATEGORIES: { value: FeatureRequestCategory; label: string }[] = [
  { value: 'courses', label: 'Courses & Syllabus' },
  { value: 'timer', label: 'Study Sessions & Timer' },
  { value: 'notes', label: 'Notes & Files' },
  { value: 'cgpa', label: 'CGPA & Projections' },
  { value: 'friends', label: 'Friends & Study Together' },
  { value: 'workspace', label: 'Google Workspace' },
  { value: 'other', label: 'Other' },
];

const STATUS_LABELS: Record<FeatureRequestStatus, string> = {
  open: 'Open',
  planned: 'Planned',
  shipped: 'Shipped',
  declined: 'Declined',
};

const STATUS_TONE: Record<FeatureRequestStatus, string> = {
  open: 'text-amber-700 dark:text-amber-400',
  planned: 'text-blue-700 dark:text-blue-400',
  shipped: 'text-emerald-700 dark:text-emerald-400',
  declined: 'text-slate-500 dark:text-slate-400',
};

function sanitizeFormUri(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const u = new URL(trimmed);
    if (
      u.protocol === 'https:' &&
      (u.hostname === 'docs.google.com' || u.hostname === 'forms.gle')
    ) {
      return u.toString();
    }
    return null;
  } catch {
    return null;
  }
}

function formatDateLabel(ts: unknown): string {
  if (!ts) return 'Just now';
  if (typeof ts === 'string') {
    const d = new Date(ts);
    return Number.isNaN(d.getTime()) ? ts : d.toLocaleDateString();
  }
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts) {
    const fn = (ts as { toDate?: () => Date }).toDate;
    if (typeof fn === 'function') {
      return fn().toLocaleDateString();
    }
  }
  return 'Recent';
}

export const FeatureRequestsView: React.FC<FeatureRequestsViewProps> = ({
  profile,
  formConfig,
  requests,
  accessToken,
  onRequestAuth,
  onNotify,
}) => {
  const userIsAdmin = isAppAdmin(profile.email);
  const safeResponderUri = formConfig?.responderUri
    ? sanitizeFormUri(formConfig.responderUri)
    : null;

  // Student feature request form state
  const [category, setCategory] = useState<FeatureRequestCategory>('courses');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | FeatureRequestStatus>('all');
  const [showEmbeddedForm, setShowEmbeddedForm] = useState(false);

  // Admin Google Forms state
  const [newFormTitle, setNewFormTitle] = useState('Study Tracker — Feature Requests');
  const [linkFormIdInput, setLinkFormIdInput] = useState('');
  const [formDetails, setFormDetails] = useState<GoogleFormDetails | null>(null);
  const [formResponses, setFormResponses] = useState<GoogleFormResponseSummary[]>([]);
  const [loadingResponses, setLoadingResponses] = useState(false);

  // Admin triage draft state per request ID
  const [triageEdits, setTriageEdits] = useState<
    Record<string, { status: FeatureRequestStatus; adminNote: string }>
  >({});
  const [savingTriageId, setSavingTriageId] = useState<string | null>(null);

  // Explicit confirmation modal state for external/destructive mutations
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

  const openConfirm = (opts: Omit<typeof confirmState, 'open'>) => {
    setConfirmState({ ...opts, open: true });
  };

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

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      onNotify('Please enter both a feature title and a short description.');
      return;
    }
    setSubmittingRequest(true);
    try {
      await submitFeatureRequest(profile, {
        category,
        title,
        description,
      });
      setTitle('');
      setDescription('');
      onNotify('Feature request submitted to admin.');
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not submit feature request.');
    } finally {
      setSubmittingRequest(false);
    }
  };

  const handleCreateGoogleForm = () => {
    if (!accessToken) {
      onNotify('Connect Google Workspace access first to create a Google Form.');
      onRequestAuth();
      return;
    }
    const desiredTitle = newFormTitle.trim() || 'Study Tracker — Feature Requests';
    openConfirm({
      title: 'Create Feature Request Google Form',
      description:
        'This will create a new Google Form in your Google account with 4 feature-request questions and publish its link to Study Tracker students.',
      details: [
        `Form title: ${desiredTitle}`,
        'Questions: Category, Feature Title, Description, Optional Email',
        'Admin: ' + ADMIN_SUPPORT_EMAIL,
      ],
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
    if (!rawId) {
      onNotify('Enter a Google Form ID first.');
      return;
    }
    if (!accessToken) {
      onNotify('Connect Google Workspace access first to verify the Google Form.');
      onRequestAuth();
      return;
    }
    openConfirm({
      title: 'Link Existing Google Form',
      description:
        'Study Tracker will fetch the form metadata via Google Forms API and share its responder link with students.',
      details: [`Form ID: ${rawId}`],
      confirmLabel: 'Verify & Link Form',
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
        onNotify(`Linked Google Form "${details.title}".`);
      },
    });
  };

  const handleUnlinkForm = () => {
    openConfirm({
      title: 'Unlink Google Form',
      description:
        'Removes the active Google Form link from the Feature Requests page. Your form remains intact in Google Drive.',
      details: [formConfig?.formTitle || 'Current linked form'],
      confirmLabel: 'Unlink Form',
      tone: 'danger',
      action: async () => {
        await clearFeatureFormConfig();
        setFormDetails(null);
        setFormResponses([]);
        onNotify('Unlinked Google Form from Study Tracker.');
      },
    });
  };

  const handleFetchResponses = async () => {
    if (!formConfig?.formId) return;
    if (!accessToken) {
      onNotify('Reconnect Google Sign-In to read Google Form responses.');
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
      onNotify(`Loaded ${responses.length} response(s) from Google Forms.`);
    } catch (err) {
      onNotify(
        err instanceof Error
          ? err.message
          : 'Could not read Google Form responses. Ensure you own the form.'
      );
    } finally {
      setLoadingResponses(false);
    }
  };

  const handleEmailAdmin = () => {
    if (!title.trim() || !description.trim()) {
      onNotify('Fill in the feature title and description above before emailing admin.');
      return;
    }
    if (!accessToken) {
      onNotify('Reconnect Google Sign-In to send email via Gmail.');
      onRequestAuth();
      return;
    }
    const categoryLabel =
      CATEGORIES.find((c) => c.value === category)?.label || category;
    openConfirm({
      title: 'Send Feature Request via Gmail',
      description: `Send an email directly from your Gmail account to the Study Tracker admin (${ADMIN_SUPPORT_EMAIL}).`,
      details: [
        `To: ${ADMIN_SUPPORT_EMAIL}`,
        `Subject: [Study Tracker Feature] ${title.trim()}`,
        `Category: ${categoryLabel}`,
      ],
      confirmLabel: 'Send Gmail',
      tone: 'primary',
      action: async () => {
        await sendStudyEmail(
          accessToken,
          ADMIN_SUPPORT_EMAIL,
          `[Study Tracker Feature] ${title.trim()}`,
          `Student: ${profile.displayName} (${profile.email})\nCategory: ${categoryLabel}\n\n${description.trim()}`
        );
        onNotify(`Feature request emailed to ${ADMIN_SUPPORT_EMAIL}.`);
      },
    });
  };

  const handleSaveTriage = async (req: FeatureRequest) => {
    const draft = triageEdits[req.id] || {
      status: req.status,
      adminNote: req.adminNote,
    };
    setSavingTriageId(req.id);
    try {
      await updateFeatureRequestAdmin(req.id, draft.status, draft.adminNote);
      onNotify(`Updated "${req.title}" to ${STATUS_LABELS[draft.status]}.`);
    } catch (err) {
      onNotify(err instanceof Error ? err.message : 'Could not update request status.');
    } finally {
      setSavingTriageId(null);
    }
  };

  const handleDeleteRequest = (req: FeatureRequest) => {
    openConfirm({
      title: 'Delete Feature Request',
      description: 'Permanently remove this feature request entry?',
      details: [req.title],
      confirmLabel: 'Delete',
      tone: 'danger',
      action: async () => {
        await deleteFeatureRequest(req.id);
        onNotify('Feature request deleted.');
      },
    });
  };

  const visibleRequests = useMemo(() => {
    if (statusFilter === 'all') return requests;
    return requests.filter((r) => r.status === statusFilter);
  }, [requests, statusFilter]);

  const counts = useMemo(() => {
    return {
      all: requests.length,
      open: requests.filter((r) => r.status === 'open').length,
      planned: requests.filter((r) => r.status === 'planned').length,
      shipped: requests.filter((r) => r.status === 'shipped').length,
    };
  }, [requests]);

  const embeddedSrc = useMemo(() => {
    if (!safeResponderUri || !safeResponderUri.startsWith('https://docs.google.com/forms/')) {
      return null;
    }
    const u = new URL(safeResponderUri);
    u.searchParams.set('embedded', 'true');
    return u.toString();
  }, [safeResponderUri]);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Feature Requests & Google Forms
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Suggest improvements directly to the admin ({ADMIN_SUPPORT_EMAIL}) or fill out the linked Google Form.
          </p>
        </div>
        {!accessToken && (
          <button
            type="button"
            onClick={onRequestAuth}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-800 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900/60 transition-colors whitespace-nowrap shrink-0"
          >
            Reconnect Google Forms & Gmail
          </button>
        )}
      </div>

      {/* Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {userIsAdmin ? 'All Student Requests' : 'Your Requests'}
          </div>
          <div className="text-2xl font-bold font-mono tabular-nums mt-1 text-slate-900 dark:text-slate-50">
            {counts.all}
          </div>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Open</div>
          <div className="text-2xl font-bold font-mono tabular-nums mt-1 text-amber-600 dark:text-amber-400">
            {counts.open}
          </div>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Planned</div>
          <div className="text-2xl font-bold font-mono tabular-nums mt-1 text-blue-600 dark:text-blue-400">
            {counts.planned}
          </div>
        </div>
        <div className="glass-panel rounded-xl p-4">
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">Shipped</div>
          <div className="text-2xl font-bold font-mono tabular-nums mt-1 text-emerald-600 dark:text-emerald-400">
            {counts.shipped}
          </div>
        </div>
      </div>

      {/* Main Two-Column Grid: Submit Form + Linked Google Form */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Direct In-App Feature Request Submission */}
        <section className="lg:col-span-7 glass-panel rounded-xl p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <ClipboardList className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Request a Feature
              </h2>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
              Sent to Admin Queue
            </span>
          </div>

          <form onSubmit={(e) => void handleSubmitRequest(e)} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label
                  htmlFor="fr-category"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                >
                  Area / Category
                </label>
                <select
                  id="fr-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value as FeatureRequestCategory)}
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="fr-title"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                >
                  Feature Title
                </label>
                <input
                  id="fr-title"
                  type="text"
                  maxLength={140}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Exam countdown calendar view"
                  className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label
                htmlFor="fr-description"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
              >
                Detailed Description & Use Case
              </label>
              <textarea
                id="fr-description"
                rows={4}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe what problem this solves in your daily study workflow..."
                className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button
                type="submit"
                disabled={submittingRequest}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap disabled:opacity-60"
              >
                <Send className="w-4 h-4" />
                {submittingRequest ? 'Submitting...' : 'Submit Request'}
              </button>

              <button
                type="button"
                onClick={handleEmailAdmin}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
              >
                <Mail className="w-4 h-4" />
                Also Send via Gmail
              </button>
            </div>
          </form>
        </section>

        {/* Official Google Form Card */}
        <section className="lg:col-span-5 glass-panel rounded-xl p-6 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                Official Google Form
              </h2>
            </div>

            {formConfig && safeResponderUri ? (
              <div className="space-y-3">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg space-y-1.5">
                  <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {formConfig.formTitle}
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums truncate">
                    Form ID: {formConfig.formId}
                  </div>
                </div>

                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  Prefer submitting through Google Forms? Open the official form linked by the admin—responses appear directly in the admin&apos;s Google Forms dashboard.
                </p>

                <div className="flex flex-wrap items-center gap-2.5">
                  <a
                    href={safeResponderUri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors whitespace-nowrap"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open Google Form
                  </a>

                  {embeddedSrc && (
                    <button
                      type="button"
                      onClick={() => setShowEmbeddedForm((v) => !v)}
                      className="px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
                    >
                      {showEmbeddedForm ? 'Hide Embedded Form' : 'Embed Form Here'}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                {userIsAdmin
                  ? 'No Google Form is linked yet. Use the Admin Google Forms Console below to generate one in one click or link an existing Form ID.'
                  : `The admin (${ADMIN_SUPPORT_EMAIL}) has not linked an external Google Form yet. Use the Request a Feature form on the left—it reaches the admin directly.`}
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center justify-between gap-2">
            <span>Admin Contact</span>
            <span className="font-mono text-slate-700 dark:text-slate-300 truncate">
              {ADMIN_SUPPORT_EMAIL}
            </span>
          </div>
        </section>
      </div>

      {/* Optional Embedded Google Form */}
      {showEmbeddedForm && embeddedSrc && (
        <section className="glass-panel rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {formConfig?.formTitle || 'Google Form'}
            </span>
            <button
              type="button"
              onClick={() => setShowEmbeddedForm(false)}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
            >
              Close Embed
            </button>
          </div>
          <iframe
            title="Study Tracker Feature Request Google Form"
            src={embeddedSrc}
            className="w-full h-[540px] border-0 bg-white"
          />
        </section>
      )}

      {/* Admin Console: Google Forms Creation, Linking & Live Responses */}
      {userIsAdmin && (
        <section className="glass-panel border-blue-200/80 dark:border-blue-800/70 rounded-xl p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Admin Console — Google Forms Manager
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Signed in as {profile.email}. Create or link a Google Form and read live responses.
                </p>
              </div>
            </div>

            {formConfig?.formId && (
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => void handleFetchResponses()}
                  disabled={loadingResponses}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap disabled:opacity-60"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingResponses ? 'animate-spin' : ''}`} />
                  {loadingResponses ? 'Loading...' : 'Fetch Google Form Responses'}
                </button>
                <button
                  type="button"
                  onClick={handleUnlinkForm}
                  className="px-3 py-2 text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 hover:bg-red-100 dark:hover:bg-red-950/70 rounded-lg transition-colors whitespace-nowrap"
                >
                  Unlink
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Create new Google Form */}
            <div className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Create New Google Form via API
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Creates a structured feature-request Google Form in your Google account and shares its link with students.
              </p>
              <input
                type="text"
                maxLength={140}
                value={newFormTitle}
                onChange={(e) => setNewFormTitle(e.target.value)}
                placeholder="Study Tracker — Feature Requests"
                className="w-full px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={handleCreateGoogleForm}
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                Create & Link Google Form
              </button>
            </div>

            {/* Link existing Google Form by ID */}
            <form
              onSubmit={handleLinkExistingForm}
              className="p-4 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl space-y-3"
            >
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Link Existing Google Form by ID
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Paste the Form ID from your Google Form edit URL (`docs.google.com/forms/d/&lt;FORM_ID&gt;/edit`).
              </p>
              <input
                type="text"
                maxLength={128}
                value={linkFormIdInput}
                onChange={(e) => setLinkFormIdInput(e.target.value)}
                placeholder="e.g., 1FAIpQLSd..."
                className="w-full px-3 py-2 text-sm font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-800 dark:text-slate-100 bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 rounded-lg transition-colors whitespace-nowrap"
              >
                <Link2 className="w-3.5 h-3.5" />
                Verify & Link Form ID
              </button>
            </form>
          </div>

          {/* Live Google Form Structure & Responses */}
          {formDetails && (
            <div className="space-y-3 pt-2">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Linked Form Questions ({formDetails.questions.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {formDetails.questions.map((q) => (
                  <div
                    key={q.questionId}
                    className="p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg"
                  >
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {q.title}
                    </div>
                    <div className="text-[11px] font-mono text-slate-500 mt-0.5 uppercase">
                      {q.kind}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {formResponses.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Google Forms Submissions ({formResponses.length})
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                {formResponses.map((resp) => (
                  <div
                    key={resp.responseId}
                    className="p-4 bg-white dark:bg-slate-950 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                      <span className="font-mono">
                        {resp.respondentEmail || 'Anonymous respondent'}
                      </span>
                      <span className="tabular-nums">
                        {formatDateLabel(resp.createTime)}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {resp.answers.map((ans, idx) => (
                        <div key={idx} className="text-xs">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            {ans.questionTitle}:{' '}
                          </span>
                          <span className="text-slate-600 dark:text-slate-400">
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
        </section>
      )}

      {/* Feature Request Queue (Student's own requests, or All Requests for Admin) */}
      <section className="glass-panel rounded-xl p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {userIsAdmin ? 'All Student Feature Requests (Admin Triage)' : 'Your Submitted Feature Requests'}
          </h2>

          <div className="inline-flex bg-slate-100 dark:bg-slate-950 p-1 rounded-lg border border-slate-200 dark:border-slate-800 self-start">
            {(['all', 'open', 'planned', 'shipped'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors capitalize whitespace-nowrap ${
                  statusFilter === st
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-2xs'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {visibleRequests.length === 0 ? (
          <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400 border border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
            No feature requests match this filter yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {visibleRequests.map((req) => {
              const catLabel =
                CATEGORIES.find((c) => c.value === req.category)?.label || req.category;
              const draft = triageEdits[req.id] || {
                status: req.status,
                adminNote: req.adminNote || '',
              };
              const canDelete =
                userIsAdmin || (req.authorUid === profile.uid && req.status === 'open');

              return (
                <div
                  key={req.id}
                  className="p-5 bg-white dark:bg-slate-900/60 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5 text-xs">
                        <span
                          className={`font-semibold uppercase tracking-wider ${STATUS_TONE[req.status]}`}
                        >
                          {STATUS_LABELS[req.status]}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500 dark:text-slate-400 font-medium">
                          {catLabel}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                          {formatDateLabel(req.createdAt)}
                        </span>
                        {userIsAdmin && (
                          <>
                            <span className="text-slate-400">·</span>
                            <span className="text-slate-600 dark:text-slate-300 font-mono">
                              {req.authorName} ({req.authorEmail || req.authorUid})
                            </span>
                          </>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {req.title}
                      </h3>
                    </div>

                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDeleteRequest(req)}
                        className="p-1.5 text-slate-400 hover:text-red-600 dark:hover:text-red-400 rounded-md transition-colors"
                        aria-label={`Delete ${req.title}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {req.description}
                  </p>

                  {req.adminNote && !userIsAdmin && (
                    <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900/60 rounded-lg text-xs text-slate-700 dark:text-slate-300">
                      <span className="font-semibold text-blue-700 dark:text-blue-400">
                        Admin Note:{' '}
                      </span>
                      {req.adminNote}
                    </div>
                  )}

                  {userIsAdmin && (
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-1 sm:grid-cols-12 gap-3 items-center">
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
                        className="sm:col-span-3 px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                      >
                        <option value="open">Open</option>
                        <option value="planned">Planned</option>
                        <option value="shipped">Shipped</option>
                        <option value="declined">Declined</option>
                      </select>

                      <input
                        type="text"
                        maxLength={500}
                        value={draft.adminNote}
                        onChange={(e) =>
                          setTriageEdits((prev) => ({
                            ...prev,
                            [req.id]: { ...draft, adminNote: e.target.value },
                          }))
                        }
                        placeholder="Add response note visible to student..."
                        className="sm:col-span-7 px-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-slate-900 dark:text-slate-100"
                      />

                      <button
                        type="button"
                        onClick={() => void handleSaveTriage(req)}
                        disabled={savingTriageId === req.id}
                        className="sm:col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-slate-900 dark:bg-blue-600 hover:bg-slate-800 dark:hover:bg-blue-700 rounded-lg transition-colors whitespace-nowrap disabled:opacity-60"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {savingTriageId === req.id ? 'Saving...' : 'Save'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

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
          if (!confirmBusy) {
            setConfirmState((prev) => ({ ...prev, open: false, action: null }));
          }
        }}
      />
    </div>
  );
};

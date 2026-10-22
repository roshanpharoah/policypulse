import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  FileText,
  FileX2,
  Plus,
  RefreshCw,
  ShieldQuestion,
  UploadCloud,
  XCircle,
} from 'lucide-react';
import { PageHeader, SectionHeading } from '@/components/layout/PageHeader';
import { MetricCard } from '@/components/data/MetricCard';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Input, Select } from '@/components/ui/Field';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { Callout } from '@/components/feedback/Callout';
import { ConfirmDialog } from '@/components/feedback/ConfirmDialog';
import { Textarea } from '@/components/ui/Field';
import { VerificationBadge } from '@/components/data/Badges';
import { useDemo } from '@/hooks/useDemo';
import { rejectDocument, recordSimulatedUpload, renewDocument, verifyDocument } from '@/services/ui/actions';
import { addDays } from '@/lib/date';
import { formatINR } from '@/lib/format';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, READINESS_STATES, type DocumentType } from '@/types/document';
import { cn } from '@/lib/cn';

type Health = {
  label: string;
  detail: string;
  tone: 'sage' | 'amber' | 'rose';
  urgent: 'renew' | 'verify' | 'reject' | null;
};

const LEGEND: { state: (typeof READINESS_STATES)[number]; text: string }[] = [
  { state: 'VALID', text: 'Present, in force, verified and fresh enough for the deadline.' },
  { state: 'MISSING', text: 'No document of the required type exists at all.' },
  { state: 'EXPIRED', text: "The document's own validity ended before today." },
  { state: 'UNVERIFIED', text: 'In force, but nobody has verified it — still blocking.' },
  { state: 'INVALID', text: 'Explicitly rejected or declared invalid in the demo.' },
  { state: 'EXPIRES_BEFORE_DEADLINE', text: 'Valid today, but it lapses before the application deadline.' },
];

export function DocumentsPage() {
  const { state, views, documentImpact } = useDemo();
  const today = state.clock.now.slice(0, 10);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadType, setUploadType] = useState<DocumentType>('INCOME_CERTIFICATE');
  const [uploadReference, setUploadReference] = useState('SIM-2026-001');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('Rejected during the demo review.');

  const missing = useMemo(
    () =>
      views
        .flatMap((view) =>
          view.decision.blockers
            .filter((blocker) => blocker.kind === 'DOCUMENT_MISSING')
            .map((blocker) => ({ view, blocker })),
        )
        .filter((item) => item.blocker.documentType),
    [views],
  );

  const health = (document: { expiresOn: string | null; verification: string; invalidReason?: string }): Health => {
    if (document.verification === 'rejected') {
      return { label: 'Invalid', detail: document.invalidReason ?? 'Rejected in the demo.', tone: 'rose', urgent: 'renew' };
    }
    if (document.expiresOn !== null && document.expiresOn < today) {
      return {
        label: 'Expired',
        detail: `Lapsed on ${document.expiresOn} — today is ${today}.`,
        tone: 'rose',
        urgent: 'renew',
      };
    }
    if (document.expiresOn !== null && document.expiresOn < addDays(today, 45)) {
      return {
        label: 'Expires soon',
        detail: `In force until ${document.expiresOn}; renew to cover later deadlines.`,
        tone: 'amber',
        urgent: 'renew',
      };
    }
    if (document.verification !== 'verified') {
      return {
        label: 'Unverified',
        detail: 'Nobody has verified this document yet — treated as blocking.',
        tone: 'amber',
        urgent: 'verify',
      };
    }
    return { label: 'Valid', detail: 'In force, verified and usable for current deadlines.', tone: 'sage', urgent: 'reject' };
  };

  const validCount = state.documents.filter((document) => health(document).tone === 'sage').length;
  const fundingUnblocked = documentImpact.reduce((total, impact) => total + impact.fundingUnblocked, 0);

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Evidence"
        title="Documents"
        description="A document is only as good as the deadline it has to cover. Readiness is evaluated per requirement: missing, expired, unverified, invalid or expiring before the deadline are all blocking states — never a quiet pass."
        actions={
          <Button variant="primary" icon={<UploadCloud className="size-4" />} onClick={() => setUploadOpen(true)}>
            Simulated upload
          </Button>
        }
      />

      <Callout tone="warning" title="No file is ever uploaded">
        Every upload, renewal, verification and rejection below is a simulated event written to the local event log. Nothing
        is transmitted or stored outside this browser.
      </Callout>

      <div className="grid gap-3 sm:grid-cols-3">
        <MetricCard
          label="Documents in the dossier"
          value={state.documents.length}
          hint={`${validCount} currently valid for every live deadline`}
          icon={<FileText className="size-4" />}
        />
        <MetricCard
          label="Funding unlocked by documents"
          value={formatINR(fundingUnblocked)}
          hint="Amount tied to applications blocked by at least one document issue"
          icon={<CheckCircle2 className="size-4" />}
          tone="teal"
        />
        <MetricCard
          label="Missing requirements"
          value={missing.length}
          hint="Required documents with no file in the dossier at all"
          icon={<FileX2 className="size-4" />}
          tone={missing.length > 0 ? 'rose' : 'sage'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_20rem]">
        <div className="space-y-2.5" data-demo="document-list">
          {documentImpact.map((impact) => {
            const document = impact.document;
            const status = health(document);
            return (
              <Card key={document.id} className="p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <span
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-lg',
                      status.tone === 'sage'
                        ? 'bg-pp-sage-soft text-pp-sage'
                        : status.tone === 'amber'
                          ? 'bg-pp-amber-soft text-pp-amber'
                          : 'bg-pp-rose-soft text-pp-rose',
                    )}
                  >
                    {status.tone === 'sage' ? (
                      <CheckCircle2 className="size-4" aria-hidden />
                    ) : status.tone === 'amber' ? (
                      <AlertTriangle className="size-4" aria-hidden />
                    ) : (
                      <XCircle className="size-4" aria-hidden />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-sm font-semibold text-pp-navy">{document.title}</h2>
                      <Badge tone={status.tone}>{status.label}</Badge>
                      <VerificationBadge state={document.verification} />
                      <Badge tone="outline">{DOCUMENT_TYPE_LABELS[document.docType]}</Badge>
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-pp-muted">
                      {document.issuer} · ref {document.reference} · issued {document.issuedOn} ·{' '}
                      {document.expiresOn ? `expires ${document.expiresOn}` : 'no expiry'}
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-pp-muted">{status.detail}</p>

                    {impact.blockingOpportunityIds.length > 0 ? (
                      <div className="mt-2 rounded-lg border border-pp-rose/20 bg-pp-rose-soft/40 px-2.5 py-1.5">
                        <p className="text-[11px] font-semibold text-pp-navy">
                          Blocks {impact.blockingOpportunityIds.length} application
                          {impact.blockingOpportunityIds.length === 1 ? '' : 's'} ·{' '}
                          <span className="tabular-nums text-pp-rose">{formatINR(impact.fundingUnblocked)}</span> at stake
                        </p>
                        <ul className="mt-1 flex flex-wrap gap-1.5">
                          {impact.blockingOpportunityIds.map((opportunityId) => {
                            const opportunity = state.opportunities.find((item) => item.id === opportunityId);
                            const view = views.find((item) => item.opportunity.id === opportunityId);
                            return (
                              <li key={opportunityId}>
                                {view ? (
                                  <Link
                                    to={`/workspace/${view.application.id}`}
                                    className="rounded bg-pp-surface px-1.5 py-0.5 text-[10px] text-pp-teal hover:underline"
                                  >
                                    {opportunity?.title ?? opportunityId}
                                  </Link>
                                ) : (
                                  <span className="rounded bg-pp-surface px-1.5 py-0.5 text-[10px] text-pp-muted">
                                    {opportunity?.title ?? opportunityId}
                                  </span>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    ) : (
                      <p className="mt-2 text-[11px] text-pp-muted">Not blocking any application today.</p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-wrap gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<RefreshCw className="size-3.5" />}
                      onClick={() => void renewDocument(document)}
                    >
                      Renew
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<ShieldQuestion className="size-3.5" />}
                      disabled={document.verification === 'verified'}
                      onClick={() => void verifyDocument(document)}
                    >
                      Verify
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      icon={<XCircle className="size-3.5" />}
                      disabled={document.verification === 'rejected'}
                      onClick={() => setRejecting(document.id)}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Readiness states" description="Collapsed into “valid / invalid” is exactly the failure mode PolicyPulse exists to prevent." />
            <CardBody className="space-y-2">
              {LEGEND.map((item) => (
                <div key={item.state} className="flex gap-2 text-xs leading-relaxed">
                  <Badge tone={item.state === 'VALID' ? 'sage' : item.state === 'UNVERIFIED' || item.state === 'EXPIRES_BEFORE_DEADLINE' ? 'amber' : 'rose'}>
                    {item.state.replace(/_/g, ' ')}
                  </Badge>
                  <span className="text-pp-muted">{item.text}</span>
                </div>
              ))}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Missing right now" description="Requirements with no file at all." />
            <CardBody className="space-y-2">
              {missing.length === 0 ? (
                <p className="text-sm text-pp-muted">Every required document has a file in the dossier.</p>
              ) : (
                missing.map(({ view, blocker }) => (
                  <div key={blocker.id} className="rounded-lg border border-pp-line bg-pp-canvas/50 px-3 py-2">
                    <p className="text-xs font-semibold text-pp-navy">
                      {blocker.documentType ? DOCUMENT_TYPE_LABELS[blocker.documentType] : blocker.title}
                    </p>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-pp-muted">
                      Needed for {view.opportunity.title} · {blocker.resolution}
                    </p>
                    <div className="mt-1.5 flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        icon={<Plus className="size-3" />}
                        onClick={() => {
                          if (blocker.documentType) setUploadType(blocker.documentType);
                          setUploadOpen(true);
                        }}
                      >
                        Upload (simulated)
                      </Button>
                      <Link to={`/workspace/${view.application.id}`}>
                        <Button size="sm" variant="ghost" icon={<ArrowRight className="size-3" />}>
                          Open
                        </Button>
                      </Link>
                    </div>
                  </div>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <SectionHeading title="How readiness is computed" />
      <Card>
        <CardBody className="grid gap-3 text-xs leading-relaxed text-pp-muted sm:grid-cols-3">
          <div>
            <p className="font-semibold text-pp-navy">1. Pick the most recent document</p>
            <p>
              <code className="text-pp-teal">pickDocument</code> selects the newest issue date of the right type, so a renewed
              certificate replaces the lapsed one.
            </p>
          </div>
          <div>
            <p className="font-semibold text-pp-navy">2. Measure freshness against the deadline</p>
            <p>
              Not “is it valid today?”, but “will it still cover the deadline?”. That is how{' '}
              <code className="text-pp-teal">EXPIRES_BEFORE_DEADLINE</code> appears.
            </p>
          </div>
          <div>
            <p className="font-semibold text-pp-navy">3. Precedence, not scores</p>
            <p>
              Missing &gt; invalid &gt; expired &gt; expires before deadline &gt; unverified &gt; valid. One rule, applied
              identically everywhere.
            </p>
          </div>
        </CardBody>
      </Card>

      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Simulated document upload</DialogTitle>
            <DialogDescription>
              Creates a <code>DocumentAdded</code> event dated from the demo clock. No file is read or sent.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-pp-muted">Document type</span>
              <Select value={uploadType} onChange={(event) => setUploadType(event.target.value as DocumentType)}>
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {DOCUMENT_TYPE_LABELS[type]}
                  </option>
                ))}
              </Select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold uppercase tracking-wide text-pp-muted">Reference</span>
              <Input value={uploadReference} onChange={(event) => setUploadReference(event.target.value)} />
            </label>
            <p className="text-[11px] leading-relaxed text-pp-faint">
              Issued today ({today}), valid for one demo year, verification starts as <strong>pending</strong> — so it is
              still blocking until verified.
            </p>
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button
              variant="primary"
              icon={<UploadCloud className="size-4" />}
              disabled={uploadReference.trim().length === 0}
              onClick={() => {
                void recordSimulatedUpload(
                  uploadType,
                  `${DOCUMENT_TYPE_LABELS[uploadType]} (demo upload)`,
                  uploadReference.trim(),
                );
                setUploadOpen(false);
              }}
            >
              Add document
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={rejecting !== null}
        onOpenChange={(open) => !open && setRejecting(null)}
        title="Reject this document?"
        description="The rejection is recorded as an event with your reason. Any requirement depending on it becomes INVALID and blocking."
        confirmLabel="Reject (simulated)"
        tone="danger"
        onConfirm={() => {
          const document = state.documents.find((candidate) => candidate.id === rejecting);
          if (document) void rejectDocument(document, rejectReason.trim() || 'Rejected in the demo.');
        }}
      >
        <label className="block space-y-1.5">
          <span className="text-xs font-semibold uppercase tracking-wide text-pp-muted">Reason</span>
          <Textarea value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} />
        </label>
      </ConfirmDialog>
    </div>
  );
}

export function DocIcon(props: { className?: string }) {
  return <CircleAlert className={props.className ?? 'size-4'} aria-hidden />;
}

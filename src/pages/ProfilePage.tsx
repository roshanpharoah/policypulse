import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Info,
  LockKeyhole,
  RotateCcw,
  Save,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card, CardBody, CardHeader } from '@/components/ui/Card';
import { Field, Input, Select } from '@/components/ui/Field';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Progress } from '@/components/ui/Progress';
import { Switch } from '@/components/ui/Switch';
import { Callout } from '@/components/feedback/Callout';
import { useDemo } from '@/hooks/useDemo';
import { confirmField, saveProfile } from '@/services/ui/actions';
import { toast } from '@/services/ui/toast';
import { UNKNOWN } from '@/types/common';
import type { ProfileChange } from '@/types/events';
import {
  CATEGORIES,
  COURSE_TYPES,
  DOMICILE_STATES,
  EMPLOYMENT_STATUSES,
  GENDERS,
  INSTITUTION_TIERS,
  PROFILE_FIELDS,
  PROFILE_FIELD_HELP,
  PROFILE_FIELD_LABELS,
  SENSITIVE_PROFILE_FIELDS,
  studentProfileSchema,
  type ProfileField,
  type StudentProfile,
} from '@/types/profile';
import { formatDate } from '@/lib/date';
import { formatINR } from '@/lib/format';

type DraftValue = string | number | boolean;
type Draft = Record<ProfileField, DraftValue>;

function draftFrom(profile: StudentProfile): Draft {
  const draft = {} as Draft;
  for (const field of PROFILE_FIELDS) {
    const value = profile[field];
    draft[field] =
      typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? value : UNKNOWN;
  }
  return draft;
}

function numeric(value: DraftValue | undefined): string {
  return typeof value === 'number' ? String(value) : '';
}

const GROUPS: { title: string; description: string; fields: ProfileField[]; sensitive?: boolean }[] = [
  {
    title: 'Location, study and merit',
    description: 'The facts most rules depend on. Unknown is explicit and visible.',
    fields: [
      'domicileState',
      'residencyYears',
      'courseType',
      'institutionTier',
      'yearOfStudy',
      'percentageMarks',
      'cgpa',
      'coCurricularActivities',
      'employmentStatus',
    ],
  },
  {
    title: 'Equity and access',
    description: 'Requested only by schemes that actually need it.',
    fields: ['category', 'firstGenerationLearner', 'annualFamilyIncome', 'hasDisability', 'gender', 'bankAccountVerified'],
    sensitive: true,
  },
];

const NUMERIC_FIELDS: Partial<Record<ProfileField, { min: number; max: number; step: number; testId?: string }>> = {
  annualFamilyIncome: { min: 0, max: 100_000_000, step: 1_000, testId: 'profile-income' },
  percentageMarks: { min: 0, max: 100, step: 0.1 },
  cgpa: { min: 0, max: 10, step: 0.1, testId: 'profile-cgpa' },
  yearOfStudy: { min: 1, max: 6, step: 1 },
  coCurricularActivities: { min: 0, max: 200, step: 1 },
  residencyYears: { min: 0, max: 80, step: 0.5 },
};

const ENUM_OPTIONS: Partial<Record<ProfileField, readonly string[]>> = {
  domicileState: DOMICILE_STATES,
  category: CATEGORIES,
  employmentStatus: EMPLOYMENT_STATUSES,
  institutionTier: INSTITUTION_TIERS,
  courseType: COURSE_TYPES,
  gender: GENDERS,
};

const BOOLEAN_FIELDS: ProfileField[] = ['hasDisability', 'bankAccountVerified', 'firstGenerationLearner'];

function changeValue(value: unknown): ProfileChange['before'] {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return UNKNOWN;
}

function displayValue(value: unknown): string {
  if (value === UNKNOWN) return 'Unknown';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return value;
  return '—';
}

export function ProfilePage() {
  const { state, completeness, events } = useDemo();
  const [draft, setDraft] = useState<Draft>(() => draftFrom(state.profile));
  const [revealSensitive, setRevealSensitive] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(draftFrom(state.profile));
  }, [state.profile]);

  const candidate = useMemo(() => ({ ...state.profile, ...draft }), [draft, state.profile]);
  const validation = studentProfileSchema.safeParse(candidate);

  const changes = useMemo<ProfileChange[]>(
    () =>
      PROFILE_FIELDS.filter((field) => draft[field] !== state.profile[field]).map((field) => ({
        field,
        before: changeValue(state.profile[field]),
        after: changeValue(draft[field]),
      })),
    [draft, state.profile],
  );

  const setField = (field: ProfileField, value: DraftValue) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const save = async () => {
    if (changes.length === 0) return;
    if (!validation.success) {
      const issue = validation.error.issues[0];
      toast({
        tone: 'danger',
        title: 'Profile not saved',
        description: `${issue?.path.join('.') ?? 'A field'} — ${issue?.message ?? 'invalid value'}`,
      });
      return;
    }
    setSaving(true);
    try {
      await saveProfile(changes);
    } finally {
      setSaving(false);
    }
  };

  const renderField = (field: ProfileField) => {
    const label = PROFILE_FIELD_LABELS[field];
    const value = draft[field];
    const inputId = `profile-${field}`;
    const numericConfig = NUMERIC_FIELDS[field];
    const enumOptions = ENUM_OPTIONS[field];
    const isBoolean = BOOLEAN_FIELDS.includes(field);

    if (numericConfig) {
      return (
        <Field key={field} label={label} htmlFor={inputId} hint={PROFILE_FIELD_HELP[field]}>
          <div className="flex gap-1.5">
            <Input
              id={inputId}
              data-testid={numericConfig.testId}
              type="number"
              inputMode="decimal"
              min={numericConfig.min}
              max={numericConfig.max}
              step={numericConfig.step}
              value={numeric(String(value))}
              placeholder="Unknown"
              onChange={(event) => {
                const next = event.target.value;
                if (next === '') setField(field, UNKNOWN);
                else setField(field, Number(next));
              }}
            />
            <Button
              size="sm"
              variant={value === UNKNOWN ? 'teal' : 'outline'}
              onClick={() => setField(field, UNKNOWN)}
              aria-label={`Mark ${label} as unknown`}
              className="shrink-0"
            >
              Unknown
            </Button>
          </div>
        </Field>
      );
    }

    if (enumOptions) {
      return (
        <Field key={field} label={label} htmlFor={inputId} hint={PROFILE_FIELD_HELP[field]}>
          <Select
            id={inputId}
            data-testid={field === 'domicileState' ? 'profile-domicile' : undefined}
            value={String(value)}
            onChange={(event) => setField(field, event.target.value)}
          >
            <option value={UNKNOWN}>Unknown</option>
            {enumOptions.map((option) => (
              <option key={option} value={option}>
                {option.replace(/_/g, ' ')}
              </option>
            ))}
          </Select>
        </Field>
      );
    }

    if (isBoolean) {
      return (
        <Field key={field} label={label} htmlFor={inputId} hint={PROFILE_FIELD_HELP[field]}>
          <Select
            id={inputId}
            value={String(value)}
            onChange={(event) => {
              const next = event.target.value;
              setField(field, next === UNKNOWN ? UNKNOWN : next === 'true');
            }}
          >
            <option value={UNKNOWN}>Unknown</option>
            <option value="true">Yes</option>
            <option value="false">No</option>
          </Select>
        </Field>
      );
    }

    return null;
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Source of truth"
        title="Student profile"
        description="The profile is a set of confirmed facts — not guesses. Every change is appended to the event log with a before and after value, and eligibility is recomputed immediately."
        actions={
          <>
            <Button variant="outline" icon={<RotateCcw className="size-4" />} onClick={() => setDraft(draftFrom(state.profile))} disabled={changes.length === 0}>
              Discard changes
            </Button>
            <Button
              variant="primary"
              icon={<Save className="size-4" />}
              onClick={() => void save()}
              loading={saving}
              disabled={changes.length === 0}
              data-testid="profile-save"
            >
              Save {changes.length > 0 ? `${changes.length} change${changes.length === 1 ? '' : 's'}` : 'profile'}
            </Button>
          </>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-4">
          <Card>
            <CardHeader
              title="Identity (read-only)"
              description="Seeded demo dossier. Contact details are not used by any rule."
              icon={<ShieldCheck className="size-4" />}
            />
            <CardBody className="grid gap-3 sm:grid-cols-2">
              <ReadOnly label="Full name" value={state.profile.fullName} />
              <ReadOnly label="Email" value={state.profile.email} />
              <ReadOnly label="Date of birth" value={formatDate(state.profile.dateOfBirth)} />
              <ReadOnly label="Student id" value={state.profile.id} />
            </CardBody>
          </Card>

          {GROUPS.map((group) => {
            const hidden = group.sensitive && !revealSensitive;
            return (
              <Card key={group.title}>
                <CardHeader
                  title={group.title}
                  description={group.description}
                  icon={group.sensitive ? <LockKeyhole className="size-4" /> : <Info className="size-4" />}
                  actions={
                    group.sensitive ? (
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] text-pp-muted">{revealSensitive ? 'Shown' : 'Hidden'}</span>
                        <Switch
                          checked={revealSensitive}
                          onCheckedChange={setRevealSensitive}
                          label="Show sensitive profile attributes"
                        />
                      </div>
                    ) : undefined
                  }
                />
                <CardBody>
                  {hidden ? (
                    <Callout tone="neutral" title="Sensitive attributes are hidden by default">
                      <p>
                        {SENSITIVE_PROFILE_FIELDS.map((field) => PROFILE_FIELD_LABELS[field]).join(', ')} are only revealed
                        when the demo needs them. None of these values is sent anywhere.
                      </p>
                      <Button
                        size="sm"
                        variant="outline"
                        className="mt-2"
                        icon={<Eye className="size-3.5" />}
                        onClick={() => setRevealSensitive(true)}
                      >
                        Reveal to edit
                      </Button>
                    </Callout>
                  ) : (
                    <div className="grid gap-4 sm:grid-cols-2">
                      {group.fields.map(renderField)}
                    </div>
                  )}
                </CardBody>
              </Card>
            );
          })}

          <Card>
            <CardHeader
              title="Pending changes"
              description="Nothing is written until you save. Each saved change becomes an immutable event."
              actions={
                changes.length > 0 ? (
                  <Badge tone="amber">{changes.length} pending</Badge>
                ) : (
                  <Badge tone="sage">In sync</Badge>
                )
              }
            />
            <CardBody>
              {changes.length === 0 ? (
                <p className="text-sm text-pp-muted">The form matches the last saved profile.</p>
              ) : (
                <ul className="space-y-1.5">
                  {changes.map((change) => (
                    <li key={change.field} className="flex flex-wrap items-center gap-1.5 text-xs">
                      <span className="font-medium text-pp-navy">{PROFILE_FIELD_LABELS[change.field as ProfileField]}</span>
                      <span className="rounded bg-pp-rose-soft px-1.5 py-0.5 text-pp-rose">{displayValue(change.before)}</span>
                      <ArrowRight className="size-3 text-pp-faint" aria-hidden />
                      <span className="rounded bg-pp-sage-soft px-1.5 py-0.5 text-pp-sage">{displayValue(change.after)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {!validation.success ? (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-pp-rose">
                  <AlertTriangle className="size-3.5" aria-hidden />
                  {validation.error.issues[0]?.path.join('.')}: {validation.error.issues[0]?.message}
                </p>
              ) : null}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Completeness" description="Only fields used by at least one rule are counted." />
            <CardBody className="space-y-3">
              <div className="flex items-end justify-between">
                <p className="text-3xl font-semibold tabular-nums text-pp-navy">{completeness.percentage}%</p>
                <p className="text-[11px] text-pp-muted">
                  {completeness.confirmedFields}/{completeness.totalFields} confirmed
                </p>
              </div>
              <Progress
                value={completeness.percentage}
                tone={completeness.percentage === 100 ? 'sage' : 'amber'}
                label="Profile completeness"
              />
              <p className="text-xs leading-relaxed text-pp-muted">
                An unknown attribute does not fail a rule. It makes the verdict potentially eligible and names the exact
                fact that is missing.
              </p>
            </CardBody>
          </Card>

          <div data-demo="profile-unknowns">
            <Card>
              <CardHeader
                title="Unknowns and their reach"
                description="Confirming a fact can unlock several decisions at once."
                actions={<Badge tone={completeness.unknownFields.length > 0 ? 'amber' : 'sage'}>{completeness.unknownFields.length} unknown</Badge>}
              />
              <CardBody className="space-y-2.5">
                {completeness.impact.length === 0 ? (
                  <div className="flex items-center gap-2 text-sm text-pp-sage">
                    <Check className="size-4" aria-hidden /> Every rule-relevant field is confirmed.
                  </div>
                ) : (
                  completeness.impact.map((item) => (
                    <div key={item.field} className="rounded-lg border border-pp-amber/25 bg-pp-amber-soft/40 px-3 py-2">
                      <p className="text-sm font-semibold text-pp-navy">{item.label}</p>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-pp-muted">
                        {item.titles.length} opportunit{item.titles.length === 1 ? 'y' : 'ies'} cannot be fully evaluated
                        without it.
                      </p>
                      {item.field === 'domicileState' ? (
                        <Button
                          size="sm"
                          variant="teal"
                          className="mt-2"
                          icon={<Sparkles className="size-3.5" />}
                          onClick={() =>
                            void confirmField(
                              'domicileState',
                              state.profile.domicileState,
                              'Madhya Pradesh',
                              'Domicile confirmed in the profile form.',
                            )
                          }
                        >
                          Confirm Madhya Pradesh
                        </Button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setRevealSensitive(true)}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-pp-teal hover:underline"
                        >
                          Edit the field above <ArrowRight className="size-3" />
                        </button>
                      )}
                    </div>
                  ))
                )}
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader
              title="Privacy by design"
              description="Sensitive attributes are gated behind an explicit reveal."
              icon={revealSensitive ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            />
            <CardBody className="space-y-2 text-xs leading-relaxed text-pp-muted">
              <p>Sensitive fields: {SENSITIVE_PROFILE_FIELDS.length}. They are only shown when you choose to reveal them.</p>
              <p>The eligibility engine reads them only when a scheme's rule targets that field.</p>
              <p>
                <Link to="/what-if" className="font-medium text-pp-teal hover:underline">
                  Try a change in the what-if lab
                </Link>{' '}
                without writing any event.
              </p>
              <p className="text-pp-faint">{events.length} events recorded so far.</p>
            </CardBody>
          </Card>
        </div>
      </div>
    </div>
  );
}

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-pp-muted">{label}</p>
      <p className="mt-0.5 text-sm text-pp-ink">{value}</p>
    </div>
  );
}

export function formatIncome(value: unknown): string {
  return typeof value === 'number' ? formatINR(value) : displayValue(value);
}

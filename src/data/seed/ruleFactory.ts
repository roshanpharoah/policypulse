import type { Criterion, DocumentRequirement, Operator } from '@/types/opportunity';
import type { ProfileField } from '@/types/profile';
import type { DocumentType } from '@/types/document';
import type { MarginUnit } from '@/domain/rules/margin';
import type { RuleValue, RuleValueList } from '@/types/common';

export interface ProfileCriterionInput {
  id: string;
  label: string;
  field: ProfileField;
  operator: Operator;
  value?: RuleValue | RuleValueList;
  value2?: RuleValue;
  requirement: string;
  clauseRef: string;
  clauseText: string;
  unit?: MarginUnit;
  thresholdLabel?: string;
  onUnknown?: 'unknown' | 'fail';
  severity?: 'blocking' | 'advisory';
  fixable?: boolean;
  effortHours?: number;
  effectiveFrom?: string;
}

export function profileCriterion(input: ProfileCriterionInput): Criterion {
  return {
    id: input.id,
    label: input.label,
    target: { kind: 'profile', field: input.field },
    operator: input.operator,
    value: input.value as Criterion['value'],
    value2: input.value2 as Criterion['value2'],
    onUnknown: input.onUnknown ?? 'unknown',
    severity: input.severity ?? 'blocking',
    requirement: input.requirement,
    source: { clauseRef: input.clauseRef, text: input.clauseText },
    effectiveFrom: input.effectiveFrom ?? '2026-01-01',
    relativeTo: 'today',
    effortHours: input.effortHours ?? 0.25,
    unit: input.unit ?? 'GENERIC',
    thresholdLabel: input.thresholdLabel,
    fixable: input.fixable ?? false,
  };
}

export interface DocumentCriterionInput {
  id: string;
  label: string;
  docType: DocumentType;
  attribute: 'issuedOn' | 'expiresOn';
  operator: Operator;
  value?: RuleValue | RuleValueList;
  requirement: string;
  clauseRef: string;
  clauseText: string;
  unit?: MarginUnit;
  thresholdLabel?: string;
  onUnknown?: 'unknown' | 'fail';
  severity?: 'blocking' | 'advisory';
  relativeTo?: 'today' | 'deadline';
  effectiveFrom?: string;
}

export function documentCriterion(input: DocumentCriterionInput): Criterion {
  return {
    id: input.id,
    label: input.label,
    target: { kind: 'document', docType: input.docType, attribute: input.attribute },
    operator: input.operator,
    value: input.value as Criterion['value'],
    onUnknown: input.onUnknown ?? 'unknown',
    severity: input.severity ?? 'blocking',
    requirement: input.requirement,
    source: { clauseRef: input.clauseRef, text: input.clauseText },
    effectiveFrom: input.effectiveFrom ?? '2026-01-01',
    relativeTo: input.relativeTo ?? 'today',
    effortHours: 0.25,
    unit: input.unit ?? 'GENERIC',
    thresholdLabel: input.thresholdLabel,
    fixable: false,
  };
}

export interface DocumentRequirementInput {
  id: string;
  docType: DocumentType;
  label: string;
  required?: boolean;
  severity?: 'blocking' | 'advisory';
  maxAgeDays?: number;
  clauseRef: string;
  clauseText: string;
  effortHours?: number;
}

export function documentRequirement(input: DocumentRequirementInput): DocumentRequirement {
  return {
    id: input.id,
    docType: input.docType,
    label: input.label,
    required: input.required ?? true,
    severity: input.severity ?? 'blocking',
    maxAgeDays: input.maxAgeDays,
    source: { clauseRef: input.clauseRef, text: input.clauseText },
    effortHours: input.effortHours ?? 0.5,
  };
}

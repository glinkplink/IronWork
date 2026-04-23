import type { EsignJobStatus } from '../types/db';
import { getEsignProgressModel } from './esign-progress';

export interface ChangeOrderSignatureState {
  displayLabel:
    | 'Not sent'
    | 'Sent'
    | 'Opened'
    | 'Signed'
    | 'Signed offline'
    | 'Declined'
    | 'Expired';
  isSignatureSatisfied: boolean;
  summary: string;
}

export function isChangeOrderSignatureSatisfied(
  esignStatus: EsignJobStatus | null,
  offlineSignedAt: string | null
): boolean {
  return esignStatus === 'completed' || offlineSignedAt != null;
}

export function getChangeOrderSignatureState(
  esignStatus: EsignJobStatus | null,
  offlineSignedAt: string | null
): ChangeOrderSignatureState {
  if (esignStatus === 'completed') {
    return {
      displayLabel: 'Signed',
      isSignatureSatisfied: true,
      summary: 'Change order has been signed.',
    };
  }

  if (offlineSignedAt != null) {
    return {
      displayLabel: 'Signed offline',
      isSignatureSatisfied: true,
      summary: 'Signature recorded manually (not verified through DocuSeal).',
    };
  }

  const progress = getEsignProgressModel(esignStatus ?? 'not_sent', 'change_order');
  return {
    displayLabel: progress.title as ChangeOrderSignatureState['displayLabel'],
    isSignatureSatisfied: false,
    summary: progress.summary,
  };
}

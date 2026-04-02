import type { EsignJobStatus } from '../types/db';
import { getEsignProgressModel } from './esign-progress';

export interface WorkOrderSignatureState {
  displayLabel: 'Not sent' | 'Sent' | 'Opened' | 'Signed' | 'Signed offline' | 'Declined' | 'Expired';
  isSignatureSatisfied: boolean;
  summary: string;
}

export function getWorkOrderSignatureState(
  esignStatus: EsignJobStatus | null,
  offlineSignedAt: string | null
): WorkOrderSignatureState {
  if (esignStatus === 'completed') {
    return {
      displayLabel: 'Signed',
      isSignatureSatisfied: true,
      summary: 'Work order has been signed.',
    };
  }

  if (offlineSignedAt !== null) {
    return {
      displayLabel: 'Signed offline',
      isSignatureSatisfied: true,
      summary: 'Signature recorded manually (not verified through DocuSeal).',
    };
  }

  const progress = getEsignProgressModel(esignStatus ?? 'not_sent');
  return {
    displayLabel: progress.title as WorkOrderSignatureState['displayLabel'],
    isSignatureSatisfied: false,
    summary: progress.summary,
  };
}
import type { WelderJob, AgreementSection, SectionContentBlock, SignatureBlockData } from '../types';
import type { BusinessProfile } from '../types/db';

const SERVICE_PROVIDER = 'the Service Provider';
const SERVICE_PROVIDER_CAP = 'The Service Provider';
const CUSTOMER = 'the Customer';

function padWoNumber(n: number): string {
  return String(n).padStart(4, '0');
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatPrice(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function capitalizeFirst(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function getSignatureBlockData(job: WelderJob, profile: BusinessProfile | null): SignatureBlockData {
  const d = new Date();
  const ownerDate = `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
  return {
    customerName: job.customer_name,
    ownerName: profile?.owner_name || profile?.business_name || '',
    ownerDate,
  };
}

export function generateAgreement(job: WelderJob, profile: BusinessProfile | null): AgreementSection[] {
  const sections: AgreementSection[] = [];
  const businessName = profile?.business_name || job.contractor_name || 'Contractor';
  const contractorPhone = job.contractor_phone || profile?.phone || '';
  const contractorEmail = job.contractor_email || profile?.email || '';

  const priceTypeLabel =
    job.price_type === 'fixed' ? 'Fixed Price' :
    job.price_type === 'estimate' ? 'Estimate' :
    'Time & Materials';

  const balanceDue = Math.max(0, job.price - job.deposit_amount);

  // 1. Parties & Project Information
  const partiesRows: [string, string][] = [
    ['Work Order #', `WO-${padWoNumber(job.wo_number)}`],
    ['Agreement Date', formatDate(job.agreement_date)],
    ['Service Provider', businessName],
    ['SP Phone', contractorPhone || '—'],
    ['SP Email', contractorEmail || '—'],
    ['Customer', job.customer_name],
    ['Customer Phone', job.customer_phone],
    ['Customer Email', job.customer_email || '—'],
    ['Job Site', job.job_location],
    ['Governing State', job.governing_state || '—'],
  ];
  sections.push({
    title: 'Parties & Project Information',
    number: 1,
    blocks: [{ type: 'table', rows: partiesRows }],
  });

  // 2. Project Overview
  const overviewRows: [string, string][] = [
    ['Item / Structure', job.asset_or_item_description],
    ['Work Requested', job.requested_work],
    ['Job Classification', capitalizeFirst(job.job_classification)],
    ['Target Start', formatDate(job.target_start)],
    ['Target Completion', formatDate(job.target_completion_date)],
  ];
  sections.push({
    title: 'Project Overview',
    number: 2,
    blocks: [{ type: 'table', rows: overviewRows }],
  });

  // 3. Scope of Work
  const scopeItems: string[] = [];
  if (job.requested_work) scopeItems.push(job.requested_work);
  if (job.installation_included) scopeItems.push('Installation of repaired/fabricated components');
  if (job.grinding_included) scopeItems.push('Grinding welds smooth');
  if (job.paint_or_coating_included) scopeItems.push('Paint or coating application');
  if (job.removal_or_disassembly_included) scopeItems.push('Removal and/or disassembly of existing components');

  const materialsText =
    job.materials_provided_by === 'welder'
      ? `All materials will be provided by ${SERVICE_PROVIDER}.`
      : job.materials_provided_by === 'customer'
      ? `All materials will be provided by ${CUSTOMER}.`
      : 'Materials will be provided by both parties as agreed.';

  const scopeBlocks: SectionContentBlock[] = [
    { type: 'bullets', items: scopeItems.length > 0 ? scopeItems : [job.requested_work || 'As described above'] },
    { type: 'paragraph', text: materialsText },
  ];
  sections.push({ title: 'Scope of Work', number: 3, blocks: scopeBlocks });

  // 4. Exclusions
  const exclusionBlocks: SectionContentBlock[] =
    job.exclusions.length > 0
      ? [{ type: 'bullets', items: job.exclusions }]
      : [{ type: 'paragraph', text: 'None specified.' }];
  sections.push({ title: 'Exclusions', number: 4, blocks: exclusionBlocks });

  // 5. Customer Obligations & Site Conditions
  const obligationBlocks: SectionContentBlock[] = [];
  if (job.customer_obligations.length > 0) {
    obligationBlocks.push({ type: 'bullets', items: job.customer_obligations });
  }
  obligationBlocks.push({
    type: 'paragraph',
    text: 'Failure to meet site conditions may result in rescheduling and/or a mobilization fee.',
  });
  sections.push({ title: 'Customer Obligations & Site Conditions', number: 5, blocks: obligationBlocks });

  // 6. Pricing & Payment Terms
  const pricingRows: [string, string][] = [
    ['Price Type', priceTypeLabel],
    ['Total', formatPrice(job.price)],
    ['Deposit', job.deposit_amount > 0 ? formatPrice(job.deposit_amount) : 'None'],
    ['Balance Due at Completion', formatPrice(balanceDue)],
    ['Accepted Payment Methods', job.payment_methods.length > 0 ? job.payment_methods.join(', ') : '—'],
  ];
  const pricingBlocks: SectionContentBlock[] = [
    { type: 'table', rows: pricingRows },
    { type: 'paragraph', text: job.late_payment_terms },
  ];
  if (job.card_fee_note) {
    pricingBlocks.push({
      type: 'paragraph',
      text: 'Payments made by credit or debit card are subject to a processing fee of up to 3.5%.',
    });
  }
  const salesTaxNote = job.governing_state
    ? `Sales tax applicability is governed by ${job.governing_state} state law. ${SERVICE_PROVIDER_CAP} will collect applicable taxes where required.`
    : `${SERVICE_PROVIDER_CAP} will collect applicable sales tax where required by state law.`;
  pricingBlocks.push({ type: 'paragraph', text: salesTaxNote });
  sections.push({ title: 'Pricing & Payment Terms', number: 6, blocks: pricingBlocks });

  // 7. Change Orders
  sections.push({
    title: 'Change Orders',
    number: 7,
    blocks: [{
      type: 'paragraph',
      text: `Any work outside the agreed scope requires written or verbal approval from ${CUSTOMER} before proceeding. Change orders may result in additional charges and timeline adjustments. ${SERVICE_PROVIDER_CAP} will provide an estimate for any additional work before proceeding.`,
    }],
  });

  // 8. Hidden Damage
  sections.push({
    title: 'Hidden Damage',
    number: 8,
    blocks: [{
      type: 'paragraph',
      text: `If hidden damage is discovered during repair work that was not visible during initial inspection, ${SERVICE_PROVIDER} will notify ${CUSTOMER} before proceeding. Additional work required to address hidden damage may result in additional charges and will require ${CUSTOMER} approval.`,
    }],
  });

  // 9. Completion & Acceptance
  sections.push({
    title: 'Completion & Acceptance',
    number: 9,
    blocks: [{
      type: 'paragraph',
      text: `Upon completion of the work and ${CUSTOMER} approval, responsibility for the repaired/fabricated item transfers back to ${CUSTOMER}. ${SERVICE_PROVIDER_CAP} is only responsible for workmanship defects as outlined in the Workmanship Warranty section.`,
    }],
  });

  // 10. Workmanship Warranty
  sections.push({
    title: 'Workmanship Warranty',
    number: 10,
    blocks: [
      {
        type: 'paragraph',
        text: `${SERVICE_PROVIDER_CAP} guarantees the welding workmanship for ${job.workmanship_warranty_days} days from the completion date.`,
      },
      {
        type: 'bullets',
        items: [
          'Covers: Defects in welding workmanship',
          'Covers: Failure of weld joints under normal use',
        ],
      },
      {
        type: 'bullets',
        items: [
          'Does NOT cover: Misuse or abuse of the repaired item',
          'Does NOT cover: Modifications made after completion',
          'Does NOT cover: Damage from accidents, impacts, or overloading',
          'Does NOT cover: Normal wear and tear',
          'Does NOT cover: Rust or corrosion (unless specifically coated)',
          'Does NOT cover: Structural failures unrelated to the weld repair',
        ],
      },
    ],
  });

  // 11. Liability & Indemnification
  sections.push({
    title: 'Liability & Indemnification',
    number: 11,
    blocks: [{
      type: 'paragraph',
      text: `${SERVICE_PROVIDER_CAP}'s total liability under this agreement shall not exceed ${formatPrice(job.price)}. ${SERVICE_PROVIDER_CAP} shall not be liable for indirect, incidental, or consequential damages. ${CUSTOMER.charAt(0).toUpperCase() + CUSTOMER.slice(1)} agrees to indemnify and hold ${SERVICE_PROVIDER} harmless from claims arising from ${CUSTOMER}'s misuse or modification of the work after completion.`,
    }],
  });

  // 12. Third-Party Work
  sections.push({
    title: 'Third-Party Work',
    number: 12,
    blocks: [{
      type: 'paragraph',
      text: `${SERVICE_PROVIDER_CAP} is not responsible for work performed by other contractors, modifications made after completion of this agreement, issues arising from prior repairs or work by others, or damage caused by misuse after work completion.`,
    }],
  });

  // 13. Cancellation & Rescheduling
  sections.push({
    title: 'Cancellation & Rescheduling',
    number: 13,
    blocks: [{
      type: 'paragraph',
      text: `Either party may cancel this agreement with written notice. If ${CUSTOMER} cancels after materials have been ordered or work has begun, ${CUSTOMER} is responsible for material costs incurred and any labor performed to date. Rescheduling requests should be made at least 48 hours in advance. Late cancellations may incur a mobilization fee.`,
    }],
  });

  // 14. Dispute Resolution
  const disputeState = job.governing_state || 'the governing state';
  sections.push({
    title: 'Dispute Resolution',
    number: 14,
    blocks: [{
      type: 'paragraph',
      text: `In the event of a dispute, both parties agree to attempt good-faith negotiation for a period of ${job.negotiation_period} days before pursuing formal remedies. This agreement shall be governed by the laws of ${disputeState}. Any unresolved disputes shall be submitted to binding arbitration or small claims court in ${disputeState}.`,
    }],
  });

  // 15. Entire Agreement
  sections.push({
    title: 'Entire Agreement',
    number: 15,
    blocks: [{
      type: 'paragraph',
      text: `This document constitutes the entire agreement between the parties and supersedes all prior discussions, representations, or agreements. Any modifications to this agreement must be made in writing and signed by both parties.`,
    }],
  });

  // Signature page
  sections.push({
    title: 'Signatures & Acceptance',
    number: 0,
    blocks: [{ type: 'signature' }],
    signatureData: getSignatureBlockData(job, profile),
  });

  return sections;
}

export function formatAgreementAsText(sections: AgreementSection[]): string {
  return sections
    .map((section) => {
      const header = section.number > 0
        ? `${section.number}. ${section.title}`
        : section.title;

      const body = section.blocks
        .map((block) => {
          if (block.type === 'paragraph') return block.text;
          if (block.type === 'bullets') return block.items.map((i) => `• ${i}`).join('\n');
          if (block.type === 'table') return block.rows.map(([k, v]) => `${k}: ${v}`).join('\n');
          if (block.type === 'signature') {
            const s = section.signatureData;
            if (!s) return '';
            return `Customer\nName: ${s.customerName}\nSignature: _________________________\nDate: _________________________\n\nService Provider\nName: ${s.ownerName}\nSignature: ${s.ownerName}\nDate: ${s.ownerDate}`;
          }
          return '';
        })
        .join('\n\n');

      return `${header}\n\n${body}`;
    })
    .join('\n\n\n');
}

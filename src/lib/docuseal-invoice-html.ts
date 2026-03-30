import type { BusinessProfile, Invoice, Job } from '../types/db';
import type { WelderJob } from '../types';
import type { EsignSendDocumentsPayload } from './esign-api';
import { generateInvoiceHtml } from './invoice-generator';
import { buildDocusealEsignFooterLine, buildDocusealHtmlFooter, buildDocusealHtmlHeader } from './docuseal-header-footer';
import {
  docusealAgreementEmbeddedStyles,
  docusealGoogleFontLinks,
  docusealUsDateToday,
} from './docuseal-agreement-html';
import { DOCUSEAL_CUSTOMER_ROLE } from './docuseal-constants';
import { esc } from './html-escape';
import { jobLocationSingleLine } from './job-site-address';
import { jobRowToWelderJob } from './job-to-welder-job';

const FIELD_STYLE_INLINE =
  'width: 220px; height: 22px; display: inline-block; margin-bottom: -4px; vertical-align: middle;';
const FIELD_STYLE_SIG =
  'width: 200px; height: 56px; max-height: 56px; overflow: hidden; display: inline-block; margin-top: 4px; vertical-align: top;';
const FIELD_STYLE_DATE =
  'width: 140px; height: 22px; display: inline-block; margin-bottom: -4px; vertical-align: middle;';

export interface InvoiceDocusealEsignOptions {
  providerSignatureDataUrl?: string | null;
}

function buildInvoiceSignatureSection(
  invoice: Invoice,
  job: Job,
  profile: BusinessProfile | null,
  options: InvoiceDocusealEsignOptions
): string {
  const ownerName = profile?.owner_name || profile?.business_name || '';
  const customerName = job.customer_name || '';
  const customerRole = DOCUSEAL_CUSTOMER_ROLE;
  const providerSignatureMarkup = options.providerSignatureDataUrl
    ? `<img class="signature-autofill-image" src="${esc(options.providerSignatureDataUrl)}" alt="Service provider signature" />`
    : `<div class="signature-autofill-name">${esc(ownerName)}</div>`;

  return `
    <div class="invoice-signature-section">
      <h3 class="section-title">Customer acknowledgment</h3>
      <p class="content-paragraph">
        Please review Invoice #${esc(String(invoice.invoice_number).padStart(4, '0'))} and sign below to acknowledge receipt.
      </p>
      <div class="signature-blocks">
        <div class="signature-block">
          <div class="signature-block-identifier">Customer</div>
          <div class="signature-field">
            <span class="signature-field-label">Name</span>
            <text-field name="customer_printed_name" role="${esc(customerRole)}" default_value="${esc(customerName)}" style="${FIELD_STYLE_INLINE}"></text-field>
          </div>
          <div class="signature-field">
            <span class="signature-field-label">Signature</span>
            <signature-field name="customer_signature" role="${esc(customerRole)}" format="drawn_or_typed" required="true" style="${FIELD_STYLE_SIG}"></signature-field>
          </div>
          <div class="signature-field">
            <span class="signature-field-label">Date</span>
            <date-field name="customer_signed_date" role="${esc(customerRole)}" required="true" default_value="${esc(docusealUsDateToday())}" style="${FIELD_STYLE_DATE}"></date-field>
          </div>
        </div>
        <div class="signature-block">
          <div class="signature-block-identifier">Service Provider</div>
          <div class="signature-field">
            <span class="signature-field-label">Name</span>
            <div class="signature-field-value">${esc(ownerName)}</div>
          </div>
          <div class="signature-field">
            <span class="signature-field-label">Signature</span>
            <div class="signature-field-value">${providerSignatureMarkup}</div>
          </div>
          <div class="signature-field">
            <span class="signature-field-label">Date</span>
            <div class="signature-field-value">${esc(docusealUsDateToday())}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function buildDocusealInvoiceEsignParts(
  invoice: Invoice,
  job: Job,
  profile: BusinessProfile | null,
  options: InvoiceDocusealEsignOptions = {}
): { html: string; html_header: string; html_footer: string } {
  const invoiceLabel = `Invoice #${String(invoice.invoice_number).padStart(4, '0')}`;
  const signatureSection = buildInvoiceSignatureSection(invoice, job, profile, options);
  const bodyContent = generateInvoiceHtml(invoice, job, profile, {
    extraSectionsHtml: signatureSection,
  });
  const welderJob: WelderJob = jobRowToWelderJob(job, profile);
  const html_header = buildDocusealHtmlHeader(invoiceLabel);
  const html_footer = buildDocusealHtmlFooter(buildDocusealEsignFooterLine(profile, welderJob));

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  ${docusealGoogleFontLinks()}
  ${docusealAgreementEmbeddedStyles()}
</head>
<body>
${bodyContent}
</body>
</html>`;

  return { html, html_header, html_footer };
}

export function buildInvoiceEsignNotificationMessage(
  invoice: Invoice,
  job: Job,
  profile: BusinessProfile | null
): { subject: string; body: string } {
  const invoiceNum = String(invoice.invoice_number).padStart(4, '0');
  const contractorName = profile?.business_name ?? 'Your Contractor';
  const signerName = profile?.owner_name ?? contractorName;
  const customerFirst = job.customer_name.split(' ')[0] || job.customer_name;
  const location = jobLocationSingleLine(job.job_location);
  return {
    subject: `${contractorName} sent you an Invoice to review — Invoice #${invoiceNum}`,
    body: `Hi ${customerFirst},\n\n${contractorName} has issued Invoice #${invoiceNum}${location ? ` for work at ${location}` : ''} and is requesting your acknowledgment signature.\n\nPlease review and sign using the link below:\n\n{{submitter.link}}\n\nThank you,\n${signerName}\n${contractorName}`,
  };
}

export function buildInvoiceEsignSendPayload(
  invoice: Invoice,
  job: Job,
  profile: BusinessProfile | null,
  options: InvoiceDocusealEsignOptions = {}
): EsignSendDocumentsPayload {
  const invoiceLabel = `Invoice #${String(invoice.invoice_number).padStart(4, '0')}`;
  const { html, html_header, html_footer } = buildDocusealInvoiceEsignParts(
    invoice,
    job,
    profile,
    options
  );
  return {
    name: invoiceLabel,
    send_email: true,
    documents: [
      {
        name: invoiceLabel,
        html,
        html_header,
        html_footer,
      },
    ],
    message: buildInvoiceEsignNotificationMessage(invoice, job, profile),
  };
}

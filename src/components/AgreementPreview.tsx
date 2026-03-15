import { jsPDF } from 'jspdf';
import type { WelderJob } from '../types';
import type { BusinessProfile } from '../types/db';
import { generateAgreement, formatAgreementAsText } from '../lib/agreement-generator';

interface AgreementPreviewProps {
  job: WelderJob;
  profile: BusinessProfile | null;
}

function getPdfFilename(customerName: string): string {
  const sanitized = customerName.replace(/\s+/g, '');
  const d = new Date();
  const m = d.getMonth() + 1;
  const day = d.getDate();
  const yy = String(d.getFullYear()).slice(-2);
  return `${sanitized}${m}-${day}-${yy}.pdf`;
}

// Labels that should have bold formatting
const BOLD_LABELS = [
  'Date:',
  'Service Provider:',
  'Customer:',
  'Job Location:',
  'Phone:',
  'Item/Structure:',
  'Work Requested:',
  'Job Type:',
  'Total Price:',
  'Price Type:',
  'Deposit Required:',
  'Payment Terms:',
  'Target Completion:',
];

// Parse a line and return label/value parts if it matches a known label
function parseLabeledLine(line: string): { label: string; value: string } | null {
  for (const label of BOLD_LABELS) {
    if (line.startsWith(label)) {
      return { label, value: line.slice(label.length).trim() };
    }
  }
  return null;
}

// Render a line with bold label for HTML preview
function renderLineWithBoldLabel(line: string, key: number) {
  const parsed = parseLabeledLine(line);
  if (parsed) {
    return (
      <p key={key} className="content-line">
        <strong>{parsed.label}</strong> {parsed.value}
      </p>
    );
  }
  return (
    <p key={key} className="content-line">
      {line}
    </p>
  );
}

export function AgreementPreview({ job, profile }: AgreementPreviewProps) {
  const sections = generateAgreement(job, profile);
  const plainText = formatAgreementAsText(sections);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPdf = () => {
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.height; // ~297mm for A4
    const pageWidth = doc.internal.pageSize.width;   // ~210mm for A4
    const margin = 20;
    const maxWidth = pageWidth - (margin * 2);       // ~170mm
    const baseLineHeight = 6;                        // Base line height

    let yPosition = margin;
    const lines = doc.splitTextToSize(plainText, maxWidth);

    // Section headers to detect for special formatting
    const sectionHeaders = [
      'WELDING SERVICES AGREEMENT',
      'Project Overview',
      'Scope of Work',
      'Materials',
      'Exclusions',
      'Hidden Damage Clause',
      'Third-Party Work',
      'Change Orders',
      'Pricing and Payment',
      'Completion and Responsibility',
      'Workmanship Warranty',
      'Agreement and Acknowledgment',
    ];

    lines.forEach((line: string) => {
      const trimmedLine = line.trim();
      const isMainTitle = trimmedLine === 'WELDING SERVICES AGREEMENT';
      const isSectionHeader = sectionHeaders.includes(trimmedLine);
      const isEmptyLine = trimmedLine === '';

      // Determine line height and spacing
      let lineHeight = baseLineHeight;
      if (isEmptyLine) {
        lineHeight = 3; // Reduced spacing for empty lines
      } else if (isSectionHeader) {
        lineHeight = baseLineHeight + 2; // Extra space after headers
      }

      // Check if adding this line would exceed page height
      if (yPosition + lineHeight > pageHeight - margin) {
        doc.addPage();
        yPosition = margin;
      }

      // Add extra space before section headers (except main title)
      if (isSectionHeader && !isMainTitle) {
        yPosition += 4;
      }

      // Skip rendering empty lines, just add spacing
      if (!isEmptyLine) {
        // Set font style for headers
        if (isMainTitle) {
          doc.setFontSize(16);
          doc.setFont('helvetica', 'bold');
          doc.text(line, pageWidth / 2, yPosition, { align: 'center' });
        } else if (isSectionHeader) {
          doc.setFontSize(12);
          doc.setFont('helvetica', 'bold');
          doc.text(line, margin, yPosition);
        } else {
          doc.setFontSize(10);
          // Check if this line has a bold label
          const parsed = parseLabeledLine(trimmedLine);
          if (parsed) {
            // Render label in bold, value in normal
            doc.setFont('helvetica', 'bold');
            doc.text(parsed.label, margin, yPosition);
            const labelWidth = doc.getTextWidth(parsed.label + ' ');
            doc.setFont('helvetica', 'normal');
            doc.text(parsed.value, margin + labelWidth, yPosition);
          } else {
            doc.setFont('helvetica', 'normal');
            doc.text(line, margin, yPosition);
          }
        }
      }

      yPosition += lineHeight;
    });

    doc.save(getPdfFilename(job.customer_name));
  };

  const actionButtons = (
    <div className="preview-actions">
      <button onClick={handlePrint} className="btn-action">
        Print
      </button>
      <button onClick={handleDownloadPdf} className="btn-action">
        📥 Download PDF
      </button>
    </div>
  );

  return (
    <div className="agreement-preview">
      {actionButtons}

      <div className="agreement-document">
        {sections.map((section, index) => {
          const isSignature = !!section.signatureData;
          const sig = section.signatureData;
          return (
            <div
              key={index}
              className={`agreement-section ${isSignature ? 'signature-section' : ''}`}
            >
              <h3 className="section-title">{section.title}</h3>
              <div className="section-content">
                {section.content.split('\n').map((line, i) => renderLineWithBoldLabel(line, i))}
                {sig && (
                  <div className="signature-blocks">
                    <div className="signature-block">
                      <div className="signature-field">
                        <span className="signature-field-label">Name</span>
                        <div className="signature-field-value">{sig.customerName}</div>
                      </div>
                      <div className="signature-field">
                        <span className="signature-field-label">Signature</span>
                        <div className="signature-field-value" />
                      </div>
                      <div className="signature-field">
                        <span className="signature-field-label">Date</span>
                        <div className="signature-field-value" />
                      </div>
                    </div>
                    <div className="signature-block">
                      <div className="signature-field">
                        <span className="signature-field-label">Name</span>
                        <div className="signature-field-value signature-typed-autofill">
                          {sig.ownerName}
                        </div>
                      </div>
                      <div className="signature-field">
                        <span className="signature-field-label">Signature</span>
                        <div className="signature-field-value" />
                      </div>
                      <div className="signature-field">
                        <span className="signature-field-label">Date</span>
                        <div className="signature-field-value">{sig.ownerDate}</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {actionButtons}
    </div>
  );
}

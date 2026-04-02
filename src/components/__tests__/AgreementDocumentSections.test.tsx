// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { AgreementDocumentSections } from '../AgreementDocumentSections';
import type { AgreementSection } from '../../types';

afterEach(() => {
  cleanup();
});

describe('AgreementDocumentSections', () => {
  it('renders two sections that share a title without duplicate-key issues', () => {
    const sections: AgreementSection[] = [
      {
        title: 'Shared Title',
        number: 1,
        blocks: [{ type: 'paragraph', text: 'First body' }],
      },
      {
        title: 'Shared Title',
        number: 2,
        blocks: [{ type: 'paragraph', text: 'Second body' }],
      },
    ];

    render(
      <div className="agreement-document">
        <AgreementDocumentSections sections={sections} />
      </div>
    );

    const headings = screen.getAllByRole('heading', { level: 3 });
    expect(headings).toHaveLength(2);
    expect(headings[0]).toHaveTextContent('1. Shared Title');
    expect(headings[1]).toHaveTextContent('2. Shared Title');
    expect(screen.getByText('First body')).toBeInTheDocument();
    expect(screen.getByText('Second body')).toBeInTheDocument();
  });

  const partiesSectionEmptySp: AgreementSection = {
    title: 'Parties & Project Information',
    number: 1,
    blocks: [
      {
        type: 'partiesLayout',
        agreementDate: 'January 1, 2026',
        serviceProvider: { businessName: '', phone: '', email: '' },
        customer: { name: 'Cust', phone: '555', email: 'c@test.com' },
        jobSiteAddress: '123 Main',
      },
    ],
  };

  it('shows guest SP placeholders when isAnonymousPreview', () => {
    render(
      <div className="agreement-document">
        <AgreementDocumentSections
          sections={[partiesSectionEmptySp]}
          isAnonymousPreview
        />
      </div>
    );

    expect(screen.getAllByText('(Will be filled in at final step)')).toHaveLength(2);
  });

  it('omits guest SP placeholders when isAnonymousPreview is false', () => {
    render(
      <div className="agreement-document">
        <AgreementDocumentSections sections={[partiesSectionEmptySp]} />
      </div>
    );

    expect(screen.queryByText('(Will be filled in at final step)')).not.toBeInTheDocument();
  });
});

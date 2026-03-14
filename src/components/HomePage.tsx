interface HomePageProps {
  onCreateAgreement: () => void;
  businessName?: string;
}

export function HomePage({ onCreateAgreement, businessName }: HomePageProps) {
  return (
    <div className="home-page">
      <div className="home-content">
        {businessName && (
          <p className="home-greeting">Welcome back, {businessName}</p>
        )}
        <h1>Create clear job agreements and protect your work</h1>
        <p className="home-description">
          Generate a Work Agreement, track changes, and keep a clear record of what was approved.
        </p>
        <button className="btn-primary btn-large" onClick={onCreateAgreement}>
          Create Work Agreement
        </button>
      </div>
    </div>
  );
}
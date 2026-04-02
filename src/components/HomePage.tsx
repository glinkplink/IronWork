import './HomePage.css';

interface HomePageProps {
  onCreateAgreement: () => void;
}

export function HomePage({ onCreateAgreement }: HomePageProps) {
  return (
    <div className="home-page">
      <div className="home-content">
        <h1>Cover your ass.</h1>
        <p className="home-subheading">Stop working for free. Get it in writing.</p>
        <button className="btn-primary btn-large" onClick={onCreateAgreement}>
          Create Work Order
        </button>
      </div>
    </div>
  );
}

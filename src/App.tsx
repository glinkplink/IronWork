import { useState, useEffect } from 'react';
import type { WelderJob } from './types';
import { JobForm } from './components/JobForm';
import { AgreementPreview } from './components/AgreementPreview';
import { AuthPage } from './components/AuthPage';
import { BusinessProfileForm } from './components/BusinessProfileForm';
import { useAuth } from './hooks/useAuth';
import { signOut } from './lib/auth';
import { getProfile } from './lib/db/profile';
import type { BusinessProfile } from './types/db';
import sampleJob from './data/sample-job.json';
import './App.css';

function App() {
  const { user, loading: authLoading } = useAuth();
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [editingProfile, setEditingProfile] = useState(false);
  const [activeTab, setActiveTab] = useState<'form' | 'preview'>('form');
  const [job, setJob] = useState<WelderJob>(() => ({
    ...(sampleJob as WelderJob),
    contractor_name: '',
  }));

  useEffect(() => {
    if (profile && !editingProfile) {
      setJob((prev) => ({ ...prev, contractor_name: profile.business_name }));
    }
  }, [profile?.business_name, editingProfile]);

  useEffect(() => {
    if (user) {
      const loadProfile = async () => {
        setProfileLoading(true);
        const data = await getProfile(user.id);
        setProfile(data);
        setProfileLoading(false);
      };
      loadProfile();
    } else {
      setProfile(null);
      setProfileLoading(false);
    }
  }, [user]);

  const loadProfile = async () => {
    if (!user) return;
    setProfileLoading(true);
    const data = await getProfile(user.id);
    setProfile(data);
    setProfileLoading(false);
    setEditingProfile(false);
  };

  if (authLoading || profileLoading) {
    return <div className="app-loading">Loading...</div>;
  }

  if (!user) {
    return <AuthPage />;
  }

  if (!profile || editingProfile) {
    return (
      <BusinessProfileForm
        userId={user.id}
        initialProfile={profile}
        onSave={loadProfile}
      />
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <h1>ScopeLock</h1>
        <p className="tagline">Simple Agreements for Welders</p>
        <div className="header-actions">
          <button
            type="button"
            className="btn-edit-profile"
            onClick={() => setEditingProfile(true)}
          >
            Edit Profile
          </button>
          <button
            type="button"
            className="btn-sign-out"
            onClick={() => signOut()}
          >
            Sign Out
          </button>
        </div>
      </header>

      <nav className="tab-nav">
        <button
          className={`tab-button ${activeTab === 'form' ? 'active' : ''}`}
          onClick={() => setActiveTab('form')}
        >
          Job Details
        </button>
        <button
          className={`tab-button ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          Agreement Preview
        </button>
      </nav>

      <main className="app-main">
        {activeTab === 'form' ? (
          <JobForm job={job} onChange={setJob} />
        ) : (
          <AgreementPreview job={job} />
        )}
      </main>

      <footer className="app-footer">
        <p>ScopeLock - Protect Your Work</p>
      </footer>
    </div>
  );
}

export default App;

import { useState, useEffect } from 'react';

export type AppView =
  | 'home'
  | 'form'
  | 'preview'
  | 'profile'
  | 'clients'
  | 'work-orders'
  | 'work-order-detail'
  | 'co-detail'
  | 'change-order-wizard'
  | 'invoice-wizard'
  | 'invoice-final'
  | 'invoices'
  | 'auth';

type AppHistoryState = { view?: AppView };

const APP_VIEWS: AppView[] = [
  'home',
  'form',
  'preview',
  'profile',
  'clients',
  'work-orders',
  'work-order-detail',
  'co-detail',
  'change-order-wizard',
  'invoice-wizard',
  'invoice-final',
  'invoices',
  'auth',
];

function isAppView(v: unknown): v is AppView {
  return typeof v === 'string' && (APP_VIEWS as readonly string[]).includes(v);
}

export function useAppNavigation() {
  const [view, setView] = useState<AppView>('home');

  const navigateTo = (newView: AppView) => {
    window.history.pushState({ view: newView }, '');
    setView(newView);
  };

  const replaceView = (next: AppView) => {
    window.history.replaceState({ view: next }, '');
    setView(next);
  };

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const st = e.state as AppHistoryState | null;
      const v = st?.view;
      if (isAppView(v)) setView(v);
      else setView('home');
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  return { view, setView, navigateTo, replaceView };
}

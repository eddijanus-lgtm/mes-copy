import { useState, useEffect } from 'react';
import { useTranslation } from "../i18n/I18nProvider.jsx";
import { useAuth } from "../providers/AuthProvider.jsx";

export default function SystemStatus() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [backendOnline, setBackendOnline] = useState('checking');
  const [dbOnline, setDbOnline] = useState('checking');

  useEffect(() => {
    const check = () => {
      fetch('/api/health').then(res => res.json()).then(health => {
        setBackendOnline(health.status === 'ok' ? 'online' : 'error');
        setDbOnline(health.info?.database?.status === 'up' ? 'online' : 'error');
      }).catch(() => { setBackendOnline('offline'); setDbOnline('unknown'); });
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  const statusIcon = backendOnline === 'online' ? '✅' : backendOnline === 'error' ? '❌' : '⚠️';
  const dbIcon = dbOnline === 'online' ? '✅' : dbOnline === 'error' ? '❌' : '❓';
  const tokenIcon = token ? '✅' : '🔒';

  const statusLabel = backendOnline === 'online' ? t("system.online") : backendOnline === 'error' ? t("system.error") : t("system.offline");
  const dbLabel = dbOnline === 'online' ? t("system.connected") : dbOnline === 'error' ? t("system.error") : t("system.unknown");
  const tokenLabel = token ? t("system.authenticated") : t("system.notLoggedIn");

  return (
    <div className="fixed bottom-4 right-4 z-[9999] min-w-[200px] rounded-lg border border-neutral-200 bg-white p-2.5 font-mono text-xs text-neutral-800 shadow-[0_10px_30px_rgba(15,23,42,0.12)]">
      <div className="mb-1 border-b border-neutral-200 pb-1 font-bold">{t("system.title")}</div>
      <div>{t("system.backend")}: {statusIcon} {statusLabel}</div>
      <div>{t("system.database")}: {dbIcon} {dbLabel}</div>
      <div>{t("system.session")}: {tokenIcon} {tokenLabel}</div>
    </div>
  );
}

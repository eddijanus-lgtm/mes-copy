import { useState, useEffect } from 'react';

export default function SystemStatus() {
  const [backendOnline, setBackendOnline] = useState(null);
  const [dbOnline, setDbOnline] = useState(null);
  const [token, setToken] = useState(false);

  useEffect(() => {
    checkBackend();
    const interval = setInterval(checkBackend, 5000);
    return () => clearInterval(interval);
  }, []);

  async function checkBackend() {
    setToken(Boolean(localStorage.getItem('jwt_token')));
    try {
      const res = await fetch('/api/health');
      const health = await res.json();
      setBackendOnline(res.ok ? 'online' : 'error');
      setDbOnline(health.info?.database?.status === 'up' ? 'online' : 'error');
    } catch {
      setBackendOnline('offline');
      setDbOnline('unknown');
    }
  }

  const status = backendOnline === 'online' ? '🟢 Online' :
                 backendOnline === 'error' ? '🟠 Error' : '⚫ Offline';

  const dbStatus = dbOnline === 'online' ? '🟢 Connected' :
                   dbOnline === 'error' ? '🟠 Error' : '⚫ Unknown';
  const tokenStatus = token ? '🟢 Authenticated' : '⚪ Not logged in';

  return (
    <div style={{
      position: 'fixed',
      bottom: 16,
      right: 16,
      backgroundColor: '#1a1a2e',
      color: '#eee',
      padding: '10px 14px',
      borderRadius: 8,
      fontSize: 12,
      fontFamily: 'monospace',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
      zIndex: 9999,
      minWidth: 200,
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: 4, borderBottom: '1px solid #444', paddingBottom: 4 }}>
        System Status
      </div>
      <div>Backend: {status}</div>
      <div>Database: {dbStatus}</div>
      <div>Session: {tokenStatus}</div>
    </div>
  );
}

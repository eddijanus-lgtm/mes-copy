import { useState, useEffect } from 'react';

export default function SystemStatus() {
  const [backendOnline, setBackendOnline] = useState('checking');
  const [dbOnline, setDbOnline] = useState('checking');
  const [token, setToken] = useState(false);

  useEffect(() => {
    setToken(Boolean(localStorage.getItem('jwt_token')));
    fetch('/api/v1/health')
      .then(res => res.json())
      .then(health => {
        setBackendOnline(health.status === 'ok' ? 'online' : 'error');
        setDbOnline(health.info?.database?.status === 'up' ? 'online' : 'error');
      })
      .catch(() => {
        setBackendOnline('offline');
        setDbOnline('unknown');
      });

    const interval = setInterval(() => {
      fetch('/api/v1/health')
        .then(res => res.json())
        .then(health => {
          setBackendOnline(health.status === 'ok' ? 'online' : 'error');
          setDbOnline(health.info?.database?.status === 'up' ? 'online' : 'error');
        })
        .catch(() => {
          setBackendOnline('offline');
          setDbOnline('unknown');
        });
    }, 5000);

    return () => clearInterval(interval);
  }, []);

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
      backgroundColor: '#ffffff',
      color: '#171717',
      padding: '10px 14px',
      borderRadius: 8,
      fontSize: 12,
      fontFamily: 'monospace',
      boxShadow: '0 10px 30px rgba(15, 23, 42, 0.12)',
      border: '1px solid #e5e5e5',
      zIndex: 9999,
      minWidth: 200,
    }}>
      <div style={{ fontWeight: 'bold', marginBottom: 4, borderBottom: '1px solid #e5e5e5', paddingBottom: 4 }}>
        System Status
      </div>
      <div>Backend: {status}</div>
      <div>Database: {dbStatus}</div>
      <div>Session: {tokenStatus}</div>
    </div>
  );
}

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

  const status = backendOnline === 'online' ? 'Online' :
                  backendOnline === 'error' ? 'Fehler' : 'Offline';

  const dbStatus = dbOnline === 'online' ? 'Verbunden' :
                   dbOnline === 'error' ? 'Fehler' : 'Unbekannt';
  const tokenStatus = token ? 'Angemeldet' : 'Nicht angemeldet';
  const backendClass = backendOnline === 'online' ? 'is-online' :
    backendOnline === 'error' ? 'is-warning' : 'is-offline';
  const databaseClass = dbOnline === 'online' ? 'is-online' :
    dbOnline === 'error' ? 'is-warning' : 'is-offline';
  const sessionClass = token ? 'is-online' : 'is-offline';

  return (
    <details className="system-status">
      <summary>
        Systemstatus
        <span className="system-status__summary-dots" aria-hidden="true">
          <span className={backendClass} />
          <span className={databaseClass} />
          <span className={sessionClass} />
        </span>
      </summary>
      <div className="system-status__body">
        <div className="system-status__row">
          <span>Backend</span>
          <strong className={`system-status__value ${backendClass}`}>{status}</strong>
        </div>
        <div className="system-status__row">
          <span>Datenbank</span>
          <strong className={`system-status__value ${databaseClass}`}>{dbStatus}</strong>
        </div>
        <div className="system-status__row">
          <span>Sitzung</span>
          <strong className={`system-status__value ${sessionClass}`}>{tokenStatus}</strong>
        </div>
      </div>
    </details>
  );
}

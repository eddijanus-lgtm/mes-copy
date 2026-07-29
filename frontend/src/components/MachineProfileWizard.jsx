import { useEffect, useState } from 'react';
import { api } from '../api/client.js';
import {
  emptyMachineConnection,
  emptyMachineProfile,
  namespacesFromArray,
  normalizeProfileDocument,
  profileSetupSummary,
  stationSetupState,
  validateProfileDraft,
} from '../utils/machineProfileConfig.js';

export const MACHINE_SIGNAL_ROLES = Object.freeze([
  'workRequest',
  'requestBusy',
  'requestAccepted',
  'requestRejected',
  'requestCompleted',
  'carrierId',
  'resourceId',
  'orderId',
  'partNumber',
  'operationId',
  'stepNumber',
  'nextStationId',
  'processActive',
  'processCompleted',
  'processResult',
  'timestamp',
  'completedCarrierId',
  'routingParameter',
  'controlStart',
  'controlStop',
  'controlReset',
  'controlPause',
  'inventoryValid',
  'inventoryRevision',
  'inventoryCapacity',
  'availableCarrierCount',
  'totalCarrierCount',
  'idealCycleTimeMs',
  'goodCount',
  'rejectCount',
  'slotOccupied',
  'slotId',
  'rfidUid',
  'rfidReadValid',
  'carrierPhysicalState',
  'carrierReaderId',
  'carrierLastSeen',
  'custom',
]);

const STEPS = ['Anlage', 'SPS-Verbindungen', 'Daten zuordnen', 'Prüfen & aktivieren'];
const CAPABILITIES = [
  'production',
  'routing',
  'control',
  'inventory',
  'storage',
  'telemetry',
];
const DATA_TYPES = [
  'Boolean',
  'Byte',
  'UInt16',
  'UInt32',
  'Int16',
  'Int32',
  'Float',
  'Double',
  'String',
  'DateTime',
];
const SIGNAL_HANDSHAKE_ROLES = [
  'workRequest',
  'requestBusy',
  'requestAccepted',
  'requestRejected',
  'carrierId',
  'resourceId',
  'orderId',
  'partNumber',
  'operationId',
  'stepNumber',
  'nextStationId',
  'processActive',
  'processCompleted',
  'processResult',
  'completedCarrierId',
];

function newStation(resourceId = '') {
  return {
    stationId: '',
    resourceId: resourceId === '' ? '' : Number(resourceId),
    displayName: '',
    description: '',
    enabled: false,
    equipmentLevel: 'work_unit',
    executionModel: 'machine_job',
    jobInterface: 'telemetry_only',
    resourceType: 'production',
    capabilities: ['production', 'telemetry'],
    signals: [],
    connection: emptyMachineConnection(),
  };
}

function newSignal(namespace = 'machine') {
  return {
    key: '',
    role: 'custom',
    direction: 'machineToMes',
    namespace,
    identifier: '',
    dataType: 'Boolean',
    access: 'read',
    required: false,
    event: { trigger: 'change' },
    description: '',
  };
}

function profileLabel(profile) {
  return (
    profile.document?.displayName ||
    profile.document?.machineId ||
    profile.profileId ||
    'Unbenanntes Profil'
  );
}

function resultState(result) {
  if (!result) return 'Noch nicht ausgeführt';
  if (result.valid === true || result.success === true || result.ok === true)
    return 'Erfolgreich';
  if (result.valid === false || result.success === false || result.ok === false)
    return 'Fehlgeschlagen';
  return 'Ergebnis vorhanden';
}

function technicalId(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function normalizedOpcUaEndpoint(endpointUrl = '') {
  return endpointUrl.trim().replace(/\/$/, '').toLowerCase();
}

function uniqueStationId(displayName, stations, editedIndex) {
  const base = technicalId(displayName) || 'station';
  const used = new Set(
    stations
      .filter((_, index) => index !== editedIndex)
      .map((station) => String(station.stationId || '').trim())
      .filter(Boolean),
  );
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

export default function MachineProfileWizard({
  isOpen,
  canEdit,
  onClose,
  onProfilesChanged,
  editProfileId,
  editStationResourceId,
  addStationOnOpen = false,
}) {
  const [profiles, setProfiles] = useState([]);
  const [profile, setProfile] = useState(null);
  const [document, setDocument] = useState(null);
  const [step, setStep] = useState(0);
  const [suggestion, setSuggestion] = useState({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [changeSummary, setChangeSummary] = useState(
    'Inbetriebnahme über Assistent',
  );
  const [persistedDocument, setPersistedDocument] = useState('');
  const [stationEditor, setStationEditor] = useState(null);
  const [stationEditorIndex, setStationEditorIndex] = useState(-1);
  const [signalStationIndex, setSignalStationIndex] = useState(0);
  const [signalEditor, setSignalEditor] = useState(null);
  const [signalEditorIndex, setSignalEditorIndex] = useState(-1);
  const [browserNodes, setBrowserNodes] = useState([]);
  const [browserSelection, setBrowserSelection] = useState(null);
  const [browserConfirmed, setBrowserConfirmed] = useState(false);
  const [connectionTestResult, setConnectionTestResult] = useState(null);
  const [mappingResult, setMappingResult] = useState(null);
  const [activationDialog, setActivationDialog] = useState(false);
  const [activationConfirmation, setActivationConfirmation] = useState('');
  const [confirmControl, setConfirmControl] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setLoading(true);
    setStationEditor(null);
    setStationEditorIndex(-1);
    Promise.all([
      api.getSilent('/machine-profiles'),
      api.getSilent('/machine-profiles/suggestions').catch(() => ({})),
    ])
      .then(([response, nextSuggestion]) => {
        const loadedProfiles = Array.isArray(response?.items)
          ? response.items
          : [];
        setProfiles(loadedProfiles);
        setSuggestion(nextSuggestion || {});
        setProfile(null);
        setDocument(null);
        if (editProfileId) {
          const match = loadedProfiles.find(
            (p) =>
              p.profileId === editProfileId ||
              String(p.document?.machineId) === String(editProfileId),
          );
          if (match) {
            const nextDocument = normalizeProfileDocument(
              match.document,
              nextSuggestion || {},
            );
            setProfile(match);
            setDocument(nextDocument);
            setPersistedDocument(JSON.stringify(nextDocument));
            if (addStationOnOpen) {
              const usedResourceIds = new Set(
                nextDocument.stations.map((station) => Number(station.resourceId)),
              );
              let resourceId = Number(nextSuggestion?.resourceId) || 1;
              while (usedResourceIds.has(resourceId)) resourceId += 1;
              setStationEditor(newStation(resourceId));
              setStationEditorIndex(-1);
              setStep(1);
            } else if (editStationResourceId) {
              const index = nextDocument.stations.findIndex(
                (s) => String(s.resourceId) === String(editStationResourceId),
              );
              if (index >= 0) {
                setStationEditor(structuredClone(nextDocument.stations[index]));
                setStationEditorIndex(index);
                setStep(1);
              } else {
                setStep(0);
              }
            } else {
              setStep(0);
            }
          }
        }
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setLoading(false));
  }, [isOpen, editProfileId, editStationResourceId, addStationOnOpen]);

  if (!isOpen) return null;

  function openProfile(nextProfile) {
    const nextDocument = normalizeProfileDocument(
      nextProfile.document,
      suggestion,
    );
    setProfile(nextProfile);
    setDocument(nextDocument);
    setPersistedDocument(JSON.stringify(nextDocument));
    setStep(0);
    setSignalStationIndex(0);
    setConnectionTestResult(null);
    setMappingResult(null);
    setError('');
  }

  function startNew() {
    const nextDocument = emptyMachineProfile(suggestion);
    setProfile(null);
    setDocument(nextDocument);
    setPersistedDocument('');
    setStep(0);
    setSignalStationIndex(0);
    setConnectionTestResult(null);
    setMappingResult(null);
    setError('');
  }

  function updateDocument(path, value) {
    if (path[0] === 'connection') setConnectionTestResult(null);
    setDocument((current) => {
      const next = structuredClone(current);
      let target = next;
      path.slice(0, -1).forEach((key, index) => {
        if (target[key] == null)
          target[key] = typeof path[index + 1] === 'number' ? [] : {};
        target = target[key];
      });
      target[path.at(-1)] = value;
      return next;
    });
  }

  async function testDraftConnection(connection) {
    setError('');
    setConnectionTestResult(null);
    setLoading(true);
    try {
      const result = await api.post(
        '/machine-profiles/commissioning/test-connection',
        {
          connection,
        },
      );
      setConnectionTestResult(result);
      const namespaces = namespacesFromArray(result?.namespaceArray);
      if (namespaces.length) updateDocument(['namespaces'], namespaces);
      return result;
    } catch (requestError) {
      setError(requestError.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  function selectStep(nextStep) {
    setStationEditor(null);
    setError('');
    setStep(nextStep);
  }

  async function saveDocument() {
    if (!canEdit) return profile;
    if (!document.displayName.trim())
      throw new Error('Bitte einen Namen für die Anlage angeben.');
    if (profile && persistedDocument === JSON.stringify(document))
      return profile;
    const documentToSave = structuredClone(document);
    if (!documentToSave.machineId?.trim()) {
      const generated = await api.getSilent(
        `/machine-profiles/suggestions?displayName=${encodeURIComponent(documentToSave.displayName)}`,
      );
      documentToSave.machineId =
        generated?.machineId || technicalId(documentToSave.displayName);
    }
    const body = {
      document: documentToSave,
      changeSummary: changeSummary.trim() || undefined,
    };
    const saved = profile
      ? await api.patch(`/machine-profiles/${profile.profileId}`, body)
      : await api.post('/machine-profiles', body);
    const nextProfile = saved?.profileId
      ? saved
      : { ...profile, ...saved, document: documentToSave };
    setProfile(nextProfile);
    setDocument(structuredClone(nextProfile.document || documentToSave));
    setPersistedDocument(
      JSON.stringify(nextProfile.document || documentToSave),
    );
    setProfiles((current) => [
      nextProfile,
      ...current.filter((item) => item.profileId !== nextProfile.profileId),
    ]);
    onProfilesChanged?.();
    return nextProfile;
  }

  async function runProfileAction(action, body) {
    setError('');
    if (action === 'test-connection') setConnectionTestResult(null);
    setLoading(true);
    try {
      const saved = await saveDocument();
      const result = await api.post(
        `/machine-profiles/${saved.profileId}/${action}`,
        body,
      );
      if (action === 'test-connection') setConnectionTestResult(result);
      const nextProfile =
        action === 'test-connection'
          ? saved
          : result?.profileId
            ? result
            : action === 'validate'
              ? {
                  ...saved,
                  status: result?.valid ? 'structurally_valid' : 'draft',
                  validationResult: result,
                }
              : action === 'verify'
                ? {
                    ...saved,
                    status: result?.valid ? 'live_validated' : saved.status,
                    liveValidationResult: result,
                  }
                : { ...saved, ...result };
      setProfile(nextProfile);
      if (nextProfile.document) {
        setDocument(structuredClone(nextProfile.document));
        setPersistedDocument(JSON.stringify(nextProfile.document));
      }
      setProfiles((current) => [
        nextProfile,
        ...current.filter((item) => item.profileId !== nextProfile.profileId),
      ]);
      onProfilesChanged?.();
      return result;
    } catch (requestError) {
      setError(requestError.message);
      return null;
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    setError('');
    setLoading(true);
    try {
      await saveDocument();
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleQuickCreate() {
    setError('');
    setLoading(true);
    try {
      await saveDocument();
      setStep(1);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  function saveStation() {
    if (!stationEditor.displayName.trim()) {
      setError('Bitte einen Namen für die Station angeben.');
      return;
    }
    const endpoint = normalizedOpcUaEndpoint(
      stationEditor.connection.endpointUrl,
    );
    const duplicate = document.stations.find(
      (station, index) =>
        index !== stationEditorIndex &&
        normalizedOpcUaEndpoint(station.connection?.endpointUrl) === endpoint,
    );
    if (endpoint && duplicate) {
      setError(
        `Der OPC-UA-Endpoint ${stationEditor.connection.endpointUrl.trim()} wird bereits von Station ${duplicate.displayName || duplicate.stationId} verwendet. Jede Station benötigt einen eigenen Endpoint.`,
      );
      return;
    }
    setDocument((current) => {
      const stations = current.stations.slice();
      const normalized = {
        ...stationEditor,
        stationId:
          stationEditor.stationId?.trim() ||
          uniqueStationId(
            stationEditor.displayName,
            current.stations,
            stationEditorIndex,
          ),
      };
      if (
        Number.isInteger(Number(stationEditor.resourceId)) &&
        Number(stationEditor.resourceId) > 0
      )
        normalized.resourceId = Number(stationEditor.resourceId);
      else delete normalized.resourceId;
      if (!normalized.connection?.endpointUrl?.trim())
        normalized.enabled = false;
      if (normalized.parentResourceId)
        normalized.parentResourceId = Number(normalized.parentResourceId);
      else delete normalized.parentResourceId;
      if (stationEditorIndex < 0) stations.push(normalized);
      else stations[stationEditorIndex] = normalized;
      return { ...current, stations };
    });
    setStationEditor(null);
    setError('');
  }

  function saveSignal() {
    if (!signalEditor.key.trim() || !signalEditor.identifier.trim()) {
      setError('Signalschlüssel und Identifier sind erforderlich.');
      return;
    }
    setDocument((current) => {
      const stations = structuredClone(current.stations);
      const signals = stations[signalStationIndex].signals;
      if (signalEditorIndex < 0) signals.push(signalEditor);
      else signals[signalEditorIndex] = signalEditor;
      return { ...current, stations };
    });
    setSignalEditor(null);
    setBrowserNodes([]);
    setBrowserSelection(null);
    setError('');
  }

  async function browseNodes(nodeId = '', stationId) {
    setLoading(true);
    setError('');
    try {
      const station = document.stations.find(
        (item) => item.stationId === stationId,
      );
      if (!station?.connection?.endpointUrl?.trim()) {
        throw new Error(
          'Für diese Station ist noch keine OPC-UA-Verbindung eingetragen.',
        );
      }
      const response = await api.post(
        '/machine-profiles/commissioning/browse',
        {
          connection: station.connection,
          nodeId,
          maxNodes: 100,
        },
      );
      setBrowserNodes(
        Array.isArray(response?.items)
          ? response.items
          : Array.isArray(response?.nodes)
            ? response.nodes
            : [],
      );
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  async function autoMapSignals(stationIndex) {
    const station = document.stations[stationIndex];
    if (!station) return;
    setLoading(true);
    setError('');
    setMappingResult(null);
    try {
      if (!station.connection?.endpointUrl?.trim()) {
        throw new Error(
          'Für diese Station ist noch keine OPC-UA-Verbindung eingetragen.',
        );
      }
      const result = await api.post(
        '/machine-profiles/commissioning/discover-signals',
        {
          connection: station.connection,
          maxDepth: 6,
          maxNodes: 2000,
        },
      );
      let addedCount = 0;
      setDocument((current) => {
        const stations = structuredClone(current.stations);
        const mappedStation = stations[stationIndex];
        const signals = mappedStation.signals;
        const addresses = new Set(
          signals.map((signal) => `${signal.namespace}:${signal.identifier}`),
        );
        const keys = new Set(signals.map((signal) => signal.key));
        for (const suggestion of result.signals || []) {
          const namespace = current.namespaces.find(
            (item) => item.uri === suggestion.namespaceUri,
          );
          if (!namespace || !DATA_TYPES.includes(suggestion.dataType)) continue;
          const address = `${namespace.key}:${suggestion.identifier}`;
          if (addresses.has(address)) continue;
          let key = suggestion.key;
          let suffix = 2;
          while (keys.has(key)) key = `${suggestion.key}${suffix++}`;
          signals.push({
            ...newSignal(namespace.key),
            key,
            role: suggestion.role,
            identifier: suggestion.identifier,
            dataType: suggestion.dataType,
            access: suggestion.access,
            direction: suggestion.direction,
            description: `Automatisch erkannt: ${suggestion.path}`,
          });
          addresses.add(address);
          keys.add(key);
          addedCount += 1;
        }
        const mappedRoles = new Set(signals.map((signal) => signal.role));
        if (SIGNAL_HANDSHAKE_ROLES.every((role) => mappedRoles.has(role))) {
          mappedStation.jobInterface = 'signal_handshake';
          mappedStation.executionModel = 'work_unit_jobs';
          mappedStation.capabilities = [
            ...new Set([
              ...(mappedStation.capabilities || []),
              'production',
              'routing',
              'telemetry',
            ]),
          ];
        }
        return { ...current, stations };
      });
      setMappingResult({ ...result, addedCount, stationId: station.stationId });
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setLoading(false);
    }
  }

  function applyBrowserSelection() {
    if (!browserSelection || !browserConfirmed) return;
    const namespace = document.namespaces.find(
      (item) => item.uri === browserSelection.namespaceUri,
    );
    setSignalEditor((current) => ({
      ...current,
      namespace:
        namespace?.key || browserSelection.namespaceKey || current.namespace,
      identifier:
        browserSelection.identifier ||
        browserSelection.nodeId ||
        current.identifier,
      dataType: DATA_TYPES.includes(browserSelection.dataType)
        ? browserSelection.dataType
        : current.dataType,
    }));
    setBrowserNodes([]);
    setBrowserSelection(null);
    setBrowserConfirmed(false);
  }

  async function activate() {
    const expected = document.machineId;
    if (activationConfirmation !== expected) return;
    if (document.operatingMode === 'control' && !confirmControl) return;
    const result = await runProfileAction('activate', {
      confirmation: activationConfirmation,
      confirmControl,
    });
    if (result) setActivationDialog(false);
  }

  return (
    <div className="machine-profile-backdrop" onMouseDown={onClose}>
      <section
        className="machine-profile-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="machine-profile-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="machine-profile-header">
          <div>
            <span>Maschinen-Inbetriebnahme</span>
            <h2 id="machine-profile-title">
              {document ? profileLabel({ document }) : 'Maschinenprofile'}
            </h2>
          </div>
          <button type="button" aria-label="Schließen" onClick={onClose}>
            ×
          </button>
        </header>

        {!document ? (
          <div className="machine-profile-picker">
            <div className="machine-profile-picker-intro">
              <div>
                <strong>Profile und Prüfergebnisse</strong>
                <p>
                  {canEdit
                    ? 'Bestehende Profile versionieren oder eine neue Maschine schrittweise in Betrieb nehmen.'
                    : 'Profile, Status und vorhandene Prüfergebnisse können ohne Änderungen eingesehen werden.'}
                </p>
              </div>
              {canEdit && (
                <button
                  type="button"
                  className="profile-primary"
                  onClick={startNew}
                >
                  + Neue Maschine konfigurieren
                </button>
              )}
            </div>
            {error && (
              <p role="alert" className="profile-error">
                {error}
              </p>
            )}
            {loading ? (
              <p className="profile-empty">Profile werden geladen…</p>
            ) : profiles.length ? (
              <div className="machine-profile-list">
                {profiles.map((item) => (
                  <button
                    type="button"
                    key={`${item.profileId}-${item.version}`}
                    onClick={() => openProfile(item)}
                  >
                    <div>
                      <strong>{profileLabel(item)}</strong>
                      <span>{item.document?.machineId || item.profileId}</span>
                    </div>
                    <div className="profile-list-meta">
                      <StatusBadge status={item.status} active={item.active} />
                      <small>
                        Version {item.version || '-'}
                        {item.runtimeActiveVersion && !item.active
                          ? ` · Runtime aktiv: V${item.runtimeActiveVersion}`
                          : ''}
                      </small>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <p className="profile-empty">
                Noch keine Maschinenprofile vorhanden.
              </p>
            )}
          </div>
        ) : (
          <>
            <nav className="machine-profile-steps" aria-label="Schritte">
              {STEPS.map((label, index) => (
                <button
                  type="button"
                  key={label}
                  className={step === index ? 'is-active' : ''}
                  onClick={() => selectStep(index)}
                >
                  <span>{index + 1}</span>
                  {label}
                </button>
              ))}
            </nav>
            <div className="machine-profile-content">
              {!canEdit && (
                <p className="profile-readonly">
                  Nur-Lese-Ansicht: Änderungen und Live-Aktionen sind
                  ausschließlich für Administratoren verfügbar.
                </p>
              )}
              {error && (
                <p role="alert" className="profile-error">
                  {error}
                </p>
              )}
              {step === 0 && (
                <MasterDataStep
                  document={document}
                  profile={profile}
                  disabled={!canEdit}
                  loading={loading}
                  onQuickCreate={handleQuickCreate}
                  update={updateDocument}
                />
              )}
              {step === 1 && (
                <StationsStep
                  document={document}
                  disabled={!canEdit}
                  editor={stationEditor}
                  editorIndex={stationEditorIndex}
                  setEditor={setStationEditor}
                  setEditorIndex={setStationEditorIndex}
                  saveEditor={saveStation}
                  update={setDocument}
                  onTestConnection={testDraftConnection}
                  connectionTestResult={connectionTestResult}
                  loading={loading}
                />
              )}
              {step === 2 && (
                <SignalsStep
                  document={document}
                  disabled={!canEdit}
                  stationIndex={signalStationIndex}
                  setStationIndex={setSignalStationIndex}
                  editor={signalEditor}
                  editorIndex={signalEditorIndex}
                  setEditor={setSignalEditor}
                  setEditorIndex={setSignalEditorIndex}
                  saveEditor={saveSignal}
                  update={setDocument}
                  browseNodes={browseNodes}
                  nodes={browserNodes}
                  selection={browserSelection}
                  setSelection={setBrowserSelection}
                  confirmed={browserConfirmed}
                  setConfirmed={setBrowserConfirmed}
                  applySelection={applyBrowserSelection}
                  autoMapSignals={autoMapSignals}
                  mappingResult={mappingResult}
                  loading={loading}
                />
              )}
              {step === 3 && (
                <SummaryStep
                  profile={profile}
                  document={document}
                  canEdit={canEdit}
                  loading={loading}
                  changeSummary={changeSummary}
                  setChangeSummary={setChangeSummary}
                  onSave={handleSave}
                  onValidate={() => runProfileAction('validate')}
                  onVerify={() => runProfileAction('verify')}
                  onActivate={() => {
                    setActivationConfirmation('');
                    setConfirmControl(false);
                    setActivationDialog(true);
                  }}
                  onDeactivate={() => runProfileAction('deactivate')}
                />
              )}
            </div>
            <footer className="machine-profile-footer">
              <button
                type="button"
                onClick={() =>
                  document && profile
                    ? (setDocument(null), setProfile(null))
                    : onClose()
                }
              >
                {profile ? 'Zur Profilübersicht' : 'Abbrechen'}
              </button>
              <div>
                <button
                  type="button"
                  disabled={step === 0}
                  onClick={() => selectStep(step - 1)}
                >
                  Zurück
                </button>
                {step < 3 && (
                  <button
                    type="button"
                    className="profile-primary"
                    onClick={() => selectStep(step + 1)}
                  >
                    Weiter
                  </button>
                )}
              </div>
            </footer>
          </>
        )}
      </section>

      {activationDialog && (
        <div
          className="profile-confirm-backdrop"
          onMouseDown={() => setActivationDialog(false)}
        >
          <div
            className="profile-confirm-dialog"
            role="alertdialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <span>Aktivierung bestätigen</span>
            <h3>Profil produktiv schalten?</h3>
            <p>
              Geben Sie die technische ID <strong>{document.machineId}</strong>{' '}
              ein. Die Aktivierung kann die laufende Maschinenkonfiguration
              ersetzen.
            </p>
            <Field
              label="Bestätigung"
              value={activationConfirmation}
              onChange={setActivationConfirmation}
            />
            <label className="profile-check">
              <input
                type="checkbox"
                checked={confirmControl}
                onChange={(event) => setConfirmControl(event.target.checked)}
              />{' '}
              Ich bestätige ausdrücklich, dass Steuerzugriffe nur nach
              technischer und sicherheitsbezogener Freigabe erfolgen dürfen.
            </label>
            <div>
              <button type="button" onClick={() => setActivationDialog(false)}>
                Abbrechen
              </button>
              <button
                type="button"
                className="profile-danger"
                disabled={
                  activationConfirmation !== document.machineId ||
                  (document.operatingMode === 'control' && !confirmControl) ||
                  loading
                }
                onClick={activate}
              >
                Jetzt aktivieren
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MasterDataStep({
  document,
  profile,
  disabled,
  loading,
  onQuickCreate,
  update,
}) {
  const effectiveMode = document.operatingMode;
  const modeLabels = {
    observe: 'Beobachten',
    validate: 'Validieren',
    control: 'Steuern',
  };
  const modeDescriptions = {
    observe: 'Nur-Lese-Modus: Keine Schreibzugriffe auf die Maschine.',
    validate:
      'Lesen + Strukturprüfung: Signale werden gelesen und gegen das Profil validiert.',
    control:
      'Vollzugriff: MES kann Maschine steuern und Routing-Kommandos senden.',
  };
  return (
    <Step
      title="1. Anlage anlegen"
      intro="Ein Name genügt. Stationen, IP-Adressen und OPC-UA-Daten können vollständig nachgetragen werden, sobald die Anlage physisch verfügbar ist."
    >
      <div className="profile-mode-note">
        <strong>{profile ? modeLabels[effectiveMode] : 'Entwurf'}</strong>
        <span>
          {profile
            ? modeDescriptions[effectiveMode]
            : 'Die Anlage bleibt offline und führt keine Verbindungs- oder Schreibzugriffe aus.'}
        </span>
      </div>
      <div className="profile-quick-create">
        <Field
          label="Name der gesamten Anlage *"
          value={document.displayName}
          disabled={disabled}
          onChange={(value) => update(['displayName'], value)}
          hint="Zum Beispiel: Lernfabrik 4.0 – Linie C"
        />
        {!disabled && !profile && (
          <button
            type="button"
            className="profile-primary"
            disabled={loading || !document.displayName.trim()}
            onClick={onQuickCreate}
          >
            {loading ? 'Wird angelegt…' : 'Anlage als Entwurf anlegen'}
          </button>
        )}
      </div>
      {profile && (
        <div className="profile-draft-saved" role="status">
          <strong>Entwurf gespeichert</strong>
          <span>
            Die Anlagenstruktur kann jetzt unabhängig vom physischen
            SPS-Zustand ergänzt werden.
          </span>
        </div>
      )}
      <details className="profile-advanced">
        <summary>Weitere Profildaten</summary>
        <div className="profile-form-grid">
        <Field
          label="Technische Maschinen-ID"
          value={document.machineId}
          disabled={disabled || Boolean(profile)}
          onChange={(value) => update(['machineId'], value)}
          hint={
            profile
              ? 'Nach dem Anlegen stabil.'
              : 'Wird beim Anlegen automatisch aus dem Namen erzeugt.'
          }
        />
        <Field
          label="Hersteller"
          value={document.manufacturer || ''}
          disabled={disabled}
          onChange={(value) => update(['manufacturer'], value)}
        />
        <Field
          label="Modell"
          value={document.model || ''}
          disabled={disabled}
          onChange={(value) => update(['model'], value)}
        />
        <Field
          label="Maschinenversion"
          value={document.machineVersion || ''}
          disabled={disabled}
          onChange={(value) => update(['machineVersion'], value)}
        />
        <Field
          label="Standort"
          value={document.location || ''}
          disabled={disabled}
          onChange={(value) => update(['location'], value)}
        />
        <SelectField
          label="Betriebsmodus"
          value={document.operatingMode}
          disabled={disabled || !profile}
          options={['observe', 'validate', 'control']}
          onChange={(value) => {
            update(['operatingMode'], value);
            if (value === 'control') {
              update(
                ['routing'],
                document.routing || { terminalResourceId: 0 },
              );
              update(
                ['routingResultCodes'],
                document.routingResultCodes || {
                  accepted: 0,
                  carrier_unknown: 1,
                  order_missing: 2,
                  wrong_resource: 3,
                  already_completed: 4,
                  internal_error: 5,
                },
              );
            }
          }}
        />
        </div>
        <Field
          label="Beschreibung"
          textarea
          value={document.description || ''}
          disabled={disabled}
          onChange={(value) => update(['description'], value)}
        />
      </details>
    </Step>
  );
}

function ConnectionStep({
  document,
  disabled,
  update,
  onTest,
  testResult,
  loading,
}) {
  const connection = document.connection;
  const auth = connection.authentication;
  const security = connection.security;
  function updateNamespace(index, key, value) {
    const namespaces = structuredClone(document.namespaces);
    namespaces[index][key] = value;
    update(['namespaces'], namespaces);
  }
  function addNamespace() {
    update(
      ['namespaces'],
      [
        ...document.namespaces,
        { key: `namespace${document.namespaces.length + 1}`, uri: '' },
      ],
    );
  }
  function removeNamespace(index) {
    update(
      ['namespaces'],
      document.namespaces.filter((_, itemIndex) => itemIndex !== index),
    );
  }
  return (
    <Step
      title="1. Mit OPC UA verbinden"
      intro="Endpoint eingeben und verbinden. Der Test liest die verfügbare OPC-UA-Struktur automatisch ein."
    >
      <div className="profile-form-grid">
        <Field
          label="Endpoint URL *"
          value={connection.endpointUrl || ''}
          disabled={disabled}
          onChange={(value) => update(['connection', 'endpointUrl'], value)}
          hint="z. B. opc.tcp://192.168.1.20:4840"
        />
      </div>
      {!disabled && (
        <div className="profile-action-row">
          <button
            type="button"
            className="profile-primary"
            disabled={loading || !connection.endpointUrl}
            onClick={onTest}
          >
            {loading ? 'Verbindung wird geprüft…' : 'Verbinden'}
          </button>
          <small>Nur lesend, es wird noch kein Profil gespeichert.</small>
        </div>
      )}
      {testResult && <ConnectionTestResult result={testResult} />}
      <details className="profile-advanced">
        <summary>Erweiterte Verbindungseinstellungen</summary>
        <div className="profile-form-grid">
        <Field
          label="Application Name"
          value={connection.applicationName}
          disabled={disabled}
          onChange={(value) => update(['connection', 'applicationName'], value)}
        />
        <SelectField
          label="Authentifizierung"
          value={auth.type}
          disabled={disabled}
          options={['anonymous', 'username', 'certificate']}
          onChange={(value) =>
            update(['connection', 'authentication', 'type'], value)
          }
        />
        <SelectField
          label="Security Mode"
          value={security.mode}
          disabled={disabled}
          options={['None', 'Sign', 'SignAndEncrypt']}
          onChange={(value) =>
            update(['connection', 'security', 'mode'], value)
          }
        />
        <SelectField
          label="Security Policy"
          value={security.policy}
          disabled={disabled}
          options={[
            'None',
            'Basic256Sha256',
            'Aes128_Sha256_RsaOaep',
            'Aes256_Sha256_RsaPss',
          ]}
          onChange={(value) =>
            update(['connection', 'security', 'policy'], value)
          }
        />
        {auth.type === 'username' && (
          <>
            <Field
              label="Benutzername Env"
              value={auth.usernameEnv || ''}
              disabled={disabled}
              onChange={(value) =>
                update(['connection', 'authentication', 'usernameEnv'], value)
              }
            />
            <Field
              label="Passwort Env"
              value={auth.passwordEnv || ''}
              disabled={disabled}
              onChange={(value) =>
                update(['connection', 'authentication', 'passwordEnv'], value)
              }
            />
          </>
        )}
        {(auth.type === 'certificate' || security.mode !== 'None') && (
          <>
            <Field
              label="Zertifikatspfad Env"
              value={
                security.certificatePathEnv || auth.certificatePathEnv || ''
              }
              disabled={disabled}
              onChange={(value) => {
                update(['connection', 'security', 'certificatePathEnv'], value);
                if (auth.type === 'certificate')
                  update(
                    ['connection', 'authentication', 'certificatePathEnv'],
                    value,
                  );
              }}
            />
            <Field
              label="Private-Key-Pfad Env"
              value={security.privateKeyPathEnv || ''}
              disabled={disabled}
              onChange={(value) =>
                update(['connection', 'security', 'privateKeyPathEnv'], value)
              }
            />
          </>
        )}
        <Field
          type="number"
          label="Verbindungs-Timeout (ms)"
          value={connection.connectionTimeoutMs}
          disabled={disabled}
          onChange={(value) =>
            update(['connection', 'connectionTimeoutMs'], Number(value))
          }
        />
        <Field
          type="number"
          label="Session-Timeout (ms)"
          value={connection.sessionTimeoutMs}
          disabled={disabled}
          onChange={(value) =>
            update(['connection', 'sessionTimeoutMs'], Number(value))
          }
        />
        <label className="profile-check">
          <input
            type="checkbox"
            checked={connection.reconnect.enabled}
            disabled={disabled}
            onChange={(event) =>
              update(
                ['connection', 'reconnect', 'enabled'],
                event.target.checked,
              )
            }
          />{' '}
          Automatisch neu verbinden
        </label>
        <Field
          type="number"
          label="Reconnect Start (ms)"
          value={connection.reconnect.initialDelayMs}
          disabled={disabled}
          onChange={(value) =>
            update(['connection', 'reconnect', 'initialDelayMs'], Number(value))
          }
        />
        <Field
          type="number"
          label="Reconnect Maximum (ms)"
          value={connection.reconnect.maximumDelayMs}
          disabled={disabled}
          onChange={(value) =>
            update(['connection', 'reconnect', 'maximumDelayMs'], Number(value))
          }
        />
        <Field
          type="number"
          label="Backoff-Faktor"
          value={connection.reconnect.backoffMultiplier}
          disabled={disabled}
          onChange={(value) =>
            update(
              ['connection', 'reconnect', 'backoffMultiplier'],
              Number(value),
            )
          }
        />
        <Field
          type="number"
          label="Maximale Versuche"
          value={connection.reconnect.maxAttempts ?? ''}
          disabled={disabled}
          onChange={(value) =>
            update(
              ['connection', 'reconnect', 'maxAttempts'],
              value === '' ? undefined : Number(value),
            )
          }
        />
        </div>
        <div className="profile-namespace-editor">
        <div className="profile-section-heading">
          <span>Namespace-URIs</span>
          {!disabled && (
            <button type="button" onClick={addNamespace}>
              + Namespace
            </button>
          )}
        </div>
        {document.namespaces.map((namespace, index) => (
          <div className="profile-form-grid" key={`${namespace.key}-${index}`}>
            <Field
              label="Schlüssel"
              value={namespace.key}
              disabled={disabled}
              onChange={(value) => updateNamespace(index, 'key', value)}
            />
            <div className="profile-namespace-uri">
              <Field
                label="URI"
                value={namespace.uri}
                disabled={disabled}
                onChange={(value) => updateNamespace(index, 'uri', value)}
              />
              {!disabled && document.namespaces.length > 1 && (
                <button type="button" onClick={() => removeNamespace(index)}>
                  Entfernen
                </button>
              )}
            </div>
          </div>
        ))}
        </div>
      </details>
    </Step>
  );
}

function ConnectionTestResult({ result }) {
  const stations = Array.isArray(result.stations) ? result.stations : [result];
  return (
    <div
      className={`profile-connection-result ${result.valid ? 'is-success' : 'is-error'}`}
      role={result.valid ? 'status' : 'alert'}
    >
      <strong>
        Verbindungstest {result.valid ? 'erfolgreich' : 'fehlgeschlagen'}
      </strong>
      {result.message && <p>{result.message}</p>}
      <div>
        {stations.map((station, index) => (
          <article key={station.stationId || index}>
            <span>{station.stationId || 'Station'}</span>
            <strong>{station.valid ? 'Erreichbar' : 'Nicht erreichbar'}</strong>
            {station.endpoint && <code>{station.endpoint}</code>}
            {station.error && <small>{station.error}</small>}
            {station.valid && (
              <small>
                Session aufgebaut, NamespaceArray gelesen (
                {station.namespaceArray?.length || 0} Einträge)
              </small>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

function StationsStep({
  document,
  disabled,
  editor,
  editorIndex,
  setEditor,
  setEditorIndex,
  saveEditor,
  update,
  onTestConnection,
  connectionTestResult,
  loading,
}) {
  const setup = profileSetupSummary(document);

  function edit(station, index) {
    setEditor(structuredClone(station));
    setEditorIndex(index);
  }
  function remove(index) {
    update((current) => ({
      ...current,
      stations: current.stations.filter((_, itemIndex) => itemIndex !== index),
    }));
  }
  function add() {
    setEditor(newStation());
    setEditorIndex(-1);
  }
  return (
    <Step
      title="2. SPS-Verbindungen"
      intro="Stationen dürfen zunächst nur geplant werden. Später benötigt das MES je Station nur die SPS-Verbindung – RFID-Reader, Fördertechnik und Roboter bleiben Aufgabe der SPS."
    >
      <div className="profile-setup-summary">
        <article>
          <span>Stationen</span>
          <strong>{setup.stationCount}</strong>
        </article>
        <article>
          <span>Endpoint eingetragen</span>
          <strong>{setup.endpointCount}</strong>
        </article>
        <article>
          <span>Daten zugeordnet</span>
          <strong>{setup.mappedCount}</strong>
        </article>
      </div>
      <div className="profile-section-heading">
        <span>Stationsstruktur</span>
        {!disabled && (
          <button type="button" onClick={add}>
            + Geplante Station
          </button>
        )}
      </div>
      <div className="profile-station-list">
        {document.stations.map((station, index) => {
          const state = stationSetupState(station);
          return (
            <article key={`${station.stationId || 'planned'}-${index}`}>
              <div>
                <strong>{station.displayName || 'Unbenannte Station'}</strong>
                <span>
                  {station.stationId || 'ID wird automatisch erzeugt'}
                  {station.resourceId ? ` · R${station.resourceId}` : ''}
                </span>
                <small>
                  {station.connection?.endpointUrl || 'Noch kein OPC-UA-Endpoint'}
                </small>
              </div>
              <div>
                <span className={`profile-setup-state is-${state.key}`}>
                  {state.label}
                </span>
                <button type="button" onClick={() => edit(station, index)}>
                  {disabled ? 'Ansehen' : 'Ergänzen'}
                </button>
                {!disabled && (
                  <button type="button" onClick={() => remove(index)}>
                    Entfernen
                  </button>
                )}
              </div>
            </article>
          );
        })}
        {!document.stations.length && (
          <div className="profile-empty-state">
            <strong>Noch keine Station geplant</strong>
            <span>
              Das ist für einen Anlagenentwurf in Ordnung. Stationen können
              jederzeit ergänzt werden.
            </span>
          </div>
        )}
      </div>
      {editor && (
        <StationEditor
          station={editor}
          setStation={setEditor}
          disabled={disabled}
          stations={document.stations}
          onCancel={() => setEditor(null)}
          onSave={saveEditor}
          onTestConnection={onTestConnection}
          connectionTestResult={connectionTestResult}
          loading={loading}
          title={editorIndex < 0 ? 'Station hinzufügen' : 'Station bearbeiten'}
        />
      )}
    </Step>
  );
}

function StationEditor({
  station,
  setStation,
  disabled,
  stations,
  onCancel,
  onSave,
  onTestConnection,
  connectionTestResult,
  loading,
  title,
}) {
  const set = (key, value) =>
    setStation((current) => ({ ...current, [key]: value }));
  const connection = emptyMachineConnection(station.connection);
  const setConnection = (path, value) => {
    const next = emptyMachineConnection(connection);
    let target = next;
    for (const key of path.slice(0, -1)) target = target[key];
    target[path.at(-1)] = value;
    set('connection', next);
  };
  return (
    <div className="profile-inline-editor">
      <h4>{title}</h4>
      <p className="profile-editor-intro">
        Nur der Stationsname ist erforderlich. Später wird der OPC-UA-Endpoint
        der SPS ergänzt. Eine separate RFID-Reader- oder Roboter-IP braucht das
        MES nicht.
      </p>
      <div className="profile-form-grid">
        <Field
          label="Stationsname *"
          value={station.displayName}
          disabled={disabled}
          onChange={(value) => set('displayName', value)}
          hint="Zum Beispiel: Presse01"
        />
        <Field
          type="number"
          label="Ressourcen-ID"
          value={station.resourceId}
          disabled={disabled}
          onChange={(value) => set('resourceId', value)}
          hint="Erst vor der Aktivierung erforderlich."
        />
        <Field
          label="Technische Stations-ID"
          value={station.stationId}
          disabled={disabled}
          onChange={(value) => set('stationId', value)}
          hint="Wird automatisch aus dem Stationsnamen erzeugt."
        />
        <Field
          label="OPC-UA-Endpoint"
          value={connection.endpointUrl}
          disabled={disabled}
          onChange={(value) => setConnection(['endpointUrl'], value)}
          hint="Optional, z. B. opc.tcp://192.168.0.30:4840"
        />
      </div>
      {!disabled && (
        <div className="profile-action-row">
          <button
            type="button"
            disabled={loading || !connection.endpointUrl}
            onClick={() => onTestConnection(connection)}
          >
            {loading ? 'Verbindung wird geprüft…' : 'Stationsverbindung testen'}
          </button>
          <small>Nur diese Station wird lesend geprüft.</small>
        </div>
      )}
      {connectionTestResult?.endpoint === connection.endpointUrl && (
        <ConnectionTestResult result={connectionTestResult} />
      )}
      <details className="profile-advanced">
        <summary>Weitere Stationseinstellungen</summary>
        <div className="profile-form-grid">
        <SelectField
          label="Übergeordnete Ressource"
          value={station.parentResourceId || ''}
          disabled={disabled}
          options={[
            '',
            ...stations
              .filter(
                (item) =>
                  Number(item.resourceId) > 0 &&
                  item.resourceId !== Number(station.resourceId),
              )
              .map((item) => item.resourceId),
          ]}
          labels={[
            'Keine',
            ...stations
              .filter(
                (item) =>
                  Number(item.resourceId) > 0 &&
                  item.resourceId !== Number(station.resourceId),
              )
              .map((item) => `R${item.resourceId} · ${item.displayName}`),
          ]}
          onChange={(value) =>
            set('parentResourceId', value ? Number(value) : undefined)
          }
        />
        <SelectField
          label="Equipment-Level"
          value={station.equipmentLevel || 'work_unit'}
          disabled={disabled}
          options={['machine', 'work_unit', 'component']}
          onChange={(value) => set('equipmentLevel', value)}
        />
        <SelectField
          label="Ressourcentyp"
          value={station.resourceType}
          disabled={disabled}
          options={['production', 'inventory', 'storage', 'hybrid']}
          onChange={(value) => set('resourceType', value)}
        />
        <SelectField
          label="Ausführungsmodell"
          value={station.executionModel || 'machine_job'}
          disabled={disabled}
          options={['machine_job', 'work_unit_jobs']}
          onChange={(value) => set('executionModel', value)}
        />
        <SelectField
          label="Job-Schnittstelle"
          value={station.jobInterface || 'telemetry_only'}
          disabled={disabled}
          options={['signal_handshake', 'job_control', 'telemetry_only']}
          onChange={(value) => set('jobInterface', value)}
        />
        </div>
        <Field
          label="Beschreibung"
          textarea
          value={station.description || ''}
          disabled={disabled}
          onChange={(value) => set('description', value)}
        />
        <fieldset>
        <legend>Fähigkeiten</legend>
        <div className="profile-checkbox-grid">
          {CAPABILITIES.map((capability) => (
            <label key={capability}>
              <input
                type="checkbox"
                disabled={disabled}
                checked={(station.capabilities || []).includes(capability)}
                onChange={(event) =>
                  set(
                    'capabilities',
                    event.target.checked
                      ? [...(station.capabilities || []), capability]
                      : (station.capabilities || []).filter(
                          (item) => item !== capability,
                        ),
                  )
                }
              />{' '}
              {capability}
            </label>
          ))}
        </div>
        </fieldset>
        <label className="profile-check">
        <input
          type="checkbox"
          disabled={
            disabled ||
            !connection.endpointUrl?.trim() ||
            !(Number(station.resourceId) > 0)
          }
          checked={station.enabled}
          title={
            connection.endpointUrl && Number(station.resourceId) > 0
              ? undefined
              : 'Endpoint und Ressourcen-ID vor der Aktivierung ergänzen'
          }
          onChange={(event) => set('enabled', event.target.checked)}
        />{' '}
        Station aktiviert
        </label>
        <div className="profile-section-heading">
          <span>Erweiterte OPC-UA-Verbindung</span>
        </div>
        <StationConnectionFields
          connection={connection}
          disabled={disabled}
          hideEndpoint
          onChange={(connection) => set('connection', connection)}
        />
      </details>
      <div className="profile-editor-actions">
        <button type="button" onClick={onCancel}>
          Schließen
        </button>
        {!disabled && (
          <button type="button" className="profile-primary" onClick={onSave}>
            Übernehmen
          </button>
        )}
      </div>
    </div>
  );
}

function StationConnectionFields({ connection, disabled, onChange, hideEndpoint = false }) {
  function set(path, value) {
    const next = emptyMachineConnection(connection);
    let target = next;
    for (const key of path.slice(0, -1)) target = target[key];
    target[path.at(-1)] = value;
    onChange(next);
  }
  const security = connection.security || {};
  const authentication = connection.authentication || {};
  const reconnect = connection.reconnect || {};
  function setCertificateReference(value) {
    const next = emptyMachineConnection(connection);
    next.security.certificatePathEnv = value;
    if (next.authentication.type === 'certificate')
      next.authentication.certificatePathEnv = value;
    onChange(next);
  }
  return (
    <div className="profile-form-grid">
      {!hideEndpoint && <Field
        label="Endpoint URL *"
        value={connection.endpointUrl || ''}
        disabled={disabled}
        onChange={(value) => set(['endpointUrl'], value)}
        hint="Eigener Endpoint dieser Station"
      />}
      <Field
        label="Application Name"
        value={connection.applicationName || ''}
        disabled={disabled}
        onChange={(value) => set(['applicationName'], value)}
      />
      <SelectField
        label="Security Mode"
        value={security.mode || 'None'}
        disabled={disabled}
        options={['None', 'Sign', 'SignAndEncrypt']}
        onChange={(value) => set(['security', 'mode'], value)}
      />
      <SelectField
        label="Security Policy"
        value={security.policy || 'None'}
        disabled={disabled}
        options={[
          'None',
          'Basic256Sha256',
          'Aes128_Sha256_RsaOaep',
          'Aes256_Sha256_RsaPss',
        ]}
        onChange={(value) => set(['security', 'policy'], value)}
      />
      <SelectField
        label="Authentifizierung"
        value={authentication.type || 'anonymous'}
        disabled={disabled}
        options={['anonymous', 'username', 'certificate']}
        onChange={(value) => set(['authentication', 'type'], value)}
      />
      {authentication.type === 'username' && (
        <>
          <Field
            label="Benutzername Env"
            value={authentication.usernameEnv || ''}
            disabled={disabled}
            onChange={(value) => set(['authentication', 'usernameEnv'], value)}
          />
          <Field
            label="Passwort Env"
            value={authentication.passwordEnv || ''}
            disabled={disabled}
            onChange={(value) => set(['authentication', 'passwordEnv'], value)}
          />
        </>
      )}
      {(authentication.type === 'certificate' || security.mode !== 'None') && (
        <>
          <Field
            label="Zertifikatspfad Env"
            value={
              security.certificatePathEnv ||
              authentication.certificatePathEnv ||
              ''
            }
            disabled={disabled}
            onChange={setCertificateReference}
          />
          <Field
            label="Private-Key-Pfad Env"
            value={security.privateKeyPathEnv || ''}
            disabled={disabled}
            onChange={(value) => set(['security', 'privateKeyPathEnv'], value)}
          />
        </>
      )}
      <Field
        type="number"
        label="Verbindungs-Timeout (ms)"
        value={connection.connectionTimeoutMs}
        disabled={disabled}
        onChange={(value) => set(['connectionTimeoutMs'], Number(value))}
      />
      <Field
        type="number"
        label="Session-Timeout (ms)"
        value={connection.sessionTimeoutMs}
        disabled={disabled}
        onChange={(value) => set(['sessionTimeoutMs'], Number(value))}
      />
      <label className="profile-check">
        <input
          type="checkbox"
          checked={Boolean(reconnect.enabled)}
          disabled={disabled}
          onChange={(event) =>
            set(['reconnect', 'enabled'], event.target.checked)
          }
        />{' '}
        Automatisch neu verbinden
      </label>
      <Field
        type="number"
        label="Reconnect Start (ms)"
        value={reconnect.initialDelayMs}
        disabled={disabled}
        onChange={(value) =>
          set(['reconnect', 'initialDelayMs'], Number(value))
        }
      />
      <Field
        type="number"
        label="Reconnect Maximum (ms)"
        value={reconnect.maximumDelayMs}
        disabled={disabled}
        onChange={(value) =>
          set(['reconnect', 'maximumDelayMs'], Number(value))
        }
      />
      <Field
        type="number"
        label="Backoff-Faktor"
        value={reconnect.backoffMultiplier}
        disabled={disabled}
        onChange={(value) =>
          set(['reconnect', 'backoffMultiplier'], Number(value))
        }
      />
      <Field
        type="number"
        label="Maximale Versuche"
        value={reconnect.maxAttempts ?? ''}
        disabled={disabled}
        onChange={(value) =>
          set(
            ['reconnect', 'maxAttempts'],
            value === '' ? undefined : Number(value),
          )
        }
      />
    </div>
  );
}

function SignalsStep({
  document,
  disabled,
  stationIndex,
  setStationIndex,
  editor,
  editorIndex,
  setEditor,
  setEditorIndex,
  saveEditor,
  update,
  browseNodes,
  nodes,
  selection,
  setSelection,
  confirmed,
  setConfirmed,
  applySelection,
  autoMapSignals,
  mappingResult,
  loading,
}) {
  const station = document.stations[stationIndex];
  if (!station)
    return (
      <Step
        title="3. Stationssignale"
        intro="Legen Sie zuerst mindestens eine Station an."
      >
        <p className="profile-empty">Keine Station verfügbar.</p>
      </Step>
    );
  function edit(signal, index) {
    setEditor(structuredClone(signal));
    setEditorIndex(index);
    setSelection(null);
  }
  function add() {
    setEditor(newSignal(document.namespaces[0]?.key));
    setEditorIndex(-1);
    setSelection(null);
  }
  function remove(index) {
    update((current) => {
      const stations = structuredClone(current.stations);
      stations[stationIndex].signals.splice(index, 1);
      return { ...current, stations };
    });
  }
  return (
    <Step
      title="3. Daten zuordnen"
      intro="Sobald eine SPS erreichbar ist, erkennt das MES DB151- und stMES-Signale automatisch. RFID und Robotersteuerung bleiben intern in der SPS; das MES benötigt nur Prozessauftrag, Status und Ergebnis."
    >
      <div className="profile-section-heading">
        <SelectField
          label="Station"
          value={stationIndex}
          options={document.stations.map((_, index) => index)}
          labels={document.stations.map(
            (item) => item.displayName || item.stationId,
          )}
          onChange={(value) => {
            setStationIndex(Number(value));
            setEditor(null);
          }}
        />
        {!disabled && (
          <div className="profile-heading-actions">
            <button
              type="button"
              className="profile-primary"
              disabled={loading || !station.connection?.endpointUrl?.trim()}
              onClick={() => autoMapSignals(stationIndex)}
            >
              {loading ? 'Signale werden erkannt…' : 'Signale automatisch erkennen'}
            </button>
            <button type="button" onClick={add}>
              + Manuell hinzufügen
            </button>
          </div>
        )}
      </div>
      {!station.connection?.endpointUrl?.trim() && (
        <div className="profile-planned-note">
          <strong>{station.displayName} ist noch geplant</strong>
          <span>
            Tragen Sie unter „SPS-Verbindungen“ später den Endpoint ein. Bis
            dahin sind keine technischen Daten notwendig.
          </span>
        </div>
      )}
      {mappingResult?.stationId === station.stationId && (
        <div className="profile-mapping-result" role="status">
          <strong>{mappingResult.addedCount} Signale ergänzt</strong>
          <span>
            {mappingResult.mappedCount} bekannte Zuordnungen erkannt,{' '}
            {mappingResult.unmappedCount} Variablen bleiben zur manuellen Prüfung.
          </span>
          <small>Vorhandene und manuell geänderte Signale wurden nicht überschrieben.</small>
        </div>
      )}
      <div className="profile-signal-table">
        {station.signals.map((signal, index) => (
          <article key={`${signal.key}-${index}`}>
            <div>
              <strong>{signal.key}</strong>
              <span>{signal.role}</span>
            </div>
            <code>
              {signal.namespace}:{signal.identifier}
            </code>
            <div>
              <small>
                {signal.dataType} · {signal.direction} · {signal.access}
              </small>
              <button type="button" onClick={() => edit(signal, index)}>
                {disabled ? 'Ansehen' : 'Bearbeiten'}
              </button>
              {!disabled && (
                <button type="button" onClick={() => remove(index)}>
                  Entfernen
                </button>
              )}
            </div>
          </article>
        ))}
        {!station.signals.length && (
          <p className="profile-empty">Noch keine Signale zugeordnet.</p>
        )}
      </div>
      {editor && (
        <div className="profile-inline-editor">
          <h4>{editorIndex < 0 ? 'Signal hinzufügen' : 'Signal bearbeiten'}</h4>
          <div className="profile-form-grid">
            <Field
              label="Signalschlüssel *"
              value={editor.key}
              disabled={disabled}
              onChange={(value) =>
                setEditor((current) => ({ ...current, key: value }))
              }
            />
            <SelectField
              label="MachineSignalRole"
              value={editor.role}
              disabled={disabled}
              options={MACHINE_SIGNAL_ROLES}
              onChange={(value) =>
                setEditor((current) => ({ ...current, role: value }))
              }
            />
          </div>
          <details className="profile-advanced">
            <summary>Technische Signaleinstellungen</summary>
            <div className="profile-form-grid">
            <SelectField
              label="Namespace"
              value={editor.namespace}
              disabled={disabled}
              options={document.namespaces.map((item) => item.key)}
              onChange={(value) =>
                setEditor((current) => ({ ...current, namespace: value }))
              }
            />
            <Field
              label="Identifier *"
              value={editor.identifier}
              disabled={disabled}
              onChange={(value) =>
                setEditor((current) => ({ ...current, identifier: value }))
              }
            />
            <SelectField
              label="Datentyp"
              value={editor.dataType}
              disabled={disabled}
              options={DATA_TYPES}
              onChange={(value) =>
                setEditor((current) => ({ ...current, dataType: value }))
              }
            />
            <SelectField
              label="Zugriff"
              value={editor.access}
              disabled={disabled}
              options={['read', 'write', 'readWrite']}
              onChange={(value) =>
                setEditor((current) => ({ ...current, access: value }))
              }
            />
            <SelectField
              label="Richtung"
              value={editor.direction}
              disabled={disabled}
              options={['machineToMes', 'mesToMachine']}
              onChange={(value) =>
                setEditor((current) => ({ ...current, direction: value }))
              }
            />
            <SelectField
              label="Trigger"
              value={editor.event?.trigger || 'change'}
              disabled={disabled}
              options={['change', 'rising', 'falling']}
              onChange={(value) =>
                setEditor((current) => ({
                  ...current,
                  event: { trigger: value },
                }))
              }
            />
            <label className="profile-check">
              <input
                type="checkbox"
                disabled={disabled}
                checked={editor.required}
                onChange={(event) =>
                  setEditor((current) => ({
                    ...current,
                    required: event.target.checked,
                  }))
                }
              />{' '}
              Pflichtsignal
            </label>
            <label className="profile-check">
              <input
                type="checkbox"
                disabled={disabled}
                checked={Boolean(editor.scaling)}
                onChange={(event) =>
                  setEditor((current) =>
                    event.target.checked
                      ? { ...current, scaling: { factor: 1, offset: 0 } }
                      : Object.fromEntries(
                          Object.entries(current).filter(
                            ([key]) => key !== 'scaling',
                          ),
                        ),
                  )
                }
              />{' '}
              Skalierung verwenden
            </label>
            {editor.scaling && (
              <>
                <Field
                  type="number"
                  label="Skalierungsfaktor"
                  value={editor.scaling.factor}
                  disabled={disabled}
                  onChange={(value) =>
                    setEditor((current) => ({
                      ...current,
                      scaling: { ...current.scaling, factor: Number(value) },
                    }))
                  }
                />
                <Field
                  type="number"
                  label="Offset"
                  value={editor.scaling.offset}
                  disabled={disabled}
                  onChange={(value) =>
                    setEditor((current) => ({
                      ...current,
                      scaling: { ...current.scaling, offset: Number(value) },
                    }))
                  }
                />
              </>
            )}
            </div>
            <Field
              label="Beschreibung"
              textarea
              value={editor.description || ''}
              disabled={disabled}
              onChange={(value) =>
                setEditor((current) => ({ ...current, description: value }))
              }
            />
          </details>
          {editor.identifier && (
            <div className="profile-node-mapping" role="status">
              <span>Verknüpfter OPC-UA-Node</span>
              <code>{editor.namespace}:{editor.identifier}</code>
            </div>
          )}
          {!disabled && (
            <div className="profile-browser">
              <div>
                <strong>OPC-UA-Node auswählen</strong>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => browseNodes('', station.stationId)}
                >
                  Objektwurzel öffnen
                </button>
              </div>
              {nodes.map((node, index) => (
                <label key={node.nodeId || node.identifier || index}>
                  {node.nodeClass === 'Variable' ? (
                    <input
                      type="radio"
                      name="browser-node"
                      checked={selection === node}
                      onChange={() => {
                        setSelection(node);
                        setConfirmed(true);
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      disabled={loading}
                      onClick={() =>
                        browseNodes(node.nodeId, station.stationId)
                      }
                    >
                      Öffnen
                    </button>
                  )}
                  <span>
                    <strong>
                      {node.displayName ||
                        node.browseName ||
                        node.identifier ||
                        node.nodeId}
                    </strong>
                    <code>
                      {node.nodeId || node.identifier} ·{' '}
                      {node.dataType || node.nodeClass} · {node.access || '-'}
                    </code>
                  </span>
                </label>
              ))}
              {selection && (
                <div className="profile-browser-confirm">
                  <code>{selection.nodeId}</code>
                  <button
                    type="button"
                    disabled={!confirmed}
                    onClick={applySelection}
                  >
                    Mapping übernehmen
                  </button>
                </div>
              )}
            </div>
          )}
          <div className="profile-editor-actions">
            <button type="button" onClick={() => setEditor(null)}>
              Schließen
            </button>
            {!disabled && (
              <button
                type="button"
                className="profile-primary"
                onClick={saveEditor}
              >
                Übernehmen
              </button>
            )}
          </div>
        </div>
      )}
    </Step>
  );
}

function SummaryStep({
  profile,
  document,
  canEdit,
  loading,
  changeSummary,
  setChangeSummary,
  onSave,
  onValidate,
  onVerify,
  onActivate,
  onDeactivate,
}) {
  const localErrors = validateProfileDraft(document);
  const setup = profileSetupSummary(document);
  const activationReady =
    setup.stationCount > 0 &&
    setup.endpointCount === setup.stationCount &&
    document.stations.every(
      (station) =>
        station.stationId?.trim() && Number(station.resourceId) > 0,
    ) &&
    document.namespaces.some((namespace) => namespace.uri?.trim());
  const requiredSignals = document.stations.flatMap((station) =>
    station.signals
      .filter((signal) => signal.required)
      .map((signal) => `${station.stationId}.${signal.key}`),
  );
  const writeSignals = document.stations.flatMap((station) =>
    station.signals
      .filter(
        (signal) =>
          signal.direction === 'mesToMachine' || signal.access !== 'read',
      )
      .map((signal) => `${station.stationId}.${signal.key}`),
  );
  const liveResult = profile?.liveValidationResult;
  return (
    <Step
      title="4. Prüfen & aktivieren"
      intro="Der Entwurf kann jederzeit gespeichert werden. Erst die Aktivierung verlangt eine vollständig eingerichtete und geprüfte Anlage."
    >
      <div className="profile-summary">
        <article>
          <span>Maschine</span>
          <strong>{document.displayName || '-'}</strong>
          <small>{document.machineId || '-'}</small>
        </article>
        <article>
          <span>Umfang</span>
          <strong>{document.stations.length} Stationen</strong>
          <small>
            {setup.endpointCount} mit Endpoint · {setup.mappedCount} mit Daten
          </small>
        </article>
        <article>
          <span>Modus</span>
          <strong>{document.operatingMode}</strong>
          <small>Transport: {document.transport}</small>
        </article>
        <article>
          <span>Status</span>
          <StatusBadge status={profile?.status} active={profile?.active} />
          <small>Version {profile?.version || 'noch nicht gespeichert'}</small>
        </article>
      </div>
      <details className="profile-advanced">
        <summary>Prüfdetails</summary>
        <div className="profile-result-grid">
        <ResultCard
          title="Dokumentvalidierung"
          result={profile?.validationResult}
        />
        <ResultCard
          title="Live-Verifikation"
          result={profile?.liveValidationResult}
        />
        <article>
          <span>Neustart</span>
          <strong>
            {profile?.restartRequired ? 'Erforderlich' : 'Nicht gemeldet'}
          </strong>
          <small>Nach Aktivierung Betriebszustand prüfen.</small>
        </article>
        </div>
        <div className="profile-preview">
        <span>Konfigurationsübersicht</span>
        <p>
          <strong>Stations-Endpoints:</strong>{' '}
          {document.stations
            .map(
              (station) =>
                `${station.stationId}: ${station.connection?.endpointUrl || document.connection.endpointUrl || 'fehlt'}`,
            )
            .join(', ') || 'fehlt'}
        </p>
        <p>
          <strong>Hierarchie:</strong>{' '}
          {document.stations
            .map(
              (station) =>
                `${station.stationId || station.displayName} (${station.resourceId ? `R${station.resourceId}` : 'Ressource offen'}${station.parentResourceId ? ` unter R${station.parentResourceId}` : ''})`,
            )
            .join(', ') || 'fehlt'}
        </p>
        <p>
          <strong>Produktrouten:</strong>{' '}
          werden nach der Stationsfreigabe separat unter „Routenplanung“
          angelegt.
        </p>
        <p>
          <strong>Pflichtsignale:</strong>{' '}
          {requiredSignals.join(', ') || 'keine'}
        </p>
        <p>
          <strong>Schreibsignale:</strong> {writeSignals.join(', ') || 'keine'}
        </p>
        <p>
          <strong>Live fehlend:</strong>{' '}
          {liveResult?.missingRequiredSignals?.join(', ') || 'nicht gemeldet'}
        </p>
        <p>
          <strong>Ungültige Datentypen:</strong>{' '}
          {liveResult?.invalidDataTypes?.join(', ') || 'nicht gemeldet'}
        </p>
        </div>
      </details>
      {localErrors.length > 0 && (
        <div className="profile-error">
          <strong>Vor der Aktivierung zu klären:</strong>
          <ul>
            {localErrors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      )}
      {canEdit && (
        <>
          <div className="profile-final-actions">
            <button
              type="button"
              className="profile-primary"
              disabled={loading}
              onClick={onSave}
            >
              Entwurf speichern
            </button>
          </div>
          <details className="profile-advanced">
            <summary>Validierung und Aktivierung</summary>
            <Field
              label="Änderungszusammenfassung"
              value={changeSummary}
              onChange={setChangeSummary}
            />
            <div className="profile-final-actions">
              <button
                type="button"
                disabled={loading || !profile}
                onClick={onValidate}
              >
                Validieren
              </button>
              <button
                type="button"
                disabled={loading || !profile}
                onClick={onVerify}
              >
                Live verifizieren
              </button>
              {profile?.active || profile?.runtimeActiveVersion ? (
                <button
                  type="button"
                  disabled={loading}
                  className="profile-danger-outline"
                  onClick={onDeactivate}
                >
                  Runtime-Version deaktivieren
                </button>
              ) : (
                <button
                  type="button"
                  disabled={loading || !profile || !activationReady}
                  className="profile-danger"
                  onClick={onActivate}
                  title={
                    activationReady
                      ? undefined
                      : 'Alle Stationen benötigen Endpoint und Ressourcen-ID; außerdem muss mindestens ein Namespace erkannt sein.'
                  }
                >
                  Aktivieren…
                </button>
              )}
            </div>
          </details>
        </>
      )}
    </Step>
  );
}

function Step({ title, intro, children }) {
  return (
    <section className="profile-step">
      <header>
        <h3>{title}</h3>
        <p>{intro}</p>
      </header>
      {children}
    </section>
  );
}
function Field({
  label,
  value,
  onChange,
  disabled,
  textarea,
  type = 'text',
  hint,
}) {
  const Tag = textarea ? 'textarea' : 'input';
  return (
    <label className="profile-field">
      <span>{label}</span>
      <Tag
        type={textarea ? undefined : type}
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
      />
      {hint && <small>{hint}</small>}
    </label>
  );
}
function SelectField({
  label,
  value,
  onChange,
  disabled,
  options,
  labels = options,
}) {
  return (
    <label className="profile-field">
      <span>{label}</span>
      <select
        value={value ?? ''}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
      >
        {options.map((option, index) => (
          <option key={String(option)} value={option}>
            {labels[index]}
          </option>
        ))}
      </select>
    </label>
  );
}
function StatusBadge({ status, active }) {
  const label =
    {
      draft: 'Entwurf',
      structurally_valid: 'Strukturell gültig',
      live_validated: 'Live geprüft',
      active: 'Aktiv',
      disabled: 'Deaktiviert',
    }[status] ||
    status ||
    'Entwurf';
  return (
    <span className={`profile-status ${active ? 'is-active' : ''}`}>
      {active ? 'Aktiv' : label}
    </span>
  );
}
function ResultCard({ title, result }) {
  return (
    <article>
      <span>{title}</span>
      <strong>{resultState(result)}</strong>
      {result?.checkedAt && <small>{result.checkedAt}</small>}
      {result?.message && <small>{result.message}</small>}
      {Array.isArray(result?.errors) && result.errors.length > 0 && (
        <small
          title={result.errors
            .map((item) => (typeof item === 'string' ? item : item.message))
            .join('\n')}
        >
          {result.errors.length} Fehler · Details per Tooltip
        </small>
      )}
    </article>
  );
}

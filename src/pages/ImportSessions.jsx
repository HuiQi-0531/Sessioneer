import React, { useState, useRef } from 'react';
import Papa from 'papaparse';
import { useNavigate, useParams } from 'react-router-dom';
import { sessionsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import UCSidebar from '../components/UCSidebar';
import { parseCsvIntoBlocks, guessColumnMapping } from '../utils/csvBlocks';
import '../styles/UCRequests.css';
import '../styles/ImportSessions.css';

const SYSTEM_FIELDS = [
  { key: 'day', label: 'Day', required: true },
  { key: 'startTime', label: 'Start Time', required: true },
  { key: 'endTime', label: 'End Time', required: true },
  { key: 'location', label: 'Location', required: false },
  { key: 'campus', label: 'Campus', required: false },
  { key: 'sessionType', label: 'Session Type', required: false },
  { key: 'capacity', label: 'Capacity', required: false },
  { key: 'staffNote', label: 'Staff (note only)', required: false },
];

const NONE_VALUE = '__none__';

const ImportSessions = () => {
  const { unitId } = useParams();
  const navigate = useNavigate();
  const { activeUnit } = useActiveUnit();

  const fileInputRef = useRef(null);
  const [step, setStep] = useState('upload'); // 'upload' | 'mapping' | 'result'
  const [error, setError] = useState('');
  const [blocks, setBlocks] = useState([]);
  const [mappings, setMappings] = useState([]); // one mapping object per block
  const [sessionTypeOverrides, setSessionTypeOverrides] = useState([]);

  const [showReplaceModal, setShowReplaceModal] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const handleFileSelected = (file) => {
    if (!file) return;
    setError('');

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target.result;
      const parsed = Papa.parse(text, { skipEmptyLines: false });
      const rawRows = parsed.data;

      const detectedBlocks = parseCsvIntoBlocks(rawRows);

      if (detectedBlocks.length === 0) {
        setError('Could not find any table in this file. Please check the file and try again.');
        return;
      }

      setBlocks(detectedBlocks);
      setMappings(detectedBlocks.map(b => guessColumnMapping(b.headers)));
      setSessionTypeOverrides(detectedBlocks.map(b => b.suggestedSessionType || ''));
      setStep('mapping');
    };
    reader.onerror = () => {
      setError('Could not read this file. Please try again.');
    };
    reader.readAsText(file);
  };

  const handleFileInputChange = (e) => {
    handleFileSelected(e.target.files[0]);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    handleFileSelected(e.dataTransfer.files[0]);
  };

  const updateMapping = (blockIndex, fieldKey, headerValue) => {
    setMappings(prev => {
      const next = [...prev];
      const blockMapping = { ...next[blockIndex] };
      if (headerValue === NONE_VALUE) {
        delete blockMapping[fieldKey];
      } else {
        blockMapping[fieldKey] = headerValue;
      }
      next[blockIndex] = blockMapping;
      return next;
    });
  };

  const updateSessionTypeOverride = (blockIndex, value) => {
    setSessionTypeOverrides(prev => {
      const next = [...prev];
      next[blockIndex] = value;
      return next;
    });
  };

  const resolveRowValue = (block, mapping, row, fieldKey) => {
    const header = mapping[fieldKey];
    if (!header) return '';
    const colIndex = block.headers.indexOf(header);
    if (colIndex === -1) return '';
    return (row[colIndex] || '').toString().trim();
  };

  const buildSessionsPayload = () => {
    const sessions = [];

    blocks.forEach((block, blockIndex) => {
      const mapping = mappings[blockIndex];
      const fallbackType = sessionTypeOverrides[blockIndex];

      block.rows.forEach(row => {
        const capacityRaw = resolveRowValue(block, mapping, row, 'capacity');
        const capacity = capacityRaw ? parseInt(capacityRaw, 10) : null;

        sessions.push({
          day: resolveRowValue(block, mapping, row, 'day'),
          startTime: resolveRowValue(block, mapping, row, 'startTime'),
          endTime: resolveRowValue(block, mapping, row, 'endTime'),
          location: resolveRowValue(block, mapping, row, 'location') || null,
          campus: resolveRowValue(block, mapping, row, 'campus') || null,
          sessionType: resolveRowValue(block, mapping, row, 'sessionType') || fallbackType || null,
          capacity: Number.isNaN(capacity) ? null : capacity,
          staffNote: resolveRowValue(block, mapping, row, 'staffNote') || null,
          status: 'Confirmed'
        });
      });
    });

    return sessions;
  };

  const handleConfirmImportClick = async () => {
    setError('');
    try {
      const existing = await sessionsAPI.getAll(unitId);
      if (existing.length > 0) {
        setShowReplaceModal(true);
      } else {
        runImport(false);
      }
    } catch (err) {
      setError('Could not check existing sessions. Please try again.');
    }
  };

  const runImport = async (replace) => {
    setShowReplaceModal(false);
    setIsImporting(true);
    setError('');

    const sessions = buildSessionsPayload();

    try {
      const result = await sessionsAPI.import(unitId, sessions, replace);
      setImportResult(result);
      setStep('result');
    } catch (err) {
      setError(err.message || 'Import failed. Please try again.');
    } finally {
      setIsImporting(false);
    }
  };

  const handleDownloadTemplate = () => {
    const csvContent = 'Day,Start Time,End Time,Location,Campus,Session Type,Capacity\nMonday,08:00,10:00,GP-P-419,GP,Tutorial,25\n';
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'session_import_template.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleDone = () => {
    navigate(`/sessions/${unitId}`);
  };

  const totalRowCount = blocks.reduce((sum, b) => sum + b.rows.length, 0);

  return (
    <div className="uc-dashboard-container">
      <UCSidebar activePage="sessions" />

      <main className="uc-main-content">
        <header className="uc-header">
          <h1>Upload Session{activeUnit ? ` - ${activeUnit.unitCode}` : ''}</h1>
        </header>

        <div className="is-content">
          {step === 'upload' && (
            <div
              className="is-upload-card"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
            >
              <p>Drag and drop your timetable CSV here, or choose a file.</p>
              <p>The system will try to automatically detect the table(s) inside it.</p>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="is-file-input"
                onChange={handleFileInputChange}
              />

              <div className="is-upload-buttons">
                <button className="is-btn is-btn-secondary" onClick={handleDownloadTemplate}>
                  Download Template
                </button>
                <button className="is-btn is-btn-primary" onClick={() => fileInputRef.current.click()}>
                  Choose CSV File
                </button>
              </div>

              {error && <p className="is-error">{error}</p>}
            </div>
          )}

          {step === 'mapping' && (
            <>
              {blocks.map((block, blockIndex) => (
                <div className="is-block-card" key={blockIndex}>
                  <div className="is-block-header">
                    <div>
                      <div className="is-block-title">
                        {block.sectionTitle || `Table ${blockIndex + 1}`}
                      </div>
                      <div className="is-block-count">{block.rows.length} rows detected</div>
                    </div>
                    <div className="is-mapping-field" style={{ minWidth: 180 }}>
                      <label>Session Type for this table</label>
                      <input
                        type="text"
                        value={sessionTypeOverrides[blockIndex] || ''}
                        onChange={(e) => updateSessionTypeOverride(blockIndex, e.target.value)}
                        placeholder="e.g. Tutorial"
                      />
                    </div>
                  </div>

                  <div className="is-mapping-grid">
                    {SYSTEM_FIELDS.map(field => (
                      <div className="is-mapping-field" key={field.key}>
                        <label>{field.label}{field.required ? ' *' : ''}</label>
                        <select
                          value={mappings[blockIndex]?.[field.key] || NONE_VALUE}
                          onChange={(e) => updateMapping(blockIndex, field.key, e.target.value)}
                        >
                          <option value={NONE_VALUE}>-- Not in file --</option>
                          {block.headers.map((h, i) => (
                            <option key={i} value={h}>{h || `(column ${i + 1})`}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>

                  <table className="is-preview-table">
                    <thead>
                      <tr>
                        {SYSTEM_FIELDS.map(field => (
                          <th key={field.key}>{field.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {block.rows.slice(0, 3).map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {SYSTEM_FIELDS.map(field => (
                            <td key={field.key}>
                              {field.key === 'sessionType'
                                ? (resolveRowValue(block, mappings[blockIndex], row, 'sessionType') || sessionTypeOverrides[blockIndex] || '-')
                                : (resolveRowValue(block, mappings[blockIndex], row, field.key) || '-')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {block.rows.length > 3 && (
                    <p className="is-preview-note">Showing first 3 of {block.rows.length} rows.</p>
                  )}
                </div>
              ))}

              {error && <p className="is-error">{error}</p>}

              <div className="is-bottom-actions">
                <button className="is-btn is-btn-secondary" onClick={() => setStep('upload')}>
                  Choose a different file
                </button>
                <button className="is-btn is-btn-primary" onClick={handleConfirmImportClick} disabled={isImporting}>
                  {isImporting ? 'Importing...' : `Import ${totalRowCount} sessions`}
                </button>
              </div>
            </>
          )}

          {step === 'result' && importResult && (
            <div className="is-result-card">
              <div className="is-result-icon">&#10003;</div>
              <h2>Import Complete</h2>

              <div className="is-result-summary">
                <div className="is-result-stat">
                  <div className="is-result-stat-number">{importResult.importedCount}</div>
                  <div className="is-result-stat-label">Imported</div>
                </div>
                <div className="is-result-stat">
                  <div className="is-result-stat-number">{importResult.skippedCount}</div>
                  <div className="is-result-stat-label">Skipped</div>
                </div>
              </div>

              {importResult.skippedCount > 0 && (
                <div className="is-skipped-list">
                  {importResult.skipped.map((s, i) => (
                    <div className="is-skipped-row" key={i}>
                      Row {s.rowIndex + 1}: {s.reason} (day: "{s.row.day || ''}", start: "{s.row.startTime || ''}")
                    </div>
                  ))}
                </div>
              )}

              <button className="is-btn is-btn-primary" style={{ width: '100%', marginTop: 20 }} onClick={handleDone}>
                Done
              </button>
            </div>
          )}
        </div>
      </main>

      {showReplaceModal && (
        <div className="is-modal-overlay" onClick={() => setShowReplaceModal(false)}>
          <div className="is-modal-content" onClick={e => e.stopPropagation()}>
            <p>This unit already has sessions. Do you want to replace them, or add these on top of the existing ones?</p>
            <div className="is-modal-buttons">
              <button className="is-btn is-btn-secondary" onClick={() => runImport(false)}>Add to existing</button>
              <button className="is-btn is-btn-primary" onClick={() => runImport(true)}>Replace all</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportSessions;
import React, { useEffect, useState } from 'react';
import { tutorApplicationsAPI } from '../config/api';
import { LOCKED_FIELDS, DEFAULT_APPLICATION_FIELDS, LEGACY_FIELD_KEYS } from '../utils/applicationForm';
import '../styles/TutorApply.css';

const fileToBase64 = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    // reader.result looks like "data:application/pdf;base64,JVBERi0x..."
    const base64 = reader.result.split(',')[1];
    resolve(base64);
  };
  reader.onerror = reject;
  reader.readAsDataURL(file);
});

const validateFile = (file) => {
  if (file.type !== 'application/pdf') return 'Please upload a PDF file.';
  if (file.size > 5 * 1024 * 1024) return 'File is too large (max 5MB).';
  return null;
};

const TutorApply = () => {
  const unitId = new URLSearchParams(window.location.search).get('unitId');
  const [lockedData, setLockedData] = useState({ firstName: '', lastName: '', email: '' });
  const [answers, setAnswers] = useState({});
  const [files, setFiles] = useState({});
  const [error, setError] = useState('');
  const [unitInfo, setUnitInfo] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const fields = unitInfo?.applicationForm || DEFAULT_APPLICATION_FIELDS;

  useEffect(() => {
    if (!unitId) return;

    tutorApplicationsAPI.getApplicationUnit(unitId)
      .then(setUnitInfo)
      .catch(() => {
        setUnitInfo(null);
      });
  }, [unitId]);

  const handleLockedChange = (e) => {
    setLockedData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleAnswerChange = (key, value) => {
    setAnswers(prev => ({ ...prev, [key]: value }));
  };

  const handleCheckboxOptionToggle = (key, option) => {
    setAnswers(prev => {
      const current = Array.isArray(prev[key]) ? prev[key] : [];
      const next = current.includes(option) ? current.filter(o => o !== option) : [...current, option];
      return { ...prev, [key]: next };
    });
  };

  const handleFileChange = (key, e) => {
    const file = e.target.files[0];
    if (!file) return;
    const validationError = validateFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError('');
    setFiles(prev => ({ ...prev, [key]: file }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!lockedData.firstName.trim() || !lockedData.lastName.trim() || !lockedData.email.trim()) {
      setError('First name, last name and email are required.');
      return;
    }

    const missingRequired = fields.find(f => f.required && f.type !== 'file' && !answers[f.key] && answers[f.key] !== 0);
    if (missingRequired) {
      setError(`"${missingRequired.label}" is required.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        unitId,
        firstName: lockedData.firstName.trim(),
        lastName: lockedData.lastName.trim(),
        email: lockedData.email.trim()
      };
      const customAnswers = {};

      for (const field of fields) {
        if (field.type === 'file') {
          const file = files[field.key];
          if (field.key === 'resume') {
            if (file) {
              payload.resumeBase64 = await fileToBase64(file);
              payload.resumeFilename = file.name;
              payload.resumeMimeType = file.type;
            }
          } else if (file) {
            customAnswers[field.key] = {
              filename: file.name,
              mimeType: file.type,
              base64: await fileToBase64(file)
            };
          }
          continue;
        }

        const value = answers[field.key];
        if (value === undefined || value === '' || (Array.isArray(value) && value.length === 0)) continue;

        if (LEGACY_FIELD_KEYS.includes(field.key)) {
          if (field.key === 'maximumHours') payload.maximumHours = parseInt(value, 10);
          else payload[field.key] = value;
        } else {
          customAnswers[field.key] = value;
        }
      }

      payload.customAnswers = customAnswers;

      await tutorApplicationsAPI.submit(payload);
      setIsSubmitted(true);
    } catch (err) {
      setError(err.message || 'Failed to submit your application. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderField = (field) => {
    const value = answers[field.key] ?? (field.type === 'checkbox' ? [] : '');

    switch (field.type) {
      case 'textarea':
        return (
          <textarea
            value={value}
            onChange={(e) => handleAnswerChange(field.key, e.target.value)}
            required={field.required}
          />
        );
      case 'number':
        return (
          <input
            type="number"
            min="0"
            value={value}
            onChange={(e) => handleAnswerChange(field.key, e.target.value)}
            required={field.required}
          />
        );
      case 'select':
        return (
          <select value={value} onChange={(e) => handleAnswerChange(field.key, e.target.value)} required={field.required}>
            <option value="">-- Select --</option>
            {(field.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        );
      case 'checkbox':
        return (
          <div className="ta-checkbox-group">
            {(field.options || []).map(opt => (
              <label key={opt} className="ta-checkbox-option">
                <input
                  type="checkbox"
                  checked={Array.isArray(value) && value.includes(opt)}
                  onChange={() => handleCheckboxOptionToggle(field.key, opt)}
                />
                {opt}
              </label>
            ))}
          </div>
        );
      case 'file':
        return (
          <label className="ta-file-input">
            <input type="file" accept="application/pdf" onChange={(e) => handleFileChange(field.key, e)} />
            {files[field.key] ? (
              <div className="ta-file-name">{files[field.key].name}</div>
            ) : (
              <div style={{ color: '#6b7280', fontSize: 13 }}>Click to upload</div>
            )}
            <div className="ta-file-hint">PDF only, max 5MB</div>
          </label>
        );
      default:
        return (
          <input
            type="text"
            value={value}
            onChange={(e) => handleAnswerChange(field.key, e.target.value)}
            required={field.required}
          />
        );
    }
  };

  if (isSubmitted) {
    return (
      <div className="ta-page">
        <div className="ta-card">
          <div className="ta-success-card">
            <div className="ta-success-icon">
              <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <h1>Application submitted!</h1>
            <p>Thanks for your interest in tutoring with us. The unit coordinator will review your application and reach out if you're a good fit.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ta-page">
      <div className="ta-card">
        <div className="ta-logo">
          <div className="ta-logo-icon">S</div>
          <div className="ta-logo-text">Sessioneer</div>
        </div>

        <h1>Tutor Application</h1>
        {unitInfo ? (
          <div className="ta-unit-banner">
            <span>Applying for</span>
            <strong>{unitInfo.unitCode}</strong>
            <small>{unitInfo.unitName}</small>
          </div>
        ) : (
          <p>Interested in tutoring with us? Fill out the form below and we'll be in touch.</p>
        )}

        <form onSubmit={handleSubmit}>
          <div className="ta-name-grid">
            <div className="ta-field">
              <label>{LOCKED_FIELDS[0].label} *</label>
              <input type="text" name="firstName" value={lockedData.firstName} onChange={handleLockedChange} required />
            </div>

            <div className="ta-field">
              <label>{LOCKED_FIELDS[1].label} *</label>
              <input type="text" name="lastName" value={lockedData.lastName} onChange={handleLockedChange} required />
            </div>
          </div>

          <div className="ta-field">
            <label>{LOCKED_FIELDS[2].label} *</label>
            <input type="email" name="email" value={lockedData.email} onChange={handleLockedChange} required />
          </div>

          {fields.map(field => (
            <div className="ta-field" key={field.key}>
              <label>{field.label}{field.required ? ' *' : ''}</label>
              {renderField(field)}
            </div>
          ))}

          {error && <p className="ta-error">{error}</p>}

          <button type="submit" className="ta-submit-btn" disabled={isSubmitting}>
            {isSubmitting ? 'Submitting...' : 'Submit Application'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default TutorApply;
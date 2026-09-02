import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { tutorApplicationsAPI } from '../config/api';
import UCSidebar from '../components/UCSidebar';
import UCPageHeader from '../components/UCPageHeader';
import { useActiveUnit } from '../context/ActiveUnitContext';
import { FIELD_TYPES, LOCKED_FIELDS, DEFAULT_APPLICATION_FIELDS, makeFieldKey } from '../utils/applicationForm';
import '../styles/UCRequests.css';
import '../styles/TutorApplications.css';
import '../styles/ApplicationFormEditor.css';

const ApplicationFormEditor = () => {
  const navigate = useNavigate();
  const { activeUnit, isLoading: unitLoading } = useActiveUnit();
  const [fields, setFields] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCustomised, setIsCustomised] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');

  const loadForm = useCallback(async () => {
    if (!activeUnit?.id) {
      setFields(DEFAULT_APPLICATION_FIELDS);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const result = await tutorApplicationsAPI.getForm(activeUnit.id);
      setFields(result.fields || DEFAULT_APPLICATION_FIELDS);
      setIsCustomised(!!result.isCustomised);
    } catch (err) {
      console.error('Error loading application form:', err);
      setFields(DEFAULT_APPLICATION_FIELDS);
    } finally {
      setIsLoading(false);
    }
  }, [activeUnit?.id]);

  useEffect(() => {
    if (unitLoading) return;
    loadForm();
  }, [unitLoading, loadForm]);

  const updateField = (index, patch) => {
    setFields(prev => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  };

  const moveField = (index, direction) => {
    setFields(prev => {
      const next = [...prev];
      const target = index + direction;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const deleteField = (index) => {
    setFields(prev => prev.filter((_, i) => i !== index));
  };

  const addField = () => {
    const existingKeys = fields.map(f => f.key);
    const label = 'New question';
    setFields(prev => [...prev, { key: makeFieldKey(label, existingKeys), label, type: 'text', required: false }]);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage('');
    try {
      await tutorApplicationsAPI.saveForm(activeUnit.id, fields);
      setIsCustomised(true);
      setSaveMessage('Saved.');
      setTimeout(() => setSaveMessage(''), 2500);
    } catch (err) {
      alert(err.message || 'Failed to save application form.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = async () => {
    if (!window.confirm('Reset to the default application form? This discards your customisations for this unit.')) return;
    setIsSaving(true);
    try {
      const result = await tutorApplicationsAPI.resetForm(activeUnit.id);
      setFields(result.fields || DEFAULT_APPLICATION_FIELDS);
      setIsCustomised(false);
    } catch (err) {
      alert(err.message || 'Failed to reset application form.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="uc-dashboard-container">
      <UCSidebar activePage="applications" />

      <main className="uc-main-content">
        <UCPageHeader title="Edit Application Form" />

        <div className="tap-content afe-content">
          <button className="afe-back-link" onClick={() => navigate('/tutor-applications')}>
            &larr; Back to Applications
          </button>

          <p className="afe-intro">
            This is the form tutors fill out when they apply for {activeUnit?.unitCode || 'this unit'}.
            First name, last name and email always stay on the form and can't be removed.
            {isCustomised ? '' : ' You are currently using the default template.'}
          </p>

          {isLoading ? (
            <div className="tap-empty-state">Loading...</div>
          ) : (
            <>
              <div className="afe-field-list">
                {LOCKED_FIELDS.map(f => (
                  <div className="afe-field-row afe-field-locked" key={f.key}>
                    <div className="afe-field-main">
                      <span className="afe-field-label">{f.label}</span>
                      <span className="afe-field-type-tag">Short text · Required · Fixed</span>
                    </div>
                  </div>
                ))}

                {fields.map((field, index) => (
                  <div className="afe-field-row" key={`${field.key}-${index}`}>
                    <div className="afe-field-main">
                      <input
                        className="afe-label-input"
                        type="text"
                        value={field.label}
                        onChange={(e) => updateField(index, { label: e.target.value })}
                        placeholder="Question label"
                      />
                      <select
                        className="afe-type-select"
                        value={field.type}
                        onChange={(e) => updateField(index, { type: e.target.value })}
                      >
                        {FIELD_TYPES.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                      <label className="afe-required-toggle">
                        <input
                          type="checkbox"
                          checked={!!field.required}
                          onChange={(e) => updateField(index, { required: e.target.checked })}
                        />
                        Required
                      </label>
                    </div>

                    {(field.type === 'select' || field.type === 'checkbox') && (
                      <div className="afe-options-row">
                        <label>Options (comma separated)</label>
                        <input
                          type="text"
                          value={(field.options || []).join(', ')}
                          onChange={(e) => updateField(index, {
                            options: e.target.value.split(',').map(o => o.trim()).filter((o, i, arr) => o !== '' || i < arr.length - 1)
                          })}
                          placeholder="e.g. Casual, Sessional, Fixed-term"
                        />
                      </div>
                    )}

                    <div className="afe-field-controls">
                      <button type="button" onClick={() => moveField(index, -1)} disabled={index === 0} title="Move up">↑</button>
                      <button type="button" onClick={() => moveField(index, 1)} disabled={index === fields.length - 1} title="Move down">↓</button>
                      <button type="button" className="afe-delete-btn" onClick={() => deleteField(index)} title="Delete question">Delete</button>
                    </div>
                  </div>
                ))}
              </div>

              <button className="afe-add-field-btn" onClick={addField} type="button">+ Add question</button>

              <div className="afe-footer-actions">
                <button className="tap-btn tap-btn-invite" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? 'Saving...' : 'Save form'}
                </button>
                <button className="afe-reset-btn" onClick={handleReset} disabled={isSaving} type="button">
                  Reset to default
                </button>
                {saveMessage && <span className="afe-save-message">{saveMessage}</span>}
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default ApplicationFormEditor;
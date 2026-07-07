import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { tutorsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import UCSidebar from '../components/UCSidebar';
import '../styles/UCRequests.css';
import '../styles/Tutors.css';

const PRIORITY_OPTIONS = ['Preferred', 'Standard', 'Backup', 'Risk'];

const Tutors = () => {
  const { unitId: unitIdFromUrl } = useParams();
  const { activeUnit, activeUnitId, setActiveUnitId, isLoading: unitLoading } = useActiveUnit();

  const [tutors, setTutors] = useState([]);
  const [isLoadingTutors, setIsLoadingTutors] = useState(true);
  const [drafts, setDrafts] = useState({}); // tutorId -> { priorityTag, internalNotes }
  const [savingId, setSavingId] = useState(null);
  const [savedId, setSavedId] = useState(null);

  useEffect(() => {
    if (unitIdFromUrl && unitIdFromUrl !== activeUnitId) {
      setActiveUnitId(unitIdFromUrl);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!activeUnit) {
      setIsLoadingTutors(false);
      return;
    }
    loadTutors(activeUnit.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUnit]);

  const loadTutors = async (unitId) => {
    setIsLoadingTutors(true);
    try {
      const data = await tutorsAPI.getAll(unitId);
      setTutors(data);
      const initialDrafts = {};
      data.forEach(t => {
        initialDrafts[t.id] = { priorityTag: t.priorityTag, internalNotes: t.internalNotes };
      });
      setDrafts(initialDrafts);
    } catch (err) {
      console.error('Error loading tutors:', err);
    } finally {
      setIsLoadingTutors(false);
    }
  };

  const updateDraft = (tutorId, field, value) => {
    setDrafts(prev => ({
      ...prev,
      [tutorId]: { ...prev[tutorId], [field]: value }
    }));
  };

  const handleSave = async (tutorId) => {
    setSavingId(tutorId);
    setSavedId(null);
    try {
      const draft = drafts[tutorId];
      await tutorsAPI.updateMarker(activeUnit.id, tutorId, draft.priorityTag, draft.internalNotes);
      setSavedId(tutorId);
      setTimeout(() => setSavedId(null), 2000);
    } catch (err) {
      console.error('Error saving tutor marker:', err);
      alert('Failed to save. Please try again.');
    } finally {
      setSavingId(null);
    }
  };

  if (unitLoading) {
    return (
      <div className="uc-dashboard-container">
        <UCSidebar activePage="tutors" />
        <main className="uc-main-content">
          <div className="tt-content"><div className="tt-empty-state"><p>Loading...</p></div></div>
        </main>
      </div>
    );
  }

  if (!activeUnit) {
    return (
      <div className="uc-dashboard-container">
        <UCSidebar activePage="tutors" />
        <main className="uc-main-content">
          <header className="uc-header"><h1>Tutors</h1></header>
          <div className="tt-content">
            <div className="tt-empty-state">
              <p>No unit selected. Choose one from the Active Unit menu, or create one first.</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="uc-dashboard-container">
      <UCSidebar activePage="tutors" />

      <main className="uc-main-content">
        <header className="uc-header">
          <h1>Tutors</h1>
        </header>

        <div className="tt-content">
          {isLoadingTutors ? (
            <div className="tt-empty-state"><p>Loading tutors...</p></div>
          ) : tutors.length === 0 ? (
            <div className="tt-empty-state"><p>No tutors have registered yet.</p></div>
          ) : (
            <table className="tt-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Max Hours</th>
                  <th>Priority</th>
                  <th>Notes</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {tutors.map(tutor => {
                  const draft = drafts[tutor.id] || { priorityTag: 'Standard', internalNotes: '' };
                  const isDirty = draft.priorityTag !== tutor.priorityTag || draft.internalNotes !== tutor.internalNotes;
                  return (
                    <tr key={tutor.id}>
                      <td>
                        <div className="tt-name">{tutor.name}</div>
                        <div className="tt-email">{tutor.email}</div>
                      </td>
                      <td>{tutor.maximumHours != null ? `${tutor.maximumHours} hrs/week` : 'Not set'}</td>
                      <td>
                        <select
                          className={`tt-tag-select ${draft.priorityTag.toLowerCase()}`}
                          value={draft.priorityTag}
                          onChange={(e) => updateDraft(tutor.id, 'priorityTag', e.target.value)}
                        >
                          {PRIORITY_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          type="text"
                          className="tt-notes-input"
                          value={draft.internalNotes || ''}
                          onChange={(e) => updateDraft(tutor.id, 'internalNotes', e.target.value)}
                          placeholder="e.g. experienced, dependable"
                        />
                      </td>
                      <td>
                        <button
                          className="tt-save-btn"
                          onClick={() => handleSave(tutor.id)}
                          disabled={!isDirty || savingId === tutor.id}
                        >
                          {savingId === tutor.id ? 'Saving...' : 'Save'}
                        </button>
                        {savedId === tutor.id && <span className="tt-saved-label">Saved</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </main>
    </div>
  );
};

export default Tutors;
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
  const [search, setSearch] = useState('');

  const [selectedTutor, setSelectedTutor] = useState(null);
  const [draft, setDraft] = useState({ priorityTag: 'Standard', internalNotes: '', tags: [] });
  const [newTagText, setNewTagText] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

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
    } catch (err) {
      console.error('Error loading tutors:', err);
    } finally {
      setIsLoadingTutors(false);
    }
  };

  const openProfile = (tutor) => {
    setSelectedTutor(tutor);
    setDraft({
      priorityTag: tutor.priorityTag,
      internalNotes: tutor.internalNotes || '',
      tags: [...(tutor.tags || [])]
    });
    setNewTagText('');
  };

  const closeProfile = () => {
    setSelectedTutor(null);
    setShowConfirm(false);
  };

  const handleAddTag = () => {
    const value = newTagText.trim();
    if (!value) return;
    if (draft.tags.includes(value)) {
      setNewTagText('');
      return;
    }
    setDraft(prev => ({ ...prev, tags: [...prev.tags, value] }));
    setNewTagText('');
  };

  const handleRemoveTag = (tag) => {
    setDraft(prev => ({ ...prev, tags: prev.tags.filter(t => t !== tag) }));
  };

  const handleSaveClick = () => {
    setShowConfirm(true);
  };

  const confirmSave = async () => {
    setIsSaving(true);
    try {
      await tutorsAPI.updateMarker(activeUnit.id, selectedTutor.id, draft.priorityTag, draft.internalNotes, draft.tags);
      setShowConfirm(false);
      closeProfile();
      await loadTutors(activeUnit.id);
    } catch (err) {
      console.error('Error saving tutor marker:', err);
      alert('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredTutors = tutors.filter(t =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  if (unitLoading) {
    return (
      <div className="uc-dashboard-container">
        <UCSidebar activePage="tutors" />
        <main className="uc-main-content">
          <div className="tt-content"><div className="tt-empty-state">Loading...</div></div>
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
            <div className="tt-empty-state">No unit selected. Choose one from the Active Unit menu, or create one first.</div>
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
          <div className="tt-search-row">
            <input
              type="text"
              className="tt-search-input"
              placeholder="Search tutors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {isLoadingTutors ? (
            <div className="tt-empty-state">Loading tutors...</div>
          ) : filteredTutors.length === 0 ? (
            <div className="tt-empty-state">No tutors found.</div>
          ) : (
            <div className="tt-card-list">
              {filteredTutors.map(tutor => (
                <div key={tutor.id} className="tt-card" onClick={() => openProfile(tutor)}>
                  <div className="tt-card-top">
                    <span className="tt-card-name">{tutor.name}</span>
                  </div>
                  <div className="tt-card-meta">
                    {tutor.workExperience ? tutor.workExperience.slice(0, 80) : 'No experience notes yet'}
                    {tutor.maximumHours != null ? ` - Max ${tutor.maximumHours} hrs/week` : ''}
                    {tutor.contractType ? ` - ${tutor.contractType}` : ''}
                  </div>
                  <div className="tt-card-badges">
                    <span className={`tt-badge ${tutor.priorityTag.toLowerCase()}`}>{tutor.priorityTag}</span>
                    {(tutor.tags || []).map(tag => (
                      <span key={tag} className="tt-badge tag">{tag}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {selectedTutor && (
        <div className="tt-modal-overlay" onClick={closeProfile}>
          <div className="tt-modal-content" onClick={e => e.stopPropagation()}>
            <button className="tt-modal-close" onClick={closeProfile}>&times;</button>

            <div className="tt-modal-header">
              <div className="tt-modal-avatar">{selectedTutor.name.charAt(0).toUpperCase()}</div>
              <div>
                <div className="tt-modal-name">{selectedTutor.name}</div>
                <div className="tt-modal-role">Tutor</div>
              </div>
            </div>

            <div className="tt-readonly-grid">
              <div className="tt-readonly-item">
                <div className="tt-readonly-label">Email</div>
                <div className="tt-readonly-value">{selectedTutor.email}</div>
              </div>
              <div className="tt-readonly-item">
                <div className="tt-readonly-label">Phone</div>
                <div className="tt-readonly-value">{selectedTutor.phoneNumber || 'Not provided'}</div>
              </div>
              <div className="tt-readonly-item">
                <div className="tt-readonly-label">Maximum Hours</div>
                <div className="tt-readonly-value">{selectedTutor.maximumHours != null ? `${selectedTutor.maximumHours} hrs/week` : 'Not set'}</div>
              </div>
              <div className="tt-readonly-item">
                <div className="tt-readonly-label">Contract Type</div>
                <div className="tt-readonly-value">{selectedTutor.contractType || 'Not set'}</div>
              </div>
              <div className="tt-readonly-item" style={{ gridColumn: '1 / -1' }}>
                <div className="tt-readonly-label">Experience</div>
                <div className="tt-readonly-value">{selectedTutor.workExperience || 'Not provided'}</div>
              </div>
              <p className="tt-readonly-note">These fields are set by the tutor and can't be edited here.</p>
            </div>

            <div className="tt-field">
              <label>Priority</label>
              <select
                value={draft.priorityTag}
                onChange={(e) => setDraft(prev => ({ ...prev, priorityTag: e.target.value }))}
              >
                {PRIORITY_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div className="tt-field">
              <label>Tags</label>
              <div className="tt-tags-input-row">
                <input
                  type="text"
                  placeholder="e.g. Friendly, Experienced"
                  value={newTagText}
                  onChange={(e) => setNewTagText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddTag(); } }}
                />
                <button type="button" className="tt-tag-add-btn" onClick={handleAddTag}>Add</button>
              </div>
              {draft.tags.length > 0 && (
                <div className="tt-tags-list">
                  {draft.tags.map(tag => (
                    <span key={tag} className="tt-tag-pill">
                      {tag}
                      <button type="button" className="tt-tag-remove" onClick={() => handleRemoveTag(tag)}>&times;</button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="tt-field">
              <label>Notes</label>
              <textarea
                value={draft.internalNotes}
                onChange={(e) => setDraft(prev => ({ ...prev, internalNotes: e.target.value }))}
                placeholder="Internal notes about this tutor..."
              />
            </div>

            <button className="tt-save-btn" onClick={handleSaveClick}>
              Save Changes
            </button>
          </div>
        </div>
      )}

      {showConfirm && (
        <div className="tt-confirm-overlay" onClick={() => setShowConfirm(false)}>
          <div className="tt-confirm-content" onClick={e => e.stopPropagation()}>
            <p>Save changes to {selectedTutor?.name}'s profile?</p>
            <div className="tt-confirm-buttons">
              <button className="cancel" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="confirm" onClick={confirmSave} disabled={isSaving}>
                {isSaving ? 'Saving...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tutors;
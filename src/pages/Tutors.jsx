import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { tutorsAPI } from '../config/api';
import { useActiveUnit } from '../context/ActiveUnitContext';
import UCSidebar from '../components/UCSidebar';
import UCPageHeader from '../components/UCPageHeader';
import { getAvatarLetter, getDisplayName } from '../utils/userName';
import '../styles/UCRequests.css';
import '../styles/Tutors.css';

const PRIORITY_OPTIONS = ['Preferred', 'Standard', 'Backup', 'Risk'];

const Tutors = () => {
  const { unitId: unitIdFromUrl } = useParams();
  const {
    activeUnit,
    activeUnitId,
    setActiveUnitId,
    isLoading: unitLoading
  } = useActiveUnit();

  const [tutors, setTutors] = useState([]);
  const [isLoadingTutors, setIsLoadingTutors] = useState(true);
  const [search, setSearch] = useState('');

  const [selectedTutor, setSelectedTutor] = useState(null);
  const [draft, setDraft] = useState({ priorityTag: 'Standard', internalNotes: '', tags: [] });
  const [newTagText, setNewTagText] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    priority: [],
    contractType: [],
    starredOnly: false,
    flaggedOnly: false,
    earlyAccessOnly: false,
    maxHoursLimit: ''
  });

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

  // Close the filter panel when clicking outside of it
  useEffect(() => {
    if (!showFilters) return;
    const handleClickOutside = (e) => {
      if (!e.target.closest('.tt-filter-wrap')) {
        setShowFilters(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showFilters]);

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

  const handleToggleEarlyAccess = async (tutor, e) => {
    e.stopPropagation();
    const nextValue = !tutor.earlyAccess;
    setTutors(prev => prev.map(t => (t.id === tutor.id ? { ...t, earlyAccess: nextValue } : t)));
    setSelectedTutor(prev => (prev && prev.id === tutor.id ? { ...prev, earlyAccess: nextValue } : prev));
    try {
      await tutorsAPI.setEarlyAccess(activeUnit.id, tutor.id, nextValue);
    } catch (err) {
      console.error('Error updating early access:', err);
      // Roll back on failure
      setTutors(prev => prev.map(t => (t.id === tutor.id ? { ...t, earlyAccess: !nextValue } : t)));
      setSelectedTutor(prev => (prev && prev.id === tutor.id ? { ...prev, earlyAccess: !nextValue } : prev));
      alert(err.message || 'Failed to update early access.');
    }
  };

  const handleToggleStar = async (tutor, e) => {
    e.stopPropagation();
    const nextValue = !tutor.starred;
    setTutors(prev => prev.map(t => (t.id === tutor.id ? { ...t, starred: nextValue } : t)));
    setSelectedTutor(prev => (prev && prev.id === tutor.id ? { ...prev, starred: nextValue } : prev));
    try {
      await tutorsAPI.setStarred(activeUnit.id, tutor.id, nextValue);
    } catch (err) {
      console.error('Error updating starred status:', err);
      // Roll back on failure
      setTutors(prev => prev.map(t => (t.id === tutor.id ? { ...t, starred: !nextValue } : t)));
      setSelectedTutor(prev => (prev && prev.id === tutor.id ? { ...prev, starred: !nextValue } : prev));
      alert(err.message || 'Failed to update star.');
    }
  };

  const handleToggleFlag = async (tutor, e) => {
    e.stopPropagation();
    const nextValue = !tutor.flagged;
    setTutors(prev => prev.map(t => (t.id === tutor.id ? { ...t, flagged: nextValue } : t)));
    setSelectedTutor(prev => (prev && prev.id === tutor.id ? { ...prev, flagged: nextValue } : prev));
    try {
      await tutorsAPI.setFlagged(activeUnit.id, tutor.id, nextValue);
    } catch (err) {
      console.error('Error updating flagged status:', err);
      // Roll back on failure
      setTutors(prev => prev.map(t => (t.id === tutor.id ? { ...t, flagged: !nextValue } : t)));
      setSelectedTutor(prev => (prev && prev.id === tutor.id ? { ...prev, flagged: !nextValue } : prev));
      alert(err.message || 'Failed to update flag.');
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

  // Distinct contract types present in the current tutor list, used to build the filter chips
  const contractTypeOptions = useMemo(
    () => [...new Set(tutors.map(t => t.contractType).filter(Boolean))],
    [tutors]
  );

  const togglePriorityFilter = (p) => {
    setFilters(prev => ({
      ...prev,
      priority: prev.priority.includes(p) ? prev.priority.filter(x => x !== p) : [...prev.priority, p]
    }));
  };

  const toggleContractTypeFilter = (c) => {
    setFilters(prev => ({
      ...prev,
      contractType: prev.contractType.includes(c) ? prev.contractType.filter(x => x !== c) : [...prev.contractType, c]
    }));
  };

  const clearFilters = () => {
    setFilters({
      priority: [],
      contractType: [],
      starredOnly: false,
      flaggedOnly: false,
      earlyAccessOnly: false,
      maxHoursLimit: ''
    });
  };

  const activeFilterCount =
    filters.priority.length +
    filters.contractType.length +
    (filters.starredOnly ? 1 : 0) +
    (filters.flaggedOnly ? 1 : 0) +
    (filters.earlyAccessOnly ? 1 : 0) +
    (filters.maxHoursLimit !== '' ? 1 : 0);

  const filteredTutors = tutors
    .filter(t => t.name.toLowerCase().includes(search.toLowerCase()))
    .filter(t => filters.priority.length === 0 || filters.priority.includes(t.priorityTag))
    .filter(t => filters.contractType.length === 0 || filters.contractType.includes(t.contractType))
    .filter(t => !filters.starredOnly || t.starred)
    .filter(t => !filters.flaggedOnly || t.flagged)
    .filter(t => !filters.earlyAccessOnly || t.earlyAccess)
    .filter(t => filters.maxHoursLimit === '' || (t.maximumHours != null && t.maximumHours <= Number(filters.maxHoursLimit)))
    .sort((a, b) => (b.starred === a.starred ? 0 : b.starred ? 1 : -1));

  if (unitLoading) {
    return (
      <div className="uc-dashboard-container">
        <UCSidebar activePage="tutors" />
        <main className="uc-main-content">
          <UCPageHeader title="Tutors" />
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
          <UCPageHeader title="Tutors" />
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
        <UCPageHeader title="Tutors" />

        <div className="tt-content">
          <div className="tt-search-row">
            <input
              type="text"
              className="tt-search-input"
              placeholder="Search tutors..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <div className="tt-filter-wrap">
              <button
                type="button"
                className={`tt-filter-btn ${activeFilterCount > 0 ? 'active' : ''}`}
                onClick={() => setShowFilters(prev => !prev)}
              >
                Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
              </button>

              {showFilters && (
                <div className="tt-filter-panel">
                  <div className="tt-filter-group">
                    <div className="tt-filter-group-title">Priority</div>
                    <div className="tt-filter-chip-row">
                      {PRIORITY_OPTIONS.map(p => (
                        <button
                          key={p}
                          type="button"
                          className={`tt-filter-chip ${filters.priority.includes(p) ? 'selected' : ''}`}
                          onClick={() => togglePriorityFilter(p)}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>

                  {contractTypeOptions.length > 0 && (
                    <div className="tt-filter-group">
                      <div className="tt-filter-group-title">Contract Type</div>
                      <div className="tt-filter-chip-row">
                        {contractTypeOptions.map(c => (
                          <button
                            key={c}
                            type="button"
                            className={`tt-filter-chip ${filters.contractType.includes(c) ? 'selected' : ''}`}
                            onClick={() => toggleContractTypeFilter(c)}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="tt-filter-group">
                    <div className="tt-filter-group-title">Max Hours (up to)</div>
                    <input
                      type="number"
                      min="0"
                      className="tt-filter-number-input"
                      placeholder="e.g. 10"
                      value={filters.maxHoursLimit}
                      onChange={(e) => setFilters(prev => ({ ...prev, maxHoursLimit: e.target.value }))}
                    />
                  </div>

                  <div className="tt-filter-group">
                    <label className="tt-filter-checkbox">
                      <input
                        type="checkbox"
                        checked={filters.starredOnly}
                        onChange={(e) => setFilters(prev => ({ ...prev, starredOnly: e.target.checked }))}
                      />
                      Starred only
                    </label>
                    <label className="tt-filter-checkbox">
                      <input
                        type="checkbox"
                        checked={filters.flaggedOnly}
                        onChange={(e) => setFilters(prev => ({ ...prev, flaggedOnly: e.target.checked }))}
                      />
                      Flagged only
                    </label>
                    <label className="tt-filter-checkbox">
                      <input
                        type="checkbox"
                        checked={filters.earlyAccessOnly}
                        onChange={(e) => setFilters(prev => ({ ...prev, earlyAccessOnly: e.target.checked }))}
                      />
                      Early schedule access only
                    </label>
                  </div>

                  <button type="button" className="tt-filter-clear-btn" onClick={clearFilters}>
                    Clear filters
                  </button>
                </div>
              )}
            </div>

          </div>

          {isLoadingTutors ? (
            <div className="tt-empty-state">Loading tutors...</div>
          ) : filteredTutors.length === 0 ? (
            <div className="tt-empty-state">
              {tutors.length === 0 ? 'No tutors found.' : 'No tutors match the selected filters.'}
            </div>
          ) : (
            <div className="tt-card-list">
              {filteredTutors.map(tutor => (
                <div key={tutor.id} className="tt-card" onClick={() => openProfile(tutor)}>
                  <div className="tt-card-top">
                    <div className="tt-card-name-group">
                      <div className="tt-card-avatar">
                        {tutor.avatarUrl ? (
                          <img src={tutor.avatarUrl} alt={getDisplayName(tutor)} />
                        ) : (
                          getAvatarLetter(tutor)
                        )}
                      </div>
                      <span className="tt-card-name">
                        {tutor.name}
                        {tutor.isSuperTutor && <span className="tt-badge super-tutor" style={{ marginLeft: 8 }}>Super Tutor</span>}
                      </span>
                    </div>
                    <div className="tt-card-actions">
                      <button
                        type="button"
                        className={`tt-star-btn ${tutor.starred ? 'starred' : ''}`}
                        onClick={(e) => handleToggleStar(tutor, e)}
                        aria-label={tutor.starred ? 'Unstar tutor' : 'Star tutor'}
                        title={tutor.starred ? 'Unstar tutor' : 'Star tutor'}
                      >
                        {tutor.starred ? '★' : '☆'}
                      </button>
                      <button
                        type="button"
                        className={`tt-flag-btn ${tutor.flagged ? 'flagged' : ''}`}
                        onClick={(e) => handleToggleFlag(tutor, e)}
                        aria-label={tutor.flagged ? 'Remove flag' : 'Flag tutor'}
                        title={tutor.flagged ? 'Remove flag' : 'Flag tutor'}
                      >
                        ⚑
                      </button>
                    </div>
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
              <div className="tt-modal-avatar">
                {selectedTutor.avatarUrl ? (
                  <img src={selectedTutor.avatarUrl} alt={getDisplayName(selectedTutor)} />
                ) : (
                  getAvatarLetter(selectedTutor)
                )}
              </div>
              <div>
                <div className="tt-modal-name">{selectedTutor.name}</div>
                <div className="tt-modal-role">{selectedTutor.isSuperTutor ? 'Super Tutor' : 'Tutor'}</div>
              </div>
              <div className="tt-modal-actions">
                <button
                  type="button"
                  className={`tt-star-btn tt-modal-icon ${selectedTutor.starred ? 'starred' : ''}`}
                  onClick={(e) => handleToggleStar(selectedTutor, e)}
                  aria-label={selectedTutor.starred ? 'Unstar tutor' : 'Star tutor'}
                  title={selectedTutor.starred ? 'Unstar tutor' : 'Star tutor'}
                >
                  {selectedTutor.starred ? '★' : '☆'}
                </button>
                <button
                  type="button"
                  className={`tt-flag-btn tt-modal-icon ${selectedTutor.flagged ? 'flagged' : ''}`}
                  onClick={(e) => handleToggleFlag(selectedTutor, e)}
                  aria-label={selectedTutor.flagged ? 'Remove flag' : 'Flag tutor'}
                  title={selectedTutor.flagged ? 'Remove flag' : 'Flag tutor'}
                >
                  ⚑
                </button>
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

            <label className="tt-early-access-toggle">
              <input
                type="checkbox"
                checked={!!selectedTutor.earlyAccess}
                onChange={(e) => handleToggleEarlyAccess(selectedTutor, e)}
              />
              Early schedule access
            </label>

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
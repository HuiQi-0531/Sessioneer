import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { unitsAPI } from '../config/api';
import '../styles/UCRequests.css';
import '../styles/CreateUnit.css';
import UCPageHeader from '../components/UCPageHeader';

// Builds semester options like "Semester 1, 2025" through a few years ahead,
// stored internally as "Semester 1|2025" so it can be split into
// separate semester/year values on submit.
const buildSemesterOptions = () => {
  const currentYear = new Date().getFullYear();
  const options = [];
  for (let year = currentYear - 1; year <= currentYear + 2; year++) {
    options.push({ value: `Semester 1|${year}`, label: `Semester 1, ${year}` });
    options.push({ value: `Semester 2|${year}`, label: `Semester 2, ${year}` });
  }
  return options;
};

const SEMESTER_OPTIONS = buildSemesterOptions();

const emptyForm = {
  unitCode: '',
  unitName: '',
  semesterYear: '',
  campus: '',
  deliveryMode: '',
  enrolmentSize: '',
  availabilityDeadline: ''
};

const CreateUnit = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditMode = Boolean(id);

  const [formData, setFormData] = useState(emptyForm);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [createdUnit, setCreatedUnit] = useState(null);

  const currentUser = useMemo(() => {
    const savedUser = localStorage.getItem('currentUser');
    return savedUser ? JSON.parse(savedUser) : null;
  }, []);

  const displayName = currentUser?.name || 'Guest';
  const avatarLetter = displayName.charAt(0).toUpperCase();

  useEffect(() => {
    if (!isEditMode) return;

    const loadUnit = async () => {
      try {
        const unit = await unitsAPI.getOne(id);
        setFormData({
          unitCode: unit.unitCode || '',
          unitName: unit.unitName || '',
          semesterYear: unit.semester && unit.year ? `${unit.semester}|${unit.year}` : '',
          campus: unit.campus || '',
          deliveryMode: unit.deliveryMode || '',
          enrolmentSize: unit.enrolmentSize || '',
          availabilityDeadline: unit.availabilityDeadline
            ? unit.availabilityDeadline.slice(0, 10)
            : ''
        });
      } catch (err) {
        console.error('Error loading unit:', err);
        setError('Could not load this unit.');
      }
    };

    loadUnit();
  }, [id, isEditMode]);

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.unitCode || !formData.unitName || !formData.semesterYear || !formData.deliveryMode) {
      setError('Please fill in Unit Code, Unit Name, Semester, and Delivery Mode.');
      return;
    }

    const [semester, yearStr] = formData.semesterYear.split('|');

    const payload = {
      unitCode: formData.unitCode,
      unitName: formData.unitName,
      semester,
      year: parseInt(yearStr, 10),
      campus: formData.campus || null,
      deliveryMode: formData.deliveryMode,
      enrolmentSize: formData.enrolmentSize ? parseInt(formData.enrolmentSize, 10) : null,
      availabilityDeadline: formData.availabilityDeadline || null
    };

    setError('');
    setIsSubmitting(true);

    try {
      if (isEditMode) {
        await unitsAPI.update(id, payload);
        navigate('/unit-setup');
      } else {
        const result = await unitsAPI.create(payload);
        setCreatedUnit(result);
        setShowSuccess(true);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    navigate('/unit-setup');
  };

  const handleDone = () => {
    navigate('/unit-setup');
  };

  return (
    <div className="uc-dashboard-container">
      <aside className="uc-sidebar">
        <div className="uc-logo-section">
          <div className="uc-logo"><span className="uc-logo-icon">S</span></div>
          <h2 className="uc-brand-name">Sessioneer</h2>
        </div>

        <div className="uc-active-unit">
          <p className="uc-active-label">Active Unit</p>
          <p className="uc-unit-code">{formData.unitCode || 'New Unit'}</p>
        </div>

        <nav className="uc-navigation">
          <a href="#dashboard" className="uc-nav-item">Dashboard</a>
          <Link to="/unit-setup" className="uc-nav-item active">Unit Setup</Link>
          <a href="#sessions" className="uc-nav-item">Sessions</a>
          <a href="#tutors" className="uc-nav-item">Tutors</a>
          <Link to="/uc-availability" className="uc-nav-item">Availability</Link>
          <a href="#schedule-builder" className="uc-nav-item">Schedule Builder</a>
          <Link to="/uc-requests" className="uc-nav-item">Requests</Link>
          <a href="#messages" className="uc-nav-item">Messages</a>
        </nav>

        <div className="uc-user-profile">
          <div className="uc-user-avatar">{avatarLetter}</div>
          <div className="uc-user-info">
            <p className="uc-user-name">{displayName}</p>
            <p className="uc-user-role">Unit Coordinator</p>
          </div>
        </div>
      </aside>

      <main className="uc-main-content">
        <UCPageHeader title="Unit" />

        <div className="cu-content">
          <div className="cu-form-card">
            {showSuccess ? (
              <div className="cu-success">
                <div className="cu-success-icon">&#10003;</div>
                <h2>Unit Created Successfully</h2>
                <div className="cu-summary">
                  <div className="cu-summary-row">
                    <span className="cu-summary-label">Unit Code</span>
                    <span className="cu-summary-value">{createdUnit?.unitCode}</span>
                  </div>
                  <div className="cu-summary-row">
                    <span className="cu-summary-label">Unit Name</span>
                    <span className="cu-summary-value">{createdUnit?.unitName}</span>
                  </div>
                  <div className="cu-summary-row">
                    <span className="cu-summary-label">Semester</span>
                    <span className="cu-summary-value">{createdUnit?.semester}, {createdUnit?.year}</span>
                  </div>
                  <div className="cu-summary-row">
                    <span className="cu-summary-label">Campus</span>
                    <span className="cu-summary-value">{createdUnit?.campus || '-'}</span>
                  </div>
                  <div className="cu-summary-row">
                    <span className="cu-summary-label">Enrolment Size</span>
                    <span className="cu-summary-value">{createdUnit?.enrolmentSize || '-'}</span>
                  </div>
                </div>
                <button className="cu-btn-primary" style={{ width: '100%' }} onClick={handleDone}>
                  Done
                </button>
              </div>
            ) : (
              <>
                <h2>{isEditMode ? 'Edit Unit' : 'Create New Unit'}</h2>

                {error && <p className="cu-error">{error}</p>}

                <form onSubmit={handleSubmit}>
                  <div className="cu-field">
                    <label>Unit Code</label>
                    <input
                      type="text"
                      name="unitCode"
                      value={formData.unitCode}
                      onChange={handleChange}
                      placeholder="e.g. IFN501"
                    />
                  </div>

                  <div className="cu-field">
                    <label>Unit Name</label>
                    <input
                      type="text"
                      name="unitName"
                      value={formData.unitName}
                      onChange={handleChange}
                      placeholder="e.g. Digital Futures"
                    />
                  </div>

                  <div className="cu-field">
                    <label>Semester</label>
                    <select name="semesterYear" value={formData.semesterYear} onChange={handleChange}>
                      <option value="">-- Select a semester --</option>
                      {SEMESTER_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>

                  <div className="cu-field">
                    <label>Campus</label>
                    <select name="campus" value={formData.campus} onChange={handleChange}>
                      <option value="">-- Select campus --</option>
                      <option value="GP">Gardens Point (GP)</option>
                      <option value="KG">Kelvin Grove (KG)</option>
                    </select>
                  </div>

                  <div className="cu-field">
                    <label>Delivery Mode</label>
                    <select name="deliveryMode" value={formData.deliveryMode} onChange={handleChange}>
                      <option value="">-- Select delivery mode --</option>
                      <option value="Online">Online</option>
                      <option value="Physical">Physical</option>
                    </select>
                  </div>

                  <div className="cu-field">
                    <label>Enrolment Size</label>
                    <input
                      type="number"
                      name="enrolmentSize"
                      value={formData.enrolmentSize}
                      onChange={handleChange}
                      placeholder="e.g. 300"
                      min="0"
                    />
                  </div>

                  <div className="cu-field">
                    <label>Availability Deadline (optional)</label>
                    <input
                      type="date"
                      name="availabilityDeadline"
                      value={formData.availabilityDeadline}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="cu-buttons-row">
                    <button type="button" className="cu-btn-cancel" onClick={handleCancel}>
                      Cancel
                    </button>
                    <button type="submit" className="cu-btn-primary" disabled={isSubmitting}>
                      {isSubmitting ? 'Saving...' : (isEditMode ? 'Save Changes' : 'Create Unit')}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default CreateUnit;
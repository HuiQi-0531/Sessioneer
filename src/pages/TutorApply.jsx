import React, { useState } from 'react';
import { tutorApplicationsAPI } from '../config/api';
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

const TutorApply = () => {
  const [formData, setFormData] = useState({ name: '', email: '', phoneNumber: '', workExperience: '' });
  const [resumeFile, setResumeFile] = useState(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.type !== 'application/pdf') {
      setError('Please upload your resume as a PDF file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Resume file is too large (max 5MB).');
      return;
    }
    setError('');
    setResumeFile(file);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!formData.name.trim() || !formData.email.trim()) {
      setError('Name and email are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      let resumeBase64 = null;
      if (resumeFile) {
        resumeBase64 = await fileToBase64(resumeFile);
      }

      await tutorApplicationsAPI.submit({
        name: formData.name.trim(),
        email: formData.email.trim(),
        phoneNumber: formData.phoneNumber.trim(),
        workExperience: formData.workExperience.trim(),
        resumeBase64,
        resumeFilename: resumeFile?.name || null,
        resumeMimeType: resumeFile?.type || null
      });

      setIsSubmitted(true);
    } catch (err) {
      setError(err.message || 'Failed to submit your application. Please try again.');
    } finally {
      setIsSubmitting(false);
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
        <p>Interested in tutoring with us? Fill out the form below and we'll be in touch.</p>

        <form onSubmit={handleSubmit}>
          <div className="ta-field">
            <label>Full name *</label>
            <input type="text" name="name" value={formData.name} onChange={handleChange} required />
          </div>

          <div className="ta-field">
            <label>Email *</label>
            <input type="email" name="email" value={formData.email} onChange={handleChange} required />
          </div>

          <div className="ta-field">
            <label>Phone number</label>
            <input type="tel" name="phoneNumber" value={formData.phoneNumber} onChange={handleChange} placeholder="e.g. 0400 123 456" />
          </div>

          <div className="ta-field">
            <label>Relevant work experience</label>
            <textarea
              name="workExperience"
              value={formData.workExperience}
              onChange={handleChange}
              placeholder="Tell us about any tutoring, teaching, or relevant industry experience..."
            />
          </div>

          <div className="ta-field">
            <label>Resume (PDF)</label>
            <label className="ta-file-input">
              <input type="file" accept="application/pdf" onChange={handleFileChange} />
              {resumeFile ? (
                <div className="ta-file-name">{resumeFile.name}</div>
              ) : (
                <div style={{ color: '#6b7280', fontSize: 13 }}>Click to upload your resume</div>
              )}
              <div className="ta-file-hint">PDF only, max 5MB</div>
            </label>
          </div>

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
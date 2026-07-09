import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { tutorApplicationsAPI } from '../config/api';
import '../styles/TutorApply.css';

const SetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();

  const [invitee, setInvitee] = useState(null);
  const [isVerifying, setIsVerifying] = useState(true);
  const [verifyError, setVerifyError] = useState('');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);

  useEffect(() => {
    const verify = async () => {
      try {
        const data = await tutorApplicationsAPI.verifyInvite(token);
        setInvitee(data);
      } catch (err) {
        setVerifyError(err.message || 'This invite link is invalid.');
      } finally {
        setIsVerifying(false);
      }
    };
    verify();
  }, [token]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitError('');

    if (password.length < 6) {
      setSubmitError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setSubmitError("Passwords don't match.");
      return;
    }

    setIsSubmitting(true);
    try {
      await tutorApplicationsAPI.acceptInvite(token, password);
      setIsDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      setSubmitError(err.message || 'Failed to create your account. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isVerifying) {
    return (
      <div className="ta-page">
        <div className="ta-card">
          <p style={{ textAlign: 'center', color: '#6b7280' }}>Checking your invite link...</p>
        </div>
      </div>
    );
  }

  if (verifyError) {
    return (
      <div className="ta-page">
        <div className="ta-card">
          <div className="ta-success-card">
            <h1>Invite link not valid</h1>
            <p>{verifyError}</p>
            <p style={{ marginTop: 16 }}>
              <Link to="/login" style={{ color: '#4f46e5', fontWeight: 600 }}>Go to login</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isDone) {
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
            <h1>Account created!</h1>
            <p>Taking you to the login page...</p>
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

        <h1>Welcome, {invitee.name}!</h1>
        <p>Set a password to activate your tutor account for {invitee.email}.</p>

        <form onSubmit={handleSubmit}>
          <div className="ta-field">
            <label>New password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="ta-field">
            <label>Confirm password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {submitError && <p className="ta-error">{submitError}</p>}

          <button type="submit" className="ta-submit-btn" disabled={isSubmitting}>
            {isSubmitting ? 'Creating account...' : 'Set Password & Activate Account'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default SetPassword;
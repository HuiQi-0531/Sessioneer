import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/LogoutConfirm.css';

const LogoutConfirm = () => {
  const navigate = useNavigate();

  const currentUser = useMemo(() => {
    const saved = localStorage.getItem('currentUser');
    return saved ? JSON.parse(saved) : null;
  }, []);

  const handleConfirm = () => {
    localStorage.removeItem('currentUser');
    localStorage.removeItem('token');
    navigate('/login', { replace: true });
  };

  const handleCancel = () => {
    navigate(-1);
  };

  return (
    <div className="lo-page">
      <div className="lo-card">
        <div className="lo-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </div>

        <h1>Log out of Sessioneer?</h1>
        <p>
          {currentUser?.name ? `You're signed in as ${currentUser.name}. ` : ''}
          You'll need to log back in to access your account.
        </p>

        <div className="lo-buttons">
          <button className="lo-btn-cancel" onClick={handleCancel}>Cancel</button>
          <button className="lo-btn-confirm" onClick={handleConfirm}>Log Out</button>
        </div>
      </div>
    </div>
  );
};

export default LogoutConfirm;
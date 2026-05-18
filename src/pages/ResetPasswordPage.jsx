import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import '../styles/ResetPassword.css';

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState(1); // 1: Email, 2: Code, 3: New Password, 4: Success
  const [email, setEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [countdown, setCountdown] = useState(60);

  // Countdown timer for Step 2
  useEffect(() => {
    if (step === 2 && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [step, countdown]);

  // Step 1: Send reset code
  const handleSendCode = async (e) => {
    e.preventDefault();
    setError('');

    if (!email) {
      setError('Please enter your email address');
      return;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError('Please enter a valid email address');
      return;
    }

    try {
      // TODO: Replace with actual API call
      console.log('Sending reset code to:', email);
      
      // Simulate API call
      // const response = await fetch('/api/auth/request-reset', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ email })
      // });
      // if (response.ok) {
      //   setStep(2);
      //   setCountdown(60);
      // }

      // For demo, move to next step
      setStep(2);
      setCountdown(60);
    } catch (err) {
      setError('Failed to send reset code. Please try again.');
    }
  };

  // Step 2: Verify code
  const handleVerifyCode = async (e) => {
    e.preventDefault();
    setError('');

    if (!resetCode) {
      setError('Please enter the reset code');
      return;
    }

    if (resetCode.length !== 6) {
      setError('Reset code must be 6 digits');
      return;
    }

    try {
      // TODO: Replace with actual API call
      console.log('Verifying code:', resetCode);
      
      // Simulate API call
      // const response = await fetch('/api/auth/verify-reset-code', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ email, code: resetCode })
      // });
      // if (response.ok) setStep(3);

      // For demo, move to next step
      setStep(3);
    } catch (err) {
      setError('Invalid reset code. Please try again.');
    }
  };

  // Step 3: Reset password
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');

    if (!newPassword) {
      setError('Please enter a new password');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (!confirmPassword) {
      setError('Please confirm your password');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    try {
      // TODO: Replace with actual API call
      console.log('Resetting password');
      
      // Simulate API call
      // const response = await fetch('/api/auth/reset-password', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ email, code: resetCode, newPassword })
      // });
      // if (response.ok) setStep(4);

      // For demo, move to success step
      setStep(4);
    } catch (err) {
      setError('Failed to reset password. Please try again.');
    }
  };

  const handleResendCode = () => {
    setCountdown(60);
    setError('');
    console.log('Resending code to:', email);
    // TODO: Implement resend API call
    alert('Reset code sent!');
  };

  const handleGoToLogin = () => {
    navigate('/login');
  };

  return (
    <div className="reset-password-page">
      <div className="reset-container">
        {/* Logo */}
        <div className="reset-logo">
          <div className="logo">
            <span className="logo-icon">S</span>
          </div>
          <h2 className="brand-name">Sessioneer</h2>
        </div>

        {/* Step 1: Enter Email */}
        {step === 1 && (
          <div className="reset-card">
            <h1>Reset Password</h1>
            <p className="subtitle">
              Enter your email address and we'll send you a code to reset your password.
            </p>

            <form onSubmit={handleSendCode}>
              {error && <div className="error-message">{error}</div>}

              <div className="form-group">
                <label>Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email address"
                  autoFocus
                />
              </div>

              <button type="submit" className="btn-primary">
                Send Reset Code
              </button>
            </form>

            <div className="form-footer">
              <Link to="/login" className="link-text">Back to Login</Link>
            </div>
          </div>
        )}

        {/* Step 2: Enter Reset Code */}
        {step === 2 && (
          <div className="reset-card">
            <h1>Reset Password</h1>
            <p className="subtitle">
              We've sent a reset code to <span className="email-highlight">{email}</span>
            </p>
            <p className="countdown">{countdown}s</p>

            <form onSubmit={handleVerifyCode}>
              {error && <div className="error-message">{error}</div>}

              <div className="form-group">
                <label>Reset Code</label>
                <input
                  type="text"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="Enter 6-digit reset code"
                  maxLength="6"
                  autoFocus
                />
              </div>

              <button type="submit" className="btn-primary">
                Confirm
              </button>
            </form>

            <div className="form-footer">
              <button onClick={handleResendCode} className="link-button">
                didn't received the code? Resend
              </button>
              <button onClick={() => setStep(1)} className="link-button">
                Use different email
              </button>
              <button onClick={() => setStep(1)} className="link-button">
                Back
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Enter New Password */}
        {step === 3 && (
          <div className="reset-card">
            <h1>Reset Password</h1>

            <form onSubmit={handleResetPassword}>
              {error && <div className="error-message">{error}</div>}

              <div className="form-group">
                <label>New Password</label>
                <div className="password-wrapper">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    autoFocus
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                  >
                    {showNewPassword ? (
                      // Eye open (password is visible)
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    ) : (
                      // Eye closed with slash (password is hidden)
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label>Confirm New Password</label>
                <div className="password-wrapper">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Confirm new password"
                  />
                  <button
                    type="button"
                    className="toggle-password"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      // Eye open (password is visible)
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                        <circle cx="12" cy="12" r="3"></circle>
                      </svg>
                    ) : (
                      // Eye closed with slash (password is hidden)
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                        <line x1="1" y1="1" x2="23" y2="23"></line>
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button type="submit" className="btn-primary">
                Reset Password
              </button>
            </form>

            <div className="form-footer">
              <button onClick={() => setStep(2)} className="link-button">
                Back
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Success */}
        {step === 4 && (
          <div className="reset-card success-card">
            <div className="success-icon">
              <div className="checkmark"></div>
            </div>
            <h1>Password Reset Successful!</h1>
            <p className="subtitle">
              Your password has been successfully reset,<br />
              you can now log in with your new password.
            </p>

            <button onClick={handleGoToLogin} className="btn-primary">
              Go to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResetPasswordPage;
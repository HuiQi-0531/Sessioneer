import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '../config/api';
import '../styles/Login.css';

const Login = () => {
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        email: '',
        password: ''
    });

    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleChange = (e) => {
        setFormData({
            ...formData,
            [e.target.name]: e.target.value
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.email || !formData.password) {
            setError('Please enter your email and password');
            return;
        }

        try {
            setError('');
            setIsSubmitting(true);

            const data = await authAPI.login(formData);

            localStorage.setItem('currentUser', JSON.stringify(data.user));

            if (data.user.role === 'coordinator') {
                navigate('/uc-requests');
            } else {
                navigate('/');
            }

        } catch (err) {
            setError(err.message || 'Login failed. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="login-page">

            <div className="login-card">

                <h1>Sessioneer Login</h1>

                <form onSubmit={handleSubmit}>

                    <div className="login-form-group">
                        <label>Email</label>

                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                        />
                    </div>

                    <div className="login-form-group">
                        <label>Password</label>

                        <input
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                        />
                    </div>

                    <div className="forgot-password-row">
                        <Link to="/reset-password" className="forgot-password-btn">
                            Forgot password?
                        </Link>
                    </div>

                    {error && (
                        <p className="login-error-message">{error}</p>
                    )}

                    <button
                        type="submit"
                        className="login-btn"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Logging in...' : 'Log In'}
                    </button>

                </form>

                <Link to="/register" className="login-register-link">
                    Register
                </Link>

            </div>

        </div>
    );
};

export default Login;
import React from 'react';
import { Navigate } from 'react-router-dom';

// Wrap any page that should require login.
// Usage: <ProtectedRoute><SomePage /></ProtectedRoute>
// Usage with role check: <ProtectedRoute allowedRoles={['coordinator']}><SomePage /></ProtectedRoute>
const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = localStorage.getItem('token');
  const savedUser = localStorage.getItem('currentUser');

  if (!token || !savedUser) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles) {
    const currentUser = JSON.parse(savedUser);
    if (!allowedRoles.includes(currentUser.role)) {
      return <Navigate to="/" replace />;
    }
  }

  return children;
};

export default ProtectedRoute;

import React from 'react';
import { Navigate } from 'react-router-dom';
import { useActiveUnit } from '../context/ActiveUnitContext';

// Wrap any page that should require login.
// Usage: <ProtectedRoute><SomePage /></ProtectedRoute>
// Usage with role check: <ProtectedRoute allowedRoles={['coordinator']}><SomePage /></ProtectedRoute>
const ProtectedRoute = ({ children, allowedRoles }) => {
  const token = localStorage.getItem('token');
  const savedUser = localStorage.getItem('currentUser');
  const { activeViewRole, isLoading } = useActiveUnit();

  if (!token || !savedUser) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles) {
    const currentUser = JSON.parse(savedUser);
    const effectiveRole = activeViewRole || currentUser.role;
    if (isLoading) return null;
    if (!allowedRoles.includes(effectiveRole)) {
      const fallbackPath = effectiveRole === 'admin'
        ? '/admin-dashboard'
        : (effectiveRole === 'coordinator' ? '/uc-dashboard' : '/tutor-dashboard');
      return <Navigate to={fallbackPath} replace />;
    }
  }

  return children;
};

export default ProtectedRoute;

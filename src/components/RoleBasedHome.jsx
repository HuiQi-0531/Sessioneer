import React from 'react';
import { Navigate } from 'react-router-dom';
import { useActiveUnit } from '../context/ActiveUnitContext';
import TutorDashboard from '../pages/TutorDashboard';

const RoleBasedHome = () => {
  const { activeViewRole, isLoading } = useActiveUnit();
  const savedUser = localStorage.getItem('currentUser');
  const currentUser = savedUser ? JSON.parse(savedUser) : null;
  const effectiveRole = activeViewRole || currentUser?.role;

  if (isLoading) return null;

  if (effectiveRole === 'coordinator') {
    return <Navigate to="/uc-requests" replace />;
  }

  return <TutorDashboard />;
};

export default RoleBasedHome;

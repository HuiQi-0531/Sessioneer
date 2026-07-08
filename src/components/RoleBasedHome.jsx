import React from 'react';
import { Navigate } from 'react-router-dom';
import TutorDashboard from '../pages/TutorDashboard';

const RoleBasedHome = () => {
  const savedUser = localStorage.getItem('currentUser');
  const currentUser = savedUser ? JSON.parse(savedUser) : null;

  if (currentUser?.role === 'coordinator') {
    return <Navigate to="/uc-requests" replace />;
  }

  return <TutorDashboard />;
};

export default RoleBasedHome;
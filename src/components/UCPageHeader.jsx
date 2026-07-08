import React from 'react';
import NotificationBell from './NotificationBell';
import '../styles/UCRequests.css';

const UCPageHeader = ({ title }) => {
  return (
    <header className="uc-header">
      <h1>{title}</h1>
      <NotificationBell />
    </header>
  );
};

export default UCPageHeader;
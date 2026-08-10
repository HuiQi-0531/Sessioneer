import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { availabilityAPI, messagesAPI, profileAPI, sessionsAPI, tutorApplicationsAPI, tutorsAPI, ucAPI, unitsAPI } from '../config/api';

const ActiveUnitContext = createContext(null);

const STORAGE_KEY = 'activeUnitId';
const ROLE_STORAGE_KEY = 'activeViewRole';
const ROLE_LABELS = {
  coordinator: 'Unit Coordinator',
  tutor: 'Tutor'
};

const getCurrentUser = () => {
  const saved = localStorage.getItem('currentUser');
  return saved ? JSON.parse(saved) : null;
};

const getDefaultRole = (unit, preferredRole, fallbackRole) => {
  const roles = unit?.roles || [];
  if (preferredRole && roles.includes(preferredRole)) return preferredRole;
  if (fallbackRole && roles.includes(fallbackRole)) return fallbackRole;
  return roles[0] || null;
};

export const ActiveUnitProvider = ({ children }) => {
  const [allUnits, setAllUnits] = useState([]);
  const [activeUnitId, setActiveUnitIdState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || null;
  });
  const [activeViewRole, setActiveViewRoleState] = useState(() => {
    return localStorage.getItem(ROLE_STORAGE_KEY) || null;
  });
  const [isLoading, setIsLoading] = useState(true);

  const refreshUnits = useCallback(async () => {
    const latestFallbackRole = getCurrentUser()?.role;

    if (latestFallbackRole !== 'coordinator' && latestFallbackRole !== 'tutor') {
      setAllUnits([]);
      setActiveUnitIdState(null);
      setActiveViewRoleState(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const units = await unitsAPI.getMyAccess();
      setAllUnits(units);

      setActiveUnitIdState(prevId => {
        const stillExists = units.find(u => u.id === prevId);
        if (stillExists) {
          const nextRole = getDefaultRole(stillExists, activeViewRole, latestFallbackRole);
          setActiveViewRoleState(nextRole);
          return prevId;
        }
        // Fall back to the first unit in the list, or null if there are none
        const firstUnit = units[0] || null;
        setActiveViewRoleState(getDefaultRole(firstUnit, activeViewRole, latestFallbackRole));
        return firstUnit ? firstUnit.id : null;
      });
    } catch (error) {
      console.error('Error loading units for ActiveUnitContext:', error);
      setAllUnits([]);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeViewRole]);

  useEffect(() => {
    refreshUnits();
  }, [refreshUnits]);

  useEffect(() => {
    if (activeUnitId) {
      localStorage.setItem(STORAGE_KEY, activeUnitId);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [activeUnitId]);

  useEffect(() => {
    if (activeViewRole) {
      localStorage.setItem(ROLE_STORAGE_KEY, activeViewRole);
    } else {
      localStorage.removeItem(ROLE_STORAGE_KEY);
    }
  }, [activeViewRole]);

  const setActiveUnitId = (id) => {
    const nextUnit = allUnits.find(u => u.id === id);
    setActiveViewRoleState(prevRole => getDefaultRole(nextUnit, prevRole, getCurrentUser()?.role));
    setActiveUnitIdState(id);
  };

  const activeUnit = allUnits.find(u => u.id === activeUnitId) || null;
  const activeUnitRoles = activeUnit?.roles || [];
  const activeUnitRoleKey = activeUnitRoles.join('|');
  const canSwitchRole = activeUnitRoles.length > 1;

  useEffect(() => {
    if (!activeUnit?.unitCode) return;
    availabilityAPI.prefetch(activeUnit.unitCode).catch(() => {
      // Prefetch is only a speed improvement. The page itself will show errors if loading fails.
    });
  }, [activeUnit?.unitCode]);

  useEffect(() => {
    if (!activeUnit?.id || activeViewRole !== 'coordinator' || !activeUnitRoles.includes('coordinator')) return;
    sessionsAPI.prefetch(activeUnit.id).catch(() => {
      // Schedule Builder will show its own error/loading state if the real page load fails.
    });
    tutorsAPI.prefetch(activeUnit.id).catch(() => {
      // Tutors page will show its own error/loading state if the real page load fails.
    });
    tutorApplicationsAPI.prefetch().catch(() => {
      // Tutor Applications page will show its own error/loading state if the real page load fails.
    });
    ucAPI.prefetchRequests().catch(() => {
      // Requests page will show its own error/loading state if the real page load fails.
    });
    messagesAPI.prefetchUnit(activeUnit.id).catch(() => {
      // Messages page will show its own error/loading state if the real page load fails.
    });
    profileAPI.prefetch().catch(() => {
      // Profile page will show its own error/loading state if the real page load fails.
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeUnit?.id, activeViewRole, activeUnitRoleKey]);

  const setActiveViewRole = (role) => {
    if (!['coordinator', 'tutor'].includes(role)) return;
    setActiveViewRoleState(role);
  };

  const value = {
    allUnits,
    activeUnit,
    activeUnitId,
    setActiveUnitId,
    activeViewRole,
    activeViewRoleLabel: ROLE_LABELS[activeViewRole] || '',
    activeUnitRoles,
    canSwitchRole,
    setActiveViewRole,
    refreshUnits,
    isLoading
  };

  return (
    <ActiveUnitContext.Provider value={value}>
      {children}
    </ActiveUnitContext.Provider>
  );
};

export const useActiveUnit = () => {
  const context = useContext(ActiveUnitContext);
  if (!context) {
    throw new Error('useActiveUnit must be used within an ActiveUnitProvider');
  }
  return context;
};

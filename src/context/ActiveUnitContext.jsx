import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { unitsAPI } from '../config/api';

const ActiveUnitContext = createContext(null);

const STORAGE_KEY = 'activeUnitId';

export const ActiveUnitProvider = ({ children }) => {
  const [allUnits, setAllUnits] = useState([]);
  const [activeUnitId, setActiveUnitIdState] = useState(() => {
    return localStorage.getItem(STORAGE_KEY) || null;
  });
  const [isLoading, setIsLoading] = useState(true);

  const currentUser = (() => {
    const saved = localStorage.getItem('currentUser');
    return saved ? JSON.parse(saved) : null;
  })();

  const isCoordinator = currentUser?.role === 'coordinator';

  const refreshUnits = useCallback(async () => {
    if (!isCoordinator) {
      setAllUnits([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const units = await unitsAPI.getAll();
      setAllUnits(units);

      setActiveUnitIdState(prevId => {
        const stillExists = units.some(u => u.id === prevId);
        if (stillExists) return prevId;
        // Fall back to the first unit in the list, or null if there are none
        return units.length > 0 ? units[0].id : null;
      });
    } catch (error) {
      console.error('Error loading units for ActiveUnitContext:', error);
      setAllUnits([]);
    } finally {
      setIsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const setActiveUnitId = (id) => {
    setActiveUnitIdState(id);
  };

  const activeUnit = allUnits.find(u => u.id === activeUnitId) || null;

  const value = {
    allUnits,
    activeUnit,
    activeUnitId,
    setActiveUnitId,
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
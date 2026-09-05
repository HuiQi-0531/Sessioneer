import React, { createContext, useContext, useState } from 'react';

const ImportSessionContext = createContext(null);

const initialState = {
  step: 'upload',
  blocks: [],
  mappings: [],
  sessionTypeOverrides: [],
  existingSessions: [],
  showExisting: true
};

// Holds the CSV import wizard's progress (parsed blocks, column mappings,
// current step) outside the ImportSessions component itself. Without this,
// navigating to any other page unmounts ImportSessions and React wipes its
// local state — so switching to Tutors and back would force the user to
// re-upload the CSV from scratch. Living here means the state survives
// route changes; it's only cleared explicitly via resetImportState().
export const ImportSessionProvider = ({ children }) => {
  const [step, setStep] = useState(initialState.step);
  const [blocks, setBlocks] = useState(initialState.blocks);
  const [mappings, setMappings] = useState(initialState.mappings);
  const [sessionTypeOverrides, setSessionTypeOverrides] = useState(initialState.sessionTypeOverrides);
  const [existingSessions, setExistingSessions] = useState(initialState.existingSessions);
  const [showExisting, setShowExisting] = useState(initialState.showExisting);

  const resetImportState = () => {
    setStep(initialState.step);
    setBlocks(initialState.blocks);
    setMappings(initialState.mappings);
    setSessionTypeOverrides(initialState.sessionTypeOverrides);
    setExistingSessions(initialState.existingSessions);
    setShowExisting(initialState.showExisting);
  };

  const value = {
    step, setStep,
    blocks, setBlocks,
    mappings, setMappings,
    sessionTypeOverrides, setSessionTypeOverrides,
    existingSessions, setExistingSessions,
    showExisting, setShowExisting,
    resetImportState
  };

  return (
    <ImportSessionContext.Provider value={value}>
      {children}
    </ImportSessionContext.Provider>
  );
};

export const useImportSession = () => {
  const ctx = useContext(ImportSessionContext);
  if (!ctx) {
    throw new Error('useImportSession must be used within an ImportSessionProvider');
  }
  return ctx;
};
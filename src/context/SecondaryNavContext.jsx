import { createContext, useContext, useState, useCallback } from 'react';

const SecondaryNavContext = createContext(null);

export const SecondaryNavProvider = ({ children }) => {
  const [config, setConfig] = useState(null);

  const register = useCallback((cfg) => setConfig(cfg), []);
  const unregister = useCallback(() => setConfig(null), []);

  return (
    <SecondaryNavContext.Provider value={{ config, register, unregister }}>
      {children}
    </SecondaryNavContext.Provider>
  );
};

export const useSecondaryNav = () => {
  const ctx = useContext(SecondaryNavContext);
  if (!ctx) return { config: null, register: () => {}, unregister: () => {} };
  return ctx;
};

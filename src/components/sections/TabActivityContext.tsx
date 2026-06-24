import React, { useEffect, useContext } from 'react';

export type TabActivityMap = Record<string, boolean>;

export const TabActivityContext = React.createContext<{
  activity: TabActivityMap;
  setTabActive: (tabId: string, active: boolean) => void;
}>({ activity: {}, setTabActive: () => {} });

export function useTabActivity(tabId: string, isActive: boolean) {
  const { setTabActive } = useContext(TabActivityContext);
  useEffect(() => {
    setTabActive(tabId, isActive);
    return () => setTabActive(tabId, false);
  }, [tabId, isActive, setTabActive]);
}

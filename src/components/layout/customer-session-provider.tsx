"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ponyoApi, PONYO_API_BASE_URL, type CustomerProfile } from "@/services/ponyo-api.client";

type CustomerSessionValue = {
  customer: CustomerProfile | null;
  setCustomer: (customer: CustomerProfile | null) => void;
};

const CustomerSessionContext = createContext<CustomerSessionValue | null>(null);

export function CustomerSessionProvider({ children }: { children: ReactNode }) {
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  useEffect(() => {
    if (!PONYO_API_BASE_URL) return;
    let active = true;
    void ponyoApi.getMe().then((profile) => {
      if (active) setCustomer(profile);
    }).catch(() => {
      if (active) setCustomer(null);
    });
    return () => { active = false; };
  }, []);

  const value = useMemo(() => ({ customer, setCustomer }), [customer]);
  return <CustomerSessionContext.Provider value={value}>{children}</CustomerSessionContext.Provider>;
}

export function useCustomerSession() {
  const value = useContext(CustomerSessionContext);
  if (!value) throw new Error("useCustomerSession must be used inside CustomerSessionProvider");
  return value;
}

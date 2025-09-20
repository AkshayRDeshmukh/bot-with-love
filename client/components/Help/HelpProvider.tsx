import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

type HelpContextValue = {
  open: boolean;
  setOpen: (v: boolean) => void;
  setContent: (c: React.ReactNode) => void;
  content: React.ReactNode;
};

const HelpContext = createContext<HelpContextValue | null>(null);

export const HelpProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  const [content, setContent] = useState<React.ReactNode>(null);

  const value = useMemo(
    () => ({ open, setOpen, setContent, content }),
    [open, content],
  );

  return (
    <HelpContext.Provider value={value}>
      {children}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-[96vw] sm:max-w-md lg:max-w-lg p-6">
          <SheetHeader>
            <div className="flex items-center justify-between">
              <SheetTitle>Help</SheetTitle>
              <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
            </div>
          </SheetHeader>
          <div className="mt-4 prose max-w-none text-sm">
            {content ?? <div>No help available for this page.</div>}
          </div>
        </SheetContent>
      </Sheet>
    </HelpContext.Provider>
  );
};

export const useHelpContext = () => {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error("useHelpContext must be used within HelpProvider");
  return ctx;
};

export default HelpProvider;

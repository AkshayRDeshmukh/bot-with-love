import React from "react";
import { useHelpContext } from "./HelpProvider";
import { Button } from "@/components/ui/button";

export const HelpButton: React.FC<{ className?: string }> = ({ className }) => {
  const { setOpen, setContent } = useHelpContext();

  const onOpen = () => {
    // If no content is set yet, open panel with default message; pages can override via usePageHelp
    setContent((prev: any) => prev ?? (
      <div>
        <p className="mb-2">This panel shows contextual help for the current page. Pages can set specific guidance here.</p>
        <p className="text-xs text-muted-foreground">No specific help is set for this page.</p>
      </div>
    ));
    setOpen(true);
  };

  return (
    <Button
      size="sm"
      onClick={onOpen}
      className={`h-8 w-8 rounded-full p-0 flex items-center justify-center ${className ?? ""} text-white bg-primary hover:bg-primary/90 ring-1 ring-border`}
      aria-label="Help"
      title="Help"
    >
      <span className="font-semibold">?</span>
    </Button>
  );
};

export default HelpButton;

import { useEffect } from "react";
import { useHelpContext } from "@/components/Help/HelpProvider";

// Hook for pages to set help content while mounted
export default function usePageHelp(content: React.ReactNode) {
  const { setContent } = useHelpContext();

  useEffect(() => {
    setContent(content);
    return () => {
      // clear content on unmount so default shows for other pages
      setContent(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

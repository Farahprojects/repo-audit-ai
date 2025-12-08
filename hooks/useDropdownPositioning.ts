import React, { useEffect } from 'react';

interface UseDropdownPositioningProps {
  dropdownRef: React.RefObject<HTMLDivElement>;
  tierButtonRefs: React.MutableRefObject<Record<string, HTMLButtonElement | null>>;
  upgradesButtonRef: React.RefObject<HTMLButtonElement>;
  historyDropdownOpen: string | null;
  upgradesDropdownOpen: boolean;
  setHistoryDropdownOpen: (value: string | null) => void;
  setUpgradesDropdownOpen: (value: boolean) => void;
}

export const useDropdownPositioning = ({
  dropdownRef,
  tierButtonRefs,
  upgradesButtonRef,
  historyDropdownOpen,
  upgradesDropdownOpen,
  setHistoryDropdownOpen,
  setUpgradesDropdownOpen,
}: UseDropdownPositioningProps) => {
  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        const clickedOnTierButton = Object.values(tierButtonRefs.current).some(
          (ref: HTMLButtonElement | null) => ref && ref.contains(event.target as Node)
        );
        const clickedOnUpgradesButton = upgradesButtonRef.current?.contains(event.target as Node);
        if (!clickedOnTierButton && !clickedOnUpgradesButton) {
          setHistoryDropdownOpen(null);
          setUpgradesDropdownOpen(false);
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [dropdownRef, tierButtonRefs, upgradesButtonRef, setHistoryDropdownOpen, setUpgradesDropdownOpen]);
};

import { useEffect, useState } from "react";

export const TABLET_MEDIA_QUERY = [
  "(min-width: 768px)",
  "(max-width: 1366px)",
  "(pointer: coarse)",
].join(" and ");

export const SMARTPHONE_MEDIA_QUERY = "(max-width: 767px)";

function readOverride(parameter) {
  const value = new URLSearchParams(window.location.search).get("tablet");
  if (parameter === "smartphone") {
    const smartphoneValue = new URLSearchParams(window.location.search).get("smartphone");
    if (smartphoneValue === "1" || smartphoneValue === "true") return true;
    if (smartphoneValue === "0" || smartphoneValue === "false") return false;
    return null;
  }
  if (value === "1" || value === "true") return true;
  if (value === "0" || value === "false") return false;
  return null;
}

export function useTabletMode() {
  const [isTabletMode, setIsTabletMode] = useState(() => {
    const override = readOverride();
    return override ?? window.matchMedia(TABLET_MEDIA_QUERY).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(TABLET_MEDIA_QUERY);
    const update = () => {
      const override = readOverride();
      setIsTabletMode(override ?? mediaQuery.matches);
    };

    mediaQuery.addEventListener("change", update);
    window.addEventListener("popstate", update);
    update();

    return () => {
      mediaQuery.removeEventListener("change", update);
      window.removeEventListener("popstate", update);
    };
  }, []);

  return isTabletMode;
}

export function useSmartphoneMode() {
  const [isSmartphoneMode, setIsSmartphoneMode] = useState(() => {
    const override = readOverride("smartphone");
    return override ?? window.matchMedia(SMARTPHONE_MEDIA_QUERY).matches;
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia(SMARTPHONE_MEDIA_QUERY);
    const update = () => {
      const override = readOverride("smartphone");
      setIsSmartphoneMode(override ?? mediaQuery.matches);
    };

    mediaQuery.addEventListener("change", update);
    window.addEventListener("popstate", update);
    update();

    return () => {
      mediaQuery.removeEventListener("change", update);
      window.removeEventListener("popstate", update);
    };
  }, []);

  return isSmartphoneMode;
}

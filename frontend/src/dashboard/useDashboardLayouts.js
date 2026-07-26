import { useCallback, useMemo, useState } from "react";
import {
  cloneDashboardState,
  DEFAULT_DASHBOARD_STATE,
  WIDGET_DEFINITIONS,
} from "./dashboardConfig.js";

const STORAGE_PREFIX = "mes.dashboard.layout.v1";
const validWidgetIds = new Set(WIDGET_DEFINITIONS.map((widget) => widget.id));

function storageKey(user) {
  return `${STORAGE_PREFIX}.${user?.id || user?.username || "authenticated-user"}`;
}

function normaliseState(candidate) {
  const fallback = cloneDashboardState();
  if (!candidate || candidate.schemaVersion !== 1 || !candidate.profiles) return fallback;

  for (const [profileId, defaultProfile] of Object.entries(fallback.profiles)) {
    const storedProfile = candidate.profiles[profileId];
    if (!storedProfile) continue;
    const visibleWidgetIds = Array.isArray(storedProfile.visibleWidgetIds)
      ? storedProfile.visibleWidgetIds.filter((id) => validWidgetIds.has(id))
      : defaultProfile.visibleWidgetIds;
    fallback.profiles[profileId] = {
      ...defaultProfile,
      ...storedProfile,
      id: profileId,
      layouts: { ...defaultProfile.layouts, ...(storedProfile.layouts || {}) },
      visibleWidgetIds,
    };
  }

  if (fallback.profiles[candidate.activeProfileId]) {
    fallback.activeProfileId = candidate.activeProfileId;
  }
  return fallback;
}

function loadState(user) {
  try {
    return normaliseState(JSON.parse(localStorage.getItem(storageKey(user))));
  } catch {
    return cloneDashboardState();
  }
}

function persistState(user, state) {
  localStorage.setItem(storageKey(user), JSON.stringify(state));
}

export function useDashboardLayouts(user) {
  const [savedState, setSavedState] = useState(() => loadState(user));
  const [draftProfile, setDraftProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const activeProfile = savedState.profiles[savedState.activeProfileId];
  const displayedProfile = draftProfile || activeProfile;

  const startEditing = useCallback(() => {
    setDraftProfile(cloneDashboardState(activeProfile));
    setIsEditing(true);
  }, [activeProfile]);

  const cancelEditing = useCallback(() => {
    setDraftProfile(null);
    setIsEditing(false);
  }, []);

  const saveEditing = useCallback(() => {
    if (!draftProfile) return;
    setSavedState((current) => {
      const next = {
        ...current,
        profiles: { ...current.profiles, [current.activeProfileId]: draftProfile },
      };
      persistState(user, next);
      return next;
    });
    setDraftProfile(null);
    setIsEditing(false);
  }, [draftProfile, user]);

  const resetDraft = useCallback(() => {
    const defaultProfile = DEFAULT_DASHBOARD_STATE.profiles[savedState.activeProfileId];
    setDraftProfile(cloneDashboardState(defaultProfile));
  }, [savedState.activeProfileId]);

  const updateLayout = useCallback((breakpoint, layout) => {
    setDraftProfile((current) => {
      if (!current || layoutItemsEqual(current.layouts[breakpoint], layout)) return current;
      return {
        ...current,
        layouts: { ...current.layouts, [breakpoint]: layout },
      };
    });
  }, []);

  const toggleWidget = useCallback((widgetId) => {
    setDraftProfile((current) => {
      if (!current) return current;
      const isVisible = current.visibleWidgetIds.includes(widgetId);
      return {
        ...current,
        visibleWidgetIds: isVisible
          ? current.visibleWidgetIds.filter((id) => id !== widgetId)
          : [...current.visibleWidgetIds, widgetId],
      };
    });
  }, []);

  const selectProfile = useCallback((profileId) => {
    if (!savedState.profiles[profileId]) return;
    const next = { ...savedState, activeProfileId: profileId };
    persistState(user, next);
    setSavedState(next);
    setDraftProfile(null);
    setIsEditing(false);
  }, [savedState, user]);

  const visibleWidgetIds = useMemo(
    () => new Set(displayedProfile.visibleWidgetIds),
    [displayedProfile.visibleWidgetIds],
  );

  return {
    profiles: savedState.profiles,
    activeProfileId: savedState.activeProfileId,
    profile: displayedProfile,
    visibleWidgetIds,
    isEditing,
    startEditing,
    cancelEditing,
    saveEditing,
    resetDraft,
    updateLayout,
    toggleWidget,
    selectProfile,
  };
}

function layoutItemsEqual(current, next) {
  if (current === next) return true;
  const currentItems = current || [];
  const nextItems = next || [];
  if (currentItems.length !== nextItems.length) return false;
  const nextById = new Map(nextItems.map((item) => [item.i, item]));
  return currentItems.every((item) => {
    const candidate = nextById.get(item.i);
    return candidate
      && item.x === candidate.x
      && item.y === candidate.y
      && item.w === candidate.w
      && item.h === candidate.h;
  });
}

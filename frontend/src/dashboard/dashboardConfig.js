const widget = (id, title, description, category, minW, minH) => ({
  id,
  title,
  description,
  category,
  minW,
  minH,
});

export const WIDGET_DEFINITIONS = [
  widget("production-flow", "Produktionsfluss", "Live-Überblick der verbundenen Stationen und aktueller Produktionsstatus", "Produktion", 4, 6),
  widget("oee", "OEE Live-Score", "Aktueller OEE nach Komponenten", "Produktion", 3, 3),
  widget("status", "Betriebsstatus", "Status der gesamten Anlage", "Produktion", 3, 4),
  widget("connected", "Verbundene Stationen", "Aktuell verbunden", "Kennzahlen", 2, 3),
  widget("alarms", "Aktive Alarme", "Aktuell", "Kennzahlen", 2, 3),
  widget("throughput", "Durchsatz", "Aktuell", "Kennzahlen", 2, 3),
  widget("yield", "Yield", "Aktuell", "Kennzahlen", 2, 3),
  widget("trends", "Historische Trends", "Verlauf ausgewählter Kennzahlen", "Kennzahlen", 4, 5),
  widget("reports", "Berichte", "Schnellzugriff auf Reports", "System", 2, 4),
];

export const WIDGET_BY_ID = Object.fromEntries(
  WIDGET_DEFINITIONS.map((definition) => [definition.id, definition]),
);

const withConstraints = (breakpoint, items) => items.map((item) => {
  const definition = WIDGET_BY_ID[item.i];
  const columnLimit = { lg: 12, md: 8, sm: 4, xs: 2, xxs: 1 }[breakpoint];
  return {
    ...item,
    minW: Math.min(definition.minW, columnLimit),
    minH: definition.minH,
  };
});

const leitstandLayouts = {
  lg: withConstraints("lg", [
    { i: "production-flow", x: 0, y: 0, w: 8, h: 8 },
    { i: "oee", x: 8, y: 0, w: 4, h: 3 },
    { i: "status", x: 8, y: 3, w: 4, h: 5 },
    { i: "connected", x: 0, y: 8, w: 3, h: 3 },
    { i: "alarms", x: 3, y: 8, w: 3, h: 3 },
    { i: "throughput", x: 6, y: 8, w: 3, h: 3 },
    { i: "yield", x: 9, y: 8, w: 3, h: 3 },
    { i: "trends", x: 0, y: 11, w: 9, h: 5 },
    { i: "reports", x: 9, y: 11, w: 3, h: 5 },
  ]),
  md: withConstraints("md", [
    { i: "production-flow", x: 0, y: 0, w: 8, h: 8 },
    { i: "oee", x: 0, y: 8, w: 4, h: 3 },
    { i: "status", x: 4, y: 8, w: 4, h: 5 },
    { i: "connected", x: 0, y: 11, w: 2, h: 3 },
    { i: "alarms", x: 2, y: 11, w: 2, h: 3 },
    { i: "throughput", x: 0, y: 14, w: 2, h: 3 },
    { i: "yield", x: 2, y: 14, w: 2, h: 3 },
    { i: "trends", x: 0, y: 17, w: 8, h: 5 },
    { i: "reports", x: 4, y: 13, w: 4, h: 4 },
  ]),
  sm: withConstraints("sm", [
    { i: "production-flow", x: 0, y: 0, w: 4, h: 8 },
    { i: "oee", x: 0, y: 8, w: 4, h: 3 },
    { i: "status", x: 0, y: 11, w: 4, h: 5 },
    { i: "connected", x: 0, y: 16, w: 2, h: 3 },
    { i: "alarms", x: 2, y: 16, w: 2, h: 3 },
    { i: "throughput", x: 0, y: 19, w: 2, h: 3 },
    { i: "yield", x: 2, y: 19, w: 2, h: 3 },
    { i: "trends", x: 0, y: 22, w: 4, h: 6 },
    { i: "reports", x: 0, y: 28, w: 4, h: 4 },
  ]),
  xs: withConstraints("xs", WIDGET_DEFINITIONS.map((definition, index) => ({
    i: definition.id,
    x: 0,
    y: index * (definition.id === "production-flow" ? 8 : 4),
    w: 2,
    h: definition.id === "production-flow" ? 8 : definition.id === "trends" ? 6 : Math.max(3, definition.minH),
  }))),
  xxs: withConstraints("xxs", WIDGET_DEFINITIONS.map((definition, index) => ({
    i: definition.id,
    x: 0,
    y: index * (definition.id === "production-flow" ? 8 : 4),
    w: 1,
    h: definition.id === "production-flow" ? 8 : definition.id === "trends" ? 6 : Math.max(3, definition.minH),
  }))),
};

const analyseLayouts = {
  ...leitstandLayouts,
  lg: withConstraints("lg", [
    { i: "trends", x: 0, y: 0, w: 8, h: 8 },
    { i: "oee", x: 8, y: 0, w: 4, h: 3 },
    { i: "status", x: 8, y: 3, w: 4, h: 5 },
    { i: "production-flow", x: 0, y: 8, w: 12, h: 7 },
    { i: "connected", x: 0, y: 15, w: 3, h: 3 },
    { i: "alarms", x: 3, y: 15, w: 3, h: 3 },
    { i: "throughput", x: 6, y: 15, w: 3, h: 3 },
    { i: "yield", x: 9, y: 15, w: 3, h: 3 },
    { i: "reports", x: 9, y: 18, w: 3, h: 4 },
  ]),
};

const allWidgetIds = WIDGET_DEFINITIONS.map((definition) => definition.id);

export const DEFAULT_DASHBOARD_STATE = {
  schemaVersion: 1,
  activeProfileId: "leitstand",
  profiles: {
    leitstand: {
      id: "leitstand",
      name: "Leitstand",
      layouts: leitstandLayouts,
      visibleWidgetIds: allWidgetIds,
    },
    analyse: {
      id: "analyse",
      name: "Analyse",
      layouts: analyseLayouts,
      visibleWidgetIds: allWidgetIds,
    },
  },
};

export function cloneDashboardState(value = DEFAULT_DASHBOARD_STATE) {
  return JSON.parse(JSON.stringify(value));
}

import React from "react";
import { MemoryRouter } from "react-router-dom";
import "../src/tailwind.css";
import "../src/app.css";
import "../src/pages/dashboard.css";
import "../src/components/dashboard/tablet-dashboard.css";
import "../src/design-system/styles/index.css";

export const globalTypes = {
  theme: {
    description: "MES-Farbschema",
    defaultValue: "light",
    toolbar: {
      icon: "paintbrush",
      items: [
        { value: "light", title: "Hell" },
        { value: "dark", title: "Dunkel" },
      ],
    },
  },
};

export const decorators = [
  (Story, context) => {
    const theme = context.globals.theme || "light";
    document.documentElement.dataset.theme = theme;
    return (
      <MemoryRouter>
        <div className="sb-mes-canvas">
          <Story />
        </div>
      </MemoryRouter>
    );
  },
];

export const parameters = {
  controls: {
    matchers: {
      color: /(background|color)$/i,
      date: /Date$/i,
    },
  },
  a11y: {
    test: "error",
  },
  layout: "centered",
  options: {
    storySort: {
      order: ["Grundlagen", "Komponenten", "Muster", "MES-Seiten", "Dashboard"],
    },
  },
};

export const tags = ["autodocs"];

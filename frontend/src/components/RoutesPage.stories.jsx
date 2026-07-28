import React from "react";
import { AuthProvider } from "../providers/AuthProvider.jsx";
import RoutesPage from "../pages/Routes.jsx";

const originalFetch = globalThis.fetch;

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function installRouteApiMock() {
  const header = btoa(JSON.stringify({ alg: "none", typ: "JWT" }));
  const payload = btoa(JSON.stringify({
    sub: "storybook-admin",
    username: "admin",
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + 3_600,
  }));
  localStorage.setItem("jwt_token", `${header}.${payload}.storybook`);

  globalThis.fetch = async (input, options = {}) => {
    const url = String(input);
    const method = options.method || "GET";

    if (url.endsWith("/api/v1/products") && method === "GET") {
      return jsonResponse([]);
    }
    if (url.endsWith("/api/v1/machine-profiles") && method === "GET") {
      return jsonResponse({
        items: [
          {
            profileId: "profile-story",
            document: {
              machineId: "lernfabrik-c",
              displayName: "Lernfabrik 4.0 – Linie C",
              stations: [
                {
                  stationId: "presse01",
                  resourceId: 30,
                  displayName: "Presse 01",
                  enabled: true,
                  routing: {
                    sequence: 1,
                    operationNo: 7,
                    operation: "Pressen",
                  },
                },
                {
                  stationId: "inspektion01",
                  resourceId: 50,
                  displayName: "Inspektion 01",
                  enabled: true,
                  routing: {
                    sequence: 2,
                    operationNo: 9,
                    operation: "Prüfen",
                  },
                },
              ],
            },
          },
        ],
      });
    }
    return originalFetch(input, options);
  };
}

export default {
  title: "MES-Seiten/Routenplanung",
  component: RoutesPage,
  parameters: {
    layout: "fullscreen",
  },
  decorators: [
    (Story) => {
      installRouteApiMock();
      return (
        <AuthProvider>
          <Story />
        </AuthProvider>
      );
    },
  ],
};

export const Produktarbeitsplan = {};

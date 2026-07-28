import React from 'react';
import MachineProfileWizard from './MachineProfileWizard.jsx';

const originalFetch = globalThis.fetch;

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function installProfileApiMock() {
  globalThis.fetch = async (input, options = {}) => {
    const url = String(input);
    const method = options.method || 'GET';

    if (url.includes('/machine-profiles/suggestions')) {
      return jsonResponse({
        machineId: 'lernfabrik-4-0-linie-c',
        resourceId: 1,
      });
    }
    if (url.endsWith('/machine-profiles') && method === 'GET') {
      return jsonResponse({ items: [] });
    }
    if (url.endsWith('/machine-profiles') && method === 'POST') {
      const body = JSON.parse(options.body);
      return jsonResponse({
        id: 'version-1',
        profileId: '00000000-0000-4000-8000-000000000001',
        version: 1,
        machineId: body.document.machineId,
        status: 'draft',
        active: false,
        document: body.document,
        createdBy: 'storybook',
        changeSummary: body.changeSummary || 'Profilentwurf angelegt',
      });
    }
    if (
      url.includes('/machine-profiles/00000000-0000-4000-8000-000000000001') &&
      method === 'PATCH'
    ) {
      const body = JSON.parse(options.body);
      return jsonResponse({
        id: 'version-2',
        profileId: '00000000-0000-4000-8000-000000000001',
        version: 2,
        machineId: body.document.machineId,
        status: 'draft',
        active: false,
        document: body.document,
        createdBy: 'storybook',
        changeSummary: body.changeSummary || 'Profilentwurf geändert',
      });
    }
    return originalFetch(input, options);
  };
}

export default {
  title: 'MES-Seiten/Maschinenprofil-Assistent',
  component: MachineProfileWizard,
  parameters: {
    layout: 'fullscreen',
  },
  decorators: [
    (Story) => {
      installProfileApiMock();
      return <Story />;
    },
  ],
};

export const OfflineFirst = {
  args: {
    isOpen: true,
    canEdit: true,
    onClose: () => {},
    onProfilesChanged: () => {},
  },
};

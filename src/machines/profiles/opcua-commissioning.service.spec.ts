import { ConfigService } from '@nestjs/config';
import { OpcUaCommissioningService } from './opcua-commissioning.service';
import type { MachineProfile } from './machine-profile.types';

jest.mock('node-opcua', () => ({}));

describe('OpcUaCommissioningService', () => {
  it('rejects a connection test without an enabled station', async () => {
    const service = new OpcUaCommissioningService(new ConfigService());
    const profile = {
      stations: [{ enabled: false }],
    } as unknown as MachineProfile;

    await expect(service.testConnection(profile)).resolves.toMatchObject({
      valid: false,
      readOnly: true,
      message: 'Keine aktivierte Station zum Testen vorhanden.',
      stations: [],
    });
  });
});

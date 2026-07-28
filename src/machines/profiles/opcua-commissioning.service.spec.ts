import { ConfigService } from '@nestjs/config';
import { OpcUaCommissioningService } from './opcua-commissioning.service';
import type { MachineProfile } from './machine-profile.types';

jest.mock('node-opcua', () => ({}));

describe('OpcUaCommissioningService', () => {
  it('rejects incomplete transient commissioning connections', async () => {
    const service = new OpcUaCommissioningService(new ConfigService());

    await expect(service.testConnectionConfig({})).rejects.toThrow(
      'Ungültige OPC-UA-Verbindungskonfiguration',
    );
    await expect(service.browseConnection({})).rejects.toThrow(
      'Ungültige OPC-UA-Verbindungskonfiguration',
    );
    await expect(service.discoverSignals({})).rejects.toThrow(
      'Ungültige OPC-UA-Verbindungskonfiguration',
    );
  });

  it('maps the Siemens reference process data names deterministically', () => {
    const service = new OpcUaCommissioningService(new ConfigService());
    const suggest = (name: string) =>
      (service as any).signalSuggestion(name) as {
        key: string;
        role: string;
      };

    expect(suggest('iCarrierID')).toMatchObject({
      key: 'carrierId',
      role: 'carrierId',
    });
    expect(suggest('iResourceID')).toMatchObject({
      key: 'resourceId',
      role: 'resourceId',
    });
    expect(suggest('iStepNo')).toMatchObject({
      key: 'stepNumber',
      role: 'stepNumber',
    });
    expect(suggest('iPar4')).toMatchObject({
      key: 'parameter4',
      role: 'routingParameter',
    });
    expect(suggest('ldtTimeStamp')).toMatchObject({
      key: 'timestamp',
      role: 'timestamp',
    });
  });

  it('assigns handshake signals to the side that owns each value', () => {
    const service = new OpcUaCommissioningService(new ConfigService());
    const direction = (role: string) =>
      (service as any).signalDirection(role) as string;

    expect(direction('workRequest')).toBe('machineToMes');
    expect(direction('carrierId')).toBe('machineToMes');
    expect(direction('completedCarrierId')).toBe('machineToMes');
    expect(direction('requestAccepted')).toBe('mesToMachine');
    expect(direction('operationId')).toBe('mesToMachine');
    expect(direction('routingParameter')).toBe('mesToMachine');
  });

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

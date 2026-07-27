import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Not, Repository } from 'typeorm';
import { MachineEntity } from '../machine.entity';
import type {
  MachineProfile,
  MachineStationProfile,
} from './machine-profile.types';
import { MachineProfileEntity } from './machine-profile.entity';
import { MachineProfileService } from './machine-profile.service';

type ProfileDocument = Record<string, any>;

@Injectable()
export class MachineProfileManagementService {
  constructor(
    @InjectRepository(MachineProfileEntity)
    private readonly versions: Repository<MachineProfileEntity>,
    @InjectRepository(MachineEntity)
    private readonly machines: Repository<MachineEntity>,
    private readonly dataSource: DataSource,
    private readonly validator: MachineProfileService,
  ) {}

  async list() {
    const versions = await this.versions.find({
      order: { created_at: 'DESC', version: 'DESC' },
    });
    const latest = new Map<string, MachineProfileEntity>();
    for (const version of versions) {
      if (!latest.has(version.profile_id))
        latest.set(version.profile_id, version);
    }
    const activeByProfile = new Map(
      versions
        .filter((entry) => entry.active)
        .map((entry) => [entry.profile_id, entry] as const),
    );
    return {
      items: [...latest.values()].map((entry) =>
        this.present(entry, activeByProfile.get(entry.profile_id)),
      ),
    };
  }

  async find(profileId: string) {
    const latest = await this.latest(profileId);
    const active = await this.versions.findOne({
      where: { profile_id: profileId, active: true },
    });
    return this.present(latest, active || undefined);
  }

  async history(profileId: string) {
    const items = await this.versions.find({
      where: { profile_id: profileId },
      order: { version: 'DESC' },
    });
    if (!items.length)
      throw new NotFoundException('Maschinenprofil nicht gefunden');
    return { items: items.map((entry) => this.present(entry)) };
  }

  async suggestions(displayName?: string) {
    const [machineRows, profileRows] = await Promise.all([
      this.machines.find({ select: { resource_id: true } }),
      this.versions.find({ order: { version: 'DESC' } }),
    ]);
    const usedResources = new Set<number>();
    for (const machine of machineRows) {
      if (machine.resource_id != null) usedResources.add(machine.resource_id);
    }
    for (const row of this.latestRows(profileRows)) {
      for (const station of this.documentStations(row.document)) {
        usedResources.add(station.resourceId);
      }
    }
    let resourceId = 1;
    while (usedResources.has(resourceId)) resourceId += 1;

    const base = this.slug(displayName || 'neue-maschine') || 'neue-maschine';
    const usedMachineIds = new Set(
      this.latestRows(profileRows).map((row) => row.machine_id),
    );
    let machineId = base;
    let suffix = 2;
    while (usedMachineIds.has(machineId)) machineId = `${base}-${suffix++}`;
    return { machineId, resourceId };
  }

  async create(
    rawDocument: Record<string, unknown>,
    user: string,
    changeSummary?: string,
  ) {
    const document = this.safeDocument(rawDocument);
    document.operatingMode = 'observe';
    const machineId = this.requiredTechnicalId(document.machineId, 'machineId');
    await this.assertIdentifiersAvailable(document, undefined);
    const entity = this.versions.create({
      profile_id: crypto.randomUUID(),
      version: 1,
      machine_id: machineId,
      status: 'draft',
      active: false,
      document: document as MachineProfile,
      validation_result: null,
      live_validation_result: null,
      created_by: user,
      change_summary: changeSummary?.trim() || 'Profilentwurf angelegt',
    });
    return this.present(await this.versions.save(entity));
  }

  async update(
    profileId: string,
    rawDocument: Record<string, unknown>,
    user: string,
    changeSummary?: string,
  ) {
    const previous = await this.latest(profileId);
    const document = this.safeDocument(rawDocument);
    const machineId = this.requiredTechnicalId(document.machineId, 'machineId');
    if (machineId !== previous.machine_id) {
      throw new ConflictException(
        'Die technische machineId ist nach dem Anlegen stabil und kann nicht geändert werden',
      );
    }
    await this.assertIdentifiersAvailable(document, profileId);
    const entity = this.versions.create({
      profile_id: profileId,
      version: previous.version + 1,
      machine_id: machineId,
      status: 'draft',
      active: false,
      document: document as MachineProfile,
      validation_result: null,
      live_validation_result: null,
      created_by: user,
      change_summary: changeSummary?.trim() || 'Profilentwurf geändert',
    });
    return this.present(await this.versions.save(entity));
  }

  async addStation(
    profileId: string,
    station: Record<string, unknown>,
    user: string,
  ) {
    const current = await this.latest(profileId);
    const document = this.clone(current.document) as ProfileDocument;
    document.stations = [
      ...this.documentStations(document),
      station,
    ] as MachineStationProfile[];
    return this.update(profileId, document, user, 'Station hinzugefügt');
  }

  async updateStation(
    profileId: string,
    stationId: string,
    station: Record<string, unknown>,
    user: string,
  ) {
    const current = await this.latest(profileId);
    const document = this.clone(current.document) as ProfileDocument;
    const stations = this.documentStations(document);
    const index = stations.findIndex((entry) => entry.stationId === stationId);
    if (index < 0) throw new NotFoundException('Station nicht gefunden');
    document.stations = stations.map((entry, stationIndex) =>
      stationIndex === index ? station : entry,
    ) as MachineStationProfile[];
    return this.update(profileId, document, user, 'Station geändert');
  }

  async removeStation(profileId: string, stationId: string, user: string) {
    const current = await this.latest(profileId);
    const document = this.clone(current.document) as ProfileDocument;
    const stations = this.documentStations(document);
    if (!stations.some((station) => station.stationId === stationId)) {
      throw new NotFoundException('Station nicht gefunden');
    }
    document.stations = stations.filter(
      (station) => station.stationId !== stationId,
    );
    return this.update(
      profileId,
      document,
      user,
      'Station in neuer Profilversion entfernt',
    );
  }

  async replaceSignals(
    profileId: string,
    stationId: string,
    signals: Record<string, unknown>[],
    user: string,
  ) {
    const current = await this.latest(profileId);
    const document = this.clone(current.document) as ProfileDocument;
    const stations = this.documentStations(document);
    const station = stations.find((entry) => entry.stationId === stationId);
    if (!station) throw new NotFoundException('Station nicht gefunden');
    document.stations = stations.map((entry) =>
      entry.stationId === stationId ? { ...entry, signals } : entry,
    ) as MachineStationProfile[];
    return this.update(profileId, document, user, 'Signalzuordnung geändert');
  }

  async validate(profileId: string) {
    const entity = await this.latest(profileId);
    const validation = this.validator.validateDocument(entity.document);
    const globalErrors = validation.profile
      ? await this.identifierErrors(validation.profile, profileId)
      : [];
    const errors = [...validation.errors, ...globalErrors];
    const result = {
      valid: errors.length === 0,
      checkedAt: new Date().toISOString(),
      errors,
      summary: validation.profile
        ? this.validationSummary(validation.profile, errors)
        : undefined,
    };
    entity.validation_result = result;
    if (!entity.active) {
      entity.status = result.valid ? 'structurally_valid' : 'draft';
    }
    await this.versions.save(entity);
    return result;
  }

  async storeLiveResult(profileId: string, result: Record<string, unknown>) {
    const entity = await this.latest(profileId);
    entity.live_validation_result = result;
    if (!entity.active) {
      entity.status =
        result.valid === true
          ? 'live_validated'
          : entity.validation_result?.valid === true
            ? 'structurally_valid'
            : 'draft';
    }
    await this.versions.save(entity);
    return this.present(entity);
  }

  async activate(
    profileId: string,
    confirmation: string,
    confirmControl: boolean,
    user: string,
  ) {
    const target = await this.latest(profileId);
    if (confirmation !== target.machine_id) {
      throw new BadRequestException(
        'Zur Aktivierung muss die machineId exakt bestätigt werden',
      );
    }
    if (
      target.document.operatingMode === 'control' &&
      confirmControl !== true
    ) {
      throw new BadRequestException(
        'control erfordert eine zusätzliche ausdrückliche Schreibfreigabe',
      );
    }
    if (
      target.document.operatingMode === 'control' &&
      target.live_validation_result?.valid !== true
    ) {
      throw new BadRequestException(
        'control darf nur für genau diese Profilversion nach erfolgreicher Live-Prüfung aktiviert werden',
      );
    }
    const validation = await this.validate(profileId);
    if (!validation.valid) {
      throw new BadRequestException({
        message: 'Ein ungültiges Profil kann nicht aktiviert werden',
        errors: validation.errors,
      });
    }

    const saved = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(MachineProfileEntity);
      const active = await repository.find({ where: { active: true } });
      for (const current of active) {
        current.active = false;
        current.status = 'disabled';
        current.change_summary = `Deaktiviert durch Aktivierung von ${target.machine_id} durch ${user}`;
      }
      if (active.length) await repository.save(active);
      const freshTarget = await repository.findOneByOrFail({ id: target.id });
      freshTarget.active = true;
      freshTarget.status = 'active';
      freshTarget.change_summary = `Aktiviert durch ${user}`;
      return repository.save(freshTarget);
    });
    return { ...this.present(saved), restartRequired: true };
  }

  async deactivate(profileId: string, user: string) {
    const entity = await this.versions.findOne({
      where: { profile_id: profileId, active: true },
    });
    if (!entity) {
      throw new ConflictException('Dieses Profil ist nicht aktiv');
    }
    entity.active = false;
    entity.status = 'disabled';
    entity.change_summary = `Deaktiviert durch ${user}`;
    return {
      ...this.present(await this.versions.save(entity)),
      restartRequired: true,
    };
  }

  async document(profileId: string): Promise<MachineProfile> {
    const entity = await this.latest(profileId);
    const validation = this.validator.validateDocument(entity.document);
    if (!validation.profile) {
      throw new BadRequestException(
        'Der Profilentwurf ist strukturell unvollständig',
      );
    }
    return validation.profile;
  }

  private async latest(profileId: string): Promise<MachineProfileEntity> {
    const entity = await this.versions.findOne({
      where: { profile_id: profileId },
      order: { version: 'DESC' },
    });
    if (!entity) throw new NotFoundException('Maschinenprofil nicht gefunden');
    return entity;
  }

  private present(
    entity: MachineProfileEntity,
    runtimeActive?: MachineProfileEntity,
  ) {
    return {
      id: entity.id,
      profileId: entity.profile_id,
      version: entity.version,
      machineId: entity.machine_id,
      status: entity.status,
      active: entity.active,
      document: entity.document,
      validationResult: entity.validation_result,
      liveValidationResult: entity.live_validation_result,
      createdBy: entity.created_by,
      changeSummary: entity.change_summary,
      createdAt: entity.created_at,
      restartRequired: false,
      runtimeActiveVersion:
        runtimeActive?.version ?? (entity.active ? entity.version : null),
    };
  }

  private safeDocument(raw: Record<string, unknown>): Record<string, any> {
    const document = this.clone(raw);
    const forbidden = this.forbiddenSecretPath(document);
    if (forbidden) {
      throw new BadRequestException(
        `Keine Secrets speichern. Verwenden Sie ausschließlich Environment-Referenzen (${forbidden})`,
      );
    }
    return document;
  }

  private forbiddenSecretPath(
    value: unknown,
    path = 'document',
  ): string | undefined {
    if (!value || typeof value !== 'object') return undefined;
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const found = this.forbiddenSecretPath(
          value[index],
          `${path}[${index}]`,
        );
        if (found) return found;
      }
      return undefined;
    }
    for (const [key, entry] of Object.entries(value)) {
      if (
        /(password|private.?key|certificate|username|secret|token|credential|api.?key)/i.test(
          key,
        ) &&
        !/(env|pathenv)$/i.test(key)
      ) {
        return `${path}.${key}`;
      }
      if (
        /(env|pathenv)$/i.test(key) &&
        (typeof entry !== 'string' || !/^OPCUA_[A-Z0-9_]+$/.test(entry))
      ) {
        return `${path}.${key} (nur OPCUA_* ist erlaubt)`;
      }
      if (
        typeof entry === 'string' &&
        /-----BEGIN (?:RSA |EC )?(?:PRIVATE KEY|CERTIFICATE)-----/.test(entry)
      ) {
        return `${path}.${key}`;
      }
      const found = this.forbiddenSecretPath(entry, `${path}.${key}`);
      if (found) return found;
    }
    return undefined;
  }

  private async assertIdentifiersAvailable(
    document: Record<string, any>,
    profileId?: string,
  ) {
    const validation = this.validator.validateDocument(document);
    if (!validation.profile) return;
    const errors = await this.identifierErrors(validation.profile, profileId);
    if (errors.length) throw new ConflictException(errors.join('; '));
  }

  private async identifierErrors(profile: MachineProfile, profileId?: string) {
    const errors: string[] = [];
    const [otherVersions, manualMachines] = await Promise.all([
      this.versions.find({
        where: profileId ? { profile_id: Not(profileId) } : {},
        order: { version: 'DESC' },
      }),
      this.machines.find({ where: { profile_managed: false } }),
    ]);
    const latestOthers = this.latestRows(otherVersions);
    if (latestOthers.some((row) => row.machine_id === profile.machineId)) {
      errors.push(`machineId ${profile.machineId} wird bereits verwendet`);
    }
    const resources = new Set<number>();
    for (const row of latestOthers) {
      for (const station of this.documentStations(row.document)) {
        resources.add(station.resourceId);
      }
    }
    for (const machine of manualMachines) {
      if (machine.resource_id != null) resources.add(machine.resource_id);
    }
    for (const station of profile.stations) {
      if (resources.has(station.resourceId)) {
        errors.push(`resourceId ${station.resourceId} wird bereits verwendet`);
      }
    }
    return errors;
  }

  private validationSummary(profile: MachineProfile, errors: string[]) {
    const writeSignals = profile.stations.flatMap((station) =>
      station.signals
        .filter(
          (signal) =>
            signal.direction === 'mesToMachine' || signal.access !== 'read',
        )
        .map((signal) => `${station.stationId}.${signal.key}`),
    );
    const requiredSignals = profile.stations.flatMap((station) =>
      station.signals
        .filter((signal) => signal.required)
        .map((signal) => `${station.stationId}.${signal.key}`),
    );
    return {
      machineId: profile.machineId,
      endpoints: profile.stations.map((station) => ({
        stationId: station.stationId,
        endpoint: (station.connection || profile.connection).endpointUrl,
      })),
      stationCount: profile.stations.length,
      hierarchy: profile.stations.map((station) => ({
        stationId: station.stationId,
        resourceId: station.resourceId,
        parentResourceId: station.parentResourceId ?? null,
      })),
      route: profile.stations
        .filter(
          (station) => station.routing?.enabled !== false && station.routing,
        )
        .sort((left, right) => left.routing!.sequence - right.routing!.sequence)
        .map((station) => ({
          stationId: station.stationId,
          ...station.routing,
        })),
      requiredSignals,
      writeSignals,
      operatingMode: profile.operatingMode,
      errors,
    };
  }

  private latestRows(rows: MachineProfileEntity[]) {
    const latest = new Map<string, MachineProfileEntity>();
    for (const row of rows) {
      const current = latest.get(row.profile_id);
      if (!current || row.version > current.version)
        latest.set(row.profile_id, row);
    }
    return [...latest.values()];
  }

  private documentStations(document: unknown): Array<any> {
    if (!document || typeof document !== 'object') return [];
    const stations = (document as Record<string, unknown>).stations;
    return Array.isArray(stations) ? stations : [];
  }

  private requiredTechnicalId(value: unknown, name: string): string {
    if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]*$/.test(value)) {
      throw new BadRequestException(
        `${name} muss eine stabile technische ID aus Kleinbuchstaben, Zahlen, Punkt, Unterstrich oder Bindestrich sein`,
      );
    }
    return value;
  }

  private slug(value: string) {
    return value
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}

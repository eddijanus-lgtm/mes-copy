import { MachineProfileErrorCode } from './machine-profile-loader.types';

export abstract class MachineProfileError extends Error {
  readonly code: MachineProfileErrorCode;
  readonly profilePath?: string;
  readonly originalCause?: unknown;

  constructor(
    code: MachineProfileErrorCode,
    message: string,
    profilePath?: string,
    originalCause?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.profilePath = profilePath;
    this.originalCause = originalCause;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class MachineProfileConfigurationError extends MachineProfileError {
  constructor(
    code: 'PROFILE_PATH_MISSING' | 'PROFILE_PATH_INVALID',
    message: string,
    profilePath?: string,
    originalCause?: unknown,
  ) {
    super(code, message, profilePath, originalCause);
  }
}

export class MachineProfileFileNotFoundError extends MachineProfileError {
  constructor(
    message: string,
    profilePath?: string,
    originalCause?: unknown,
  ) {
    super('PROFILE_FILE_NOT_FOUND', message, profilePath, originalCause);
  }
}

export class MachineProfileReadError extends MachineProfileError {
  constructor(
    message: string,
    profilePath?: string,
    originalCause?: unknown,
  ) {
    super('PROFILE_FILE_UNREADABLE', message, profilePath, originalCause);
  }
}

export class MachineProfileParseError extends MachineProfileError {
  constructor(
    message: string,
    profilePath?: string,
    originalCause?: unknown,
  ) {
    super('PROFILE_JSON_INVALID', message, profilePath, originalCause);
  }
}

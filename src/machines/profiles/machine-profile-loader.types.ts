export const MACHINE_PROFILE_PATH_CONFIG_KEY = 'MACHINE_PROFILE_PATH';

export interface MachineProfileLoadOptions {
  readonly profilePath: string;
  readonly baseDirectory?: string;
}

export type MachineProfileErrorCode =
  | 'PROFILE_PATH_MISSING'
  | 'PROFILE_PATH_INVALID'
  | 'PROFILE_FILE_NOT_FOUND'
  | 'PROFILE_FILE_UNREADABLE'
  | 'PROFILE_JSON_INVALID';

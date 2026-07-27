import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { MachineProfile } from './machine-profile.types';

export type MachineProfileLifecycleStatus =
  | 'draft'
  | 'structurally_valid'
  | 'live_validated'
  | 'active'
  | 'disabled';

@Entity('machine_profile_versions')
@Index('uq_machine_profile_version', ['profile_id', 'version'], { unique: true })
@Index('uq_machine_profile_single_active', ['active'], {
  unique: true,
  where: '"active" = true',
})
export class MachineProfileEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  profile_id: string;

  @Column({ type: 'int' })
  version: number;

  @Column({ type: 'varchar' })
  @Index()
  machine_id: string;

  @Column({ type: 'varchar', default: 'draft' })
  status: MachineProfileLifecycleStatus;

  @Column({ type: 'boolean', default: false })
  active: boolean;

  @Column({ type: 'jsonb' })
  document: MachineProfile;

  @Column({ type: 'jsonb', nullable: true })
  validation_result: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  live_validation_result: Record<string, unknown> | null;

  @Column({ type: 'varchar' })
  created_by: string;

  @Column({ type: 'varchar', nullable: true })
  change_summary: string | null;

  @CreateDateColumn()
  created_at: Date;
}

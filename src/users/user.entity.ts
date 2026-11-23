import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

export enum UserRoleEnum {
  ADMIN = 'admin',
  OPERATOR = 'operator',
  VIEWER = 'viewer',
}

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column()
  password: string;

  @Column({ type: 'enum', enum: UserRoleEnum, default: UserRoleEnum.VIEWER })
  role: UserRoleEnum;

  @Column({ type: 'timestamp', nullable: true })
  last_logon: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}

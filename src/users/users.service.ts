import { BadRequestException, Injectable, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { UserEntity } from './user.entity';

export interface UserFileEntry {
  id: string;
  username: string;
  password: string;
  role: string;
  last_logon_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UserFile {
  users: UserFileEntry[];
}

const FILE_PATH = path.resolve(process.cwd(), 'user_data.json');

@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
  ) {}

  async onModuleInit() {
    await this.seedFromDb();
  }

  private readFile(): UserFile {
    try {
      if (!fs.existsSync(FILE_PATH)) return { users: [] };
      return JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8')) as UserFile;
    } catch {
      return { users: [] };
    }
  }

  private writeFile(data: UserFile) {
    fs.writeFileSync(FILE_PATH, JSON.stringify(data, null, 2), 'utf-8');
  }

  private async seedFromDb() {
    const file = this.readFile();
    if (file.users.length > 0) return;
    const dbUsers = await this.userRepository.find();
    if (dbUsers.length === 0) return;
    file.users = dbUsers.map((u) => ({
      id: u.id,
      username: u.username,
      password: '(aus DB, nicht anzeigbar)',
      role: u.role,
      last_logon_at: null,
      created_at: u.created_at.toISOString(),
      updated_at: u.updated_at.toISOString(),
    }));
    this.writeFile(file);
  }

  findAll(): UserFileEntry[] {
    return this.readFile().users;
  }

  findOne(id: string): UserFileEntry | undefined {
    return this.readFile().users.find((u) => u.id === id);
  }

  async updateUser(
    id: string,
    data: { username?: string; password?: string; role?: string },
  ) {
    const file = this.readFile();
    const idx = file.users.findIndex((u) => u.id === id);
    if (idx === -1) throw new BadRequestException('User not found');

    const dbUser = await this.userRepository.findOne({ where: { id } });
    if (!dbUser) throw new BadRequestException('User not found in database');

    if (data.username !== undefined) {
      const exists = await this.userRepository.findOne({ where: { username: data.username } });
      if (exists && exists.id !== id) throw new BadRequestException('Username already exists');
      dbUser.username = data.username;
      file.users[idx].username = data.username;
    }

    if (data.password !== undefined) {
      dbUser.password = await bcrypt.hash(data.password, 10);
      file.users[idx].password = data.password;
    }

    if (data.role !== undefined) {
      dbUser.role = data.role as any;
      file.users[idx].role = data.role;
    }

    await this.userRepository.save(dbUser);
    file.users[idx].updated_at = new Date().toISOString();
    this.writeFile(file);
    return file.users[idx];
  }

  async deleteUser(id: string) {
    const dbUser = await this.userRepository.findOne({ where: { id } });
    if (!dbUser) throw new BadRequestException('User not found');
    await this.userRepository.remove(dbUser);

    const file = this.readFile();
    file.users = file.users.filter((u) => u.id !== id);
    this.writeFile(file);
    return { message: 'User deleted' };
  }

  syncRegister(user: UserEntity, plainPassword: string) {
    const file = this.readFile();
    file.users.push({
      id: user.id,
      username: user.username,
      password: plainPassword,
      role: user.role,
      last_logon_at: null,
      created_at: user.created_at.toISOString(),
      updated_at: user.updated_at.toISOString(),
    });
    this.writeFile(file);
  }

  updateLastLogon(userId: string) {
    const file = this.readFile();
    const user = file.users.find((u) => u.id === userId);
    if (user) {
      user.last_logon_at = new Date().toISOString();
      this.writeFile(file);
    }
  }
}

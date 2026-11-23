import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { UserEntity } from '../users/user.entity';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    private readonly jwtService: JwtService,
  ) {}

  async validateUser(username: string, pass: string): Promise<any> {
    const user = await this.userRepository.findOne({ where: { username } });
    if (user && (await bcrypt.compare(pass, user.password))) {
      const { password, ...result } = user;
      return result;
    }
    return null;
  }

  async login(user: any) {
    await this.userRepository.update(user.id, { last_logon: new Date() });
    const payload = { sub: user.id, username: user.username, role: user.role };
    return {
      access_token: await this.jwtService.signAsync(payload),
    };
  }

  async register(registerDto: RegisterDto): Promise<{ message: string }> {
    const existing = await this.userRepository.findOne({ where: { username: registerDto.username } });
    if (existing) {
      throw new BadRequestException('Username already exists');
    }

    const hashed = await bcrypt.hash(registerDto.password, 10);
    const user = this.userRepository.create({
      username: registerDto.username,
      password: hashed,
      role: registerDto.role,
    });
    await this.userRepository.save(user);
    return { message: 'User created successfully' };
  }

  async findAll(): Promise<any[]> {
    const users = await this.userRepository.find({ order: { created_at: 'DESC' } });
    return users.map(({ password, ...user }) => user);
  }

  async updateUser(id: string, data: { username?: string; password?: string; role?: string }): Promise<any> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    if (data.username !== undefined) user.username = data.username;
    if (data.password) user.password = await bcrypt.hash(data.password, 10);
    if (data.role !== undefined) user.role = data.role as any;
    await this.userRepository.save(user);
    const { password, ...result } = user;
    return result;
  }

  async deleteUser(id: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    await this.userRepository.remove(user);
  }

}

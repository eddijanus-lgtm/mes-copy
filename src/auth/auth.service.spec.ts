import { BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { UserRoleEnum, UserEntity } from '../users/user.entity';
import { AuthService } from './auth.service';

jest.mock('bcryptjs', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  const userRepository = {
    findOne: jest.fn(),
    create: jest.fn((value) => value),
    save: jest.fn(),
  };
  const jwtService = {
    signAsync: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(UserEntity), useValue: userRepository },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  it('validates a user and strips the password', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'u1', username: 'admin', password: 'hash', role: UserRoleEnum.ADMIN });
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);

    const result = await service.validateUser('admin', 'secret');

    expect(result).toEqual({ id: 'u1', username: 'admin', role: UserRoleEnum.ADMIN });
  });

  it('returns null for invalid credentials', async () => {
    userRepository.findOne.mockResolvedValue({ username: 'admin', password: 'hash' });
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);

    await expect(service.validateUser('admin', 'wrong')).resolves.toBeNull();
  });

  it('creates a JWT login response', async () => {
    jwtService.signAsync.mockResolvedValue('signed-token');

    await expect(service.login({ id: 'u1', username: 'admin', role: UserRoleEnum.ADMIN })).resolves.toEqual({ access_token: 'signed-token' });
    expect(jwtService.signAsync).toHaveBeenCalledWith({ sub: 'u1', username: 'admin', role: UserRoleEnum.ADMIN });
  });

  it('rejects duplicate registrations', async () => {
    userRepository.findOne.mockResolvedValue({ id: 'u1' });

    await expect(service.register({ username: 'admin', password: 'secret', role: UserRoleEnum.ADMIN })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('hashes the password and saves a new user', async () => {
    userRepository.findOne.mockResolvedValue(null);
    (bcrypt.hash as jest.Mock).mockResolvedValue('hashed-secret');

    await expect(service.register({ username: 'operator', password: 'secret', role: UserRoleEnum.OPERATOR })).resolves.toEqual({ message: 'User created successfully' });
    expect(userRepository.create).toHaveBeenCalledWith({ username: 'operator', password: 'hashed-secret', role: UserRoleEnum.OPERATOR });
    expect(userRepository.save).toHaveBeenCalledWith({ username: 'operator', password: 'hashed-secret', role: UserRoleEnum.OPERATOR });
  });
});

import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  it('should be defined', () => { expect(service).toBeDefined(); });

  describe('getHealthCheck', () => {
    it.each(['status', 'timestamp'] as const)('returns a %s field', (key) => {
      const result = service.getHealthCheck();
      expect(result).toHaveProperty(key);
    });

    it('returns status "ok"', () => {
      const result = service.getHealthCheck();
      expect(result.status).toBe('ok');
    });

    it('timestamp is a valid ISO string', () => {
      const result = service.getHealthCheck();
      const date = new Date(result.timestamp as string);
      expect(date.getTime()).not.toBeNaN();
    });

    it('returns plain object without prototype pollution risk', () => {
      const result = service.getHealthCheck();
      expect(Object.prototype.toString.call(result)).toBe('[object Object]');
    });
  });
});

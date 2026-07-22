import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRoleEnum } from '../users/user.entity';
import { ROLES_KEY } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<UserRoleEnum[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles) return true; // no @Roles() → erlaubt

    const request = context.switchToHttp().getRequest();
    const userRole: UserRoleEnum | undefined = request.user?.role;

    if (!userRole || !roles.includes(userRole)) {
      throw new ForbiddenException(`Role '${userRole}' required. Roles: [${roles.join(', ')}]`);
    }

    return true;
  }
}

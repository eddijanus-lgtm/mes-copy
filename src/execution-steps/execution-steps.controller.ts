import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/roles.decorator';
import { UserRoleEnum } from '../users/user.entity';
import { ExecutionStepsService } from './execution-steps.service';

@Controller()
@ApiTags('Execution steps')
@ApiBearerAuth('JWT-auth')
export class ExecutionStepsController {
  constructor(private readonly executionSteps: ExecutionStepsService) {}

  @Get('shopfloor/execution-steps/current')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  async findCurrent() {
    return { items: await this.executionSteps.findCurrent() };
  }

  @Get('orders/:id/execution-steps')
  @Roles(UserRoleEnum.ADMIN, UserRoleEnum.OPERATOR, UserRoleEnum.VIEWER)
  async findForOrder(@Param('id', ParseUUIDPipe) id: string) {
    return {
      order_id: id,
      items: await this.executionSteps.findForOrder(id),
    };
  }
}

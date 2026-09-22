import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';

import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import { BankAccountService } from './bank-account.service';
import {
  AccountQueryDto,
  CreateAccountClosingDto,
  CreateAccountMovementDto,
  UpdateAccountClosingDto,
} from './dto/bank-account.dto';

@ApiTags('bank-account')
@ApiBearerAuth()
@Controller('bank-account')
export class BankAccountController {
  constructor(private readonly cuenta: BankAccountService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Cuánto hay en la cuenta hoy, según el último cierre' })
  summary(@CurrentUser('businessId') businessId: string) {
    return this.cuenta.summary(businessId);
  }

  @Get('preview')
  @ApiOperation({
    summary:
      'Saldo esperado al cerrar un día: saldo del cierre anterior + lo que entró − lo que salió',
  })
  @ApiQuery({ name: 'date', example: '2026-09-22' })
  preview(
    @CurrentUser('businessId') businessId: string,
    @Query('date') date: string,
  ) {
    return this.cuenta.preview(businessId, date);
  }

  @Get('closings')
  @ApiOperation({ summary: 'Lista los cierres de cuenta' })
  findClosings(
    @CurrentUser('businessId') businessId: string,
    @Query() query: AccountQueryDto,
  ) {
    return this.cuenta.findClosings(businessId, query);
  }

  @Get('closings/:id')
  @ApiOperation({ summary: 'Detalle de un cierre de cuenta' })
  findClosing(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cuenta.findClosing(businessId, id);
  }

  @Post('closings')
  @ApiOperation({
    summary: 'Guarda el cierre de un día. El primero es el punto de partida.',
  })
  createClosing(@CurrentUser() user: AuthUser, @Body() dto: CreateAccountClosingDto) {
    return this.cuenta.createClosing(user.businessId, user.userId, dto);
  }

  @Patch('closings/:id')
  @ApiOperation({ summary: 'Corrige el último cierre de cuenta' })
  updateClosing(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountClosingDto,
  ) {
    return this.cuenta.updateClosing(businessId, id, dto);
  }

  @Delete('closings/:id')
  @ApiOperation({ summary: 'Borra el último cierre de cuenta' })
  removeClosing(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cuenta.removeClosing(businessId, id);
  }

  @Get('movements')
  @ApiOperation({ summary: 'Consignaciones, retiros y otros movimientos de la cuenta' })
  findMovements(
    @CurrentUser('businessId') businessId: string,
    @Query() query: AccountQueryDto,
  ) {
    return this.cuenta.findMovements(businessId, query);
  }

  @Post('movements')
  @ApiOperation({
    summary: 'Apunta dinero que entra o sale de la cuenta sin ser venta, gasto ni abono',
  })
  createMovement(@CurrentUser() user: AuthUser, @Body() dto: CreateAccountMovementDto) {
    return this.cuenta.createMovement(user.businessId, user.userId, dto);
  }

  @Delete('movements/:id')
  @ApiOperation({ summary: 'Borra un movimiento de la cuenta' })
  removeMovement(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.cuenta.removeMovement(businessId, id);
  }
}

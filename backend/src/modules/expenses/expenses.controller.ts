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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import {
  CurrentUser,
  type AuthUser,
} from '../../common/decorators/current-user.decorator';
import {
  CreateExpenseDto,
  ExpenseQueryDto,
  UpdateExpenseDto,
} from './dto/expense.dto';
import { ExpensesService } from './expenses.service';

@ApiTags('expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expenses: ExpensesService) {}

  @Get()
  @ApiOperation({ summary: 'Lista gastos por rango, categoría o método de pago' })
  findAll(
    @CurrentUser('businessId') businessId: string,
    @Query() query: ExpenseQueryDto,
  ) {
    return this.expenses.findAll(businessId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un gasto' })
  findOne(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.expenses.findOne(businessId, id);
  }

  @Post()
  @ApiOperation({ summary: 'Registra un gasto' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateExpenseDto) {
    return this.expenses.create(user.businessId, user.userId, dto);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edita un gasto' })
  update(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
  ) {
    return this.expenses.update(businessId, id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Borra un gasto' })
  remove(
    @CurrentUser('businessId') businessId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.expenses.remove(businessId, id);
  }
}

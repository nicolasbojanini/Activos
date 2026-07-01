import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Rol } from '@adn/shared';
import { ImportsService } from './imports.service';
import {
  importCommitSchema,
  type ImportCommitDto,
} from './dto/import-commit.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import type { AuthenticatedUser } from '../auth/types/authenticated-user';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe';

@ApiTags('imports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Rol.COORDINADOR)
@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('archivo'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Previsualizar un archivo .xlsx/.csv: columnas, muestra y mapeo sugerido',
  })
  preview(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('Debes adjuntar un archivo .xlsx o .csv');
    }
    return this.importsService.preview(file);
  }

  @Post('commit')
  @ApiOperation({
    summary:
      'Confirmar la importación: valida, upsert por placa y registra el lote',
  })
  commit(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(importCommitSchema)) dto: ImportCommitDto,
  ) {
    return this.importsService.commit(
      user.organizacionId,
      user.id,
      dto.archivoNombre,
      dto,
    );
  }
}

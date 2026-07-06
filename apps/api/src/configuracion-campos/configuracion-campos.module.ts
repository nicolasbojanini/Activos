import { Module } from '@nestjs/common';
import { ConfiguracionCamposController } from './configuracion-campos.controller';
import { ConfiguracionCamposService } from './configuracion-campos.service';

@Module({
  controllers: [ConfiguracionCamposController],
  providers: [ConfiguracionCamposService],
  exports: [ConfiguracionCamposService],
})
export class ConfiguracionCamposModule {}

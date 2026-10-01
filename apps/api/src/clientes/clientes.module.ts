import { Module } from '@nestjs/common';
import { FilesModule } from '../files/files.module';
import { ClientesController } from './clientes.controller';
import { ClientesService } from './clientes.service';

@Module({
  imports: [FilesModule],
  controllers: [ClientesController],
  providers: [ClientesService],
})
export class ClientesModule {}

import { Global, Module } from '@nestjs/common';
import { ControlPrismaService } from './control-prisma.service';
import { TenantClientRegistryService } from './tenant-client-registry.service';

@Global()
@Module({
  providers: [ControlPrismaService, TenantClientRegistryService],
  exports: [ControlPrismaService, TenantClientRegistryService],
})
export class PrismaModule {}

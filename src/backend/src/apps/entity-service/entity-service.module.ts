import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EntityController } from '../../controllers/entity.controller';
import { EntityService } from '../../services/entity.service';
import { SupabaseService } from '../../services/supabase.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [EntityController],
  providers: [SupabaseService, EntityService],
})
export class EntityServiceModule {}

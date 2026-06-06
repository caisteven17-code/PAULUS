import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnnouncementController } from '../../controllers/announcement.controller';
import { AnnouncementService } from '../../services/announcement.service';
import { SupabaseService } from '../../services/supabase.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AnnouncementController],
  providers: [SupabaseService, AnnouncementService],
})
export class AnnouncementServiceModule {}

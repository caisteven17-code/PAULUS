import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AnnouncementController } from '../../controllers/announcement.controller';
import { AnnouncementService } from '../../services/announcement.service';
import { EventController } from '../../controllers/event.controller';
import { EventService } from '../../services/event.service';
import { SupabaseService } from '../../services/supabase.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AnnouncementController, EventController],
  providers: [SupabaseService, AnnouncementService, EventService],
})
export class AnnouncementServiceModule {}

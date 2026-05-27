import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthController } from '../../controllers/auth.controller';
import { AppAuthService } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
  ],
  controllers: [AuthController],
  providers: [SupabaseService, AppAuthService],
})
export class AuthServiceModule {}

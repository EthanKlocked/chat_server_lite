import { Module } from '@nestjs/common';
import { ChatService } from '@src/chat/chat.service';
import { ChatGateway } from '@src/chat/chat.gateway';
import { RedisModule } from '@src/redis/redis.module';
import { JwtModule } from '@nestjs/jwt';
import { jwtConfig } from '@src/config/jwt.config';

@Module({
	imports: [
		JwtModule.registerAsync(jwtConfig),
		RedisModule
	],
	providers: [
		ChatService, 
		ChatGateway
	],
})
export class ChatModule {}

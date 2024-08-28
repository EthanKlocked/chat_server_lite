import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from '@src/app.controller';
import { AppService } from '@src/app.service';
import { ChatModule } from '@src/chat/chat.module';
import { RedisModule } from '@src/redis/redis.module';

@Module({
	imports: [
		/********* CONFIG SETTING *********/
		ConfigModule.forRoot({
			cache: true,
			isGlobal: true,
			envFilePath: `.env.${process.env.NODE_ENV}`,
		}),
		/********* CUSTOM MODULES *********/
		ChatModule,
		RedisModule,
	],
	controllers: [AppController],
	providers: [AppService],
})
export class AppModule {}

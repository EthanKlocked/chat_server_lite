import { NestFactory } from '@nestjs/core';
import { AppModule } from '@src/app.module';
import { ValidationPipe } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';


async function bootstrap() {
	const app = await NestFactory.create(AppModule);

	app.useWebSocketAdapter(new IoAdapter(app));
	app.useGlobalPipes(new ValidationPipe({
		transform: true,
		whitelist: true,
		forbidNonWhitelisted: true,
	}));

	await app.listen(3003);
}
bootstrap();

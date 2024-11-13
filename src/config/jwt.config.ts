import { ConfigModule, ConfigService } from '@nestjs/config';

export const jwtConfig = {
	imports: [ConfigModule],
	inject: [ConfigService],
	useFactory: async (configService: ConfigService) => {
		console.log(configService.get('JWT_SECRET'));
		return {
			secret: configService.get('JWT_SECRET')
		};
	}
};

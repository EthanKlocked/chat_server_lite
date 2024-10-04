import { IsString } from 'class-validator';

export class MarkDto {
	@IsString()
	roomId: string;

	@IsString()
	messageId: string;
}

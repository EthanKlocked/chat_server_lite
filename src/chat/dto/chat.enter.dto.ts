import { IsString } from 'class-validator';

export class EnterDto {
	@IsString()
	roomId: string;
}

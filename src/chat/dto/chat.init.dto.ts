import { IsArray, IsString } from 'class-validator';

export class InitDto {
	@IsArray()
	@IsString({ each: true })
	participants: string[];
}

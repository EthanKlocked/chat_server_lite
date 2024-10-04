import { IsString, IsNotEmpty, IsEnum, IsArray } from 'class-validator';

export enum MessageType {
	TEXT = 'text',
	IMAGE = 'image'
}

export class SendDto {
	@IsString()
	@IsNotEmpty()
	roomId: string;

	@IsEnum(MessageType)
	@IsNotEmpty()
	type: MessageType;

	@IsArray()
	@IsNotEmpty()
	content: string[];
}

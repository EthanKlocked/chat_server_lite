import { Injectable, BadRequestException } from '@nestjs/common';
import { RedisService } from '@src/redis/redis.service';
import { ChatMessage } from '@src/chat/chat.interface';
import { v4 as uuidv4 } from 'uuid';
import { MessageType } from '@src/chat/dto/chat.send.dto';

@Injectable()
export class ChatService {
	constructor(private redisService: RedisService) {}

	async initializeChat(members: string[]): Promise<string> {
		//duplicate room chk for 2 users
		if (members.length === 2) {
			const [user1, user2] = members;
			const existingRoom = await this.findExistingChatRoom(user1, user2);
			if (existingRoom) return existingRoom; //return exsisting room
		}
		//generate new room
		const roomId = uuidv4();
		const pipeline = this.redisService.pipeline();
		members.forEach(memberId => {
			pipeline.sadd(`chat:${roomId}:users`, memberId);
			pipeline.sadd(`user:${memberId}:chats`, roomId);
		});
		try {
			await pipeline.exec();
			return roomId;
		} catch (error) {
			await this.cleanupFailedChatInitialization(roomId, members);
			throw new Error('Failed to initialize chat room');
		}
	}

	//case 2 users
	private async findExistingChatRoom(user1: string, user2: string): Promise<string | null> {
		const user1Chats = await this.redisService.smembers(`user:${user1}:chats`);
		const user2Chats = await this.redisService.smembers(`user:${user2}:chats`);
		const commonChats = user1Chats.filter(chat => user2Chats.includes(chat));
		for (const chatId of commonChats) {
			const chatMembers = await this.redisService.smembers(`chat:${chatId}:users`);
			if (
				chatMembers.length === 2 &&
				chatMembers.includes(user1) &&
				chatMembers.includes(user2)
			) {
				return chatId;
			}
		}
		return null;
	}

	async isChatMember(userId: string, roomId: string): Promise<boolean> {
		const roomMembers = await this.redisService.smembers(`chat:${roomId}:users`);
		return roomMembers.includes(userId);
	}

	async sendMessage(
		roomId: string,
		senderId: string,
		type: MessageType,
		content: string[],
		activeUsers: string[]
	): Promise<ChatMessage> {
		if (type === MessageType.IMAGE) this.validateImageContent(content);
		const message: ChatMessage = {
			id: uuidv4(),
			senderId,
			type,
			content,
			timestamp: new Date(),
			readBy: activeUsers
		};
		await this.redisService.rpush(`chat:${roomId}:messages`, JSON.stringify(message));
		await this.redisService.ltrim(`chat:${roomId}:messages`, -100, -1);
		return message;
	}

	private validateImageContent(content: string[]): void {
		const maxSize = 5 * 1024 * 1024; // 5MB in bytes
		const allowedFormats = ['png', 'jpg', 'jpeg', 'gif'];
		content.forEach((item, index) => {
			const matches = item.match(/^data:image\/([a-z]+);base64,(.+)$/);
			if (!matches) {
				throw new BadRequestException(`Invalid image format for image ${index + 1}`);
			}
			const [, format, base64Data] = matches;
			if (!allowedFormats.includes(format)) {
				throw new BadRequestException(
					`Unsupported image format for image ${index + 1}. Allowed formats are: ${allowedFormats.join(', ')}`
				);
			}
			const sizeInBytes = (base64Data.length * 3) / 4;
			if (sizeInBytes > maxSize) {
				throw new BadRequestException(
					`Image ${index + 1} size exceeds the limit of ${maxSize / (1024 * 1024)}MB`
				);
			}
		});
	}

	async getChatList(userId: string): Promise<any[]> {
		const userChats = await this.redisService.smembers(`user:${userId}:chats`);
		const chatList = await Promise.all(
			userChats.map(async roomId => {
				const roomMembers = await this.getParticipants(roomId);
				//const lastMessage = await this.redisService.lindex(`chat:${roomId}:messages`, 0);
				const lastMessage = await this.redisService.lindex(`chat:${roomId}:messages`, -1);
				const unreadCnt = await this.getUnreadMessageCount(roomId, userId);
				//member cnt
				const isGroupChat = roomMembers.length > 2;
				//chat info
				let chatInfo: any = {
					roomId,
					lastMessage: lastMessage ? JSON.parse(lastMessage) : null,
					unreadCnt: unreadCnt,
					available: roomMembers.includes(userId),
					isGroupChat: isGroupChat
				};
				//chat info
				if (isGroupChat) {
					chatInfo.groupName =
						(await this.redisService.get(`chat:${roomId}:name`)) ||
						`Group (${roomMembers.length})`;
					chatInfo.memberCount = roomMembers.length;
					chatInfo.members = roomMembers.filter(memberId => memberId !== userId);
				} else {
					const friendId = roomMembers.find(memberId => memberId !== userId);
					chatInfo.friendId = friendId;
				}
				return chatInfo;
			})
		);
		chatList.sort((a, b) => {
			const timestampA = a.lastMessage ? new Date(a.lastMessage.timestamp).getTime() : 0;
			const timestampB = b.lastMessage ? new Date(b.lastMessage.timestamp).getTime() : 0;
			return timestampB - timestampA; // Descending order (newest first)
		});
		return chatList;
	}

	async getMessages(roomId: string, limit: number = 50): Promise<ChatMessage[]> {
		//const messages = await this.redisService.lrange(`chat:${roomId}:messages`, 0, limit - 1);
		//return messages.map(msg => JSON.parse(msg));
		const messages = await this.redisService.lrange(`chat:${roomId}:messages`, -limit, -1);
		return messages.map(msg => JSON.parse(msg));
	}

	async getParticipants(roomId: string): Promise<string[]> {
		const roomMembers = await this.redisService.smembers(`chat:${roomId}:users`);
		return roomMembers;
	}

	async markMessageAsRead(roomId: string, userId: string, messageId?: string): Promise<void> {
		const messages = await this.getMessages(roomId);
		const pipeline = this.redisService.pipeline();
		pipeline.del(`chat:${roomId}:messages`);
		messages.forEach(msg => {
			let updatedMsg = msg;
			if ((!messageId || msg.id === messageId) && !msg.readBy.includes(userId)) {
				updatedMsg = { ...msg, readBy: [...msg.readBy, userId] };
			}
			pipeline.rpush(`chat:${roomId}:messages`, JSON.stringify(updatedMsg));
		});
		await pipeline.exec();
	}

	// Helper methods
	private async getUnreadMessageCount(roomId: string, userId: string): Promise<number> {
		const messages = await this.getMessages(roomId);
		return messages.filter(msg => !msg.readBy.includes(userId)).length;
	}

	private async cleanupFailedChatInitialization(
		roomId: string,
		members: string[]
	): Promise<void> {
		const cleanupPipeline = this.redisService.pipeline();
		members.forEach(memberId => {
			cleanupPipeline.srem(`chat:${roomId}:users`, memberId);
			cleanupPipeline.srem(`user:${memberId}:chats`, roomId);
		});
		await cleanupPipeline.exec();
	}

	// Extra reset
	async resetRedis(patterns: string[] = ['user:*', 'chat:*']): Promise<void> {
		patterns.forEach(async p => {
			await this.redisService.deleteKeysByPattern(p);
		});
	}
}

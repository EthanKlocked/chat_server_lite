import { Injectable } from '@nestjs/common';
import { RedisService } from '@src/redis/redis.service';
import { ChatMessage } from '@src/chat/chat.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class ChatService {
    constructor(private redisService: RedisService) {}
    
    async initializeChat(members:string[]): Promise<string> {
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

    async isChatMember(userId: string, roomId: string): Promise<boolean> {
        const roomMembers = await this.redisService.smembers(`chat:${roomId}:users`);
        return roomMembers.includes(userId);
    }

    async sendMessage(roomId: string, senderId: string, content: string, activeUsers: string[]): Promise<ChatMessage> {
        const message: ChatMessage = {
            id: uuidv4(),
            senderId,
            content,
            timestamp: new Date(),
            readBy: activeUsers,
        };
        await this.redisService.lpush(`chat:${roomId}:messages`, JSON.stringify(message));
        await this.redisService.ltrim(`chat:${roomId}:messages`, 0, 99); 
        return message;
    }

    async getChatList(userId: string): Promise<any[]> {
        const userChats = await this.redisService.smembers(`user:${userId}:chats`);
        return Promise.all(userChats.map(async (roomId) => {
            const roomMembers = await this.getParticipants(roomId);
            const lastMessage = await this.redisService.lindex(`chat:${roomId}:messages`, 0);
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
                chatInfo.groupName = await this.redisService.get(`chat:${roomId}:name`) || `Group (${roomMembers.length})`;
                chatInfo.memberCount = roomMembers.length;
                chatInfo.members = roomMembers.filter(memberId => memberId !== userId);
            } else {
                const friendId = roomMembers.find(memberId => memberId !== userId);
                chatInfo.friendId = friendId;
            }
            return chatInfo;
        }));
    }

    async getMessages(roomId: string, limit: number = 50): Promise<ChatMessage[]> {
        const messages = await this.redisService.lrange(`chat:${roomId}:messages`, 0, limit - 1);
        return messages.map(msg => JSON.parse(msg));
    }

    async getParticipants(roomId: string): Promise<string[]> {
        const roomMembers = await this.redisService.smembers(`chat:${roomId}:users`);
        return roomMembers
    }    

    async markMessageAsRead(roomId: string, userId: string, messageId?: string): Promise<void> {
        const messages = await this.getMessages(roomId);
        const pipeline = this.redisService.pipeline();
        pipeline.del(`chat:${roomId}:messages`);
        messages.reverse().forEach(msg => {
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

    private async cleanupFailedChatInitialization(roomId: string, members: string[]): Promise<void> {
        const cleanupPipeline = this.redisService.pipeline();
        members.forEach(memberId => {
            cleanupPipeline.srem(`chat:${roomId}:users`, memberId);
            cleanupPipeline.srem(`user:${memberId}:chats`, roomId);
        });
        await cleanupPipeline.exec();
    }

    // Extra reset
    resetRedis(): Promise<void> {
        return this.redisService.flushAll();
    }    
}
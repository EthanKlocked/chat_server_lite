import { Injectable } from '@nestjs/common';
import { Redis, ChainableCommander } from 'ioredis';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class RedisService {
    private readonly redisClient: Redis;

    constructor(private readonly configService: ConfigService) {
        this.redisClient = new Redis({
            host: this.configService.get("REDIS_HOST") || 'localhost',
            port: configService.get('REDIS_PORT') || 6379,
        });
    }

    async sadd(key: string, ...members: string[]): Promise<number> {
        return this.redisClient.sadd(key, ...members);
    }

    async srem(key: string, ...members: string[]): Promise<number> {
        return this.redisClient.srem(key, ...members);
    }

    async smembers(key: string): Promise<string[]> {
        return this.redisClient.smembers(key);
    }

    async sismember(key: string, member: string): Promise<number> {
        return this.redisClient.sismember(key, member);
    }

    async lpush(key: string, ...values: string[]): Promise<number> {
        return this.redisClient.lpush(key, ...values);
    }

    async lrange(key: string, start: number, stop: number): Promise<string[]> {
        return this.redisClient.lrange(key, start, stop);
    }

    async ltrim(key: string, start: number, stop: number): Promise<string> {
        return this.redisClient.ltrim(key, start, stop);
    }

    async lindex(key: string, index: number): Promise<string | null> {
        return this.redisClient.lindex(key, index);
    }

    async set(key: string, value: string): Promise<string> {
        return this.redisClient.set(key, value);
    }

    async get(key: string): Promise<string | null> {
        return this.redisClient.get(key);
    }

    async exists(key: string): Promise<number> {
        return this.redisClient.exists(key);
    }

    async del(key: string): Promise<number> {
        return this.redisClient.del(key);
    }

    async expire(key: string, seconds: number): Promise<number> {
        return this.redisClient.expire(key, seconds);
    }

    async multi(): Promise<ChainableCommander> {
        return this.redisClient.multi();
    }

    async publish(channel: string, message: string): Promise<number> {
        return this.redisClient.publish(channel, message);
    }

    async subscribe(channel: string, callback: (channel: string, message: string) => void): Promise<void> {
        await this.redisClient.subscribe(channel);
        this.redisClient.on('message', callback);
    }

    async closeConnection(): Promise<void> {
        await this.redisClient.quit();
    }

    pipeline(): ChainableCommander {
        return this.redisClient.pipeline();
    }

    async flushAll(): Promise<void> {
        await this.redisClient.flushall();
    }
}
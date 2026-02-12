use anyhow::Result;
use redis::Pipeline;

use crate::models::{ChatInfo, ChatMessage, MessageType};
use crate::services::RedisService;
use crate::utils::validate_image_content;

#[derive(Clone)]
pub struct ChatService {
    redis: RedisService,
}

impl ChatService {
    pub fn new(redis: RedisService) -> Self {
        Self { redis }
    }

    /// Initialize a new chat room or return existing one for 1:1 chats
    pub async fn initialize_chat(&self, members: &[String]) -> Result<String> {
        // Check for existing 1:1 chat room
        if members.len() == 2 {
            if let Some(existing_room) =
                self.find_existing_chat_room(&members[0], &members[1]).await?
            {
                return Ok(existing_room);
            }
        }

        // Generate new room ID
        let room_id = uuid::Uuid::new_v4().to_string();

        // Add members to room using pipeline
        self.redis
            .exec_pipeline(|pipe: &mut Pipeline| {
                for member_id in members {
                    pipe.sadd(format!("chat:{}:users", room_id), member_id);
                    pipe.sadd(format!("user:{}:chats", member_id), &room_id);
                }
            })
            .await?;

        Ok(room_id)
    }

    /// Find existing 1:1 chat room between two users
    async fn find_existing_chat_room(&self, user1: &str, user2: &str) -> Result<Option<String>> {
        let user1_chats = self.redis.smembers(&format!("user:{}:chats", user1)).await?;
        let user2_chats = self.redis.smembers(&format!("user:{}:chats", user2)).await?;

        // Find common chats
        let common_chats: Vec<&String> = user1_chats
            .iter()
            .filter(|chat| user2_chats.contains(chat))
            .collect();

        for chat_id in common_chats {
            let chat_members = self.redis.smembers(&format!("chat:{}:users", chat_id)).await?;
            if chat_members.len() == 2
                && chat_members.contains(&user1.to_string())
                && chat_members.contains(&user2.to_string())
            {
                return Ok(Some(chat_id.clone()));
            }
        }

        Ok(None)
    }

    /// Check if user is a member of the chat room
    pub async fn is_chat_member(&self, user_id: &str, room_id: &str) -> Result<bool> {
        let members = self.redis.smembers(&format!("chat:{}:users", room_id)).await?;
        Ok(members.contains(&user_id.to_string()))
    }

    /// Send a message to a chat room
    pub async fn send_message(
        &self,
        room_id: &str,
        sender_id: &str,
        message_type: MessageType,
        content: Vec<String>,
        active_users: Vec<String>,
    ) -> Result<ChatMessage> {
        // Validate image content if message type is image
        if message_type == MessageType::Image {
            validate_image_content(&content)?;
        }

        let message = ChatMessage::new(sender_id.to_string(), message_type, content, active_users);

        let message_json = serde_json::to_string(&message)?;

        // Store message in Redis
        self.redis
            .rpush(&format!("chat:{}:messages", room_id), &message_json)
            .await?;

        // Keep only last 100 messages
        self.redis
            .ltrim(&format!("chat:{}:messages", room_id), -100, -1)
            .await?;

        Ok(message)
    }

    /// Get chat list for a user
    pub async fn get_chat_list(&self, user_id: &str) -> Result<Vec<ChatInfo>> {
        let user_chats = self.redis.smembers(&format!("user:{}:chats", user_id)).await?;

        let mut chat_list = Vec::new();

        for room_id in user_chats {
            let room_members = self.get_participants(&room_id).await?;
            let last_message_str = self
                .redis
                .lindex(&format!("chat:{}:messages", room_id), -1)
                .await?;
            let unread_cnt = self.get_unread_message_count(&room_id, user_id).await?;

            let is_group_chat = room_members.len() > 2;
            let available = room_members.contains(&user_id.to_string());

            let last_message: Option<ChatMessage> = last_message_str
                .and_then(|s| serde_json::from_str(&s).ok());

            let mut chat_info = ChatInfo {
                room_id: room_id.clone(),
                last_message,
                unread_cnt,
                available,
                is_group_chat,
                group_name: None,
                member_count: None,
                members: None,
                friend_id: None,
            };

            if is_group_chat {
                let group_name = self
                    .redis
                    .get(&format!("chat:{}:name", room_id))
                    .await?
                    .unwrap_or_else(|| format!("Group ({})", room_members.len()));
                chat_info.group_name = Some(group_name);
                chat_info.member_count = Some(room_members.len());
                chat_info.members = Some(
                    room_members
                        .into_iter()
                        .filter(|m| m != user_id)
                        .collect(),
                );
            } else {
                let friend_id = room_members.into_iter().find(|m| m != user_id);
                chat_info.friend_id = friend_id;
            }

            chat_list.push(chat_info);
        }

        // Sort by last message timestamp (newest first)
        chat_list.sort_by(|a, b| {
            let ts_a = a
                .last_message
                .as_ref()
                .map(|m| m.timestamp)
                .unwrap_or_default();
            let ts_b = b
                .last_message
                .as_ref()
                .map(|m| m.timestamp)
                .unwrap_or_default();
            ts_b.cmp(&ts_a)
        });

        Ok(chat_list)
    }

    /// Get messages from a chat room
    pub async fn get_messages(&self, room_id: &str, limit: isize) -> Result<Vec<ChatMessage>> {
        let messages_str = self
            .redis
            .lrange(&format!("chat:{}:messages", room_id), -limit, -1)
            .await?;

        let messages: Vec<ChatMessage> = messages_str
            .iter()
            .filter_map(|s| serde_json::from_str(s).ok())
            .collect();

        Ok(messages)
    }

    /// Get participants of a chat room
    pub async fn get_participants(&self, room_id: &str) -> Result<Vec<String>> {
        self.redis.smembers(&format!("chat:{}:users", room_id)).await
    }

    /// Mark message(s) as read
    pub async fn mark_message_as_read(
        &self,
        room_id: &str,
        user_id: &str,
        message_id: Option<&str>,
    ) -> Result<()> {
        let messages = self.get_messages(room_id, 50).await?;

        // Delete existing messages
        self.redis
            .del(&format!("chat:{}:messages", room_id))
            .await?;

        // Re-add messages with updated read status
        for mut msg in messages {
            let should_mark = message_id
                .map(|id| msg.id == id)
                .unwrap_or(true);

            if should_mark && !msg.read_by.contains(&user_id.to_string()) {
                msg.read_by.push(user_id.to_string());
            }

            let msg_json = serde_json::to_string(&msg)?;
            self.redis
                .rpush(&format!("chat:{}:messages", room_id), &msg_json)
                .await?;
        }

        Ok(())
    }

    /// Get unread message count for a user in a room
    async fn get_unread_message_count(&self, room_id: &str, user_id: &str) -> Result<usize> {
        let messages = self.get_messages(room_id, 50).await?;
        let count = messages
            .iter()
            .filter(|msg| !msg.read_by.contains(&user_id.to_string()))
            .count();
        Ok(count)
    }

    /// Reset Redis data (for development)
    pub async fn reset_redis(&self) -> Result<()> {
        self.redis.delete_keys_by_pattern("user:*").await?;
        self.redis.delete_keys_by_pattern("chat:*").await?;
        Ok(())
    }
}

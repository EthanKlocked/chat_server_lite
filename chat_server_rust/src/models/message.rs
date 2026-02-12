use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MessageType {
    Text,
    Image,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessage {
    pub id: String,
    pub sender_id: String,
    #[serde(rename = "type")]
    pub message_type: MessageType,
    pub content: Vec<String>,
    pub timestamp: DateTime<Utc>,
    pub read_by: Vec<String>,
}

impl ChatMessage {
    pub fn new(
        sender_id: String,
        message_type: MessageType,
        content: Vec<String>,
        read_by: Vec<String>,
    ) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            sender_id,
            message_type,
            content,
            timestamp: Utc::now(),
            read_by,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatInfo {
    pub room_id: String,
    pub last_message: Option<ChatMessage>,
    pub unread_cnt: usize,
    pub available: bool,
    pub is_group_chat: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub member_count: Option<usize>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub members: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub friend_id: Option<String>,
}

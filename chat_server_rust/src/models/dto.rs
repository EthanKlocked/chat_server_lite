use serde::{Deserialize, Serialize};

use super::MessageType;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitDto {
    pub participants: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EnterDto {
    pub room_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendDto {
    pub room_id: String,
    #[serde(rename = "type")]
    pub message_type: MessageType,
    pub content: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkDto {
    pub room_id: String,
    pub message_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RoomMembersResponse {
    pub room_id: String,
    pub members: Vec<String>,
}

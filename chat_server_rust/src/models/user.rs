use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct JwtPayload {
    pub email: String,
    pub id: String,
    pub exp: usize,
    pub iat: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UserInfo {
    pub email: String,
    pub id: String,
}

impl From<JwtPayload> for UserInfo {
    fn from(payload: JwtPayload) -> Self {
        Self {
            email: payload.email,
            id: payload.id,
        }
    }
}

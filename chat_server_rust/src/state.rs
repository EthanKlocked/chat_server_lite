use crate::config::Config;
use redis::aio::ConnectionManager;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub config: Config,
    pub redis: ConnectionManager,
}

impl AppState {
    pub async fn new(config: Config) -> anyhow::Result<Self> {
        let client = redis::Client::open(config.redis_url())?;
        let redis = ConnectionManager::new(client).await?;

        Ok(Self { config, redis })
    }
}

pub type SharedState = Arc<AppState>;

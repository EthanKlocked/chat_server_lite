use std::env;

#[derive(Clone, Debug)]
pub struct Config {
    pub jwt_secret: String,
    pub redis_host: String,
    pub redis_port: u16,
    pub redis_password: Option<String>,
    pub server_port: u16,
}

impl Config {
    pub fn from_env() -> Self {
        dotenvy::dotenv().ok();

        Self {
            jwt_secret: env::var("JWT_SECRET").unwrap_or_else(|_| "default_secret".to_string()),
            redis_host: env::var("REDIS_HOST_CUSTOM").unwrap_or_else(|_| "localhost".to_string()),
            redis_port: env::var("REDIS_PORT_CUSTOM")
                .unwrap_or_else(|_| "6379".to_string())
                .parse()
                .unwrap_or(6379),
            redis_password: env::var("REDIS_PASSWORD").ok(),
            server_port: env::var("SERVER_PORT")
                .unwrap_or_else(|_| "3003".to_string())
                .parse()
                .unwrap_or(3003),
        }
    }

    pub fn redis_url(&self) -> String {
        match &self.redis_password {
            Some(password) => format!(
                "redis://:{}@{}:{}/",
                password, self.redis_host, self.redis_port
            ),
            None => format!("redis://{}:{}/", self.redis_host, self.redis_port),
        }
    }
}

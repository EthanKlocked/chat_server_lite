use anyhow::Result;
use redis::{aio::ConnectionManager, AsyncCommands, Pipeline};

#[derive(Clone)]
pub struct RedisService {
    conn: ConnectionManager,
}

impl RedisService {
    pub fn new(conn: ConnectionManager) -> Self {
        Self { conn }
    }

    // Set operations
    pub async fn sadd(&self, key: &str, members: &[&str]) -> Result<usize> {
        let mut conn = self.conn.clone();
        let result: usize = conn.sadd(key, members).await?;
        Ok(result)
    }

    pub async fn srem(&self, key: &str, members: &[&str]) -> Result<usize> {
        let mut conn = self.conn.clone();
        let result: usize = conn.srem(key, members).await?;
        Ok(result)
    }

    pub async fn smembers(&self, key: &str) -> Result<Vec<String>> {
        let mut conn = self.conn.clone();
        let result: Vec<String> = conn.smembers(key).await?;
        Ok(result)
    }

    pub async fn sismember(&self, key: &str, member: &str) -> Result<bool> {
        let mut conn = self.conn.clone();
        let result: bool = conn.sismember(key, member).await?;
        Ok(result)
    }

    // List operations
    pub async fn rpush(&self, key: &str, value: &str) -> Result<usize> {
        let mut conn = self.conn.clone();
        let result: usize = conn.rpush(key, value).await?;
        Ok(result)
    }

    pub async fn lpush(&self, key: &str, value: &str) -> Result<usize> {
        let mut conn = self.conn.clone();
        let result: usize = conn.lpush(key, value).await?;
        Ok(result)
    }

    pub async fn lrange(&self, key: &str, start: isize, stop: isize) -> Result<Vec<String>> {
        let mut conn = self.conn.clone();
        let result: Vec<String> = conn.lrange(key, start, stop).await?;
        Ok(result)
    }

    pub async fn ltrim(&self, key: &str, start: isize, stop: isize) -> Result<()> {
        let mut conn = self.conn.clone();
        let _: () = conn.ltrim(key, start, stop).await?;
        Ok(())
    }

    pub async fn lindex(&self, key: &str, index: isize) -> Result<Option<String>> {
        let mut conn = self.conn.clone();
        let result: Option<String> = conn.lindex(key, index).await?;
        Ok(result)
    }

    // String operations
    pub async fn set(&self, key: &str, value: &str) -> Result<()> {
        let mut conn = self.conn.clone();
        let _: () = conn.set(key, value).await?;
        Ok(())
    }

    pub async fn get(&self, key: &str) -> Result<Option<String>> {
        let mut conn = self.conn.clone();
        let result: Option<String> = conn.get(key).await?;
        Ok(result)
    }

    pub async fn del(&self, key: &str) -> Result<usize> {
        let mut conn = self.conn.clone();
        let result: usize = conn.del(key).await?;
        Ok(result)
    }

    pub async fn exists(&self, key: &str) -> Result<bool> {
        let mut conn = self.conn.clone();
        let result: bool = conn.exists(key).await?;
        Ok(result)
    }

    // Pipeline operations
    pub async fn exec_pipeline<F>(&self, f: F) -> Result<()>
    where
        F: FnOnce(&mut Pipeline),
    {
        let mut conn = self.conn.clone();
        let mut pipe = redis::pipe();
        f(&mut pipe);
        let _: () = pipe.query_async(&mut conn).await?;
        Ok(())
    }

    // Delete keys by pattern
    pub async fn delete_keys_by_pattern(&self, pattern: &str) -> Result<usize> {
        let mut conn = self.conn.clone();
        let keys: Vec<String> = redis::cmd("KEYS")
            .arg(pattern)
            .query_async(&mut conn)
            .await?;

        if keys.is_empty() {
            return Ok(0);
        }

        let count: usize = conn.del(&keys).await?;
        Ok(count)
    }

    // Flush all (for development)
    pub async fn flush_all(&self) -> Result<()> {
        let mut conn = self.conn.clone();
        let _: () = redis::cmd("FLUSHALL").query_async(&mut conn).await?;
        Ok(())
    }
}

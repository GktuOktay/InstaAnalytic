from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    encryption_key: str
    chrome_user_data_dir: str = ""
    environment: str = "development"
    log_level: str = "INFO"
    host_agent_url: str = "http://host.docker.internal:8002"

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

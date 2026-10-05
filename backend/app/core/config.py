from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    encryption_key: str
    host_agent_secret: str = ""
    chrome_user_data_dir: str = ""
    environment: str = "development"
    log_level: str = "INFO"
    host_agent_url: str = "http://host.docker.internal:8002"

    # Tarama/aksiyon hızı session başına risk profilinden gelir (app/services/risk_profiles.py)
    scan_page_size: int = 50              # tek istekte çekilen kullanıcı sayısı
    scan_min_sweep_ratio: float = 0.5     # tam tarama bu orandan az kayıt getirirse "silinenleri" işleme

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

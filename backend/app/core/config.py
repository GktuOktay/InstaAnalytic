from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    redis_url: str
    encryption_key: str
    host_agent_secret: str = ""
    api_token: str = ""
    encryption_key_old: str = ""   # anahtar rotasyonu: eski anahtar yalnızca çözmek için kullanılır
    chrome_user_data_dir: str = ""
    environment: str = "development"
    log_level: str = "INFO"
    session_ttl_days: int = 30    # kullanılmayan tarayıcı oturumunun çerezleri bu süreden sonra silinir
    host_agent_url: str = "http://host.docker.internal:8002"

    # Tarama/aksiyon hızı session başına risk profilinden gelir (app/services/risk_profiles.py)
    scan_page_size: int = 50              # tek istekte çekilen kullanıcı sayısı
    scan_min_sweep_ratio: float = 0.5     # tam tarama bu orandan az kayıt getirirse "silinenleri" işleme

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()

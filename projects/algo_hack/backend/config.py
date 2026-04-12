from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Algorand
    algorand_algod_url: str = "https://testnet-api.algonode.cloud"
    algorand_algod_token: str = ""
    buyer_mnemonic: str = ""
    seller_a_mnemonic: str = ""
    seller_b_mnemonic: str = ""
    seller_c_mnemonic: str = ""

    # LLM
    gemini_api_key: str = ""

    # External APIs
    openrouteservice_api_key: str = ""
    openweathermap_api_key: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()

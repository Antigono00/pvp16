# config.py
import os
from dotenv import load_dotenv

# Load .env file if present
load_dotenv()

# Required secrets
BOT_TOKEN   = os.getenv("BOT_TOKEN", "YOUR_FALLBACK_BOT_TOKEN")
SECRET_KEY  = os.getenv("SECRET_KEY", "YOUR_FALLBACK_SECRET_KEY")

# Radix-specific configuration
RADIX_PRIVATE_KEY = os.getenv("RADIX_PRIVATE_KEY")
if not RADIX_PRIVATE_KEY:
    raise ValueError("RADIX_PRIVATE_KEY not found in environment variables")

RADIX_ACCOUNT_ADDRESS = os.getenv("RADIX_ACCOUNT_ADDRESS")
RADIX_BACKEND_BADGE_ADDRESS = os.getenv("RADIX_BACKEND_BADGE_ADDRESS")
RADIX_COMPONENT_ADDRESS = os.getenv("RADIX_COMPONENT_ADDRESS")

# Radix network configuration
RADIX_NETWORK = "mainnet"  # or "stokenet" for testnet
RADIX_GATEWAY_API = os.getenv("RADIX_GATEWAY_API", "https://mainnet.radixdlt.com")

# Optional: Validate the private key format
if RADIX_PRIVATE_KEY and (len(RADIX_PRIVATE_KEY) != 64 or not all(c in '0123456789abcdefABCDEF' for c in RADIX_PRIVATE_KEY)):
    raise ValueError("RADIX_PRIVATE_KEY appears to be in incorrect format")

# Optional
GROUP_ID    = os.getenv("GROUP_ID", "YOUR_OPTIONAL_GROUP_ID")
FLASK_ENV   = os.getenv("FLASK_ENV", "development")

DATABASE_PATH = "/root/telegram_bot/bot.db"

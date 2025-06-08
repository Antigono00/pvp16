import requests
import json
import hashlib
import time
import base64
from binascii import hexlify, unhexlify
from ecdsa import SigningKey, SECP256k1
from config import RADIX_PRIVATE_KEY, RADIX_ACCOUNT_ADDRESS, RADIX_GATEWAY_API

class RadixClient:
    def __init__(self):
        # Initialize with the private key from config
        try:
            self.private_key_bytes = unhexlify(RADIX_PRIVATE_KEY)
            self.signing_key = SigningKey.from_string(self.private_key_bytes, curve=SECP256k1)
            self.account_address = RADIX_ACCOUNT_ADDRESS
            self.gateway_api = RADIX_GATEWAY_API
        except Exception as e:
            print(f"Error initializing RadixClient: {e}")
            raise
            
    def get_current_epoch(self):
        """Get the current network epoch for transaction headers"""
        try:
            response = requests.get(f"{self.gateway_api}/state/version")
            if response.status_code == 200:
                data = response.json()
                return data.get("epoch", 0)
            else:
                raise Exception(f"Failed to get current epoch: {response.status_code}")
        except Exception as e:
            print(f"Error getting current epoch: {e}")
            raise
    
    def build_transaction(self, manifest):
        """Build a transaction using the Gateway API"""
        try:
            current_epoch = self.get_current_epoch()
            
            # Prepare the transaction header
            header = {
                "network_id": 1,  # 1 for mainnet, 2 for stokenet
                "start_epoch_inclusive": current_epoch,
                "end_epoch_exclusive": current_epoch + 2,
                "nonce": int(time.time() * 1000),  # Use current time as nonce
                "notary_public_key": self.signing_key.verifying_key.to_string().hex()
            }
            
            # Prepare the transaction payload
            payload = {
                "manifest": manifest,
                "header": header,
                "notary_is_signatory": True,
                "message": ""
            }
            
            # Send to the Gateway API
            response = requests.post(
                f"{self.gateway_api}/transaction/build", 
                json=payload,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code != 200:
                raise Exception(f"Failed to build transaction: {response.text}")
                
            return response.json()
            
        except Exception as e:
            print(f"Error building transaction: {e}")
            raise
    
    def sign_transaction(self, transaction_data):
        """Sign a built transaction"""
        try:
            # Extract the hash to sign
            intent_hash = transaction_data.get("intent_hash")
            if not intent_hash:
                raise Exception("No intent hash in transaction data")
                
            # Sign the hash
            intent_hash_bytes = unhexlify(intent_hash)
            signature = self.signing_key.sign_digest_deterministic(intent_hash_bytes)
            signature_hex = hexlify(signature).decode('utf-8')
            
            # Prepare the signed transaction
            signed_intent = {
                "intent_hash": intent_hash,
                "intent": transaction_data.get("intent"),
                "intent_signatures": [{
                    "public_key": self.signing_key.verifying_key.to_string().hex(),
                    "signature": signature_hex
                }]
            }
            
            return signed_intent
            
        except Exception as e:
            print(f"Error signing transaction: {e}")
            raise
    
    def submit_transaction(self, signed_intent):
        """Submit a signed transaction to the network"""
        try:
            # Submit to Gateway API
            response = requests.post(
                f"{self.gateway_api}/transaction/submit", 
                json=signed_intent,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code != 200:
                raise Exception(f"Failed to submit transaction: {response.text}")
                
            return response.json()
            
        except Exception as e:
            print(f"Error submitting transaction: {e}")
            raise
            
    def check_transaction_status(self, intent_hash):
        """Check the status of a submitted transaction"""
        try:
            response = requests.post(
                f"{self.gateway_api}/transaction/status",
                json={"intent_hash": intent_hash},
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code != 200:
                raise Exception(f"Failed to get transaction status: {response.text}")
                
            return response.json()
            
        except Exception as e:
            print(f"Error checking transaction status: {e}")
            raise
    
    def execute_manifest(self, manifest, wait_for_completion=True, max_retries=10):
        """Complete flow to build, sign, submit, and optionally wait for transaction"""
        try:
            # Build the transaction
            built_tx = self.build_transaction(manifest)
            
            # Sign the transaction
            signed_tx = self.sign_transaction(built_tx)
            
            # Submit the transaction
            submitted_tx = self.submit_transaction(signed_tx)
            intent_hash = submitted_tx.get("intent_hash")
            
            if not wait_for_completion:
                return {"status": "submitted", "intent_hash": intent_hash}
            
            # Wait for transaction to complete
            status = "PENDING"
            retries = 0
            
            while status != "COMMITTED_SUCCESS" and retries < max_retries:
                time.sleep(2)  # Wait 2 seconds between checks
                status_response = self.check_transaction_status(intent_hash)
                status = status_response.get("status")
                retries += 1
                
                if status == "FAILED" or status == "REJECTED":
                    return {
                        "status": "failed", 
                        "intent_hash": intent_hash,
                        "error": status_response.get("error_message", "Unknown error")
                    }
            
            if status == "COMMITTED_SUCCESS":
                return {"status": "success", "intent_hash": intent_hash}
            else:
                return {"status": "timeout", "intent_hash": intent_hash}
                
        except Exception as e:
            print(f"Error executing manifest: {e}")
            return {"status": "error", "error": str(e)}

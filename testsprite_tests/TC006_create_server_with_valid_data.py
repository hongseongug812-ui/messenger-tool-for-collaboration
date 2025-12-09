import requests
import uuid

BASE_URL = "http://localhost:8000"
TIMEOUT = 30

def test_create_server_with_valid_data():
    # 1. Login to get token
    login_url = f"{BASE_URL}/auth/login"
    login_payload = {
        "username": "weird14446",
        "password": "dlstn1151@"
    }
    headers = {"Content-Type": "application/json"}
    
    try:
        login_resp = requests.post(login_url, json=login_payload, headers=headers, timeout=TIMEOUT)
        login_resp.raise_for_status()
        token = login_resp.json()["access_token"]
    except Exception as e:
        assert False, f"Login failed: {e}"

    # 2. Create Server using Token
    create_url = f"{BASE_URL}/servers"
    unique_name = f"Test Server {str(uuid.uuid4())[:8]}"
    server_payload = {
        "name": unique_name,
        "avatar": "TS"  # Optional, but good to inspect
    }
    
    auth_headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    created_server_id = None

    try:
        response = requests.post(create_url, json=server_payload, headers=auth_headers, timeout=TIMEOUT)
        assert response.status_code == 201 or response.status_code == 200, f"Expected 200 or 201 but got {response.status_code}. Response: {response.text}"

        response_json = response.json()
        assert isinstance(response_json, dict), "Response is not a JSON object"
        assert "id" in response_json, "Response JSON does not contain server ID"
        created_server_id = response_json["id"]

        assert response_json.get("name") == server_payload["name"], "Server name in response does not match"
        
        print(f"Successfully created server: {unique_name} (ID: {created_server_id})")

    finally:
        # Optional: Delete if delete endpoint exists and user is owner
        # If no delete endpoint for servers exists yet, we assume manual cleanup or teardown script
        pass

test_create_server_with_valid_data()
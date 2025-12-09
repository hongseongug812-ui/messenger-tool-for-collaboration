import requests

BASE_URL = "http://localhost:8000"
TIMEOUT = 30

def test_get_servers_list():
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

    # 2. Get Servers List using Token
    servers_url = f"{BASE_URL}/servers"  # No trailing slash usually for FastAPI, but defined as /servers
    auth_headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }

    try:
        response = requests.get(servers_url, headers=auth_headers, timeout=TIMEOUT)
    except requests.exceptions.RequestException as e:
        assert False, f"Request to {servers_url} failed with exception: {e}"

    assert response.status_code == 200, f"Expected status code 200, got {response.status_code}. Response: {response.text}"
    
    try:
        data = response.json()
    except ValueError:
        assert False, "Response is not in JSON format"

    assert isinstance(data, list), "Response JSON is not a list"
    
    print(f"Successfully retrieved {len(data)} servers")

test_get_servers_list()
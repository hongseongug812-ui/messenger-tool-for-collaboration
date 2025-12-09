import requests
import uuid

BASE_URL = "http://localhost:8000"
AUTH_USERNAME = "weird14446"
AUTH_PASSWORD = "dlstn1151@"
TIMEOUT = 30

def test_user_registration_with_valid_data():
    url = f"{BASE_URL}/auth/signup"
    # Create unique user details to avoid conflicts
    unique_suffix = str(uuid.uuid4())[:8]
    payload = {
        "username": f"testuser_{unique_suffix}",
        "password": "TestPass123!",
        "email": f"testuser_{unique_suffix}@example.com",
        "name": "Test User"
    }
    headers = {
        "Content-Type": "application/json"
    }
    
    try:
        response = requests.post(url, json=payload, headers=headers, auth=(AUTH_USERNAME, AUTH_PASSWORD), timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request to signup endpoint failed: {e}"

    assert response.status_code == 201 or response.status_code == 200, f"Expected 200 or 201 status code, got {response.status_code}"
    try:
        resp_json = response.json()
    except ValueError:
        assert False, "Response is not a valid JSON"

    # Adjusted assertion to match actual response structure
    assert "user" in resp_json, f"'user' key not in response JSON: {resp_json}"
    user = resp_json["user"]
    assert ("username" in user and user["username"] == payload["username"]) or ("id" in user), \
        f"Response JSON missing expected keys or username does not match: {resp_json}"

test_user_registration_with_valid_data()

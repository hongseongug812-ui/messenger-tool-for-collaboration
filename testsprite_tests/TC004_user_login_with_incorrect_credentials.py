import requests

BASE_URL = "http://localhost:8000"
TIMEOUT = 30

def test_user_login_with_incorrect_credentials():
    url = f"{BASE_URL}/auth/login"
    headers = {
        "Content-Type": "application/json"
    }
    import uuid
    random_suffix = str(uuid.uuid4())[:8]
    payload = {
        "username": f"nonexistent_{random_suffix}",
        "password": "wrong_password_123"
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
    except requests.RequestException as e:
        assert False, f"Request failed: {e}"

    # Expecting HTTP 401 Unauthorized for incorrect credentials
    assert response.status_code == 401, f"Expected status code 401, but got {response.status_code}"

    try:
        json_response = response.json()
    except ValueError:
        assert False, "Response is not in JSON format"
    
    error_keys = ["error", "message", "detail"]
    found_key = None
    for key in error_keys:
        if key in json_response:
            found_key = key
            break
    assert found_key is not None, "Error message key not found in response"
    error_message = str(json_response[found_key]).lower()
    assert "incorrect" in error_message or "invalid" in error_message or "failed" in error_message, \
        f"Unexpected error message: {error_message}"

test_user_login_with_incorrect_credentials()

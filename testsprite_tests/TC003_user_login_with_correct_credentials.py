import requests

BASE_URL = "http://localhost:8000"
LOGIN_ENDPOINT = "/auth/login"
TIMEOUT = 30

def test_user_login_with_correct_credentials():
    url = BASE_URL + LOGIN_ENDPOINT
    payload = {
        "username": "weird14446",
        "password": "dlstn1151@"
    }
    headers = {
        "Content-Type": "application/json"
    }
    try:
        response = requests.post(url, json=payload, headers=headers, timeout=TIMEOUT)
        response.raise_for_status()
    except requests.RequestException as e:
        assert False, f"HTTP request failed: {e}"

    assert response.status_code == 200, f"Expected status code 200, got {response.status_code}"
    json_response = response.json()
    assert isinstance(json_response, dict), "Response is not a JSON object"

    token = None
    if "token" in json_response:
        token = json_response["token"]
    elif "access_token" in json_response:
        token = json_response["access_token"]

    assert token is not None, "Login response does not contain authentication token"
    assert isinstance(token, str) and len(token) > 0, "Invalid token value"

test_user_login_with_correct_credentials()

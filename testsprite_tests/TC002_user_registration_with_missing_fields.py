import requests

BASE_URL = "http://localhost:8000"
AUTH_USERNAME = "weird14446"
AUTH_PASSWORD = "dlstn1151@"
TIMEOUT = 30

def test_user_registration_with_missing_fields():
    url = f"{BASE_URL}/auth/signup"
    headers = {
        "Content-Type": "application/json"
    }
    # Prepare test payloads with missing username and missing password separately
    test_payloads = [
        {"password": "SomePassword123!", "email": "user@example.com", "name": "Test User"},  # Missing username
        {"username": "testuser123", "email": "user@example.com", "name": "Test User"},       # Missing password
        {},  # Missing both username and password
    ]

    for payload in test_payloads:
        try:
            response = requests.post(
                url,
                json=payload,
                headers=headers,
                auth=(AUTH_USERNAME, AUTH_PASSWORD),
                timeout=TIMEOUT
            )
        except requests.RequestException as e:
            assert False, f"Request failed: {e}"

        # Expecting client error due to missing required fields
        assert response.status_code == 422 or response.status_code == 400, (
            f"Expected 4xx error for missing fields but got {response.status_code}: {response.text}"
        )

        # The response should include error detail indicating which fields are missing
        json_resp = None
        try:
            json_resp = response.json()
        except ValueError:
            assert False, f"Response is not JSON: {response.text}"

        assert "error" in json_resp or "detail" in json_resp, (
            f"Response JSON does not contain 'error' or 'detail' key: {json_resp}"
        )

test_user_registration_with_missing_fields()
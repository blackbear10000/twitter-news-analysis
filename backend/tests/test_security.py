from app.core.security import create_access_token, hash_password, verify_password, decode_token


def test_hash_and_verify_password():
    hashed = hash_password("SuperSecret123")
    assert hashed != "SuperSecret123"
    assert verify_password("SuperSecret123", hashed)
    assert not verify_password("Wrong", hashed)


def test_token_roundtrip():
    token = create_access_token("tester")
    subject = decode_token(token)
    assert subject == "tester"


"""Production startup must refuse insecure configuration — without leaking secrets."""
import pytest

from backend.config import Settings, validate_production_settings


def _settings(**overrides) -> Settings:
    base = dict(
        environment="production",
        secret_key="a" * 48,
        webhook_base_url="https://real.example-host.app",
        twilio_account_sid="ACreal",
        twilio_auth_token="tokenreal",
        twilio_phone_number="+10000000000",
        voice_enabled=True,
    )
    base.update(overrides)
    return Settings(**base)


def test_valid_production_config_has_no_problems():
    assert validate_production_settings(_settings()) == []


@pytest.mark.parametrize(
    "bad_key", ["change-me-in-production", "your_jwt_secret_key_change_this_in_production", ""]
)
def test_default_secret_key_is_rejected(bad_key):
    problems = validate_production_settings(_settings(secret_key=bad_key))
    assert any("SECRET_KEY" in p for p in problems)


def test_short_secret_key_is_rejected():
    problems = validate_production_settings(_settings(secret_key="short"))
    assert any("SECRET_KEY" in p for p in problems)


def test_placeholder_webhook_url_is_rejected():
    problems = validate_production_settings(
        _settings(webhook_base_url="https://your-ngrok-url.ngrok.io")
    )
    assert any("WEBHOOK_BASE_URL" in p for p in problems)


def test_non_https_webhook_url_is_rejected():
    problems = validate_production_settings(_settings(webhook_base_url="http://example-host.app"))
    assert any("WEBHOOK_BASE_URL" in p for p in problems)


def test_missing_twilio_credentials_rejected_when_voice_enabled():
    problems = validate_production_settings(_settings(twilio_auth_token=""))
    assert any("TWILIO_AUTH_TOKEN" in p for p in problems)


def test_missing_twilio_credentials_allowed_when_voice_disabled():
    problems = validate_production_settings(
        _settings(voice_enabled=False, twilio_auth_token="", twilio_account_sid="")
    )
    assert problems == []


def test_problem_messages_never_contain_secret_values():
    """Error text must name the setting, never echo its value."""
    secret = "super-secret-value-that-must-not-leak"
    problems = validate_production_settings(
        _settings(secret_key="change-me-in-production", twilio_auth_token=secret, voice_enabled=True)
    )
    joined = " ".join(problems)
    assert secret not in joined
    assert "change-me-in-production" not in joined


def test_development_is_the_default_environment():
    assert Settings(_env_file=None).environment == "development"
    assert Settings(_env_file=None).is_production is False


def test_is_production_accepts_common_spellings():
    assert Settings(_env_file=None, environment="production").is_production
    assert Settings(_env_file=None, environment="PROD").is_production
    assert not Settings(_env_file=None, environment="staging").is_production

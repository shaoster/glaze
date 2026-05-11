from unittest.mock import MagicMock

import pytest

import api.utils


class TestRembgInit:
    @pytest.fixture(autouse=True)
    def clear_cache(self):
        """Clear the rembg session cache before each test."""
        api.utils._REMBG_SESSIONS.clear()

    def test_get_rembg_session_uses_sessions_dict(self, monkeypatch):
        """Verify it uses rembg.sessions.sessions if it's a dict."""
        mock_sessions_mod = MagicMock()
        mock_session_class = MagicMock()
        mock_session_class.return_value = "fake_session"

        # Simulate rembg.sessions.sessions as a dict
        mock_sessions_mod.sessions = {"u2net": mock_session_class}
        monkeypatch.setattr("rembg.sessions", mock_sessions_mod, raising=False)
        # Also need to mock the import in the function
        monkeypatch.setattr("rembg.new_session", MagicMock())

        session = api.utils._get_rembg_session("u2net")

        assert session == "fake_session"
        mock_session_class.assert_called_once()

    def test_get_rembg_session_handles_list_sessions_names(self, monkeypatch):
        """Verify it doesn't crash when sessions_names is a list (the reported bug)."""
        mock_sessions_mod = MagicMock()
        # Reported bug: sessions_names is a list
        mock_sessions_mod.sessions_names = ["u2net", "u2netp"]
        mock_sessions_mod.sessions = None  # Or missing
        mock_sessions_mod.sessions_class = []  # Or missing

        monkeypatch.setattr("rembg.sessions", mock_sessions_mod, raising=False)

        mock_new_session = MagicMock()
        mock_new_session.return_value = "fallback_session"
        monkeypatch.setattr("rembg.new_session", mock_new_session)

        # This should NOT raise AttributeError anymore
        session = api.utils._get_rembg_session("u2net")

        assert session == "fallback_session"
        mock_new_session.assert_called_once()

    def test_get_rembg_session_uses_sessions_class_list(self, monkeypatch):
        """Verify it can find the class in sessions_class list."""
        mock_sessions_mod = MagicMock()

        mock_session_class = MagicMock()
        mock_session_class.name.return_value = "u2net"
        mock_session_class.return_value = "fake_session_from_list"

        mock_sessions_mod.sessions = None
        mock_sessions_mod.sessions_class = [mock_session_class]

        monkeypatch.setattr("rembg.sessions", mock_sessions_mod, raising=False)
        monkeypatch.setattr("rembg.new_session", MagicMock())

        session = api.utils._get_rembg_session("u2net")

        assert session == "fake_session_from_list"
        mock_session_class.assert_called_once()

    def test_get_rembg_session_falls_back_on_all_failures(self, monkeypatch):
        """Verify it falls back to new_session if everything fails."""

        # Mock rembg.sessions to raise something unexpected
        def broken_import():
            raise AttributeError("boom")

        monkeypatch.setattr("api.utils.logger", MagicMock())
        # We can't easily mock the 'from rembg import sessions' if it's already imported
        # but we can mock the getattr or the logic after it.

        monkeypatch.setattr(
            "rembg.sessions",
            MagicMock(side_effect=AttributeError("boom")),
            raising=False,
        )

        mock_new_session = MagicMock()
        mock_new_session.return_value = "emergency_session"
        monkeypatch.setattr("rembg.new_session", mock_new_session)

        session = api.utils._get_rembg_session("u2net")

        assert session == "emergency_session"

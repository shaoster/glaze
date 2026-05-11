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

    def test_get_rembg_session_defaults_to_u2netp(self, monkeypatch):
        """Verify the default model is u2netp."""
        mock_new_session = MagicMock()
        mock_new_session.return_value = "default_session"
        monkeypatch.setattr("rembg.new_session", mock_new_session)
        monkeypatch.setattr("rembg.sessions", MagicMock(), raising=False)

        session = api.utils._get_rembg_session()
        assert session == "default_session"
        # Check that it was called with u2netp
        mock_new_session.assert_called_once()
        args, kwargs = mock_new_session.call_args
        assert args[0] == "u2netp"

    def test_calculate_subject_crop_uses_u2netp(self, monkeypatch):
        """Verify calculate_subject_crop calls _get_rembg_session with u2netp."""
        from PIL import Image

        mock_get_session = MagicMock()
        monkeypatch.setattr("api.utils._get_rembg_session", mock_get_session)

        mock_remove = MagicMock()
        # Return a dummy image with an alpha channel
        dummy_output = Image.new("RGBA", (100, 100), (0, 0, 0, 0))
        mock_remove.return_value = dummy_output
        monkeypatch.setattr("rembg.remove", mock_remove)

        # 1x1 white pixel PNG
        image_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\xff\xff?\x00\x05\xfe\x02\xfe\xdcD\xfe\xe7\x00\x00\x00\x00IEND\xaeB`\x82"

        api.utils.calculate_subject_crop(image_bytes)

        mock_get_session.assert_called_with("u2netp")

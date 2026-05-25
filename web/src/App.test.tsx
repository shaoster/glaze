import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Capture the onSuccess callback so tests can trigger Google sign-in.
let _googleOnSuccess: ((r: { code: string }) => void) | undefined;

vi.mock("@react-oauth/google", () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  useGoogleLogin: ({
    onSuccess,
  }: {
    onSuccess: (r: { code: string }) => void;
  }) => {
    _googleOnSuccess = onSuccess;
    return () => {
      /* no-op: tests invoke _googleOnSuccess directly */
    };
  },
}));

vi.mock("./util/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./util/api")>();
  return {
    ...actual,
    fetchAppInit: vi
      .fn()
      .mockResolvedValue({
        googleOauthClientId: "test-client-id",
        adminBaseUrl: null,
        user: null,
      }),
    loginWithGoogle: vi.fn(),
    logoutUser: vi.fn().mockResolvedValue(undefined),
    validateInviteCode: vi.fn(),
    getStaffInviteCode: vi.fn(),
    generateStaffInviteCode: vi.fn(),
    fetchPieces: vi.fn().mockResolvedValue({ count: 0, results: [] }),
    fetchPiece: vi.fn(),
    ensureCsrfCookie: vi.fn().mockResolvedValue(undefined),
    createPiece: vi.fn(),
    addPieceState: vi.fn(),
    updateCurrentState: vi.fn(),
    updatePiece: vi.fn(),
    fetchGlobalEntries: vi.fn().mockResolvedValue([]),
    createGlobalEntry: vi.fn(),
    hasCloudinaryUploadConfig: vi.fn().mockReturnValue(false),
    uploadImageToCloudinary: vi.fn(),
    fetchGlazeCombinationImages: vi.fn().mockResolvedValue([]),
    updateUserPreferences: vi.fn(async (preferences) => ({
      alias: "",
      preferences,
    })),
  };
});

vi.mock("./components/NewPieceDialog", () => ({
  default: () => null,
}));

vi.mock("./components/PieceList", () => ({
  default: ({ onNewPiece }: { onNewPiece?: () => void }) => (
    <div>
      {onNewPiece && <button onClick={onNewPiece}>New Piece</button>}
      <div>Piece List Content</div>
    </div>
  ),
}));

vi.mock("./components/PieceDetail", () => ({
  default: () => <div>Piece Detail Content</div>,
}));

vi.mock("./components/UserPreferencesDialog", () => ({
  default: ({
    open,
    activeSectionId,
    onClose,
    onSectionChange,
  }: {
    open: boolean;
    activeSectionId: "process-summary" | "tutorials" | "identity" | null;
    onClose: () => void;
    onSectionChange: (
      sectionId: "process-summary" | "tutorials" | "identity" | null,
    ) => void;
  }) =>
    open ? (
      <div>
        <div>User Preferences Dialog</div>
        <div>Active Section: {activeSectionId ?? "none"}</div>
        <button onClick={() => onSectionChange("process-summary")}>
          Process Summary
        </button>
        <button onClick={() => onSectionChange("tutorials")}>Tutorials</button>
        <button onClick={() => onSectionChange("identity")}>Identity</button>
        <button onClick={onClose}>Cancel</button>
      </div>
    ) : null,
}));

vi.mock("./components/GlazeCombinationGallery", () => ({
  default: () => <div>Glaze Combinations</div>,
}));

vi.mock("./pages/GlazeImportToolPage", () => ({
  default: () => <div>Glaze Import Tool Page</div>,
}));

// Now import App and the mocked api
import {
  fetchAppInit,
  fetchPiece,
  loginWithGoogle,
  logoutUser,
  validateInviteCode,
} from "./util/api";
import App from "./App";
import { getPostLoginRedirectTarget } from "./util/postLoginRedirect";

const MOCK_OPENID_SUBJECT =
  "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2";

const MOCK_USER = {
  id: 1,
  is_staff: false,
  openid_subject: MOCK_OPENID_SUBJECT,
  alias: "",
  preferences: {
    process_summary_fields: [],
    summary_customize_popover: true as const,
    change_alias_prompt: true as const,
  },
};

const MOCK_ADMIN_USER = {
  ...MOCK_USER,
  is_staff: true,
};

// The display name shown in the chip is the first 8 chars of openid_subject + "…"
const MOCK_DISPLAY_NAME = `${MOCK_OPENID_SUBJECT.slice(0, 8)}…`;

describe("App auth flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _googleOnSuccess = undefined;
    window.history.pushState({}, "", "/");
    vi.mocked(fetchAppInit).mockResolvedValue({
      googleOauthClientId: "test-client-id",
      adminBaseUrl: null,
      user: null,
    });
    sessionStorage.clear();
  });

  it("shows error when /api/auth/me/ returns a server error", async () => {
    vi.mocked(fetchAppInit).mockRejectedValue(new Error("503"));
    render(<App />);
    await waitFor(() => {
      expect(
        screen.getByText(/All identity providers are misconfigured/),
      ).toBeInTheDocument();
    });
  });

  it("shows landing form when not authenticated", async () => {
    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText("Track every pottery piece through your workflow."),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("img", { name: "PotterDoc icon" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "About Us" })).toHaveAttribute(
      "href",
      "/about",
    );
    expect(
      screen.getByRole("link", { name: "Privacy Policy" }),
    ).toHaveAttribute("href", "/privacy-policy");

    expect(
      screen.getByRole("button", { name: /sign in with google/i }),
    ).toBeInTheDocument();
  });

  it("derives a safe admin redirect target from the apex next parameter", () => {
    expect(
      getPostLoginRedirectTarget(
        "potterdoc.com",
        "https:",
        "https://admin.potterdoc.com/admin/",
      ),
    ).toBe("https://admin.potterdoc.com/admin/");

    expect(
      getPostLoginRedirectTarget(
        "potterdoc.com",
        "https:",
        "https://example.com/admin/",
      ),
    ).toBeNull();
  });

  it("opens the privacy policy from the unauthenticated footer", async () => {
    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: "Privacy Policy" }),
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("link", { name: "Privacy Policy" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Privacy Policy" }),
      ).toBeInTheDocument();
      expect(screen.getByText(/we do not sell your data/i)).toBeInTheDocument();
      expect(window.location.pathname).toBe("/privacy-policy");
    });
  });

  it("opens the about page from the unauthenticated footer", async () => {
    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: "About Us" }),
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole("link", { name: "About Us" }));

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "About Us" }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: "View on GitHub" }),
      ).toHaveAttribute("href", "https://github.com/shaoster/glaze");
      expect(
        screen.getByText(/dinosaurs were the first great potters/i),
      ).toBeInTheDocument();
      expect(window.location.pathname).toBe("/about");
    });
  });

  it("logs in with Google and shows piece list view with user chip", async () => {
    vi.mocked(loginWithGoogle).mockResolvedValue(MOCK_USER);

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText("Track every pottery piece through your workflow."),
      ).toBeInTheDocument();
    });

    expect(_googleOnSuccess).toBeDefined();
    await _googleOnSuccess!({ code: "auth-code-123" });

    await waitFor(
      () => {
        expect(screen.getByText(MOCK_DISPLAY_NAME)).toBeInTheDocument();
        expect(screen.getByText("Piece List Content")).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    expect(
      screen.getByRole("img", { name: "PotterDoc app icon" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Pieces" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Analyze" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });

  it("passes pending invite code from sessionStorage to loginWithGoogle", async () => {
    sessionStorage.setItem("pendingInviteCode", "test-invite-uuid");
    vi.mocked(loginWithGoogle).mockResolvedValue(MOCK_USER);

    render(<App />);

    await waitFor(() =>
      expect(
        screen.getByText(/track every pottery piece/i),
      ).toBeInTheDocument(),
    );

    expect(_googleOnSuccess).toBeDefined();
    await _googleOnSuccess!({ code: "auth-code-456" });

    await waitFor(() =>
      expect(loginWithGoogle).toHaveBeenCalledWith(
        "auth-code-456",
        window.location.origin,
        "test-invite-uuid",
      ),
    );
    expect(sessionStorage.getItem("pendingInviteCode")).toBeNull();
  });

  it("shows error when Google sign-in fails", async () => {
    vi.mocked(loginWithGoogle).mockRejectedValue(new Error("network error"));

    render(<App />);

    await waitFor(() =>
      expect(
        screen.getByText(/track every pottery piece/i),
      ).toBeInTheDocument(),
    );

    expect(_googleOnSuccess).toBeDefined();
    await _googleOnSuccess!({ code: "bad-code" });

    await waitFor(() =>
      expect(screen.getByText(/google sign-in failed/i)).toBeInTheDocument(),
    );
  });

  it("switches between landing tabs and keeps the URL in sync", async () => {
    vi.mocked(fetchAppInit).mockResolvedValue({
      googleOauthClientId: "test-client-id",
      adminBaseUrl: null,
      user: MOCK_USER,
    });

    render(<App />);

    await waitFor(
      () => {
        expect(
          screen.getByRole("button", { name: /new piece/i }),
        ).toBeInTheDocument();
      },
      { timeout: 5000 },
    );

    await userEvent.click(screen.getByRole("tab", { name: "Analyze" }));

    await waitFor(() => {
      expect(screen.getByText("Glaze Combinations")).toBeInTheDocument();
      expect(window.location.pathname).toBe("/analyze");
    });

    expect(screen.getByRole("tab", { name: "Analyze" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.click(screen.getByRole("tab", { name: "Pieces" }));

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new piece/i }),
      ).toBeInTheDocument();
      expect(window.location.pathname).toBe("/");
    });
  });

  it("clicking Log out calls logoutUser and returns to the login form", async () => {
    vi.mocked(fetchAppInit).mockResolvedValue({
      googleOauthClientId: "test-client-id",
      adminBaseUrl: null,
      user: MOCK_USER,
    });
    vi.mocked(logoutUser).mockResolvedValue(undefined);

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new piece/i }),
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText(MOCK_DISPLAY_NAME));
    await userEvent.click(screen.getByText("Log out"));

    await waitFor(() => {
      expect(logoutUser).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(
        screen.getByText("Track every pottery piece through your workflow."),
      ).toBeInTheDocument();
    });
  });

  it("shows the manual crop tool menu item only for admin users and routes to it", async () => {
    vi.mocked(fetchAppInit).mockResolvedValue({
      googleOauthClientId: "test-client-id",
      adminBaseUrl: "https://admin.potterdoc.com",
      user: MOCK_ADMIN_USER,
    });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new piece/i }),
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText(MOCK_DISPLAY_NAME));
    await userEvent.click(screen.getByText("Glaze Import Tool"));

    await waitFor(() => {
      expect(screen.getByText("Glaze Import Tool Page")).toBeInTheDocument();
      expect(window.location.pathname).toBe("/tools/glaze-import");
    });
  });

  it("shows the Admin Tool menu item only for admin users and redirects to /admin/", async () => {
    vi.mocked(fetchAppInit).mockResolvedValue({
      googleOauthClientId: "test-client-id",
      adminBaseUrl: "https://admin.potterdoc.com",
      user: MOCK_ADMIN_USER,
    });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new piece/i }),
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText(MOCK_DISPLAY_NAME));
    const adminLink = screen.getByText("Admin Tool").closest("a");
    expect(adminLink).toHaveAttribute(
      "href",
      "https://admin.potterdoc.com/admin/",
    );
  });

  it("does not show the manual crop tool menu item for non-admin users", async () => {
    vi.mocked(fetchAppInit).mockResolvedValue({
      googleOauthClientId: "test-client-id",
      adminBaseUrl: null,
      user: MOCK_USER,
    });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new piece/i }),
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText(MOCK_DISPLAY_NAME));

    expect(screen.queryByText("Glaze Import Tool")).not.toBeInTheDocument();
  });

  it("navigates to the piece summary preferences route from the user menu", async () => {
    vi.mocked(fetchAppInit).mockResolvedValue({
      googleOauthClientId: "test-client-id",
      adminBaseUrl: null,
      user: MOCK_USER,
    });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new piece/i }),
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText(MOCK_DISPLAY_NAME));
    await userEvent.click(screen.getByText("Preferences"));

    expect(screen.getByText("User Preferences Dialog")).toBeInTheDocument();
    expect(window.location.pathname).toBe("/preferences");
  });

  it("shows the alias tutorial inlay and opens identity preferences from it", async () => {
    vi.mocked(fetchAppInit).mockResolvedValue({
      googleOauthClientId: "test-client-id",
      adminBaseUrl: null,
      user: MOCK_USER,
    });

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new piece/i }),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByRole("button", { name: "Change your alias!" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Change your alias!" }),
    );

    await waitFor(() => {
      expect(screen.getByText("User Preferences Dialog")).toBeInTheDocument();
      expect(screen.getByText("Active Section: identity")).toBeInTheDocument();
      expect(window.location.pathname).toBe("/preferences/identity");
    });
  });

  it("opens the identity preferences route directly", async () => {
    vi.mocked(fetchAppInit).mockResolvedValue({
      googleOauthClientId: "test-client-id",
      adminBaseUrl: null,
      user: MOCK_USER,
    });
    window.history.pushState({}, "", "/preferences/identity");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("User Preferences Dialog")).toBeInTheDocument();
    });

    expect(window.location.pathname).toBe("/preferences/identity");
  });

  it("opens the tutorials preferences route directly", async () => {
    vi.mocked(fetchAppInit).mockResolvedValue({
      googleOauthClientId: "test-client-id",
      adminBaseUrl: null,
      user: MOCK_USER,
    });
    window.history.pushState({}, "", "/preferences/tutorials");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("User Preferences Dialog")).toBeInTheDocument();
    });

    expect(window.location.pathname).toBe("/preferences/tutorials");
  });

  it("cancels preferences back to the current piece detail instead of the pieces list return target", async () => {
    vi.mocked(fetchAppInit).mockResolvedValue({
      googleOauthClientId: "test-client-id",
      adminBaseUrl: null,
      user: MOCK_USER,
    });
    vi.mocked(fetchPiece).mockResolvedValue({
      id: "piece-1",
      name: "Tall Mug",
      created: new Date("2024-01-01T00:00:00Z"),
      last_modified: new Date("2024-01-02T00:00:00Z"),
      thumbnail: null,
      shared: false,
      can_edit: true,
      is_editable: false,
      current_state: {
        id: "state-1",
        state: "designed",
        notes: "",
        created: new Date("2024-01-01T00:00:00Z"),
        last_modified: new Date("2024-01-01T00:00:00Z"),
        images: [],
        custom_fields: {},
        has_been_edited: false,
        previous_state: null,
        next_state: null,
      },
      history: [],
      current_location: "",
      tags: [],
      showcase_story: "",
      showcase_fields: [],
    });
    window.history.pushState({}, "", "/pieces/piece-1");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Piece Detail Content")).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText(MOCK_DISPLAY_NAME));
    await userEvent.click(screen.getByText("Preferences"));
    await userEvent.click(screen.getByText("Tutorials"));
    await userEvent.click(screen.getByText("Cancel"));

    expect(window.location.pathname).toBe("/pieces/piece-1");
  });

  it("activates the analyze tab on direct navigation to /analyze", async () => {
    vi.mocked(fetchAppInit).mockResolvedValue({
      googleOauthClientId: "test-client-id",
      adminBaseUrl: null,
      user: MOCK_USER,
    });
    window.history.pushState({}, "", "/analyze");

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Glaze Combinations")).toBeInTheDocument();
    });

    expect(screen.getByRole("tab", { name: "Analyze" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(screen.getByRole("tab", { name: "Pieces" })).toHaveAttribute(
      "aria-selected",
      "false",
    );
  });
});

describe("invite page routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("renders InvitePage at /invite when the user is already signed in", async () => {
    vi.mocked(fetchAppInit).mockResolvedValue({
      googleOauthClientId: "test-client-id",
      adminBaseUrl: null,
      user: MOCK_USER,
    });
    vi.mocked(validateInviteCode).mockResolvedValue({ valid: true });
    window.history.pushState({}, "", "/invite?code=test-uuid");

    render(<App />);

    await waitFor(() =>
      expect(
        screen.getByText(/your invite code is valid/i),
      ).toBeInTheDocument(),
    );
  });

  it("renders InvitePage at /invite when not signed in", async () => {
    vi.mocked(fetchAppInit).mockResolvedValue({
      googleOauthClientId: "test-client-id",
      adminBaseUrl: null,
      user: null,
    });
    vi.mocked(validateInviteCode).mockResolvedValue({ valid: true });
    window.history.pushState({}, "", "/invite?code=test-uuid");

    render(<App />);

    await waitFor(() =>
      expect(
        screen.getByText(/your invite code is valid/i),
      ).toBeInTheDocument(),
    );
  });

  it("stores invite code in sessionStorage after validation", async () => {
    vi.mocked(fetchAppInit).mockResolvedValue({
      googleOauthClientId: "test-client-id",
      adminBaseUrl: null,
      user: null,
    });
    vi.mocked(validateInviteCode).mockResolvedValue({ valid: true });
    window.history.pushState({}, "", "/invite?code=my-invite-uuid");

    render(<App />);

    await waitFor(() =>
      expect(
        screen.getByText(/your invite code is valid/i),
      ).toBeInTheDocument(),
    );

    expect(sessionStorage.getItem("pendingInviteCode")).toBe("my-invite-uuid");
  });

  it("shows error for invalid invite code", async () => {
    vi.mocked(fetchAppInit).mockResolvedValue({
      googleOauthClientId: "test-client-id",
      adminBaseUrl: null,
      user: null,
    });
    vi.mocked(validateInviteCode).mockRejectedValue({
      response: { data: { detail: "This code has been used." } },
    });
    window.history.pushState({}, "", "/invite?code=used-code");

    render(<App />);

    await waitFor(() =>
      expect(screen.getByText(/this code has been used/i)).toBeInTheDocument(),
    );
  });
});

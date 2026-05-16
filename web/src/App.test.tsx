import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Capture the onSuccess callback so tests can trigger Google sign-in.
let _googleOnSuccess: ((r: { credential: string }) => void) | undefined;

vi.mock("@react-oauth/google", () => ({
  GoogleOAuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  GoogleLogin: ({ onSuccess }: { onSuccess: (r: { credential: string }) => void }) => {
    _googleOnSuccess = onSuccess;
    return <button>Google Login</button>;
  },
}));
vi.mock("./util/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./util/api")>();
  return {
    ...actual,
    fetchCurrentUser: vi.fn().mockResolvedValue(null),
    loginWithGoogle: vi.fn(),
    loginWithGoogleChecked: vi.fn(),
    loginWithEmail: vi.fn(),
    logoutUser: vi.fn().mockResolvedValue(undefined),
    registerWithEmail: vi.fn(),
    requestWaitlist: vi.fn().mockResolvedValue(undefined),
    acceptInvite: vi.fn(),
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

vi.mock("./components/GlazeCombinationGallery", () => ({
  default: () => <div>Glaze Combinations</div>,
}));

vi.mock("./pages/GlazeImportToolPage", () => ({
  default: () => <div>Glaze Import Tool Page</div>,
}));

// Now import App and the mocked api
import {
  fetchCurrentUser,
  loginWithEmail,
  loginWithGoogleChecked,
  logoutUser,
  requestWaitlist,
  acceptInvite,
  NotInvitedError,
} from "./util/api";
import App from "./App";

const MOCK_USER = {
  id: 1,
  email: "potter@example.com",
  first_name: "Pat",
  last_name: "Potter",
  is_staff: false,
  openid_subject: "",
  profile_image_url: "",
};

const MOCK_ADMIN_USER = {
  ...MOCK_USER,
  is_staff: true,
};

describe("App auth flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
    // Reset fetchCurrentUser to return null by default
    vi.mocked(fetchCurrentUser).mockResolvedValue(null);
  });

  it("shows landing/login form when not authenticated", async () => {
    render(<App />);

    // Wait for the auth landing form to appear
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

    // Verify we can find an input field (email input)
    const inputs = screen.getAllByRole("textbox");
    expect(inputs.length).toBeGreaterThan(0);
    // Verify the submit button exists
    const buttons = screen.getAllByRole("button");
    const logInButton = buttons.find(
      (btn) => btn.textContent === "Log In" && btn.closest("form"),
    );
    expect(logInButton).toBeDefined();
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

  it("logs in and shows piece list view with current user badge", async () => {
    // Mock loginWithEmail to return a user
    vi.mocked(loginWithEmail).mockResolvedValue(MOCK_USER);

    const { container } = render(<App />);

    // Wait for the form to appear
    await waitFor(() => {
      expect(
        screen.getByText("Track every pottery piece through your workflow."),
      ).toBeInTheDocument();
    });

    // Fill in credentials - get inputs from the form
    const inputs = container.querySelectorAll(
      'input[type="email"], input[type="password"]',
    );
    const emailInput = inputs[0] as HTMLInputElement;
    const passwordInput = inputs[1] as HTMLInputElement;

    if (emailInput && passwordInput) {
      fireEvent.change(emailInput, { target: { value: "potter@example.com" } });
      fireEvent.change(passwordInput, { target: { value: "password123" } });
    }

    // Submit the form - find the submit button (inside the form)
    const submitButton = screen
      .getAllByRole("button")
      .find((btn) => btn.textContent === "Log In" && btn.closest("form"));
    if (submitButton) {
      await userEvent.click(submitButton);
    }

    // Wait for the authenticated view to fully appear
    await waitFor(() => {
      expect(screen.getByText("Pat Potter")).toBeInTheDocument();
      expect(screen.getByText("Piece List Content")).toBeInTheDocument();
    });

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

  it("shows a spinner while login is submitting", async () => {
    vi.mocked(loginWithEmail).mockImplementation(
      () => new Promise(() => {}) as ReturnType<typeof loginWithEmail>,
    );

    const { container } = render(<App />);

    await waitFor(() => {
      expect(
        screen.getByText("Track every pottery piece through your workflow."),
      ).toBeInTheDocument();
    });

    const inputs = container.querySelectorAll(
      'input[type="email"], input[type="password"]',
    );
    const emailInput = inputs[0] as HTMLInputElement;
    const passwordInput = inputs[1] as HTMLInputElement;

    fireEvent.change(emailInput, { target: { value: "potter@example.com" } });
    fireEvent.change(passwordInput, { target: { value: "password123" } });

    const submitButton = screen
      .getAllByRole("button")
      .find((btn) => btn.textContent === "Log In" && btn.closest("form"));
    expect(submitButton).toBeDefined();

    await userEvent.click(submitButton!);

    expect(screen.getByText("Signing you in...")).toBeInTheDocument();
    expect(
      submitButton?.querySelector('[role="progressbar"]'),
    ).toBeInTheDocument();
  });

  it("switches between landing tabs and keeps the URL in sync", async () => {
    vi.mocked(fetchCurrentUser).mockResolvedValue(MOCK_USER);

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new piece/i }),
      ).toBeInTheDocument();
    });

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
    vi.mocked(fetchCurrentUser).mockResolvedValue(MOCK_USER);
    vi.mocked(logoutUser).mockResolvedValue(undefined);

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new piece/i }),
      ).toBeInTheDocument();
    });

    // Open the user menu and click log out
    await userEvent.click(screen.getByText("Pat Potter"));
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
    vi.mocked(fetchCurrentUser).mockResolvedValue(MOCK_ADMIN_USER);

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new piece/i }),
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Pat Potter"));
    await userEvent.click(screen.getByText("Glaze Import Tool"));

    await waitFor(() => {
      expect(screen.getByText("Glaze Import Tool Page")).toBeInTheDocument();
      expect(window.location.pathname).toBe("/tools/glaze-import");
    });
  });

  it("shows the Admin Tool menu item only for admin users and redirects to /admin/", async () => {
    vi.mocked(fetchCurrentUser).mockResolvedValue(MOCK_ADMIN_USER);

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new piece/i }),
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Pat Potter"));
    const adminLink = screen.getByText("Admin Tool").closest("a");
    expect(adminLink).toHaveAttribute("href", "/admin/");
  });

  it("does not show the manual crop tool menu item for non-admin users", async () => {
    vi.mocked(fetchCurrentUser).mockResolvedValue(MOCK_USER);

    render(<App />);

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new piece/i }),
      ).toBeInTheDocument();
    });

    await userEvent.click(screen.getByText("Pat Potter"));

    expect(screen.queryByText("Glaze Import Tool")).not.toBeInTheDocument();
  });

  it("activates the analyze tab on direct navigation to /analyze", async () => {
    vi.mocked(fetchCurrentUser).mockResolvedValue(MOCK_USER);
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

// ── invite / waitlist / not_invited flows ─────────────────────────────────────

describe("not_invited and waitlist flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.pushState({}, "", "/");
    vi.mocked(fetchCurrentUser).mockResolvedValue(null);
    vi.mocked(requestWaitlist).mockResolvedValue(undefined);
  });

  it("successful Google sign-in logs the user in", async () => {
    vi.mocked(loginWithGoogleChecked).mockResolvedValue(MOCK_USER);
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client-id");

    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Google Login" })).toBeInTheDocument(),
    );

    expect(_googleOnSuccess).toBeDefined();
    await _googleOnSuccess!({ credential: "header.eyJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20ifQ.sig" });

    await waitFor(() => expect(screen.getByText("Pat Potter")).toBeInTheDocument());

    vi.unstubAllEnvs();
  });

  it("shows generic error when Google sign-in fails (onError)", async () => {
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client-id");

    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Google Login" })).toBeInTheDocument(),
    );

    // The GoogleLogin mock exposes onError via the rendered button's sibling.
    // Simulate the onError path by finding and triggering it through the mock.
    // Our mock only exposes onSuccess — patch loginWithGoogleChecked to cover
    // the generic-error branch via onSuccess throwing a non-NotInvitedError.
    vi.mocked(loginWithGoogleChecked).mockRejectedValue(new Error("network error"));
    await _googleOnSuccess!({ credential: "header.eyJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20ifQ.sig" });

    await waitFor(() =>
      expect(screen.getByText(/google sign-in failed/i)).toBeInTheDocument(),
    );

    vi.unstubAllEnvs();
  });

  it("shows inline error when Request Access clicked with no email", async () => {
    render(<App />);
    await waitFor(() =>
      expect(screen.getByText(/track every pottery piece/i)).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: "Request Access" }));

    await waitFor(() =>
      expect(screen.getByText(/enter your email below/i)).toBeInTheDocument(),
    );
    expect(requestWaitlist).not.toHaveBeenCalled();
  });

  it("submits waitlist immediately when Request Access clicked with email pre-filled", async () => {
    const { container } = render(<App />);
    await waitFor(() =>
      expect(screen.getByText(/track every pottery piece/i)).toBeInTheDocument(),
    );

    const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
    fireEvent.change(emailInput, { target: { value: "hopeful@example.com" } });

    await userEvent.click(screen.getByRole("button", { name: "Request Access" }));

    await waitFor(() =>
      expect(screen.getByText(/we'll let you know/i)).toBeInTheDocument(),
    );
    expect(requestWaitlist).toHaveBeenCalledWith("hopeful@example.com");
  });

  // P1 regression: unpadded base64url JWT payload must still yield the email.
  it("shows Request Access with correct email after Google not_invited with unpadded JWT", async () => {
    // {"email":"x@example.com"} is 25 bytes → base64 needs == padding → test the
    // padding fix by stripping it before handing the credential to the handler.
    const rawPayload = '{"email":"x@example.com"}';
    const b64url = btoa(rawPayload).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
    const credential = `header.${b64url}.sig`;

    vi.mocked(loginWithGoogleChecked).mockRejectedValue(
      new NotInvitedError("This email is not invited."),
    );

    // GoogleLogin only renders when VITE_GOOGLE_CLIENT_ID is set.
    vi.stubEnv("VITE_GOOGLE_CLIENT_ID", "test-client-id");

    render(<App />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Google Login" })).toBeInTheDocument(),
    );

    // _googleOnSuccess is captured when GoogleLogin renders.
    expect(_googleOnSuccess).toBeDefined();
    await _googleOnSuccess!({ credential });

    await waitFor(() =>
      expect(screen.getByText(/this email is not invited/i)).toBeInTheDocument(),
    );
    // The shared section shows "Request access" (lowercase a); the header row
    // shows "Request Access" (capital A). Click the shared-section button which
    // already has the email from the decoded JWT.
    const requestButton = screen.getByRole("button", { name: "Request access" });
    await userEvent.click(requestButton);

    await waitFor(() =>
      expect(screen.getByText(/we'll let you know/i)).toBeInTheDocument(),
    );
    expect(requestWaitlist).toHaveBeenCalledWith("x@example.com");

    vi.unstubAllEnvs();
  });
});

describe("invite page routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(requestWaitlist).mockResolvedValue(undefined);
  });

  // P2 regression: /invite must render InvitePage even when authenticated.
  it("renders InvitePage at /invite when the user is already signed in", async () => {
    vi.mocked(fetchCurrentUser).mockResolvedValue(MOCK_USER);
    vi.mocked(acceptInvite).mockResolvedValue({ email: "user@example.com" });
    window.history.pushState({}, "", "/invite?token=valid-token");

    render(<App />);

    await waitFor(() =>
      expect(screen.getByText(/you've been invited/i)).toBeInTheDocument(),
    );
  });

  it("renders InvitePage at /invite when not signed in", async () => {
    vi.mocked(fetchCurrentUser).mockResolvedValue(null);
    vi.mocked(acceptInvite).mockResolvedValue({ email: "new@example.com" });
    window.history.pushState({}, "", "/invite?token=valid-token");

    render(<App />);

    await waitFor(() =>
      expect(screen.getByText(/you've been invited/i)).toBeInTheDocument(),
    );
  });

  // P3 regression: "Continue to sign in" must prefill the email on the auth form.
  it("prefills email on auth form after accepting an invite", async () => {
    vi.mocked(fetchCurrentUser).mockResolvedValue(null);
    vi.mocked(acceptInvite).mockResolvedValue({ email: "invited@example.com" });
    window.history.pushState({}, "", "/invite?token=valid-token");

    const { container } = render(<App />);

    await waitFor(() =>
      expect(screen.getByText(/you've been invited/i)).toBeInTheDocument(),
    );

    await userEvent.click(screen.getByRole("button", { name: /continue to sign in/i }));

    await waitFor(() => {
      const emailInput = container.querySelector('input[type="email"]') as HTMLInputElement;
      expect(emailInput?.value).toBe("invited@example.com");
    });
  });
});

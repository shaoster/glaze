import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Mock the module before importing App
vi.mock("./util/api", () => ({
  fetchCurrentUser: vi.fn().mockResolvedValue(null),
  loginWithGoogle: vi.fn(),
  loginWithEmail: vi.fn(),
  logoutUser: vi.fn().mockResolvedValue(undefined),
  registerWithEmail: vi.fn(),
  fetchPieces: vi.fn().mockResolvedValue([]),
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
}));

vi.mock("./components/NewPieceDialog", () => ({
  default: () => null,
}));

vi.mock("./components/PieceList", () => ({
  default: () => <div>Piece List Content</div>,
}));

vi.mock("./components/PieceDetail", () => ({
  default: () => <div>Piece Detail Content</div>,
}));

vi.mock("./components/GlazeCombinationGallery", () => ({
  default: () => <div>Glaze Gallery Content</div>,
}));

vi.mock("./pages/GlazeImportToolPage", () => ({
  default: () => <div>Glaze Import Tool Page</div>,
}));

// Now import App and the mocked api
import { fetchCurrentUser, loginWithEmail, logoutUser } from "./util/api";
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
      expect(screen.getByText("Glaze Gallery Content")).toBeInTheDocument();
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
      expect(screen.getByText("Glaze Gallery Content")).toBeInTheDocument();
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

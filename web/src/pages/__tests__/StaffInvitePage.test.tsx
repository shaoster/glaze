import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import StaffInvitePage from "../StaffInvitePage";
import * as api from "../../util/api";

vi.mock("../../util/api", () => ({
  getStaffInviteCode: vi.fn(),
  generateStaffInviteCode: vi.fn(),
  sendEmailInvite: vi.fn(),
  generateInviteBatch: vi.fn(),
}));

vi.mock("qrcode.react", () => ({
  QRCodeSVG: () => <div data-testid="qr-code" />,
}));

function axiosError(status: number) {
  return Object.assign(new Error(), { isAxiosError: true, response: { status } });
}

const MOCK_CODE = { code: "abc-123", expires_at: "2030-01-01T00:00:00Z" };

function renderPage() {
  render(
    <MemoryRouter>
      <StaffInvitePage />
    </MemoryRouter>,
  );
}

describe("StaffInvitePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows a spinner while loading", () => {
    vi.mocked(api.getStaffInviteCode).mockReturnValue(new Promise(() => {}));
    renderPage();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("displays the invite code and QR after load", async () => {
    vi.mocked(api.getStaffInviteCode).mockResolvedValue(MOCK_CODE);
    renderPage();
    expect(await screen.findByTestId("qr-code")).toBeInTheDocument();
    expect(screen.getByText("abc-123")).toBeInTheDocument();
  });

  it("shows an error alert on load failure", async () => {
    vi.mocked(api.getStaffInviteCode).mockRejectedValue(new Error("network"));
    renderPage();
    expect(
      await screen.findByText("Failed to load invite code."),
    ).toBeInTheDocument();
  });

  it("generates a new code when Generate New Code is clicked", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getStaffInviteCode).mockResolvedValue(MOCK_CODE);
    const newCode = { code: "xyz-999", expires_at: "2031-06-01T00:00:00Z" };
    vi.mocked(api.generateStaffInviteCode).mockResolvedValue(newCode);

    renderPage();
    await screen.findByText("abc-123");

    await user.click(screen.getByRole("button", { name: /generate new code/i }));

    await waitFor(() => {
      expect(screen.getByText("xyz-999")).toBeInTheDocument();
    });
    expect(api.generateStaffInviteCode).toHaveBeenCalledOnce();
  });

  describe("Send invite", () => {
    beforeEach(async () => {
      vi.mocked(api.getStaffInviteCode).mockResolvedValue(MOCK_CODE);
    });

    it("shows success feedback and clears the field on success", async () => {
      const user = userEvent.setup();
      vi.mocked(api.sendEmailInvite).mockResolvedValue(undefined);

      renderPage();
      await screen.findByText("abc-123");

      await user.type(screen.getByLabelText(/recipient email/i), "a@b.com");
      await user.click(screen.getByRole("button", { name: /send invite/i }));

      expect(await screen.findByText("Invite sent.")).toBeInTheDocument();
      expect(screen.getByLabelText(/recipient email/i)).toHaveValue("");
    });

    it("shows no-codes message on 409", async () => {
      const user = userEvent.setup();
      vi.mocked(api.sendEmailInvite).mockRejectedValue(axiosError(409));

      renderPage();
      await screen.findByText("abc-123");

      await user.type(screen.getByLabelText(/recipient email/i), "a@b.com");
      await user.click(screen.getByRole("button", { name: /send invite/i }));

      expect(
        await screen.findByText(/no invite codes available/i),
      ).toBeInTheDocument();
    });

    it("shows invalid email message on 400", async () => {
      const user = userEvent.setup();
      vi.mocked(api.sendEmailInvite).mockRejectedValue(axiosError(400));

      renderPage();
      await screen.findByText("abc-123");

      await user.type(screen.getByLabelText(/recipient email/i), "bad");
      await user.click(screen.getByRole("button", { name: /send invite/i }));

      expect(
        await screen.findByText(/enter a valid email address/i),
      ).toBeInTheDocument();
    });
  });

  describe("Generate batch", () => {
    beforeEach(async () => {
      vi.mocked(api.getStaffInviteCode).mockResolvedValue(MOCK_CODE);
    });

    it("shows success with count on resolve", async () => {
      const user = userEvent.setup();
      vi.mocked(api.generateInviteBatch).mockResolvedValue({ created: 10 });

      renderPage();
      await screen.findByText("abc-123");

      const countField = screen.getByLabelText(/how many/i);
      await user.clear(countField);
      await user.type(countField, "10");
      await user.click(screen.getByRole("button", { name: /generate batch/i }));

      expect(
        await screen.findByText("Generated 10 invite codes."),
      ).toBeInTheDocument();
      expect(api.generateInviteBatch).toHaveBeenCalledWith(10);
    });

    it("shows validation error for count of 0 without calling API", async () => {
      const user = userEvent.setup();
      renderPage();
      await screen.findByText("abc-123");

      const countField = screen.getByLabelText(/how many/i);
      await user.clear(countField);
      await user.type(countField, "0");
      await user.click(screen.getByRole("button", { name: /generate batch/i }));

      expect(
        await screen.findByText(/enter a positive number of codes/i),
      ).toBeInTheDocument();
      expect(api.generateInviteBatch).not.toHaveBeenCalled();
    });
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import InvitePage from "../InvitePage";

vi.mock("../../util/api", () => ({
  validateInviteCode: vi.fn(),
}));

import { validateInviteCode } from "../../util/api";

const mockValidateInviteCode = vi.mocked(validateInviteCode);

function renderWithCode(code: string) {
  render(
    <MemoryRouter initialEntries={[`/invite?code=${code}`]}>
      <Routes>
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/" element={<div>Sign in page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("InvitePage", () => {
  beforeEach(() => {
    mockValidateInviteCode.mockReset();
    sessionStorage.clear();
  });

  it("shows success banner and sign-in button on valid code", async () => {
    mockValidateInviteCode.mockResolvedValue({ valid: true });
    renderWithCode("valid-uuid");
    await waitFor(() =>
      expect(
        screen.getByText(/your invite code is valid/i),
      ).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /continue to sign in/i }),
    ).toBeInTheDocument();
  });

  it("stores the code in sessionStorage on success", async () => {
    mockValidateInviteCode.mockResolvedValue({ valid: true });
    renderWithCode("valid-uuid");
    await waitFor(() =>
      expect(
        screen.getByText(/your invite code is valid/i),
      ).toBeInTheDocument(),
    );
    expect(sessionStorage.getItem("pendingInviteCode")).toBe("valid-uuid");
  });

  it("shows error on invalid or expired code", async () => {
    mockValidateInviteCode.mockRejectedValue({
      response: { data: { detail: "Invalid or expired invitation link." } },
    });
    renderWithCode("bad-uuid");
    await waitFor(() =>
      expect(
        screen.getByText(/invalid or expired invitation link/i),
      ).toBeInTheDocument(),
    );
  });

  it("shows error when no code in URL", async () => {
    render(
      <MemoryRouter initialEntries={["/invite"]}>
        <Routes>
          <Route path="/invite" element={<InvitePage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(screen.getByText(/no invite code found/i)).toBeInTheDocument(),
    );
  });
});

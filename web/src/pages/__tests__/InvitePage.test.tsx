import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import InvitePage from "../InvitePage";

vi.mock("../../util/api", () => ({
  acceptInvite: vi.fn(),
}));

import { acceptInvite } from "../../util/api";

const mockAcceptInvite = vi.mocked(acceptInvite);

function renderWithToken(token: string) {
  render(
    <MemoryRouter initialEntries={[`/invite?token=${token}`]}>
      <Routes>
        <Route path="/invite" element={<InvitePage />} />
        <Route path="/" element={<div>Sign in page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("InvitePage", () => {
  beforeEach(() => {
    mockAcceptInvite.mockReset();
  });

  it("shows success banner and email on valid token", async () => {
    mockAcceptInvite.mockResolvedValue({ email: "user@example.com" });
    renderWithToken("valid-token");
    await waitFor(() =>
      expect(screen.getByText(/you've been invited/i)).toBeInTheDocument(),
    );
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
  });

  it("shows error on invalid token", async () => {
    mockAcceptInvite.mockRejectedValue({
      response: { data: { detail: "Invalid invitation link." } },
    });
    renderWithToken("bad-token");
    await waitFor(() =>
      expect(screen.getByText(/invalid invitation link/i)).toBeInTheDocument(),
    );
  });

  it("shows error when no token in URL", async () => {
    render(
      <MemoryRouter initialEntries={["/invite"]}>
        <Routes>
          <Route path="/invite" element={<InvitePage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(
        screen.getByText(/no invitation token/i),
      ).toBeInTheDocument(),
    );
  });
});

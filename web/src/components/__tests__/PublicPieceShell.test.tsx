import { Suspense } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import CircularProgress from "@mui/material/CircularProgress";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import PublicPieceShell from "../PublicPieceShell";
import ErrorBoundary from "../ErrorBoundary";
import * as api from "../../util/api";

vi.mock("react-router-dom", () => ({
  useParams: () => ({ id: "piece-1" }),
}));

vi.mock("../../util/api", () => ({
  fetchPiece: vi.fn(),
}));

vi.mock("../../../workflow.yml", () => ({
  default: {
    version: "test",
    globals: {},
    states: [
      {
        id: "state1",
        visible: true,
        friendly_name: "State 1",
        description: "Test state.",
        successors: [],
      },
    ],
  },
}));

function renderShell(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary>
        <Suspense fallback={<CircularProgress />}>
          <PublicPieceShell />
        </Suspense>
      </ErrorBoundary>
    </QueryClientProvider>,
  );
}

describe("PublicPieceShell", () => {
  it("renders a loading indicator while fetching", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(api.fetchPiece).mockReturnValue(new Promise(() => {}));

    renderShell(queryClient);

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders piece content with showcase story and custom fields when loaded", async () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    vi.mocked(api.fetchPiece).mockResolvedValue({
      id: "piece-1",
      name: "Beautiful Bowl",
      showcase_story: "This is a hand-crafted bowl.",
      showcase_fields: [
        "state1.material",
        "state1.emptyField",
        "state1.validBool",
      ],
      thumbnail: null,
      history: [
        {
          state: "state1",
          custom_fields: {
            material: "Clay",
            emptyField: "",
            validBool: true,
          },
        },
      ],
    } as any);

    renderShell(queryClient);

    expect(await screen.findByText("Beautiful Bowl")).toBeInTheDocument();
    expect(
      screen.getByText("This is a hand-crafted bowl."),
    ).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();

    expect(screen.getByText("Clay")).toBeInTheDocument();
    expect(screen.getByText("Yes")).toBeInTheDocument();

    expect(screen.queryByText("EmptyField")).not.toBeInTheDocument();
  });
});

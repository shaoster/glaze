import { beforeEach, describe, expect, it, vi } from "vitest";

const renderMock = vi.fn();
const createRootMock = vi.fn(() => ({ render: renderMock }));
const registerMock = vi.fn();

vi.mock("react-dom/client", () => ({
  createRoot: createRootMock,
}));

vi.mock("./App.tsx", () => ({
  default: () => <div>Mock App</div>,
}));

describe("main.tsx", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '<div id="root"></div>';
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { register: registerMock },
    });
  });

  it("renders the app into the root element", async () => {
    await import("./main.tsx");

    expect(createRootMock).toHaveBeenCalledWith(document.getElementById("root"));
    expect(renderMock).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

// Mock axios.create to return a controlled mock client
const mockGet = vi.fn();
const mockPost = vi.fn();
const mockPatch = vi.fn();
const mockDelete = vi.fn();

vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return {
    ...actual,
    default: {
      ...actual.default,
      create: vi.fn(() => ({
        get: mockGet,
        post: mockPost,
        patch: mockPatch,
        delete: mockDelete,
        defaults: {},
      })),
      isAxiosError: actual.default.isAxiosError,
    },
  };
});

// Import after mocking
const {
  fetchPieces,
  fetchPiece,
  createPiece,
  addPieceState,
  updateCurrentState,
  updatePiece,
  fetchGlobalEntries,
  fetchGlazeCombinations,
  toggleGlobalEntryFavorite,
  createGlobalEntry,
  fetchCurrentUser,
  loginWithEmail,
  logoutUser,
} = await import("../api");

// ---------------------------------------------------------------------------
// Shared wire fixtures
// ---------------------------------------------------------------------------

const wireImage = {
  url: "https://example.com/img.jpg",
  caption: "a caption",
  created: "2024-01-01T00:00:00Z",
  cloudinary_public_id: "pub123",
};

const wirePieceState = {
  state: "designed",
  notes: "some notes",
  created: "2024-01-01T00:00:00Z",
  last_modified: "2024-01-02T00:00:00Z",
  images: [wireImage],
  previous_state: null,
  next_state: null,
  additional_fields: { clay_weight_grams: 500 },
};

const wirePieceSummary = {
  id: "piece-1",
  name: "My Vase",
  created: "2024-01-01T00:00:00Z",
  last_modified: "2024-01-02T00:00:00Z",
  thumbnail: "/thumbnails/vase.svg",
  current_state: { state: "designed" },
  current_location: "Studio",
  tags: [{ id: "t1", name: "functional", color: "#aabbcc" }],
};

const wirePieceDetail = {
  ...wirePieceSummary,
  current_state: wirePieceState,
  history: [wirePieceState],
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// fetchPieces
// ---------------------------------------------------------------------------

describe("fetchPieces", () => {
  it("returns mapped PieceSummary array", async () => {
    mockGet.mockResolvedValue({ data: [wirePieceSummary] });

    const result = await fetchPieces();

    expect(mockGet).toHaveBeenCalledWith("pieces/");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("piece-1");
    expect(result[0].created).toBeInstanceOf(Date);
    expect(result[0].last_modified).toBeInstanceOf(Date);
    expect(result[0].current_state.state).toBe("designed");
    expect(result[0].tags[0].name).toBe("functional");
  });

  it("maps tags with empty array when missing", async () => {
    mockGet.mockResolvedValue({
      data: [{ ...wirePieceSummary, tags: undefined }],
    });
    const result = await fetchPieces();
    expect(result[0].tags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// fetchPiece
// ---------------------------------------------------------------------------

describe("fetchPiece", () => {
  it("returns mapped PieceDetail", async () => {
    mockGet.mockResolvedValue({ data: wirePieceDetail });

    const result = await fetchPiece("piece-1");

    expect(mockGet).toHaveBeenCalledWith("pieces/piece-1/");
    expect(result.id).toBe("piece-1");
    expect(result.current_state.created).toBeInstanceOf(Date);
    expect(result.current_state.images[0].created).toBeInstanceOf(Date);
    expect(result.current_state.additional_fields).toEqual({
      clay_weight_grams: 500,
    });
    expect(result.history).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// createPiece
// ---------------------------------------------------------------------------

describe("createPiece", () => {
  it("posts to pieces/ and returns mapped PieceDetail", async () => {
    mockPost.mockResolvedValue({ data: wirePieceDetail });

    const result = await createPiece({ name: "My Vase" });

    expect(mockPost).toHaveBeenCalledWith("pieces/", { name: "My Vase" });
    expect(result.name).toBe("My Vase");
  });
});

// ---------------------------------------------------------------------------
// addPieceState
// ---------------------------------------------------------------------------

describe("addPieceState", () => {
  it("posts to pieces/<id>/states/ and returns mapped PieceDetail", async () => {
    mockPost.mockResolvedValue({ data: wirePieceDetail });

    const result = await addPieceState("piece-1", {
      state: "wheel_thrown",
      notes: "threw it",
    });

    expect(mockPost).toHaveBeenCalledWith("pieces/piece-1/states/", {
      state: "wheel_thrown",
      notes: "threw it",
    });
    expect(result.id).toBe("piece-1");
  });
});

// ---------------------------------------------------------------------------
// updateCurrentState
// ---------------------------------------------------------------------------

describe("updateCurrentState", () => {
  it("patches pieces/<id>/state/ and returns mapped PieceDetail", async () => {
    mockPatch.mockResolvedValue({ data: wirePieceDetail });

    const result = await updateCurrentState("piece-1", {
      notes: "updated notes",
    });

    expect(mockPatch).toHaveBeenCalledWith("pieces/piece-1/state/", {
      notes: "updated notes",
    });
    expect(result.id).toBe("piece-1");
  });
});

// ---------------------------------------------------------------------------
// updatePiece
// ---------------------------------------------------------------------------

describe("updatePiece", () => {
  it("patches pieces/<id>/ with piece-level fields", async () => {
    mockPatch.mockResolvedValue({ data: wirePieceDetail });

    await updatePiece("piece-1", { name: "New Name" });

    expect(mockPatch).toHaveBeenCalledWith("pieces/piece-1/", {
      name: "New Name",
    });
  });
});

// ---------------------------------------------------------------------------
// fetchGlobalEntries
// ---------------------------------------------------------------------------

describe("fetchGlobalEntries", () => {
  it("maps snake_case is_public → camelCase isPublic", async () => {
    mockGet.mockResolvedValue({
      data: [
        {
          id: "g1",
          name: "Cone 6",
          is_public: true,
          is_favorite: false,
          color: "#ff0000",
        },
      ],
    });

    const result = await fetchGlobalEntries("glaze_type");

    expect(mockGet).toHaveBeenCalledWith("globals/glaze_type/");
    expect(result[0].isPublic).toBe(true);
    expect(result[0].isFavorite).toBe(false);
    expect(result[0].color).toBe("#ff0000");
  });

  it("omits isFavorite when is_favorite is absent", async () => {
    mockGet.mockResolvedValue({
      data: [{ id: "g2", name: "Studio B", is_public: false }],
    });

    const result = await fetchGlobalEntries("location");

    expect("isFavorite" in result[0]).toBe(false);
    expect("color" in result[0]).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fetchGlazeCombinations — filter parameter encoding
// ---------------------------------------------------------------------------

describe("fetchGlazeCombinations", () => {
  it("calls globals/glaze_combination/ with no params when no filters given", async () => {
    mockGet.mockResolvedValue({ data: [] });

    await fetchGlazeCombinations();

    expect(mockGet).toHaveBeenCalledWith("globals/glaze_combination/", {
      params: {},
    });
  });

  it("encodes glazeTypeIds as comma-joined string", async () => {
    mockGet.mockResolvedValue({ data: [] });

    await fetchGlazeCombinations({ glazeTypeIds: ["a", "b"] });

    expect(mockGet).toHaveBeenCalledWith(
      "globals/glaze_combination/",
      expect.objectContaining({ params: { glaze_type_ids: "a,b" } }),
    );
  });

  it("encodes boolean filters as strings", async () => {
    mockGet.mockResolvedValue({ data: [] });

    await fetchGlazeCombinations({
      isFoodSafe: true,
      runs: false,
      highlightsGrooves: true,
      isDifferentOnWhiteAndBrownClay: false,
    });

    expect(mockGet).toHaveBeenCalledWith(
      "globals/glaze_combination/",
      expect.objectContaining({
        params: {
          is_food_safe: "true",
          runs: "false",
          highlights_grooves: "true",
          is_different_on_white_and_brown_clay: "false",
        },
      }),
    );
  });

  it("omits filters whose values are undefined", async () => {
    mockGet.mockResolvedValue({ data: [] });

    await fetchGlazeCombinations({ isFoodSafe: undefined });

    const call = mockGet.mock.calls[0];
    expect(call[1].params).not.toHaveProperty("is_food_safe");
  });
});

// ---------------------------------------------------------------------------
// toggleGlobalEntryFavorite
// ---------------------------------------------------------------------------

describe("toggleGlobalEntryFavorite", () => {
  it("POSTs to favorite when favorite=true", async () => {
    mockPost.mockResolvedValue({});

    await toggleGlobalEntryFavorite("glaze_combination", "gc-1", true);

    expect(mockPost).toHaveBeenCalledWith(
      "globals/glaze_combination/gc-1/favorite/",
    );
    expect(mockDelete).not.toHaveBeenCalled();
  });

  it("DELETEs from favorite when favorite=false", async () => {
    mockDelete.mockResolvedValue({});

    await toggleGlobalEntryFavorite("glaze_combination", "gc-1", false);

    expect(mockDelete).toHaveBeenCalledWith(
      "globals/glaze_combination/gc-1/favorite/",
    );
    expect(mockPost).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// createGlobalEntry
// ---------------------------------------------------------------------------

describe("createGlobalEntry", () => {
  it("posts payload and maps the response", async () => {
    mockPost.mockResolvedValue({
      data: { id: "loc-1", name: "Studio B", is_public: false },
    });

    const result = await createGlobalEntry("location", {
      field: "name",
      value: "Studio B",
    });

    expect(mockPost).toHaveBeenCalledWith("globals/location/", {
      field: "name",
      value: "Studio B",
    });
    expect(result.id).toBe("loc-1");
    expect(result.isPublic).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fetchCurrentUser — 401/403 → null, other errors rethrown
// ---------------------------------------------------------------------------

describe("fetchCurrentUser", () => {
  it("returns user data on success", async () => {
    mockGet.mockResolvedValue({
      data: {
        id: 1,
        email: "user@example.com",
        first_name: "Jane",
        last_name: "Doe",
        is_staff: false,
        openid_subject: "",
        profile_image_url: "",
      },
    });

    const user = await fetchCurrentUser();
    expect(user?.email).toBe("user@example.com");
  });

  it("returns null on 401", async () => {
    const err = Object.assign(new Error("Unauthorized"), {
      isAxiosError: true,
      response: { status: 401 },
    });
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);
    mockGet.mockRejectedValue(err);

    const user = await fetchCurrentUser();
    expect(user).toBeNull();
  });

  it("returns null on 403", async () => {
    const err = Object.assign(new Error("Forbidden"), {
      isAxiosError: true,
      response: { status: 403 },
    });
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);
    mockGet.mockRejectedValue(err);

    const user = await fetchCurrentUser();
    expect(user).toBeNull();
  });

  it("rethrows non-auth errors", async () => {
    const err = Object.assign(new Error("Server Error"), {
      isAxiosError: true,
      response: { status: 500 },
    });
    vi.spyOn(axios, "isAxiosError").mockReturnValue(true);
    mockGet.mockRejectedValue(err);

    await expect(fetchCurrentUser()).rejects.toThrow("Server Error");
  });
});

// ---------------------------------------------------------------------------
// loginWithEmail — calls ensureCsrfCookie first
// ---------------------------------------------------------------------------

describe("loginWithEmail", () => {
  it("fetches CSRF cookie then POSTs credentials", async () => {
    mockGet.mockResolvedValue({});
    mockPost.mockResolvedValue({
      data: {
        id: 1,
        email: "user@example.com",
        first_name: "",
        last_name: "",
        is_staff: false,
        openid_subject: "",
        profile_image_url: "",
      },
    });

    const user = await loginWithEmail("user@example.com", "secret");

    expect(mockGet).toHaveBeenCalledWith("auth/csrf/");
    expect(mockPost).toHaveBeenCalledWith("auth/login/", {
      email: "user@example.com",
      password: "secret",
    });
    expect(user.email).toBe("user@example.com");
  });
});

// ---------------------------------------------------------------------------
// logoutUser — calls ensureCsrfCookie first
// ---------------------------------------------------------------------------

describe("logoutUser", () => {
  it("fetches CSRF cookie then POSTs to logout", async () => {
    mockGet.mockResolvedValue({});
    mockPost.mockResolvedValue({});

    await logoutUser();

    expect(mockGet).toHaveBeenCalledWith("auth/csrf/");
    expect(mockPost).toHaveBeenCalledWith("auth/logout/", {});
  });
});

// ---------------------------------------------------------------------------
// Wire → domain mapping edge cases
// ---------------------------------------------------------------------------

describe("Wire → domain mapping", () => {
  it("handles null cloudinary_public_id in images", async () => {
    const wireWithNullId = {
      ...wirePieceDetail,
      current_state: {
        ...wirePieceState,
        images: [{ ...wireImage, cloudinary_public_id: null }],
      },
    };
    mockGet.mockResolvedValue({ data: wireWithNullId });

    const result = await fetchPiece("piece-1");
    expect(result.current_state.images[0].cloudinary_public_id).toBeNull();
  });

  it("handles missing additional_fields (defaults to {})", async () => {
    const wireNoFields = {
      ...wirePieceDetail,
      current_state: { ...wirePieceState, additional_fields: undefined },
    };
    mockGet.mockResolvedValue({ data: wireNoFields });

    const result = await fetchPiece("piece-1");
    expect(result.current_state.additional_fields).toEqual({});
  });

  it("maps previous_state and next_state through as-is", async () => {
    const wireWithNav = {
      ...wirePieceDetail,
      current_state: {
        ...wirePieceState,
        previous_state: "designed",
        next_state: "trimmed",
      },
    };
    mockGet.mockResolvedValue({ data: wireWithNav });

    const result = await fetchPiece("piece-1");
    expect(result.current_state.previous_state).toBe("designed");
    expect(result.current_state.next_state).toBe("trimmed");
  });
});

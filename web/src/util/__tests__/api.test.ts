import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearAccessToken } from "../authTokenStore";

const mockClient = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  request: vi.fn(),
  defaults: {} as Record<string, unknown>,
  interceptors: {
    request: {
      use: vi.fn(),
    },
    response: {
      use: vi.fn(),
    },
  },
};

const mockCreate = vi.fn(() => mockClient);
const mockIsAxiosError = vi.fn((error: unknown) => {
  return Boolean(
    typeof error === "object" &&
    error !== null &&
    "isAxiosError" in error &&
    error.isAxiosError,
  );
});

vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return {
    ...actual,
    AxiosHeaders: actual.AxiosHeaders,
    default: {
      ...actual.default,
      create: mockCreate,
      isAxiosError: mockIsAxiosError,
    },
  };
});

// fetchPieces talks to the GraphQL endpoint via graphqlRequest.
const mockGraphqlRequest = vi.fn();
vi.mock("../graphqlClient", () => ({
  graphqlClient: {},
  graphqlRequest: (...args: unknown[]) => mockGraphqlRequest(...args),
}));

async function loadApiModule(options?: { expoBaseUrl?: string }) {
  vi.resetModules();
  if (options?.expoBaseUrl === undefined) {
    delete process.env.EXPO_PUBLIC_API_BASE_URL;
  } else {
    process.env.EXPO_PUBLIC_API_BASE_URL = options.expoBaseUrl;
  }
  return import("../api");
}

const wireImage = {
  url: "https://example.com/img.jpg",
  caption: "a caption",
  created: "2024-01-01T00:00:00Z",
  cropped_url: "https://example.com/img__crop.jpg",
  image_id: "11111111-2222-3333-4444-555555555555",
  width: 800,
  height: 600,
};

const wirePieceState = {
  state: "designed",
  notes: "some notes",
  created: "2024-01-01T00:00:00Z",
  last_modified: "2024-01-02T00:00:00Z",
  images: [wireImage],
  previous_state: null,
  next_state: null,
  custom_fields: { clay_weight_lbs: 500 },
};

const wirePieceSummary = {
  id: "piece-1",
  name: "My Vase",
  created: "2024-01-01T00:00:00Z",
  last_modified: "2024-01-02T00:00:00Z",
  thumbnail: {
    url: "/thumbnails/vase.svg",
    crop: null,
  },
  photo_count: 2,
  current_state: { state: "designed" },
  current_location: "Studio",
  tags: [{ id: "t1", name: "functional", color: "#aabbcc", is_public: true }],
};

const wirePieceDetail = {
  ...wirePieceSummary,
  current_state: wirePieceState,
  history: [wirePieceState],
};

beforeEach(() => {
  vi.clearAllMocks();
  clearAccessToken();
  mockClient.get.mockReset();
  mockClient.post.mockReset();
  mockClient.patch.mockReset();
  mockClient.delete.mockReset();
  mockClient.request.mockReset();
  mockClient.interceptors.request.use.mockReset();
  mockClient.interceptors.response.use.mockReset();
  mockGraphqlRequest.mockReset();
  mockClient.defaults = {};
  delete process.env.EXPO_PUBLIC_API_BASE_URL;
  vi.unstubAllGlobals();
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_API_BASE_URL;
  vi.unstubAllGlobals();
});

describe("client setup", () => {
  it("creates the API client with default browser settings", async () => {
    await loadApiModule();

    expect(mockCreate).toHaveBeenCalledWith({ baseURL: "/api/" });
    expect(mockClient.defaults).toMatchObject({
      withCredentials: true,
      xsrfCookieName: "potterdoc_csrftoken",
      xsrfHeaderName: "X-CSRFToken",
    });
  });

  it("overrides the base URL when Expo env config is present", async () => {
    await loadApiModule({ expoBaseUrl: "https://api.example.com" });

    expect(mockClient.defaults.baseURL).toBe("https://api.example.com");
  });
});

describe("auth token wiring", () => {
  it("attaches the access token to outgoing requests", async () => {
    await loadApiModule();
    const { setAccessToken: setLoadedAccessToken } = await import(
      "../authTokenStore"
    );
    setLoadedAccessToken("test-access-token");

    const requestUse = mockClient.interceptors.request.use.mock.calls[0]?.[0];
    expect(requestUse).toBeInstanceOf(Function);

    const result = requestUse?.({
      headers: { "X-Request-ID": "abc123" },
    });

    expect(result).toMatchObject({
      headers: {
        "X-Request-ID": "abc123",
        Authorization: "Bearer test-access-token",
      },
    });
  });

  it("refreshes a 401 once and retries the original request", async () => {
    const { ensureCsrfCookie } = await loadApiModule();
    const responseUse = mockClient.interceptors.response.use.mock.calls[0]?.[1];
    expect(responseUse).toBeInstanceOf(Function);

    mockClient.get.mockResolvedValueOnce({ data: undefined });
    mockClient.post.mockResolvedValueOnce({
      data: { accessToken: "fresh-access-token" },
    });
    mockClient.request.mockResolvedValueOnce({ data: "retried" });

    const retryConfig = {
      url: "pieces/piece-1/",
      headers: { "X-Request-ID": "abc123" },
    };
    const error = {
      isAxiosError: true,
      response: { status: 401 },
      config: retryConfig,
    };

    const result = await responseUse?.(error);

    expect(ensureCsrfCookie).toBeDefined();
    expect(mockClient.get).toHaveBeenCalledWith("auth/csrf/");
    expect(mockClient.post).toHaveBeenCalledWith("auth/token/refresh/", {});
    const retriedConfig = mockClient.request.mock.calls[0]?.[0];
    expect(retriedConfig).toMatchObject({
      url: "pieces/piece-1/",
      _retry: true,
    });
    expect(retriedConfig.headers.get("Authorization")).toBe(
      "Bearer fresh-access-token",
    );
    expect(retriedConfig.headers.get("X-Request-ID")).toBe("abc123");
    expect(result).toEqual({ data: "retried" });
  });
});

describe("piece endpoints", () => {
  it("fetchPieces maps GraphQL wire data to PieceSummary values", async () => {
    const { fetchPieces } = await loadApiModule();
    mockGraphqlRequest.mockResolvedValue({
      pieces: { count: 1, results: [wirePieceSummary] },
    });

    const result = await fetchPieces();

    expect(result.count).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].created).toBeInstanceOf(Date);
    expect(result.results[0].last_modified).toBeInstanceOf(Date);
    expect(result.results[0].photo_count).toBe(2);
    expect(result.results[0].thumbnail?.crop).toBeNull();
    expect(result.results[0].current_state.state).toBe("designed");
    expect(result.results[0].tags[0]).toMatchObject({
      name: "functional",
      color: "#aabbcc",
      is_public: true,
    });
  });

  it("fetchPieces maps ordering and pagination to GraphQL variables", async () => {
    const { fetchPieces } = await loadApiModule();
    mockGraphqlRequest.mockResolvedValue({ pieces: { count: 0, results: [] } });

    await fetchPieces({ ordering: "name", limit: 10, offset: 20 });

    const [, variables] = mockGraphqlRequest.mock.calls[0];
    expect(variables).toMatchObject({
      ordering: "NAME_ASC",
      limit: 10,
      offset: 20,
      filter: undefined,
    });
  });

  it("fetchPieces builds a GraphQL filter from state, shared, search, and tagIds", async () => {
    const { fetchPieces } = await loadApiModule();
    mockGraphqlRequest.mockResolvedValue({ pieces: { count: 0, results: [] } });

    await fetchPieces({
      state: ["completed"],
      shared: true,
      search: "vase",
      tagIds: ["t1", "t2"],
    });

    const [, variables] = mockGraphqlRequest.mock.calls[0];
    expect(variables.filter).toEqual({
      state: ["completed"],
      shared: true,
      search: "vase",
      tagIds: ["t1", "t2"],
    });
  });

  it("fetchPieces defaults missing tags to an empty array", async () => {
    const { fetchPieces } = await loadApiModule();
    mockGraphqlRequest.mockResolvedValue({
      pieces: { count: 1, results: [{ ...wirePieceSummary, tags: undefined }] },
    });

    const result = await fetchPieces();

    expect(result.results[0].tags).toEqual([]);
  });

  it("fetchPiece maps nested dates, images, and navigation fields", async () => {
    const { fetchPiece } = await loadApiModule();
    mockClient.get.mockResolvedValue({
      data: {
        ...wirePieceDetail,
        current_state: {
          ...wirePieceState,
          previous_state: "designed",
          next_state: "trimmed",
          images: [{ ...wireImage, cropped_url: null }],
          custom_fields: undefined,
        },
      },
    });

    const result = await fetchPiece("piece-1");

    expect(mockClient.get).toHaveBeenCalledWith("pieces/piece-1/");
    expect(result.current_state.images[0].created).toBeInstanceOf(Date);
    expect(result.current_state.images[0].cropped_url).toBeNull();
    expect(result.current_state.custom_fields).toEqual({});
    expect(result.current_state.previous_state).toBe("designed");
    expect(result.current_state.next_state).toBe("trimmed");
  });

  it("fetchPiece normalizes valid image crops and drops invalid crops", async () => {
    const { fetchPiece } = await loadApiModule();
    mockClient.get.mockResolvedValue({
      data: {
        ...wirePieceDetail,
        current_state: {
          ...wirePieceState,
          images: [
            {
              ...wireImage,
              crop: { x: -0.25, y: 0.5, width: 1.25, height: 0.75 },
            },
            {
              ...wireImage,
              crop: { x: 0, y: 0, width: 0, height: 1 },
            },
            {
              ...wireImage,
              crop: { x: 0, y: "bad", width: 1, height: 1 },
            },
          ],
        },
      },
    });

    const result = await fetchPiece("piece-1");

    expect(result.current_state.images[0].crop).toEqual({
      x: 0,
      y: 0.5,
      width: 1,
      height: 0.75,
    });
    expect(result.current_state.images[1].crop).toBeNull();
    expect(result.current_state.images[2].crop).toBeNull();
  });

  it("fetchPieces normalizes thumbnail crops from schema metadata", async () => {
    const { fetchPieces } = await loadApiModule();
    mockGraphqlRequest.mockResolvedValue({
      pieces: {
        count: 1,
        results: [
          {
            ...wirePieceSummary,
            thumbnail: {
              ...wirePieceSummary.thumbnail,
              crop: { x: -1, y: 0.25, width: 2, height: 0.5 },
            },
          },
        ],
      },
    });

    const result = await fetchPieces();

    expect(result.results[0].thumbnail?.crop).toEqual({
      x: 0,
      y: 0.25,
      width: 1,
      height: 0.5,
    });
  });

  it("createPiece posts the payload and maps the response", async () => {
    const { createPiece } = await loadApiModule();
    mockClient.post.mockResolvedValue({ data: wirePieceDetail });

    const result = await createPiece({ name: "My Vase" });

    expect(mockClient.post).toHaveBeenCalledWith("pieces/", {
      name: "My Vase",
    });
    expect(result.name).toBe("My Vase");
  });

  it("addPieceState posts to the state endpoint", async () => {
    const { addPieceState } = await loadApiModule();
    mockClient.post.mockResolvedValue({ data: wirePieceDetail });

    const result = await addPieceState("piece-1", {
      state: "wheel_thrown",
      notes: "threw it",
    });

    expect(mockClient.post).toHaveBeenCalledWith("pieces/piece-1/states/", {
      state: "wheel_thrown",
      notes: "threw it",
    });
    expect(result.id).toBe("piece-1");
  });

  it("updateCurrentState patches the current state endpoint", async () => {
    const { updateCurrentState } = await loadApiModule();
    mockClient.patch.mockResolvedValue({ data: wirePieceDetail });

    const result = await updateCurrentState("piece-1", {
      notes: "updated notes",
    });

    expect(mockClient.patch).toHaveBeenCalledWith("pieces/piece-1/state/", {
      notes: "updated notes",
    });
    expect(result.id).toBe("piece-1");
  });

  it("updatePastState patches the specific state endpoint", async () => {
    const { updatePastState } = await loadApiModule();
    mockClient.patch.mockResolvedValue({ data: wirePieceDetail });

    const result = await updatePastState("piece-1", "state-1", {
      notes: "retroactive notes",
    });

    expect(mockClient.patch).toHaveBeenCalledWith(
      "pieces/piece-1/states/state-1/",
      {
        notes: "retroactive notes",
      },
    );
    expect(result.id).toBe("piece-1");
  });

  it("updatePiece patches piece-level fields", async () => {
    const { updatePiece } = await loadApiModule();
    mockClient.patch.mockResolvedValue({ data: wirePieceDetail });

    await updatePiece("piece-1", { name: "New Name" });

    expect(mockClient.patch).toHaveBeenCalledWith("pieces/piece-1/", {
      name: "New Name",
    });
  });

  it("deletePieceState sends a delete request and returns the piece detail", async () => {
    const { deletePieceState } = await loadApiModule();
    mockClient.delete.mockResolvedValue({ data: wirePieceDetail });

    const result = await deletePieceState("piece-1", "state-1");

    expect(mockClient.delete).toHaveBeenCalledWith(
      "pieces/piece-1/states/state-1/",
    );
    expect(result.id).toBe("piece-1");
  });
});

describe("auth endpoints", () => {
  const authUser = {
    id: 1,
    is_staff: false,
    openid_subject:
      "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    alias: "",
    preferences: {
      process_summary_fields: [],
      summary_customize_popover: true,
      change_alias_prompt: true,
    },
  };

  it("ensureCsrfCookie fetches the CSRF endpoint", async () => {
    const { ensureCsrfCookie } = await loadApiModule();
    mockClient.get.mockResolvedValue({});

    await ensureCsrfCookie();

    expect(mockClient.get).toHaveBeenCalledWith("auth/csrf/");
  });

  it("loginWithGoogle fetches CSRF before posting the auth code", async () => {
    const { loginWithGoogle } = await loadApiModule();
    mockClient.get.mockResolvedValue({});
    mockClient.post.mockResolvedValue({ data: authUser });

    const user = await loginWithGoogle("auth-code-xyz", "https://example.com");

    expect(mockClient.get).toHaveBeenCalledWith("auth/csrf/");
    expect(mockClient.post).toHaveBeenCalledWith("auth/google/", {
      code: "auth-code-xyz",
      redirect_uri: "https://example.com",
      invite_code: undefined,
    });
    expect(user).toEqual(authUser);
  });

  it("loginWithGoogle forwards invite_code when provided", async () => {
    const { loginWithGoogle } = await loadApiModule();
    mockClient.get.mockResolvedValue({});
    mockClient.post.mockResolvedValue({ data: authUser });

    await loginWithGoogle(
      "auth-code-xyz",
      "https://example.com",
      "invite-uuid",
    );

    expect(mockClient.post).toHaveBeenCalledWith("auth/google/", {
      code: "auth-code-xyz",
      redirect_uri: "https://example.com",
      invite_code: "invite-uuid",
    });
  });

  it("getStaffInviteCode calls GET on the staff invite endpoint", async () => {
    const { getStaffInviteCode } = await loadApiModule();
    const response = { code: "abc-uuid", expires_at: "2026-08-01T00:00:00Z" };
    mockClient.get.mockResolvedValue({ data: response });

    await expect(getStaffInviteCode()).resolves.toEqual(response);
    expect(mockClient.get).toHaveBeenCalledWith("staff/invite-code/");
  });

  it("generateStaffInviteCode fetches CSRF then POSTs to generate a new code", async () => {
    const { generateStaffInviteCode } = await loadApiModule();
    const response = { code: "new-uuid", expires_at: "2026-08-01T00:00:00Z" };
    mockClient.get.mockResolvedValue({});
    mockClient.post.mockResolvedValue({ data: response });

    await expect(generateStaffInviteCode()).resolves.toEqual(response);
    expect(mockClient.get).toHaveBeenCalledWith("auth/csrf/");
    expect(mockClient.post).toHaveBeenCalledWith("staff/invite-code/", {});
  });

  it("generateInviteBatch fetches CSRF then POSTs the count", async () => {
    const { generateInviteBatch } = await loadApiModule();
    mockClient.get.mockResolvedValue({});
    mockClient.post.mockResolvedValue({ data: { created: 25 } });

    await expect(generateInviteBatch(25)).resolves.toEqual({ created: 25 });
    expect(mockClient.get).toHaveBeenCalledWith("auth/csrf/");
    expect(mockClient.post).toHaveBeenCalledWith("staff/invite-batch/", {
      count: 25,
    });
  });

  it("sendEmailInvite fetches CSRF then POSTs the email", async () => {
    const { sendEmailInvite } = await loadApiModule();
    mockClient.get.mockResolvedValue({});
    mockClient.post.mockResolvedValue({});

    await sendEmailInvite("recipient@example.com");

    expect(mockClient.get).toHaveBeenCalledWith("auth/csrf/");
    expect(mockClient.post).toHaveBeenCalledWith("auth/invite/send/", {
      email: "recipient@example.com",
    });
  });

  it("logoutUser fetches CSRF before posting to logout", async () => {
    const { logoutUser } = await loadApiModule();
    mockClient.get.mockResolvedValue({});
    mockClient.post.mockResolvedValue({});

    await logoutUser();

    expect(mockClient.get).toHaveBeenCalledWith("auth/csrf/");
    expect(mockClient.post).toHaveBeenCalledWith("auth/logout/", {});
  });

  it("fetchUserPreferences returns normalized preferences", async () => {
    const { fetchUserPreferences } = await loadApiModule();
    mockClient.get.mockResolvedValue({
      data: {
        alias: "",
        preferences: { process_summary_fields: ["piece.name", 123] },
      },
    });

    await expect(fetchUserPreferences()).resolves.toEqual({
      alias: "",
      preferences: {
        process_summary_fields: ["piece.name"],
      },
    });
    expect(mockClient.get).toHaveBeenCalledWith("auth/preferences/");
  });

  it("updateUserPreferences fetches CSRF before patching preferences", async () => {
    const { updateUserPreferences } = await loadApiModule();
    mockClient.get.mockResolvedValue({});
    mockClient.patch.mockResolvedValue({
      data: {
        alias: "",
        preferences: {
          process_summary_fields: ["piece.created"],
          summary_customize_popover: true,
          change_alias_prompt: true,
        },
      },
    });

    await expect(
      updateUserPreferences({
        process_summary_fields: ["piece.created"],
        summary_customize_popover: true,
        change_alias_prompt: true,
      }),
    ).resolves.toEqual({
      alias: "",
      preferences: {
        process_summary_fields: ["piece.created"],
        summary_customize_popover: true,
        change_alias_prompt: true,
      },
    });
    expect(mockClient.get).toHaveBeenCalledWith("auth/csrf/");
    expect(mockClient.patch).toHaveBeenCalledWith("auth/preferences/", {
      preferences: {
        process_summary_fields: ["piece.created"],
        summary_customize_popover: true,
        change_alias_prompt: true,
      },
    });
  });
});

describe("global entry endpoints", () => {
  it("fetchGlobalEntries maps snake_case fields to camelCase", async () => {
    const { fetchGlobalEntries } = await loadApiModule();
    mockClient.get.mockResolvedValue({
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

    expect(mockClient.get).toHaveBeenCalledWith("globals/glaze_type/");
    expect(result).toEqual([
      {
        id: "g1",
        name: "Cone 6",
        isPublic: true,
        isFavorite: false,
        color: "#ff0000",
      },
    ]);
  });

  it("fetchGlobalEntries omits optional fields that are absent", async () => {
    const { fetchGlobalEntries } = await loadApiModule();
    mockClient.get.mockResolvedValue({
      data: [{ id: "g2", name: "Studio B", is_public: false }],
    });

    const [entry] = await fetchGlobalEntries("location");

    expect(entry).toEqual({
      id: "g2",
      name: "Studio B",
      isPublic: false,
    });
  });

  it("fetchGlobalEntriesWithFilters forwards query params unchanged", async () => {
    const { fetchGlobalEntriesWithFilters } = await loadApiModule();
    mockClient.get.mockResolvedValue({
      data: [{ id: "g1", name: "Cone 6", is_favorite: true }],
    });

    const result = await fetchGlobalEntriesWithFilters("glaze_type", {
      search: "cone",
    });

    expect(mockClient.get).toHaveBeenCalledWith("globals/glaze_type/", {
      params: { search: "cone" },
    });
    expect(result[0].is_favorite).toBe(true);
  });

  it("toggleGlobalEntryFavorite posts when favorite is true", async () => {
    const { toggleGlobalEntryFavorite } = await loadApiModule();
    mockClient.post.mockResolvedValue({});

    await toggleGlobalEntryFavorite("glaze_combination", "gc-1", true);

    expect(mockClient.post).toHaveBeenCalledWith(
      "globals/glaze_combination/gc-1/favorite/",
    );
    expect(mockClient.delete).not.toHaveBeenCalled();
  });

  it("toggleGlobalEntryFavorite deletes when favorite is false", async () => {
    const { toggleGlobalEntryFavorite } = await loadApiModule();
    mockClient.delete.mockResolvedValue({});

    await toggleGlobalEntryFavorite("glaze_combination", "gc-1", false);

    expect(mockClient.delete).toHaveBeenCalledWith(
      "globals/glaze_combination/gc-1/favorite/",
    );
    expect(mockClient.post).not.toHaveBeenCalled();
  });

  it("createGlobalEntry posts the payload and defaults isPublic to false", async () => {
    const { createGlobalEntry } = await loadApiModule();
    mockClient.post.mockResolvedValue({
      data: { id: "loc-1", name: "Studio B" },
    });

    const result = await createGlobalEntry("location", {
      field: "name",
      value: "Studio B",
    });

    expect(mockClient.post).toHaveBeenCalledWith("globals/location/", {
      field: "name",
      value: "Studio B",
    });
    expect(result).toEqual({
      id: "loc-1",
      name: "Studio B",
      isPublic: false,
    });
  });

  it("createTagEntry wraps tag fields in the values payload", async () => {
    const { createTagEntry } = await loadApiModule();
    mockClient.post.mockResolvedValue({
      data: {
        id: "tag-1",
        name: "favorite",
        color: "#112233",
        is_public: false,
      },
    });

    const result = await createTagEntry({
      name: "favorite",
      color: "#112233",
    });

    expect(mockClient.post).toHaveBeenCalledWith("globals/tag/", {
      values: { name: "favorite", color: "#112233" },
    });
    expect(result.name).toBe("favorite");
  });
});

describe("glaze analysis endpoints", () => {
  it("fetchGlazeCombinationImages maps nested piece images", async () => {
    const { fetchGlazeCombinationImages } = await loadApiModule();
    mockClient.get.mockResolvedValue({
      data: [
        {
          glaze_combination: { id: "gc-1", name: "Tenmoku / Clear" },
          pieces: [
            {
              id: "piece-1",
              name: "Mug",
              state: "fired",
              images: [wireImage],
            },
          ],
        },
      ],
    });

    const result = await fetchGlazeCombinationImages();

    expect(mockClient.get).toHaveBeenCalledWith(
      "analysis/glaze-combination-images/",
    );
    expect(result[0].pieces[0].state).toBe("fired");
    expect(result[0].pieces[0].images[0].created).toBeInstanceOf(Date);
  });
});

describe("upload endpoints", () => {
  it("fetchR2PresignedUrl posts the content type with the default image resource type", async () => {
    const { fetchR2PresignedUrl } = await loadApiModule();
    const presigned = {
      upload_url: "https://r2.example.com/bucket/key?signature=abc",
      key: "images/key.jpg",
      public_url: "https://cdn.example.com/images/key.jpg",
      expires_in: 600,
    };
    mockClient.post.mockResolvedValue({ data: presigned });

    await expect(fetchR2PresignedUrl("image/jpeg")).resolves.toEqual(
      presigned,
    );
    expect(mockClient.post).toHaveBeenCalledWith("uploads/r2/presigned-url/", {
      content_type: "image/jpeg",
      resource_type: "image",
    });
  });

  it("fetchR2PresignedUrl forwards an explicit resource type", async () => {
    const { fetchR2PresignedUrl } = await loadApiModule();
    mockClient.post.mockResolvedValue({
      data: {
        upload_url: "https://r2.example.com/bucket/key?signature=abc",
        key: "videos/key.mp4",
        public_url: "https://cdn.example.com/videos/key.mp4",
        expires_in: 600,
      },
    });

    await fetchR2PresignedUrl("video/mp4", "video");

    expect(mockClient.post).toHaveBeenCalledWith("uploads/r2/presigned-url/", {
      content_type: "video/mp4",
      resource_type: "video",
    });
  });

  it("importManualSquareCropRecords posts JSON with r2_key per record", async () => {
    const { importManualSquareCropRecords } = await loadApiModule();
    mockClient.post.mockResolvedValue({
      data: {
        results: [],
        summary: {
          created_glaze_types: 0,
          created_glaze_combinations: 0,
          skipped_duplicates: 0,
          errors: 0,
        },
      },
    });

    const records = [
      {
        client_id: "one",
        filename: "crop.jpg",
        reviewed: true,
        r2_key: "images/user1/abc.webp",
        parsed_fields: {
          name: "Tenmoku",
          kind: "glaze_type" as const,
          first_glaze: "Tenmoku",
          second_glaze: "",
          runs: true,
          is_food_safe: false,
        },
      },
    ];

    await importManualSquareCropRecords(records);

    const [path, body] = mockClient.post.mock.calls[0] as [string, unknown];
    expect(path).toBe("admin/manual-square-crop-import/");
    expect(body).toEqual({ records });
  });
});

describe("extractErrorMessage", () => {
  it("returns the raw string if response data is a string", async () => {
    const { extractErrorMessage } = await loadApiModule();
    const error = {
      isAxiosError: true,
      response: { data: "Bad Request" },
    };
    mockIsAxiosError.mockReturnValue(true);

    expect(extractErrorMessage(error)).toBe("Bad Request");
  });

  it("returns the first non_field_errors if present", async () => {
    const { extractErrorMessage } = await loadApiModule();
    const error = {
      isAxiosError: true,
      response: {
        data: { non_field_errors: ["Invalid state transition"] },
      },
    };
    mockIsAxiosError.mockReturnValue(true);

    expect(extractErrorMessage(error)).toBe("Invalid state transition");
  });

  it("returns the first field error if non_field_errors is absent", async () => {
    const { extractErrorMessage } = await loadApiModule();
    const error = {
      isAxiosError: true,
      response: {
        data: { name: ["This field is required."] },
      },
    };
    mockIsAxiosError.mockReturnValue(true);

    expect(extractErrorMessage(error)).toBe("This field is required.");
  });

  it("returns the Error message for generic Error objects", async () => {
    const { extractErrorMessage } = await loadApiModule();
    const error = new Error("Network failure");
    mockIsAxiosError.mockReturnValue(false);

    expect(extractErrorMessage(error)).toBe("Network failure");
  });

  it("returns the default message for unknown error types", async () => {
    const { extractErrorMessage } = await loadApiModule();
    mockIsAxiosError.mockReturnValue(false);

    expect(extractErrorMessage({}, "Something went wrong")).toBe(
      "Something went wrong",
    );
  });
});

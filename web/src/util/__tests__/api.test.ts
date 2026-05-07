import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockClient = {
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
  delete: vi.fn(),
  defaults: {} as Record<string, unknown>,
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

vi.mock("axios", () => ({
  default: {
    create: mockCreate,
    isAxiosError: mockIsAxiosError,
  },
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
  cloudinary_public_id: "pub123",
  cloud_name: "demo-cloud",
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
  thumbnail: "/thumbnails/vase.svg",
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
  mockClient.get.mockReset();
  mockClient.post.mockReset();
  mockClient.patch.mockReset();
  mockClient.delete.mockReset();
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
      xsrfCookieName: "csrftoken",
      xsrfHeaderName: "X-CSRFToken",
    });
  });

  it("overrides the base URL when Expo env config is present", async () => {
    await loadApiModule({ expoBaseUrl: "https://api.example.com" });

    expect(mockClient.defaults.baseURL).toBe("https://api.example.com");
  });
});

describe("piece endpoints", () => {
  it("fetchPieces maps wire data to PieceSummary values", async () => {
    const { fetchPieces } = await loadApiModule();
    mockClient.get.mockResolvedValue({ data: { count: 1, results: [wirePieceSummary] } });

    const result = await fetchPieces();

    expect(mockClient.get).toHaveBeenCalledWith("pieces/", { params: undefined });
    expect(result.count).toBe(1);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].created).toBeInstanceOf(Date);
    expect(result.results[0].last_modified).toBeInstanceOf(Date);
    expect(result.results[0].current_state.state).toBe("designed");
    expect(result.results[0].tags[0]).toMatchObject({
      name: "functional",
      color: "#aabbcc",
      is_public: true,
    });
  });

  it("fetchPieces passes ordering and pagination params", async () => {
    const { fetchPieces } = await loadApiModule();
    mockClient.get.mockResolvedValue({ data: { count: 0, results: [] } });

    await fetchPieces({ ordering: "name", limit: 10, offset: 20 });

    expect(mockClient.get).toHaveBeenCalledWith("pieces/", {
      params: { ordering: "name", limit: 10, offset: 20 },
    });
  });

  it("fetchPieces defaults missing tags to an empty array", async () => {
    const { fetchPieces } = await loadApiModule();
    mockClient.get.mockResolvedValue({
      data: { count: 1, results: [{ ...wirePieceSummary, tags: undefined }] },
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
          images: [{ ...wireImage, cloudinary_public_id: null }],
          custom_fields: undefined,
        },
      },
    });

    const result = await fetchPiece("piece-1");

    expect(mockClient.get).toHaveBeenCalledWith("pieces/piece-1/");
    expect(result.current_state.created).toBeInstanceOf(Date);
    expect(result.current_state.images[0].created).toBeInstanceOf(Date);
    expect(result.current_state.images[0].cloudinary_public_id).toBeNull();
    expect(result.current_state.custom_fields).toEqual({});
    expect(result.current_state.previous_state).toBe("designed");
    expect(result.current_state.next_state).toBe("trimmed");
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

  it("updatePiece patches piece-level fields", async () => {
    const { updatePiece } = await loadApiModule();
    mockClient.patch.mockResolvedValue({ data: wirePieceDetail });

    await updatePiece("piece-1", { name: "New Name" });

    expect(mockClient.patch).toHaveBeenCalledWith("pieces/piece-1/", {
      name: "New Name",
    });
  });
});

describe("auth endpoints", () => {
  const authUser = {
    id: 1,
    email: "user@example.com",
    first_name: "Jane",
    last_name: "Doe",
    is_staff: false,
    openid_subject: "",
    profile_image_url: "",
  };

  it("ensureCsrfCookie fetches the CSRF endpoint", async () => {
    const { ensureCsrfCookie } = await loadApiModule();
    mockClient.get.mockResolvedValue({});

    await ensureCsrfCookie();

    expect(mockClient.get).toHaveBeenCalledWith("auth/csrf/");
  });

  it("loginWithEmail fetches CSRF before posting credentials", async () => {
    const { loginWithEmail } = await loadApiModule();
    mockClient.get.mockResolvedValue({});
    mockClient.post.mockResolvedValue({ data: authUser });

    const user = await loginWithEmail("user@example.com", "secret");

    expect(mockClient.get).toHaveBeenCalledWith("auth/csrf/");
    expect(mockClient.post).toHaveBeenCalledWith("auth/login/", {
      email: "user@example.com",
      password: "secret",
    });
    expect(user.email).toBe("user@example.com");
  });

  it("registerWithEmail fetches CSRF before posting the payload", async () => {
    const { registerWithEmail } = await loadApiModule();
    mockClient.get.mockResolvedValue({});
    mockClient.post.mockResolvedValue({ data: authUser });

    const user = await registerWithEmail({
      email: "user@example.com",
      password: "secret",
      first_name: "Jane",
    });

    expect(mockClient.get).toHaveBeenCalledWith("auth/csrf/");
    expect(mockClient.post).toHaveBeenCalledWith("auth/register/", {
      email: "user@example.com",
      password: "secret",
      first_name: "Jane",
    });
    expect(user).toEqual(authUser);
  });

  it("fetchCurrentUser returns the user on success", async () => {
    const { fetchCurrentUser } = await loadApiModule();
    mockClient.get.mockResolvedValue({ data: authUser });

    await expect(fetchCurrentUser()).resolves.toEqual(authUser);
  });

  it("fetchCurrentUser returns null on 401 and 403 responses", async () => {
    const { fetchCurrentUser } = await loadApiModule();

    mockClient.get.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 401 },
    });
    await expect(fetchCurrentUser()).resolves.toBeNull();

    mockClient.get.mockRejectedValueOnce({
      isAxiosError: true,
      response: { status: 403 },
    });
    await expect(fetchCurrentUser()).resolves.toBeNull();
  });

  it("fetchCurrentUser rethrows non-auth failures", async () => {
    const { fetchCurrentUser } = await loadApiModule();
    const error = { isAxiosError: true, response: { status: 500 } };
    mockClient.get.mockRejectedValue(error);

    await expect(fetchCurrentUser()).rejects.toBe(error);
  });

  it("fetchCurrentUser rethrows non-Axios errors", async () => {
    const { fetchCurrentUser } = await loadApiModule();
    const error = new Error("boom");
    mockClient.get.mockRejectedValue(error);

    await expect(fetchCurrentUser()).rejects.toThrow("boom");
  });

  it("loginWithGoogle fetches CSRF before posting the credential", async () => {
    const { loginWithGoogle } = await loadApiModule();
    mockClient.get.mockResolvedValue({});
    mockClient.post.mockResolvedValue({ data: authUser });

    const user = await loginWithGoogle("google-token");

    expect(mockClient.get).toHaveBeenCalledWith("auth/csrf/");
    expect(mockClient.post).toHaveBeenCalledWith("auth/google/", {
      credential: "google-token",
    });
    expect(user).toEqual(authUser);
  });

  it("logoutUser fetches CSRF before posting to logout", async () => {
    const { logoutUser } = await loadApiModule();
    mockClient.get.mockResolvedValue({});
    mockClient.post.mockResolvedValue({});

    await logoutUser();

    expect(mockClient.get).toHaveBeenCalledWith("auth/csrf/");
    expect(mockClient.post).toHaveBeenCalledWith("auth/logout/", {});
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
  it("fetchGlazeCombinations omits params when no filters are provided", async () => {
    const { fetchGlazeCombinations } = await loadApiModule();
    mockClient.get.mockResolvedValue({ data: [] });

    await fetchGlazeCombinations();

    expect(mockClient.get).toHaveBeenCalledWith("globals/glaze_combination/", {
      params: {},
    });
  });

  it("fetchGlazeCombinations encodes filter values into query params", async () => {
    const { fetchGlazeCombinations } = await loadApiModule();
    mockClient.get.mockResolvedValue({ data: [] });

    await fetchGlazeCombinations({
      glazeTypeIds: ["a", "b"],
      isFoodSafe: true,
      runs: false,
      highlightsGrooves: true,
      isDifferentOnWhiteAndBrownClay: false,
      firingTemperatureId: "cone-6",
    });

    expect(mockClient.get).toHaveBeenCalledWith("globals/glaze_combination/", {
      params: {
        glaze_type_ids: "a,b",
        is_food_safe: "true",
        runs: "false",
        highlights_grooves: "true",
        is_different_on_white_and_brown_clay: "false",
        firing_temperature_id: "cone-6",
      },
    });
  });

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
  it("fetchCloudinaryWidgetConfig returns the config unchanged", async () => {
    const { fetchCloudinaryWidgetConfig } = await loadApiModule();
    mockClient.get.mockResolvedValue({
      data: { cloud_name: "demo", api_key: "abc123", folder: "glaze" },
    });

    await expect(fetchCloudinaryWidgetConfig()).resolves.toEqual({
      cloud_name: "demo",
      api_key: "abc123",
      folder: "glaze",
    });
  });

  it("signCloudinaryWidgetParams posts wrapped params and returns the signature", async () => {
    const { signCloudinaryWidgetParams } = await loadApiModule();
    mockClient.post.mockResolvedValue({ data: { signature: "signed-value" } });

    const signature = await signCloudinaryWidgetParams({
      folder: "glaze",
      timestamp: 123,
    });

    expect(mockClient.post).toHaveBeenCalledWith(
      "uploads/cloudinary/widget-signature/",
      {
        params_to_sign: { folder: "glaze", timestamp: 123 },
      },
    );
    expect(signature).toBe("signed-value");
  });

  it("parseCloudinaryAutoCrop normalizes pixel getinfo coordinates", async () => {
    const { parseCloudinaryAutoCrop } = await loadApiModule();

    expect(
      parseCloudinaryAutoCrop({
        input: { width: 1000, height: 800 },
        g_auto_info: { x: 100, y: 80, width: 500, height: 400 },
      }),
    ).toEqual({ x: 0.1, y: 0.1, width: 0.5, height: 0.5 });
  });

  it("parseCloudinaryAutoCrop handles nested w/h crops and invalid payloads", async () => {
    const { parseCloudinaryAutoCrop } = await loadApiModule();

    expect(
      parseCloudinaryAutoCrop({
        nested: [{ ignored: true }, { x: 0.2, y: 0.3, w: 0.4, h: 0.5 }],
      }),
    ).toEqual({ x: 0.2, y: 0.3, width: 0.4, height: 0.5 });
    expect(parseCloudinaryAutoCrop({ input: { width: 100, height: 100 } })).toBeNull();
    expect(
      parseCloudinaryAutoCrop({
        crop: { x: "bad", y: 0, width: 1, height: 1 },
      }),
    ).toBeNull();
  });

  it("importManualSquareCropRecords posts multipart data with payload and matching files", async () => {
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

    const file = new File(["image"], "crop.jpg", { type: "image/jpeg" });
    const records = [
      {
        client_id: "one",
        filename: "crop.jpg",
        reviewed: true,
        parsed_fields: {
          name: "Tenmoku",
          kind: "glaze_type" as const,
          first_glaze: "Tenmoku",
          second_glaze: "",
          runs: true,
          is_food_safe: false,
        },
      },
      {
        client_id: "two",
        filename: "skip.jpg",
        reviewed: false,
        parsed_fields: {
          name: "Clear / Iron",
          kind: "glaze_combination" as const,
          first_glaze: "Clear",
          second_glaze: "Iron",
          runs: null,
          is_food_safe: null,
        },
      },
    ];

    await importManualSquareCropRecords(records, { one: file });

    const [path, form] = mockClient.post.mock.calls[0] as [string, FormData];
    expect(path).toBe("admin/manual-square-crop-import/");
    expect(form).toBeInstanceOf(FormData);
    expect(form.get("payload")).toBe(JSON.stringify({ records }));
    const uploadedFile = form.get("crop_image__one");
    expect(uploadedFile).toBeInstanceOf(File);
    expect((uploadedFile as File).name).toBe(file.name);
    expect(form.get("crop_image__two")).toBeNull();
  });

  it("scanCloudinaryCleanupAssets returns the admin cleanup payload", async () => {
    const { scanCloudinaryCleanupAssets } = await loadApiModule();
    const payload = {
      assets: [
        {
          public_id: "piece/orphan",
          url: "https://example.com/orphan.jpg",
          bytes: 2048,
          created_at: "2026-05-06T12:00:00Z",

        },
      ],
      summary: { total: 1, referenced: 0, unused: 1 },
    };
    mockClient.get.mockResolvedValue({ data: payload });

    await expect(scanCloudinaryCleanupAssets()).resolves.toEqual(payload);
    expect(mockClient.get).toHaveBeenCalledWith("admin/cloudinary-cleanup/");
  });

  it("deleteCloudinaryCleanupAssets sends public ids in the delete body", async () => {
    const { deleteCloudinaryCleanupAssets } = await loadApiModule();
    mockClient.delete.mockResolvedValue({
      data: { deleted: { "piece/orphan": "deleted" } },
    });

    await expect(
      deleteCloudinaryCleanupAssets(["piece/orphan"]),
    ).resolves.toEqual({ "piece/orphan": "deleted" });
    expect(mockClient.delete).toHaveBeenCalledWith(
      "admin/cloudinary-cleanup/",
      {
        data: { public_ids: ["piece/orphan"] },
      },
    );
  });
});

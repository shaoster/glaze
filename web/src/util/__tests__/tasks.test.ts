import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";
import { submitTask, fetchTask, pollTask } from "../api";
import { AsyncTask } from "../types";

vi.mock("axios");
const mockedAxios = vi.mocked(axios);

describe("Async Task API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("submitTask sends correct payload", async () => {
    const mockTask: Partial<AsyncTask> = { id: "123", status: "pending" };
    mockedAxios.post.mockResolvedValueOnce({ data: mockTask });

    const result = await submitTask("test-task", { foo: "bar" });
    expect(mockedAxios.post).toHaveBeenCalledWith("/api/tasks/", {
      task_type: "test-task",
      input_params: { foo: "bar" },
    });
    expect(result).toEqual(mockTask);
  });

  it("fetchTask calls correct endpoint", async () => {
    const mockTask: Partial<AsyncTask> = { id: "123", status: "running" };
    mockedAxios.get.mockResolvedValueOnce({ data: mockTask });

    const result = await fetchTask("123");
    expect(mockedAxios.get).toHaveBeenCalledWith("/api/tasks/123/");
    expect(result).toEqual(mockTask);
  });

  it("pollTask succeeds when status becomes success", async () => {
    const pendingTask: Partial<AsyncTask> = { id: "123", status: "pending" };
    const successTask: Partial<AsyncTask> = { id: "123", status: "success", result: "done" };

    mockedAxios.get
      .mockResolvedValueOnce({ data: pendingTask })
      .mockResolvedValueOnce({ data: successTask });

    // Speed up the test by reducing delay
    const result = await pollTask("123", { initialDelayMs: 1 });
    
    expect(mockedAxios.get).toHaveBeenCalledTimes(2);
    expect(result.status).toBe("success");
    expect(result.result).toBe("done");
  });

  it("pollTask fails when maxRetries exceeded", async () => {
    const pendingTask: Partial<AsyncTask> = { id: "123", status: "pending" };
    mockedAxios.get.mockResolvedValue({ data: pendingTask });

    await expect(pollTask("123", { maxRetries: 2, initialDelayMs: 1 })).rejects.toThrow(
      "Task 123 timed out"
    );
  });
});

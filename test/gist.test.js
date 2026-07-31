import { describe, it, expect, vi } from "vitest";

const gistModule = globalThis.MTT.gist;

function fakeStorage(seed) {
  const values = new Map(Object.entries(seed || {}));
  return {
    getItem: (key) => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: (key) => values.delete(key),
    snapshot: () => Object.fromEntries(values),
  };
}

function response(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => typeof body === "string" ? body : JSON.stringify(body),
  };
}

describe("GitHub Gist sync credentials", () => {
  it("keeps one-time connection and automatic return visits functional", async () => {
    const storage = fakeStorage();
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ login: "learner" }))
      .mockResolvedValueOnce(response([{ id: "gist-7", description: "music-theory-trainer-progress" }]));
    const gist = gistModule.create({ storage, fetch });

    const connected = await gist.connect("ghp_example_secret");

    expect(connected).toEqual({ username: "learner", gistId: "gist-7" });
    expect(gist.getStatus()).toEqual({ connected: true, gistId: "gist-7", credentialStorage: "device" });
    expect(storage.snapshot()).toEqual({
      "mtt.gh.token": "ghp_example_secret",
      "mtt.gh.gistId": "gist-7",
    });
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer ghp_example_secret");
  });

  it("retains nothing when account or Gist validation fails", async () => {
    const storage = fakeStorage();
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ login: "learner" }))
      .mockResolvedValueOnce(response({ message: "Service unavailable" }, 503));
    const gist = gistModule.create({ storage, fetch });

    await expect(gist.connect("ghp_example_secret")).rejects.toThrow("Service unavailable");
    expect(gist.isConnected()).toBe(false);
    expect(storage.snapshot()).toEqual({});
  });

  it("reports blocked browser storage instead of claiming to be connected", async () => {
    const storage = {
      getItem: () => null,
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => {},
    };
    const fetch = vi.fn()
      .mockResolvedValueOnce(response({ login: "learner" }))
      .mockResolvedValueOnce(response([]));
    const gist = gistModule.create({ storage, fetch });

    await expect(gist.connect("ghp_example_secret")).rejects.toThrow("could not save");
    expect(gist.isConnected()).toBe(false);
  });

  it("disconnect removes both the credential and Gist identifier", () => {
    const storage = fakeStorage({
      "mtt.gh.token": "ghp_example_secret",
      "mtt.gh.gistId": "gist-7",
    });
    const gist = gistModule.create({ storage, fetch: vi.fn() });

    gist.disconnect();

    expect(gist.getStatus()).toEqual({ connected: false, gistId: null, credentialStorage: null });
    expect(storage.snapshot()).toEqual({});
  });

  it("redacts a credential if an upstream error reflects it", async () => {
    const storage = fakeStorage();
    const fetch = vi.fn().mockResolvedValue(response({ message: "Rejected ghp_example_secret" }, 403));
    const gist = gistModule.create({ storage, fetch });

    await expect(gist.connect("ghp_example_secret")).rejects.toThrow("Rejected [redacted]");
    expect(storage.snapshot()).toEqual({});
  });

  it("creates one private progress Gist and remembers its identifier", async () => {
    const storage = fakeStorage({ "mtt.gh.token": "ghp_example_secret" });
    const fetch = vi.fn().mockResolvedValue(response({ id: "gist-new" }));
    const gist = gistModule.create({ storage, fetch });

    await gist.push({ savedAt: 9, totalAnswered: 4 });

    const [, options] = fetch.mock.calls[0];
    const requestBody = JSON.parse(options.body);
    expect(options.method).toBe("POST");
    expect(requestBody.public).toBe(false);
    expect(JSON.parse(requestBody.files["progress.json"].content)).toEqual({ savedAt: 9, totalAnswered: 4 });
    expect(storage.snapshot()["mtt.gh.gistId"]).toBe("gist-new");
  });
});

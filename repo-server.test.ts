import { expect, it, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";

it("keeps list remote resolution local by default and sends only canonical repo identity after opt-in", async () => {
  const network = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(null, { status: 404 }));
  const h = createFakePluginHost({
    pluginId: "project-folders",
    agentSkillIds: ["project-folders"],
    experimental_hostEntry: true,
    experimental_callHostRpc: async () => ({
      remotes: [
        {
          path: "/private/local/path",
          url: "https://oauth2:credential@gitlab.com/acme/sub/repo.git",
        },
        { path: "/unrequested", url: "https://github.com/secret/unrequested" },
      ],
    }),
    sdk: {
      projects: {
        list: async () =>
          [
            {
              id: "p1",
              name: "Test",
              sources: [
                {
                  type: "local_path",
                  hostId: "h1",
                  path: "/private/local/path",
                  isDefault: true,
                },
              ],
            },
          ] as never,
      },
      hosts: {
        list: async () =>
          [{ id: "h1", name: "Device", status: "connected" }] as never,
      },
      environments: { list: async () => [] },
      files: {
        read: async () => {
          throw new Error("ENOENT");
        },
        write: async () => ({
          outcome: "written",
          sha256: "sha",
          sizeBytes: 1,
        }),
        mkdir: async () => ({}) as never,
      },
    },
  });
  try {
    await plugin(h.bb);
    const call = h.harness.behavior.callRpc;
    type List = {
      roots: {
        repoUrl: string | null;
        repoPrivate: boolean | null;
        githubUrl: string | null;
      }[];
    };
    let list: List;
    await vi.waitFor(async () => {
      list = (await call("list", null)) as List;
      expect(list.roots[0].repoUrl).toBe("https://gitlab.com/acme/sub/repo");
    });
    expect(list!.roots[0].githubUrl).toBeNull();
    expect(list!.roots[0].repoPrivate).toBeNull();
    expect(network).not.toHaveBeenCalled();
    const saved = (await call("prefs_get", null)) as {
      prefs: { projects: { checkRepoVisibility: boolean } };
    };
    saved.prefs.projects.checkRepoVisibility = true;
    await call("prefs_save", { prefs: saved.prefs });
    await vi.waitFor(async () => {
      list = (await call("list", null)) as List;
      expect(list.roots[0].repoPrivate).toBe(true);
    });
    expect(network).toHaveBeenCalledTimes(1);
    expect(network.mock.calls[0][0]).toBe(
      "https://gitlab.com/api/v4/projects/acme%2Fsub%2Frepo",
    );
    await call("list", null);
    expect(network).toHaveBeenCalledTimes(1);
    saved.prefs.projects.checkRepoVisibility = false;
    await call("prefs_save", { prefs: saved.prefs });
    expect(
      ((await call("list", null)) as List).roots[0].repoPrivate,
    ).toBeNull();
    expect(network).toHaveBeenCalledTimes(1);
    network.mockImplementation(
      async (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          init!.signal!.addEventListener(
            "abort",
            () => reject(new Error("cancelled")),
            { once: true },
          );
        }),
    );
    saved.prefs.projects.checkRepoVisibility = true;
    await call("prefs_save", { prefs: saved.prefs });
    await call("list", null);
    await vi.waitFor(() => expect(network).toHaveBeenCalledTimes(2));
    saved.prefs.projects.checkRepoVisibility = false;
    await call("prefs_save", { prefs: saved.prefs });
    expect(network.mock.calls[1][1]!.signal!.aborted).toBe(true);
  } finally {
    await h.harness.lifecycle.dispose();
    network.mockRestore();
  }
});

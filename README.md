# Maven grouped-update version bump reproduction

Fixture for [Renovate discussion #47338](https://github.com/renovatebot/renovate/discussions/47338). The POM follows the reporter's minimal example.

Updating three plugins while bumping `1.1.9-SNAPSHOT` to `1.1.10-SNAPSHOT` shifts the positions of the remaining dependency edits. The affected updater removes the `>` before both property values and returns invalid XML.

## Run

Use Node 24, Git, and a Renovate checkout with its dependencies installed using the repository's pinned pnpm version. Clone this fixture normally; its committed `main` branch is the input.

```sh
node reproduce.mjs /absolute/path/to/renovate broken
```

After applying the fix to that Renovate checkout:

```sh
node reproduce.mjs /absolute/path/to/renovate fixed
```

Each run creates a fresh local clone under ignored `runs/`, then calls Renovate's actual Maven extractor and branch update worker. Git reads, property resolution, dependency positions and edits are real. The runner supplies three fixed upgrade targets so it needs no registry or GitHub credentials. It does not run the full CLI lookup phase or create remote branches.

Results and the generated POM are saved in the run directory. The assertions require invalid XML before the fix and the exact expected POM after it, including the project bump and all three plugin updates. Input order follows the worker's descending-position convention.

The fix defers the project-version bump until dependency edits finish and makes a repeated Maven version bump a no-op. The `renovate.json` file also describes the corresponding ordinary Renovate configuration; current registry versions are not needed by the deterministic runner.

Verified on Windows with Node 24.22.1 against Renovate commit `a45ee254dc3a7d512f4467174fc9b5503bbf481a`: the unmodified updater produces invalid XML; the local patch produces valid XML matching all four expected version changes.

Prepared with Codex (GPT-6); the source code and runtime assertions are available for inspection. No claim of a hosted GitLab or Maven build run is made.

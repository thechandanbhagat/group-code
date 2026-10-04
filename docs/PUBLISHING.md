# Publishing Group Code

The **Publish extension** GitHub Actions workflow publishes one tested VSIX to the VS Code Marketplace, Open VSX, or both. It runs only when manually dispatched from `main`; ordinary pushes and CI runs do not publish.

## Set up the two credentials

Add these repository secrets under [Settings → Secrets and variables → Actions](https://github.com/thechandanbhagat/group-code/settings/secrets/actions). Do not commit tokens or paste them into chat or workflow inputs.

| Secret | Credential |
| --- | --- |
| `VSCE_PAT` | An Azure DevOps PAT with **Marketplace → Manage** scope and **All accessible organizations**, from an account authorized to publish as `thechandanbhagat`. See the [VS Code publishing instructions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token). |
| `OVSX_PAT` | An Open VSX access token from the account authorized for the `thechandanbhagat` namespace. Generate it under avatar → Settings → Access Tokens. See the [Open VSX publishing instructions](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions). |

The registries use independent credentials; a GitHub PAT cannot replace either token. The Open VSX account must have accepted its Eclipse Publisher Agreement. The extension's existing namespace is `thechandanbhagat`; do not create a different namespace.

VS Code's publishing documentation announces retirement of global Azure DevOps PATs on **December 1, 2026**. Plan to migrate the Marketplace job to [Microsoft Entra ID automated publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace) before that date.

## Test and publish a release

1. Commit and push the version change in `package.json`, `package-lock.json`, and `CHANGELOG.md` to `main`.
2. Open [Actions → Publish extension](https://github.com/thechandanbhagat/group-code/actions/workflows/publish.yml) and choose **Run workflow** on `main`.
3. Enter the exact version (currently `1.9.1`), choose `both`, and leave **dry_run** checked. No credentials are needed for this validation run.
4. After the dry run succeeds, run the workflow again with the same version and **dry_run** unchecked to publish. The real run repeats validation before uploading.

Each run checks the release identity and lockfile versions, runs unit regressions, verifies the VSIX, and tests the packaged extension in the minimum and current stable VS Code hosts. The selected publishing jobs also install their CLI tools and verify the downloaded VSIX's SHA-256 checksum, including during a dry run. The upload steps run only when `dry_run` is false. Publishing credentials are exposed only to their own upload step, not dependency installation, tests, or packaging.

The equivalent GitHub CLI commands are:

```sh
gh workflow run publish.yml --ref main -f version=1.9.1 -f registry=both -f dry_run=true
gh workflow run publish.yml --ref main -f version=1.9.1 -f registry=both -f dry_run=false
```

## If only one registry succeeds

Review the failed job, fix its credentials or registry issue, then choose **Re-run failed jobs** on that original run (or `gh run rerun RUN_ID --failed`). This retains the original source commit and tested artifact, so the registries receive identical bytes even if `main` has since changed. Do this within the artifact's 14-day retention period.

A fresh dispatch with `registry` set to just the failed registry is appropriate only if `main` is still at the original release commit. If the artifact has expired or release source has changed, recover the exact original VSIX before retrying, or release a new version to both registries. Do not republish the already successful registry. Duplicate versions deliberately fail rather than being silently skipped. Publishing to both registries is not atomic.

After publishing, verify the version on [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=thechandanbhagat.groupcode) and [Open VSX](https://open-vsx.org/extension/thechandanbhagat/groupcode). Successful CLI submission can precede registry indexing or validation; check the live listing as well.

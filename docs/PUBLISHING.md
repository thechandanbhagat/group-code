# Publishing Group Code

The **Publish extension** GitHub Actions workflow publishes one tested VSIX to the VS Code Marketplace and Open VSX when a stable version tag such as `v1.10.0` is pushed. Manual runs from `main` support dry runs and retrying one registry. Ordinary branch pushes and CI runs do not publish.

## Set up the two credentials

Add these repository secrets under [Settings → Secrets and variables → Actions](https://github.com/thechandanbhagat/group-code/settings/secrets/actions). Do not commit tokens or paste them into chat or workflow inputs.

| Secret | Credential |
| --- | --- |
| `VSCE_PAT` | An Azure DevOps PAT with **Marketplace → Manage** scope and **All accessible organizations**, from an account authorized to publish as `thechandanbhagat`. See the [VS Code publishing instructions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token). |
| `OVSX_PAT` | An Open VSX access token from the account authorized for the `thechandanbhagat` namespace. Generate it under avatar → Settings → Access Tokens. See the [Open VSX publishing instructions](https://github.com/eclipse-openvsx/openvsx/wiki/Publishing-Extensions). |

The registries use independent credentials; a GitHub PAT cannot replace either token. The Open VSX account must have accepted its Eclipse Publisher Agreement. The extension's existing namespace is `thechandanbhagat`; do not create a different namespace.

VS Code's publishing documentation announces retirement of global Azure DevOps PATs on **December 1, 2026**. Plan to migrate the Marketplace job to [Microsoft Entra ID automated publishing](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace) before that date.

## Test and publish a release

1. Update `package.json`, both root versions in `package-lock.json`, `CHANGELOG.md`, and the guide version badge.
2. Commit and push the release source to `main`, then wait for the CI matrix to pass.
3. Create an annotated tag matching the package version and push that tag. This starts a real publication to both registries:

```sh
git tag -a v1.10.0 -m "Group Code 1.10.0"
git push origin v1.10.0
```

The workflow requires tagged source to belong to `main` and the tag's version to match the manifest and lockfile. Tags for prereleases or mismatched versions fail before packaging. Each run checks the release identity, runs unit regressions, verifies the VSIX, and tests the packaged extension in the minimum and current stable VS Code hosts. Both registries receive the same artifact after SHA-256 verification. Publishing credentials are exposed only to their own upload step, not dependency installation, tests, or packaging.

For an optional validation run before tagging, open [Actions → Publish extension](https://github.com/thechandanbhagat/group-code/actions/workflows/publish.yml), choose **Run workflow** on `main`, enter the exact package version, select `both`, and keep **dry_run** checked. The CLI equivalent is:

```sh
gh workflow run publish.yml --ref main -f version=1.10.0 -f registry=both -f dry_run=true
```

Manual runs publish only when `dry_run=false`; tag runs always publish. Use one release path to avoid duplicate submissions.

## If only one registry succeeds

Review the failed job, fix its credentials or registry issue, then choose **Re-run failed jobs** on that original run (or `gh run rerun RUN_ID --failed`). This retains the original source commit and tested artifact, so the registries receive identical bytes even if `main` has since changed. Do this within the artifact's 14-day retention period.

A fresh dispatch with `registry` set to just the failed registry is appropriate only if `main` is still at the original release commit. If the artifact has expired or release source has changed, recover the exact original VSIX before retrying, or release a new version to both registries. Do not republish the already successful registry. Duplicate versions deliberately fail rather than being silently skipped. Publishing to both registries is not atomic.

After publishing, verify the version on [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=thechandanbhagat.groupcode) and [Open VSX](https://open-vsx.org/extension/thechandanbhagat/groupcode). Successful CLI submission can precede registry indexing or validation; check the live listing as well.

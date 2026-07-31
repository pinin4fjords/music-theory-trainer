# Security and data storage

Motif is a static browser application. It has no application server and no user
accounts. Practice progress is private to the browser unless the learner chooses
an additional save method on the **Your data** page.

## GitHub Gist sync

GitHub sync uses a classic Personal Access Token with the `gist` scope. It creates
or updates one private Gist named `music-theory-trainer-progress`.

The token is stored under `mtt.gh.token` in the site's `localStorage`. This is
intentional: it lets automatic sync continue after the browser is closed and
reopened. The Gist identifier is stored separately under `mtt.gh.gistId`. Neither
value is part of the progress state, manual backup files, or GitHub Gist content.

This design has an important trust boundary:

- Any JavaScript running on the same origin can read the token.
- The `gist` scope applies to every Gist in the connected GitHub account, not only
  the progress Gist.
- Browser extensions, another person using the same browser profile, or a
  compromised site deployment may gain the same access as the learner.

Disconnecting removes both the token and Gist identifier from this browser. It
does not revoke the token at GitHub. To remove access completely, delete the Motif
token at <https://github.com/settings/tokens> and then disconnect the device.

## Maintainer controls

- Do not add third-party scripts, analytics tags, or remote code to the Motif
  origin without reviewing their access to browser storage.
- Never include credentials in logs, errors, progress state, URLs, exports, test
  fixtures, or Gist content.
- Validate the GitHub account and Gist lookup before retaining a new token.
- Keep disconnect covered by tests that verify removal of both local values.
- Preserve newest-copy-wins behavior. A stale remote copy must not replace newer
  local progress.
- Treat any script injection vulnerability as a possible GitHub token exposure.

## Reporting a vulnerability

Do not open a public issue if a report contains a credential or a practical
exploit. Contact the repository owner privately through their GitHub profile and
revoke any affected token immediately.

# @toolpath/part-server

The part API, as an application-agnostic Hono app: the BYOK connection cookie,
part creation and upload URLs, the analysis event stream, and the mesh relay.

```ts
import { createPartApi } from '@toolpath/part-server'

const app = createPartApi({ appName: 'part-viewer' })
```

`appName` names the connection cookie and domain-separates the key it is sealed
with, so two applications on one origin cannot read each other's session even
though they share `APP_SESSION_SECRET`. Changing it invalidates that
application's existing sessions.

Nothing in here is a product decision. Uploading a part and following a job is
the same work whichever application is doing it; what an application does with
a finished report is what makes it that application, and that stays in the
application.

**The API key never leaves this package.** It is read from the encrypted cookie
per request, used to construct an SDK client, and never returned to a browser —
which is the whole reason a static application that wants parts has to grow a
server rather than calling the API directly.

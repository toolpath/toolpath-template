# @toolpath/domain

Pure helpers that more than one application in this workspace needs: unit
conversion and formatting, class composition, and keyboard movement through a
list of rows.

Nothing here may import an application, a framework router, or a Toolpath API
client. A helper that needs one of those belongs in the application that has
it, until a second application needs it too — at which point the thing to
extract is the pure part, not the coupling.

Every export is covered by a test in this package rather than in a consumer,
which is what makes an extraction from one application safe for the next.

# @toolpath/part-client

What a browser needs to talk to `@toolpath/part-server`: the typed fetches, one
error-message rule, and the two hooks every application repeats — connection
state, and the analysis event stream.

It knows the API's paths and nothing about a product. Anything that decides
where to navigate after an upload, or what to render while a job runs, belongs
in the application: `usePartUpload` stays in each application for exactly that
reason, since it ends in a route only that application knows.

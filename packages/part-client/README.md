# @toolpath/part-client

What a browser needs to talk to `@toolpath/part-server`: the typed fetches, one
error-message rule, the upload (create a file, PUT it, inspect it, make a part
of a body), and the hooks every application repeats — connection state, the
upload with its choice of body (`useFileUpload`), and the analysis event
stream.

It knows the API's paths and nothing about a product. Anything that decides
where to navigate after an upload, or what to render while a job runs, belongs
in the application: each application's `usePartUpload` is `useFileUpload`
with the one thing only it knows — where a started part goes.

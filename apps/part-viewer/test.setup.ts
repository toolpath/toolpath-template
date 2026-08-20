// The application requires its real session configuration in every runtime. Tests supply an
// explicit fixed value before importing the Hono application.
process.env.APP_SESSION_SECRET = 'part-viewer-test-session-secret'
process.env.TOOLPATH_API_BASE_URL = 'https://engine.test'

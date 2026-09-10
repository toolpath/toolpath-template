// This package requires its real session configuration in every runtime. Tests
// supply explicit fixed values before the API is constructed.
process.env.APP_SESSION_SECRET = 'part-server-test-session-secret'
process.env.TOOLPATH_API_BASE_URL = 'https://engine.test'

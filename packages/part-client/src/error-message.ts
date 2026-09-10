import { AppApiError } from './api.js'

export const errorMessage = (error: unknown): string =>
  error instanceof AppApiError ? error.message : 'Could not complete that request. Try again.'

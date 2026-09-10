import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  uploadPart: vi.fn(),
}))

vi.mock('react-router', () => ({
  useNavigate: () => mocks.navigate,
}))

vi.mock('@toolpath/part-client', () => ({
  errorMessage: (reason: unknown) => String(reason),
  uploadPart: mocks.uploadPart,
}))

const { usePartUpload } = await import('./use-part-upload')

describe('part upload routing', () => {
  it('hands a replacement job to the current workspace instead of navigating away', async () => {
    const onStarted = vi.fn()
    mocks.uploadPart.mockResolvedValue({ partId: 'part-2', jobId: 'job-2' })
    const { result } = renderHook(() => usePartUpload({ onStarted }))

    await act(() => result.current.upload(new File(['STEP fixture'], 'replacement.step')))

    expect(onStarted).toHaveBeenCalledWith({ partId: 'part-2', jobId: 'job-2' })
    expect(mocks.navigate).not.toHaveBeenCalled()
  })

  it('keeps the standalone uploader route for a first part', async () => {
    mocks.uploadPart.mockResolvedValue({ partId: 'part-2', jobId: 'job-2' })
    const { result } = renderHook(() => usePartUpload())

    await act(() => result.current.upload(new File(['STEP fixture'], 'replacement.step')))

    expect(mocks.navigate).toHaveBeenCalledWith('/parts/part-2?job=job-2')
  })
})

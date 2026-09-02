export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

export const CAD_EXTENSIONS = ['.iges', '.igs', '.sldprt', '.step', '.stp', '.x_b', '.x_t'] as const

export const isSupportedCadFilename = (filename: string): boolean =>
  CAD_EXTENSIONS.some((extension) => filename.toLowerCase().endsWith(extension))

export const validateCadFile = (file: File): string | null => {
  if (!file.size) {
    return 'Choose a non-empty CAD file to analyze.'
  }
  if (!isSupportedCadFilename(file.name)) {
    return `Supported files: ${CAD_EXTENSIONS.join(', ')}.`
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return 'CAD files must be 100 MiB or smaller.'
  }
  return null
}

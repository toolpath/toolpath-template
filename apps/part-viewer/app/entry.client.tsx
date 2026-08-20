import { startTransition } from 'react'
import { hydrateRoot } from 'react-dom/client'
import { HydratedRouter } from 'react-router/dom'

// React Three Fiber's StrictMode remount probe can force a WebGL context loss. Hydrate this
// imperative GPU resource once; camera and scene ownership remain inside @toolpath/viewer.
startTransition(() => {
  hydrateRoot(document, <HydratedRouter />)
})

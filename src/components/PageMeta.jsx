import { useEffect } from 'react'
import { applyPageHeadMeta } from '../utils/headMeta'

function PageMeta({ meta, children }) {
  useEffect(() => {
    if (!meta) return undefined
    return applyPageHeadMeta(meta)
  }, [meta])

  return children
}

export default PageMeta

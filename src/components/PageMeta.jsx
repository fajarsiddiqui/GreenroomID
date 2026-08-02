import { useEffect } from 'react'
import { applyPageHeadMeta } from '../utils/headMeta'
import { applyPageSchema } from '../utils/pageMeta'

function PageMeta({ meta, schema, children }) {
  useEffect(() => {
    if (!meta) return undefined
    return applyPageHeadMeta(meta)
  }, [meta])

  useEffect(() => {
    if (!schema) return undefined
    return applyPageSchema({ id: 'greenroomid-page-schema', data: schema })
  }, [schema])

  return children
}

export default PageMeta

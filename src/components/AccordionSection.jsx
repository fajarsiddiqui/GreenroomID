import { useState } from 'react'

function AccordionSection({ title, subtitle, defaultOpen = false, children, right }) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-4 px-6 py-5 text-left hover:bg-gray-50 transition"
      >
        <div>
          <h3 className="font-bold text-gray-800">{title}</h3>
          {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          {right}
          <span className="text-gray-400 text-lg">{open ? '−' : '+'}</span>
        </div>
      </button>
      {open && <div className="px-6 pb-6 border-t border-gray-100">{children}</div>}
    </section>
  )
}

export default AccordionSection

import { useEffect, useMemo, useRef, useState } from 'react'

function getPageItems(currentPage, totalPages) {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1)

  const pages = [...new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1])]
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b)

  return pages.flatMap((page, index) => {
    if (index === 0 || page === pages[index - 1] + 1) return [page]
    return [`ellipsis-${page}`, page]
  })
}

function PaginatedDropdown({ options, value, onChange, disabled = false, ariaLabel, pageSize = 10, placeholder = 'Select an option' }) {
  const rootRef = useRef(null)
  const [open, setOpen] = useState(false)
  const [page, setPage] = useState(1)
  const selectedOption = options.find((option) => option.value === value)
  const totalPages = Math.max(1, Math.ceil(options.length / pageSize))
  const currentPage = Math.min(page, totalPages)
  const pageOptions = options.slice((currentPage - 1) * pageSize, currentPage * pageSize)
  const pageItems = useMemo(() => getPageItems(currentPage, totalPages), [currentPage, totalPages])

  useEffect(() => {
    if (!open) return undefined

    function closeOnOutsideClick(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }

    function closeOnEscape(event) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  function toggleDropdown() {
    if (disabled) return
    const selectedIndex = options.findIndex((option) => option.value === value)
    setPage(selectedIndex >= 0 ? Math.floor(selectedIndex / pageSize) + 1 : 1)
    setOpen((current) => !current)
  }

  function selectOption(option) {
    onChange(option.value)
    setOpen(false)
  }

  return (
    <div className={`paginated-dropdown${open ? ' open' : ''}`} ref={rootRef}>
      <button type="button" className="paginated-dropdown-trigger" aria-label={ariaLabel} aria-haspopup="listbox" aria-expanded={open} disabled={disabled} onClick={toggleDropdown}>
        <span className={selectedOption ? undefined : 'paginated-dropdown-placeholder'}>{selectedOption?.label || placeholder}</span><span className="paginated-dropdown-chevron" aria-hidden="true" />
      </button>
      {open && <div className="paginated-dropdown-panel">
        <div className="paginated-dropdown-options" role="listbox" aria-label={ariaLabel}>
          {pageOptions.map((option) => <button type="button" role="option" aria-selected={option.value === value} className={option.value === value ? 'selected' : ''} key={option.value} onClick={() => selectOption(option)}>{option.label}</button>)}
        </div>
        {totalPages > 1 && <nav className="paginated-dropdown-pagination" aria-label={`${ariaLabel} pages`}>
          <button type="button" onClick={() => setPage(Math.max(1, currentPage - 1))} disabled={currentPage === 1}>Previous</button>
          <div>{pageItems.map((item) => typeof item === 'number' ? <button type="button" key={item} className={item === currentPage ? 'active' : ''} aria-current={item === currentPage ? 'page' : undefined} onClick={() => setPage(item)}>{item}</button> : <span key={item} aria-hidden="true">…</span>)}</div>
          <button type="button" onClick={() => setPage(Math.min(totalPages, currentPage + 1))} disabled={currentPage === totalPages}>Next</button>
        </nav>}
      </div>}
    </div>
  )
}

export default PaginatedDropdown

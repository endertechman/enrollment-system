function paginationItems(currentPage, totalPages) {
  if (totalPages <= 3) return Array.from({ length: totalPages }, (_, index) => index + 1)
  if (currentPage <= 2) return [1, 2, 3, 'end-ellipsis', totalPages]
  if (currentPage >= totalPages - 1) return [1, 'start-ellipsis', totalPages - 2, totalPages - 1, totalPages]
  return [1, 'start-ellipsis', currentPage, 'end-ellipsis', totalPages]
}

function TablePagination({ currentPage, totalItems, onPageChange, pageSize = 10, ariaLabel = 'Record pages' }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize))
  const safePage = Math.min(Math.max(currentPage, 1), totalPages)
  const firstIndex = (safePage - 1) * pageSize
  const shownStart = totalItems === 0 ? 0 : firstIndex + 1
  const shownEnd = Math.min(firstIndex + pageSize, totalItems)

  return (
    <footer className="growth-table-footer">
      <span>Showing {shownStart}–{shownEnd} of {totalItems}</span>
      <nav className="growth-pagination" aria-label={ariaLabel}>
        <button type="button" onClick={() => onPageChange(Math.max(1, safePage - 1))} disabled={safePage === 1} aria-label="Previous page">‹</button>
        {paginationItems(safePage, totalPages).map((item) => typeof item === 'number'
          ? <button type="button" key={item} className={item === safePage ? 'active' : ''} aria-current={item === safePage ? 'page' : undefined} onClick={() => onPageChange(item)}>{item}</button>
          : <span key={item} aria-hidden="true">…</span>)}
        <button type="button" onClick={() => onPageChange(Math.min(totalPages, safePage + 1))} disabled={safePage === totalPages} aria-label="Next page">›</button>
      </nav>
    </footer>
  )
}

export default TablePagination

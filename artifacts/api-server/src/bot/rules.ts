export function normalizeSearchQuery(query: string) {
  return query.trim().replace(/\s+/g, " ");
}

export function normalizePagination(
  page: number,
  pageSize: number,
  totalItems: number,
) {
  const safePageSize = Math.max(1, Math.min(Math.floor(pageSize) || 1, 25));
  const totalPages = Math.max(1, Math.ceil(totalItems / safePageSize));
  const currentPage = Math.max(1, Math.min(Math.floor(page) || 1, totalPages));
  return {
    page: currentPage,
    pageSize: safePageSize,
    totalPages,
    offset: (currentPage - 1) * safePageSize,
  };
}